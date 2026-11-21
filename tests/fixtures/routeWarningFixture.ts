import { expect } from 'vitest';
import { createInitialWorld } from '../../src/data/initialWorld';
import { applyMapBrush } from '../../src/engine/mapBrushEngine';
import { availablePilgrimageActions,resolvePilgrimageAction } from '../../src/engine/pilgrimageEngine';
import { advanceWorldTick } from '../../src/engine/worldEngine';
import type { Cultivator,LLMDecisionPayload,WorldState } from '../../src/types/world';

export const makeRouteWarningFixtureDecision=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,...fields,innerMonologue:'只用实际踏过的格位和亲历证据。'});
const rest=makeRouteWarningFixtureDecision('REST');
export const routeWarningFixtureTurn=(world:WorldState,choices:Record<string,LLMDecisionPayload>={})=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(({id})=>[id,choices[id]??rest])),()=>.99);
export const routeWarningFixtureActor=(world:WorldState,id:string)=>world.cultivators.find(actor=>actor.id===id)!;
const pilgrimage=(pilgrimageMove:'accept'|'advance',targetPilgrimageId:string)=>makeRouteWarningFixtureDecision('PILGRIMAGE',{pilgrimageMove,targetPilgrimageId});
export const routeWarningFixtureAction=(routeWarningMove:'post'|'corroborate'|'retract',targetRouteObservationId?:string,targetRouteWarningId?:string)=>
  makeRouteWarningFixtureDecision('ROUTE_WARNING',{routeWarningMove,targetRouteObservationId,targetRouteWarningId});

export function routeWarningFixture(){
  const world=createInitialWorld(13071);
  world.tick=24;world.month=5;
  const start=world.locations.find(({id})=>id==='loc-taixu')!;
  const middle=world.locations.find(({id})=>id==='loc-market')!;
  const stop=world.locations.find(({id})=>id==='loc-market-east')!;
  start.x=220;start.y=220;middle.x=340;middle.y=220;stop.x=380;stop.y=220;
  const [one,partner,two,helper,outsider]=world.cultivators;
  for(const actor of world.cultivators) actor.locationId=stop.id;
  for(const actor of [one,partner,two,helper]){
    actor.locationId=start.id;actor.alive=true;actor.hp=actor.maxHp;actor.spiritStones=220;actor.tribulation=undefined;
    actor.exploredTileIds=world.terrain.tiles.map(row=>row.id);
  }
  outsider.realm='练气';
  const run=(leader:Cultivator,second:Cultivator)=>{
    const offer=availablePilgrimageActions(leader,world).find(option=>option.pilgrimageMove==='propose'&&
      option.targetCultivatorId===second.id)!;
    expect(offer).toMatchObject({targetLocationId:middle.id,targetPilgrimageNextStopId:stop.id});
    expect(resolvePilgrimageAction(world,leader,makeRouteWarningFixtureDecision('PILGRIMAGE',offer))).not.toBeNull();
    const row=world.pilgrimages.journeys.at(-1)!;
    expect(resolvePilgrimageAction(world,second,pilgrimage('accept',row.id))).not.toBeNull();
    return row.id;
  };
  const left=run(one,partner),right=run(two,helper);
  const target={x:260,y:220};
  const brush=applyMapBrush(world,'cursed_miasma',[target]);
  const hazard=brush.mapHazards.find(row=>row.kind==='cursed_miasma')!;
  const crossed=routeWarningFixtureTurn(brush,{[one.id]:pilgrimage('advance',left),[two.id]:pilgrimage('advance',right)});
  expect(crossed.pilgrimages.journeys.every(row=>row.path.length===0&&row.legIndex===1)).toBe(true);
  expect([one,partner,two,helper].map(actor=>routeWarningFixtureActor(crossed,actor.id).locationId)).toEqual(Array(4).fill(middle.id));
  return {world:crossed,left,right,one:one.id,partner:partner.id,two:two.id,helper:helper.id,outsider:outsider.id,start:start.id,
    middle:middle.id,stop:stop.id, hazard};
}
