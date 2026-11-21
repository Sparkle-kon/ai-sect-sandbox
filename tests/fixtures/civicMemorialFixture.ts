import {expect} from 'vitest';
import {createInitialWorld} from '../../src/data/initialWorld';
import {applyMapBrush} from '../../src/engine/mapBrushEngine';
import {advanceWorldTick} from '../../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../../src/types/world';

export const civicChoice=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,...fields,innerMonologue:'实核原坊籍、已发生的赈济与独立在场证据。'});
export const civicMove=(civicMemorialMove:'propose'|'verify',id:string)=>
  civicChoice('CIVIC_MEMORIAL',{civicMemorialMove,...(civicMemorialMove==='propose'?{targetCivicDeedId:id}:{targetCivicMemorialId:id})});
export const civicActor=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
export const civicVillage=(world:WorldState,id:string)=>world.settlements.villages.find(row=>row.id===id)!;
export const civicTurn=(world:WorldState,options:Record<string,LLMDecisionPayload>={})=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(({id})=>[id,options[id]??civicChoice('REST')])),()=>.99);

export function civicMemorialFixture(){
  const world=createInitialWorld(7041);
  world.tick=20;world.month=5;
  const village=world.settlements.villages.find(row=>row.locationId==='loc-market')!;
  const site=world.locations.find(row=>row.id===village.locationId)!;
  const recruiter=civicActor(world,world.sects[0].leaderId!);
  const [proposer,witness,other,editor,outsider]=world.cultivators.filter(row=>row.id!==recruiter.id);
  const volunteers=village.volunteers.slice(0,2);
  volunteers.forEach(row=>Object.assign(row,{name:'纪同山',age:24,aptitude:95,willingness:95}));
  for(const actor of world.cultivators)actor.locationId='loc-market-east';
  for(const actor of [recruiter,proposer,witness,other,editor]){
    actor.locationId=site.id;actor.age=35;actor.hp=actor.maxHp;actor.spiritStones=250;
    actor.herbs.earth_root=12;actor.tribulation=undefined;
  }
  site.herbs.jade_leaf=8;site.herbCapacity.jade_leaf=12;
  const recruit=(volunteerId:string)=>civicChoice('RECRUIT_SETTLER',{targetSettlementId:village.id,targetVolunteerId:volunteerId});
  const first=civicTurn(world,{[recruiter.id]:recruit(volunteers[0].id)});
  const both=civicTurn(first,{[recruiter.id]:recruit(volunteers[1].id)});
  const subjectId=`recruit-${volunteers[0].id}`, sameNameId=`recruit-${volunteers[1].id}`;
  expect(civicActor(both,subjectId).name).toBe(civicActor(both,sameNameId).name);
  expect(civicActor(both,subjectId).spiritStones).toBe(25);
  const challenged=applyMapBrush(both,'cursed_miasma',[site]);
  const provisioned=civicTurn(challenged,{[subjectId]:civicChoice('GATHER_HERBS',{targetHerbId:'jade_leaf'}),
    [proposer.id]:civicChoice('VILLAGE_GRANARY',{granaryMove:'donate_roots',targetSettlementId:village.id})});
  expect(civicActor(provisioned,subjectId).herbs.jade_leaf).toBe(2);
  expect(civicVillage(provisioned,village.id).stress).toBeGreaterThanOrEqual(15);
  const relieved=civicTurn(provisioned,{[subjectId]:civicChoice('DELIVER_RELIEF',{targetSettlementId:village.id})});
  const deed=relieved.civicMemorials.deeds[0];
  expect(deed).toMatchObject({subjectId,settlementId:village.id,siteId:site.id,volunteerId:volunteers[0].id,
    name:'纪同山',tick:relieved.tick,stones:12,herbs:2});
  expect(deed.witnessIds).toContain(witness.id);
  expect(deed.witnessIds).not.toContain(outsider.id);
  expect(civicActor(relieved,subjectId).spiritStones).toBe(13);
  expect(civicActor(relieved,subjectId).herbs.jade_leaf).toBe(0);
  return {world:relieved,deedId:deed.id,sourceEventId:'evt-'+deed.reliefRecordId,subjectId,sameNameId,
    proposer:proposer.id,witness:witness.id,other:other.id,editor:editor.id,outsider:outsider.id,siteId:site.id,settlementId:village.id};
}
