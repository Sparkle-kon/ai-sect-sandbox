import { expect } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { sectRelation } from '../src/engine/diplomacyEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload,WorldState } from '../src/types/world';

export const attackSect='sect-qingyun', defendSect='sect-bloodmoon', commander='npc-1', patriarch='npc-3',
  disciple='npc-4', location='loc-blood', siegeId='siege-5-sect-qingyun-sect-bloodmoon';
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'静守本处。'};
export const siegeActor=(world:WorldState,id:string)=>world.cultivators.find(actor=>actor.id===id)!;
export const siegeSect=(world:WorldState,id=defendSect)=>world.sects.find(sect=>sect.id===id)!;
export const actualSiege=(world:WorldState)=>world.sieges.find(row=>row.id===siegeId)!;
export function siegeTurn(world:WorldState,choices:Record<string,LLMDecisionPayload>={}){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(actor=>[actor.id,choices[actor.id]??rest])),
    ()=>.5,'utility');
}

export function actualGrandSiege(launchDelay=0){
  const initial=createInitialWorld(1,'spirit-bloom');
  const declared=siegeTurn(initial,{
    [commander]:{chosenAction:'DECLARE_WAR',targetSectId:defendSect,innerMonologue:'按实有国书宣战。'},
    'npc-5':{chosenAction:'OFFER_ALLIANCE',targetSectId:attackSect,innerMonologue:'以在场掌门身份缔盟。'},
    [patriarch]:{chosenAction:'BUILD_FACILITY',facilityKind:'defense_array',innerMonologue:'公库实付款筑阵。'},
  });
  expect(declared.tick).toBe(2);
  expect(sectRelation(declared,attackSect,defendSect)).toMatchObject({pact:'war',sinceTick:2});
  expect(sectRelation(declared,attackSect,'sect-danxia')).toMatchObject({pact:'alliance',sinceTick:2});
  expect(declared.events).toContainEqual(expect.objectContaining({id:'evt-2-dip-sect-qingyun-sect-bloodmoon-declare_war',actorIds:[commander,patriarch]}));
  expect(siegeSect(declared)).toMatchObject({facilities:{defense_array:1},arrayHp:200,arrayMaxHp:200});
  expect(declared.resourceFlow.months.flatMap(month=>month.entries)).toContainEqual(expect.objectContaining({
    reason:'facility_construction',refId:defendSect,good:'stone',amount:340,
  }));
  const home=siegeTurn(declared,{[disciple]:{chosenAction:'EXPLORE',targetLocationId:location,innerMonologue:'回本门山门。'}});
  expect(siegeActor(home,disciple).locationId).toBe(location);
  let cooled=siegeTurn(home);
  for(let wait=0;wait<launchDelay;wait++)cooled=siegeTurn(cooled);
  const launched=siegeTurn(cooled,{[commander]:{chosenAction:'LAUNCH_SIEGE',targetSectId:defendSect,innerMonologue:'公库实资出征。'}});
  const fightId=`siege-${launched.tick}-${attackSect}-${defendSect}`;
  const siege=launched.sieges.find(row=>row.id===fightId)!;
  expect(siege).toMatchObject({attackerSectId:attackSect,defenderSectId:defendSect,startedTick:5+launchDelay,
    status:'marching',rounds:0,destinationId:location});
  expect(siegeSect(launched,attackSect).spiritStones).toBeLessThan(siegeSect(cooled,attackSect).spiritStones);
  expect(launched.events).toContainEqual(expect.objectContaining({
    id:`evt-${launched.tick}-dip-sect-qingyun-sect-bloodmoon-launch_siege`,actorIds:siege.participantIds,locationId:'loc-taixu',
    description:expect.stringContaining('330灵石'),
  }));
  expect(new Set(siege.participantIds).size).toBeGreaterThanOrEqual(5);
  const assembled=siegeTurn(launched);
  expect(assembled.events).toContainEqual(expect.objectContaining({id:`evt-${assembled.tick}-dip-${siege.id}`,title:'联军完成集结',locationId:'loc-taixu'}));
  for(const id of siege.participantIds)expect(siegeActor(assembled,id).locationId).toBe('loc-taixu');
  const arrived=siegeTurn(assembled);
  const arrivedSiege=arrived.sieges.find(row=>row.id===fightId)!;
  expect(arrivedSiege).toMatchObject({status:'sieging',rounds:0});
  expect(arrived.events).toContainEqual(expect.objectContaining({id:`evt-${arrived.tick}-dip-${siege.id}`,title:'联军抵达山门',locationId:location}));
  for(const id of siege.participantIds)expect(siegeActor(arrived,id).locationId).toBe(location);
  return {initial,declared,home,cooled,launched,assembled,arrived,siege:arrivedSiege};
}
