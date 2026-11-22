import {expect} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

export const scribePlace='loc-market',patronId='elder-danxia-1',scribeId='elder-danxia-2',distantId='npc-8';
export const commissionedActor=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
export function scribeOrder(chosenAction:LLMDecisionPayload['chosenAction'],props:Partial<LLMDecisionPayload>={}):LLMDecisionPayload{
  return {chosenAction,innerMonologue:'照实看原有物证，不妄编胜负。',...props};
}
export function scribeMonth(world:WorldState,overrides:Record<string,LLMDecisionPayload>={}){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.filter(row=>row.alive&&row.hp>0).map(row=>
    [row.id,overrides[row.id]??scribeOrder('REST')])),()=>.99,'utility',undefined,{captureTrace:false,capturePresentation:false});
}
export function scribeVisit(world:WorldState,id:string,target:string){
  const person=commissionedActor(world,id);
  if(person.locationId===target)return;
  const known=knownMapLocations(world,person),knownDestination=known.some(site=>site.id===target);
  const reachable=world.locations.filter(row=>row.id!==person.locationId&&!(row.type==='secret_realm'&&row.expeditionOmenId!==undefined));
  const unknown=reachable.filter(row=>!known.includes(row)),pool=unknown.length?unknown:reachable,index=pool.findIndex(site=>site.id===target);
  expect(knownDestination||index>=0).toBe(true);
  let draw=0;
  applyCultivatorBrainDecision(world,person,scribeOrder('EXPLORE',knownDestination?{targetLocationId:target}:{}),
    ()=>!knownDestination&&draw++===0?(index+.25)/pool.length:.99);
  expect(person.locationId).toBe(target);
}
const opponentId='elder-taixu-1';
export function nativeScribeLocalActors(){
  let world=createInitialWorld(106,'spirit-bloom');
  world=scribeMonth(world,{[patronId]:scribeOrder('GATHER_HERBS',{targetHerbId:'jade_leaf'}),
    [scribeId]:scribeOrder('GATHER_HERBS',{targetHerbId:'jade_leaf'})});
  for(const id of [patronId,scribeId,opponentId])scribeVisit(world,id,scribePlace);
  return world;
}
export function nativeScribeFact(){
  let world=nativeScribeLocalActors();
  world=scribeMonth(world,{[patronId]:scribeOrder('DUEL',{targetCultivatorId:opponentId})});
  const proof=world.eraHeritage?.facts.find(row=>row.firsthandIds.includes(patronId));
  expect(proof).toBeDefined();
  const source=proof!.source;
  expect(source).toMatchObject({kind:'duel',tick:world.tick,locationId:scribePlace,participantIds:[patronId,opponentId]});
  const retell=(id:string)=>scribeOrder('CHRONICLE_ERRATA',
    {chronicleErrataMove:'retell',targetChronicleSourceId:source.sourceEventId,targetCultivatorId:id});
  world=scribeMonth(world,{[patronId]:retell(patronId),[scribeId]:retell(opponentId)});
  const originals=world.chronicleErrata.retellings.filter(row=>row.sourceEventId===source.sourceEventId);
  expect(originals).toHaveLength(2);
  expect(originals.map(row=>row.authorId).sort()).toEqual([patronId,scribeId].sort());
  return {world,factId:source.sourceEventId,factTick:proof!.tick,retellings:originals};
}
