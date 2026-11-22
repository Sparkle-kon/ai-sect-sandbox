import { useState } from 'react';
import type { useWorldSimulationController } from '../controllers/useWorldSimulationController';
import { activeAvatar } from '../engine/avatarEngine';
import { beastDuelContactForParticipant, isPrivateBeastDuelEvent,
  projectGuidedBeastDuel, queueGuidedBeastDuelChoice } from '../engine/beastDuelProtection';
import type { BeastDuelChoice, BeastDuelContact } from '../types/beastDuelProtection';
import { BeastDuelProtectionCard, type BeastDuelProtectionCardView } from './BeastDuelProtectionCard';

type Sim=ReturnType<typeof useWorldSimulationController>;
type Seen={scope:string;revision:number;tick:number;contact:BeastDuelContact;view:BeastDuelProtectionCardView};

export function useBeastDuelSpotlight(sim:Sim,blocked:boolean) {
  const [seen,setSeen]=useState<Seen>();
  const {world,viewScopeKey,authority,timeline,history,saveContextVersion}=sim;
  const revision=saveContextVersion.current;
  const actor=sim.preview?undefined:activeAvatar(world);
  const read=!blocked&&actor?projectGuidedBeastDuel(world,actor):undefined;
  const contact=read&&actor?beastDuelContactForParticipant(world,actor):undefined;
  const site=contact?.siteId&&world.locations.find(row=>row.id===contact.siteId);
  const view:BeastDuelProtectionCardView|undefined=actor&&read&&site&&contact?.id===read.contactId?
    {ownerName:actor.name,beastName:read.beastName,siteName:site.name,queued:read.queued?.choice,
      options:read.options.map(option=>({choice:option.choice,refugeName:option.destinationName}))}:undefined;
  const stamp=seen&&seen.scope===viewScopeKey&&seen.revision===revision&&world.tick===seen.tick&&
    (!actor||actor.id===seen.contact.ownerId)&&!sim.preview?seen:undefined;
  const matching=stamp&&world.events.filter(event=>isPrivateBeastDuelEvent(event)&&event.tick===world.tick&&
    event.actorIds.length===1&&event.actorIds[0]===stamp.contact.ownerId&&
    (event.id===`evt-${stamp.contact.id}-guard-${world.tick}`||event.id===`evt-${stamp.contact.id}-withdraw-${world.tick}`));
  const outcome=matching?.length===1?matching[0]:undefined;
  let aftermath='';
  if(stamp&&outcome?.id.includes('-withdraw-')){
    const duel=world.events.filter(event=>event.tick===world.tick&&event.locationId===stamp.contact.siteId&&
      [`evt-${world.tick}-${stamp.contact.attackerId}-duel`,`evt-${world.tick}-${stamp.contact.attackerId}-kill`].includes(event.id)&&
      event.actorIds[0]===stamp.contact.attackerId&&event.actorIds[1]===stamp.contact.defenderId);
    const owners=world.cultivators.filter(row=>row.id===stamp.contact.ownerId);
    if(duel.length===1&&owners.length===1)aftermath=owners[0].alive&&owners[0].hp>0?'原主在实际交锋后仍生还。':'原主未能生还。';
  }
  const ready=()=>!!(actor&&contact&&read&&!blocked&&authority.current===world&&history.current===timeline&&
    saveContextVersion.current===revision&&!sim.browsing.current&&!sim.stepInFlight.current&&
    !sim.fastForwardRun.current&&!sim.campaignGuard.current&&activeAvatar(world)===actor&&
    beastDuelContactForParticipant(world,actor)===contact);
  const choose=(choice:BeastDuelChoice)=>{
    if(!actor||!contact||!read||read.queued||!ready())return false;
    const options=read.options.filter(row=>row.choice===choice);
    if(options.length!==1)return false;
    return sim.updateWorld(current=>current===world?queueGuidedBeastDuelChoice(current,actor.id,contact.id,choice,options[0].destinationId):current)!==world;
  };
  const advance=()=>{
    if(!contact||!view||!read?.queued||!ready())return false;
    setSeen({scope:viewScopeKey,revision,tick:world.tick+1,contact,view});
    void sim.handleStepTick();
    return true;
  };
  return {pending:Boolean(view),card:view&&contact?<BeastDuelProtectionCard key={`${viewScopeKey}:${contact.id}`}
    view={view} busy={sim.isStepping||sim.fastForwardLocked} onChoose={choose} onAdvance={advance}/>:
    !blocked&&stamp&&outcome?<BeastDuelProtectionCard key={`${viewScopeKey}:${stamp.contact.id}:receipt`}
      view={stamp.view} receipt={{title:outcome.title,description:outcome.description+aftermath}}
      onContinue={()=>setSeen(undefined)}/>:undefined};
}
