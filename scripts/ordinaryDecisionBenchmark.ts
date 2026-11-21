import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {campaignSHA256} from '../src/engine/campaignMemento';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import type {WorldgenProfileId} from '../src/types/world';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const months=48;
const samples=[{seed:2031,profile:'classic'},{seed:2032,profile:'classic'},{seed:50421,profile:'fractured-frontier'}] as const;
const routineKinds=['REST','CULTIVATE','SOCIALIZE','EXPLORE','GATHER_HERBS'] as const;
type Routine=(typeof routineKinds)[number];
const ordinary=(raw:unknown):raw is Routine=>routineKinds.some(name=>raw===name);
const rule=__SECT_UTILITY_RULE_VERSION__;
if(!/^[0-9a-f]{64}$/.test(rule))throw Error('无法提供当次真实规则指纹。');

function simulate(seed:number,profile:WorldgenProfileId,midpointRead:boolean){
  let world=createInitialWorld(seed,profile),previous=new Map<string,Routine>();
  const terminal:Record<Routine,number>={REST:0,CULTIVATE:0,SOCIALIZE:0,EXPLORE:0,GATHER_HERBS:0};
  let possibleRepeats=0,repeats=0,advancedActors=0,observedRescues=0,observedOathDeliveries=0;
  const issuedOaths=new Set<string>(),activeOaths=new Set<string>(),fulfilledOaths=new Set<string>();
  for(let i=1;i<=months;i++){
    const applied=new Set<string>();
    world=advanceWorldTick(world,undefined,undefined,'utility',undefined,{
      onActor(actorId,_alternatives,ok){if(ok)applied.add(actorId);}
    });
    for(const oath of world.oaths.contracts){
      issuedOaths.add(oath.id);
      if(oath.deadlineTick!==undefined)activeOaths.add(oath.id);
      if(oath.status==='fulfilled')fulfilledOaths.add(oath.id);
    }
    const recent=new Map<string,Routine>();
    for(const actor of world.cultivators){
      if(!applied.has(actor.id))continue;
      advancedActors++;
      const action=actor.currentAction;
      if(action==='EXPEDITION_RESCUE')observedRescues++;
      if(action==='FULFILL_OATH')observedOathDeliveries++;
      if(!ordinary(action))continue;
      terminal[action]++;
      recent.set(actor.id,action);
      const before=previous.get(actor.id);
      if(before!==undefined){possibleRepeats++;if(before===action)repeats++;}
    }
    previous=recent;
    if(midpointRead&&i===months/2)world=decodeEraWorldSave(encodeEraWorldSave(world));
  }
  return {save:encodeEraWorldSave(world),tick:world.tick,advancedActors,terminal,possibleRepeats,repeats,
    other:{observedRescues,observedOathDeliveries,issuedOaths:issuedOaths.size,activeOaths:activeOaths.size,fulfilledOaths:fulfilledOaths.size},roster:world.cultivators.length};
}
for(const {seed,profile} of samples){
  const start=performance.now();
  const whole=simulate(seed,profile,false),restored=simulate(seed,profile,true);
  if(JSON.stringify(whole)!==JSON.stringify(restored))throw Error(`种子 ${seed} 的实走与中途读回不一致。`);
  const {save,...listed}=whole;
  console.log(JSON.stringify({rule,seed,profile,months,...listed,
    nativeSha256:await campaignSHA256(new TextEncoder().encode(save)),
    restoredReplayBytesExact:true,workMs:Math.round(performance.now()-start)}));
}
