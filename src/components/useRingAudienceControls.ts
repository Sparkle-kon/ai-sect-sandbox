import {useRef} from 'react';
import type {useWorldSimulationController} from '../controllers/useWorldSimulationController';
import {availableRingAudienceAims,closeRingAudience,exchangeRingAudience,openRingAudience,projectRingAudience,sealRingAudience} from '../engine/ringAudienceEngine';
import {resolveRingAudienceVoice} from '../engine/ringAudienceDialogue';
import type {RingAudienceAim,RingAudienceRole} from '../types/ringAudience';
import type {WorldState} from '../types/world';

type Simulation=ReturnType<typeof useWorldSimulationController>;
type Cursor={sessionId:string;targetId:string;role:RingAudienceRole;expectedTurn:number};
export function isRingAudienceFrameCurrent(expected:{world:WorldState;history:object;revision:number;config:object},
  actual:{world:WorldState;history:object;revision:number;config:object;blocked:boolean}):boolean{
  return !actual.blocked && expected.world===actual.world && expected.history===actual.history &&
    expected.revision===actual.revision && expected.config===actual.config;
}

export function useRingAudienceControls(simulation:Simulation){
  const {world,timeline,llmConfig}=simulation;
  const config=useRef(llmConfig);
  config.current=llmConfig;
  const revision=simulation.saveContextVersion.current;
  const snapshot=(expectedWorld=world,expectedHistory:object=timeline)=>({world:expectedWorld,history:expectedHistory,revision,config:llmConfig});
  const actual=(allowInFlight=false)=>({world:simulation.authority.current,history:simulation.history.current,
    revision:simulation.saveContextVersion.current,config:config.current,
    blocked:!!simulation.browsing.current||!!simulation.fastForwardRun.current||!!simulation.campaignGuard.current||
      (!allowInFlight&&simulation.stepInFlight.current)});
  const commit=(change:(current:WorldState)=>WorldState)=>isRingAudienceFrameCurrent(snapshot(),actual())
    ?simulation.updateWorld(current=>current===world?change(current):current):world;
  return (role:RingAudienceRole,targetId?:string)=>{
    const session=!simulation.preview?projectRingAudience(world,role,targetId):undefined;
    const id=session?.targetId??targetId;
    const target=world.cultivators.find(actor=>actor.id===id&&actor.alive);
    return {role,target:target&&{id:target.id,name:target.name},
      aims:id&&!simulation.preview?availableRingAudienceAims(world,id,role):[],
      session,busy:!isRingAudienceFrameCurrent(snapshot(),actual()),exchangeCost:role==='ring'?3:4,
      onOpen:(request:{role:RingAudienceRole;targetId:string;aim:RingAudienceAim})=>{
        if(request.role===role&&request.targetId===id)commit(current=>openRingAudience(current,request));
      },
      onClose:(request:Cursor)=>{if(request.role===role&&request.targetId===id)commit(current=>closeRingAudience(current,request));},
      onSeal:(request:Cursor)=>{if(request.role===role&&request.targetId===id)commit(current=>sealRingAudience(current,request));},
      onExchange:async(request:Cursor&{message:string})=>{
        if(request.role!==role||request.targetId!==id||!isRingAudienceFrameCurrent(snapshot(),actual())||!simulation.tryBeginInteraction())return false;
        try{
          const native=exchangeRingAudience(world,request);
          if(native===world||!isRingAudienceFrameCurrent(snapshot(),actual(true)))return false;
          if(simulation.updateWorld(current=>current===world?native:current)!==native)return false;
          const after=snapshot(native,simulation.history.current);
          const session=projectRingAudience(native,role,id);
          const last=session?.turns.at(-1);
          if(!last)return true;
          const voiced=await resolveRingAudienceVoice(world,native,request.sessionId,last.index,llmConfig);
          if(voiced!==native&&isRingAudienceFrameCurrent(after,actual(true)))simulation.updateWorld(current=>current===native?voiced:current);
          return true;
        } finally {simulation.endInteraction();}
      },
    };
  };
}
