import { expect } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { clanChildActorId } from "../src/engine/cultivationClanTerms";
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload,WorldState } from '../src/types/world';

export const clanFirst='npc-5',clanSecond='elder-danxia-2',clanSite='loc-danxia';
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'在真实年月里静守本处。'};
export const clanActor=(world:WorldState,id=clanFirst)=>world.cultivators.find(row=>row.id===id)!;
export const clanMonth=(world:WorldState,choices:Record<string,LLMDecisionPayload>={})=>
  advanceWorldTick(world,Object.fromEntries(world.cultivators.map(actor=>[actor.id,choices[actor.id]??rest])),
    ()=>.37,'utility',undefined,{captureTrace:false,capturePresentation:false});
export const clanAffinity=(world:WorldState)=>world.relationships.find(row=>
  row.fromId===clanFirst&&row.toId===clanSecond||row.fromId===clanSecond&&row.toId===clanFirst);

export function actualClanTrust(naturalDeathNextYear=false){
  let world=createInitialWorld(1,'spirit-bloom');
  const start=world;
  if(naturalDeathNextYear){
    // Controlled starting one-year remaining lifespan, not a scripted death or tick edit.
    const elder=clanActor(start);
    elder.lifespan=elder.age+1;
  }
  expect(clanAffinity(start)).toBeUndefined();
  expect(clanActor(start)).toMatchObject({alive:true,gender:'man',spiritRoot:'木',locationId:clanSite});
  expect(clanActor(start,clanSecond)).toMatchObject({alive:true,gender:'woman',spiritRoot:'火',locationId:clanSite});
  for(let i=0;i<4;i++){
    world=clanMonth(world,{
      [clanFirst]:{chosenAction:'SOCIALIZE',targetCultivatorId:clanSecond,innerMonologue:'与当面的同门坐而论道。'},
      [clanSecond]:{chosenAction:'SOCIALIZE',targetCultivatorId:clanFirst,innerMonologue:'与当面的同门坐而论道。'},
    });
    expect(world.events).toContainEqual(expect.objectContaining({id:`evt-${world.tick}-${clanFirst}-social`,actorIds:[clanFirst,clanSecond]}));
    expect(world.events).toContainEqual(expect.objectContaining({id:`evt-${world.tick}-${clanSecond}-social`,actorIds:[clanSecond,clanFirst]}));
  }
  expect(clanAffinity(world)?.affinity).toBe(96);
  return {start,world};
}

export const clanPropose:LLMDecisionPayload={
  chosenAction:'CULTIVATION_CLAN',clanMove:'propose',targetCultivatorId:clanSecond,
  innerMonologue:'凭相知与自愿向在场同道提出约誓。',
};
export const clanOrder=(clanMove:Exclude<NonNullable<LLMDecisionPayload['clanMove']>,'propose'>,
  targetCultivationUnionId:string):LLMDecisionPayload=>({
  chosenAction:'CULTIVATION_CLAN',clanMove,targetCultivationUnionId,innerMonologue:'仅由本人决定这一道家约。',
});

export const clanUnion=(world:WorldState)=>world.cultivationClans!.unions[0];
export function actualClanProposal(naturalDeathNextYear=false){
  const trust=actualClanTrust(naturalDeathNextYear),proposed=clanMonth(trust.world,{[clanFirst]:clanPropose}),union=clanUnion(proposed);
  expect(union).toMatchObject({parents:[clanFirst,clanSecond],siteId:clanSite,proposedTick:proposed.tick,status:'proposed'});
  return {...trust,trusted:trust.world,proposed,union};
}
export function actualClanVows(naturalDeathNextYear=false){
  const proposal=actualClanProposal(naturalDeathNextYear),id=proposal.union.id;
  const accepted=clanMonth(proposal.proposed,{[clanSecond]:clanOrder('accept',id)});
  expect(clanUnion(accepted)).toMatchObject({acceptedTick:accepted.tick,status:'accepted'});
  const invited=clanMonth(accepted,{[clanFirst]:clanOrder('ceremony_offer',id)});
  expect(clanUnion(invited).ceremonyOffer).toMatchObject({actorId:clanFirst,tick:invited.tick});
  const bonded=clanMonth(invited,{[clanSecond]:clanOrder('ceremony',id)});
  expect(clanUnion(bonded)).toMatchObject({status:'bonded',ceremony:{actorId:clanSecond,tick:bonded.tick,qiPaidEach:8}});
  return {...proposal,accepted,invited,bonded};
}
export function actualClanExpecting(naturalDeathNextYear=false){
  const vows=actualClanVows(naturalDeathNextYear),id=vows.union.id;
  const offered=clanMonth(vows.bonded,{[clanFirst]:clanOrder('family_offer',id)});
  expect(clanUnion(offered).plan).toMatchObject({offeredBy:clanFirst,offeredTick:offered.tick,status:'offered'});
  const expecting=clanMonth(offered,{[clanSecond]:clanOrder('family_accept',id)});
  expect(clanUnion(expecting).plan).toMatchObject({status:'expecting',acceptedBy:clanSecond,acceptedTick:expecting.tick,earnedTicks:[]});
  return {...vows,offered,expecting};
}
export function actualClanBirth(){
  const plan=actualClanExpecting();
  let justBefore=plan.expecting;
  for(let i=0;i<8;i++)justBefore=clanMonth(justBefore);
  expect(clanUnion(justBefore).plan).toMatchObject({status:'expecting',earnedTicks:Array.from({length:8},(_,i)=>plan.expecting.tick+i+1)});
  expect(justBefore.cultivationClans?.children).toEqual([]);
  const newborn=clanMonth(justBefore),child=newborn.cultivationClans!.children[0];
  expect(child).toMatchObject({birthTick:newborn.tick,maturesAtTick:newborn.tick+216,parentIds:[clanFirst,clanSecond],
    parentRoots:['木','火'],siteId:clanSite});
  expect(clanUnion(newborn).plan).toMatchObject({status:'born',childId:child.id});
  return {...plan,justBefore,newborn,child};
}

export function actualClanAdult(){
  const native=actualClanBirth();
  const personId=clanChildActorId(native.child.id);
  let lastMinor=native.newborn;
  while(lastMinor.tick+1<native.child.maturesAtTick){
    lastMinor=clanMonth(lastMinor);
    expect(lastMinor.cultivators.some(row=>row.id===personId)).toBe(false);
  }
  const adult=clanMonth(lastMinor);
  expect(adult.tick-native.child.birthTick).toBe(216);
  expect(clanActor(adult,personId)).toMatchObject({id:personId,age:18,alive:true,sectId:'',
    locationId:clanSite,name:native.child.name,gender:native.child.gender,
    clanHeritage:{childId:native.child.id,clanId:native.child.clanId,roots:native.child.roots,innateTrait:native.child.innateTrait}});
  return {...native,lastMinor,adult,personId};
}
