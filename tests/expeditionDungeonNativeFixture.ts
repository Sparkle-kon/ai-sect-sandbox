import {expect} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {canSeeOccasion} from '../src/engine/expeditionOmenEngine';
import {availableOccasionJoins} from '../src/engine/occasionEngine';
import {resolveObservatoryAction} from '../src/engine/fieldObservatoryEngine';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {DungeonMove,DungeonRoom} from '../src/types/expeditionDungeon';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

export const dungeonExplorer='npc-2',dungeonCompanion='npc-1',dungeonOutsider='npc-3',dungeonOrigin='loc-vein-north',dungeonOccasion='occasion-4-expedition';
export const dungeonActor=(world:WorldState,id=dungeonExplorer)=>world.cultivators.find(row=>row.id===id)!;
export const dungeonOccasionIn=(world:WorldState)=>world.occasions.find(row=>row.id===dungeonOccasion)!;
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'眼下实地守候。'};
const instrument=(observatoryMove:'fund'|'measure',targetObservatoryTick?:number):LLMDecisionPayload=>({
  ...rest,chosenAction:'FIELD_OBSERVATORY',observatoryMove,targetLocationId:dungeonOrigin,targetObservatoryTick,
});
export function dungeonMonth(world:WorldState,orders:Readonly<Record<string,LLMDecisionPayload>>={},roll=.99){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,orders[row.id]??rest])),()=>roll,'utility');
}

export function actualNativeDungeonGate(withCompanion=false){
  const original=createInitialWorld(2031,'classic'),operator=dungeonActor(original);
  expect(operator.locationId).toBe(dungeonOrigin);
  const stones=operator.spiritStones;
  const funded=resolveObservatoryAction(original,operator,instrument('fund'));
  expect(funded).toMatchObject({tick:1,witnessScope:'participants'});
  expect(operator.spiritStones).toBeLessThan(stones);
  const prospect=dungeonActor(original,dungeonCompanion);
  const known=knownMapLocations(original,prospect),found=known.some(row=>row.id===dungeonOrigin);
  const unknown=original.locations.filter(row=>row.id!==prospect.locationId&&!known.includes(row));
  const nativeIndex=unknown.findIndex(row=>row.id===dungeonOrigin);
  if(withCompanion&&!found)expect(nativeIndex).toBeGreaterThanOrEqual(0);
  const ahead=withCompanion?dungeonMonth(original,{[prospect.id]:{...rest,chosenAction:'EXPLORE',
    targetLocationId:found?dungeonOrigin:undefined}},found ? .99 : (nativeIndex+.3)/unknown.length):dungeonMonth(original);
  if(withCompanion)expect(dungeonActor(ahead,dungeonCompanion).locationId).toBe(dungeonOrigin);
  const measured=dungeonMonth(ahead,{[dungeonExplorer]:instrument('measure',1)});
  expect(measured.tick).toBe(3);
  expect(measured.events).toContainEqual(expect.objectContaining({
    id:'evt-field-observatory-npc-2-1-measure',tick:3,witnessScope:'participants',
  }));
  const opening=dungeonMonth(measured,withCompanion?{[dungeonExplorer]:{...rest,chosenAction:'FIELD_OBSERVATORY',
    observatoryMove:'relay',targetLocationId:dungeonOrigin,targetObservatoryTick:1,targetCultivatorId:dungeonCompanion}}:{});
  const open=dungeonOccasionIn(opening);
  expect(open).toMatchObject({status:'registration',startedTick:4,anchorSiteId:dungeonOrigin,locationId:'occasion-4-expedition-gate',
    participantIds:[],registrationClosesTick:7,expiresTick:16});
  expect(open.omenId).toBeTruthy();
  expect(canSeeOccasion(opening,dungeonActor(opening),open)).toBe(true);
  expect(canSeeOccasion(opening,dungeonActor(opening,dungeonOutsider),open)).toBe(false);
  const join={action:'JOIN_OCCASION',targetOccasionId:dungeonOccasion} as const;
  expect(availableOccasionJoins(dungeonActor(opening),opening,5)).toContainEqual(join);
  expect(availableOccasionJoins(dungeonActor(opening,dungeonOutsider),opening,5)).not.toContainEqual(join);
  const joining={...rest,chosenAction:join.action,targetOccasionId:dungeonOccasion};
  if(withCompanion)expect(availableOccasionJoins(dungeonActor(opening,dungeonCompanion),opening,5)).toContainEqual(join);
  const applicants:Record<string,LLMDecisionPayload>={[dungeonExplorer]:joining};
  if(withCompanion)applicants[dungeonCompanion]=joining;
  const enrolled=dungeonMonth(opening,applicants);
  expect(new Set(dungeonOccasionIn(enrolled).participantIds)).toEqual(new Set(withCompanion?[dungeonExplorer,dungeonCompanion]:[dungeonExplorer]));
  expect(enrolled.events).toContainEqual(expect.objectContaining({
    id:`evt-${enrolled.tick}-${dungeonOccasion}-join-${dungeonExplorer}`,actorIds:[dungeonExplorer],
    locationId:dungeonOrigin,witnessScope:'participants',
  }));
  expect(dungeonActor(enrolled).locationId).toBe(dungeonOrigin);
  const entered=dungeonMonth(dungeonMonth(enrolled));
  expect(dungeonOccasionIn(entered)).toMatchObject({status:'running',startedTick:4,round:0,expeditions:[]});
  expect(entered.tick).toBe(7);
  expect(dungeonActor(entered).locationId).toBe(open.locationId);
  if(withCompanion)expect(dungeonActor(entered,dungeonCompanion).locationId).toBe(open.locationId);
  return {opening,enrolled,entered,occasion:dungeonOccasionIn(entered)};
}

export const dungeonOrder=(dungeonMove:DungeonMove,targetDungeonRoomId:DungeonRoom):LLMDecisionPayload=>({
  chosenAction:'EXPEDITION_DUNGEON',dungeonMove,targetOccasionId:dungeonOccasion,targetDungeonRoomId,
  innerMonologue:'循已由真名录准许的秘境路径行事。',
});
export const dungeonMove=(world:WorldState,move:DungeonMove,room:DungeonRoom,id=dungeonExplorer)=>
  dungeonMonth(world,{[id]:dungeonOrder(move,room)});
export function enterNativeDungeon(){
  const {entered,...sources}=actualNativeDungeonGate();
  const world=dungeonMove(entered,'enter','garden');
  expect(dungeonOccasionIn(world).dungeon).toMatchObject({openedTick:world.tick,room:'garden',
    members:[{actorId:dungeonExplorer,enteredTick:world.tick}]});
  return {...sources,entered,world};
}
