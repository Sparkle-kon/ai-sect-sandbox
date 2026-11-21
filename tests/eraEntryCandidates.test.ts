import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {findEraEntryCandidate,projectEraEntryCandidates} from '../src/engine/eraEntryCandidates';
import {advanceOccasions,joinOccasion} from '../src/engine/occasionEngine';
import {resolveSettlementAction} from '../src/engine/settlementEngine';
import {decodeWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import type {Cultivator,WorldState} from '../src/types/world';

function actualHouseholdRecruit(){
  const world=createInitialWorld(7041);
  const sponsor=world.cultivators[0],village=world.settlements.villages.find(row=>row.locationId==='loc-market')!;
  const sect=world.sects.find(row=>row.id===sponsor.sectId)!;
  world.tick=20;
  sponsor.locationId=village.locationId;sponsor.age=45;sponsor.hp=sponsor.maxHp;sect.spiritStones=500;village.stress=8;
  const volunteer=village.volunteers[0];
  Object.assign(volunteer,{name:sponsor.name,age:24,aptitude:95,willingness:95});
  const actual=resolveSettlementAction(world,sponsor,{chosenAction:'RECRUIT_SETTLER',targetSettlementId:village.id,
    targetVolunteerId:volunteer.id,innerMonologue:'验证真实登记，不凭同名。'});
  expect(actual?.title).toBe('凡人自愿入门');
  const actorId=volunteer.enlistedCultivatorId!;
  expect(world.households.members.some(row=>row.recruitedId===actorId&&row.status==='recruited')).toBe(true);
  return {world,known:sponsor.id,actorId,siteId:village.locationId,village};
}

function cloneNativeShape(original:Cultivator,id:string):Cultivator{
  return {...structuredClone(original),id,memories:[],coreMemories:[],reflections:[],rumors:[],memorySequence:0};
}

describe('exact retained local era entrant candidates',()=>{
  it('uses exact proof for founder and actual named village recruit, not deserialized display-label and ID lookalikes',()=>{
    const {world,known,actorId,siteId,village}=actualHouseholdRecruit();
    const impostor='recruit-looks-plausible',prototype=world.cultivators.find(row=>row.id===actorId)!;
    world.cultivators.push(cloneNativeShape(prototype,impostor));
    const copy=decodeWorldSave(encodeWorldSave(world)),before=JSON.stringify(copy);
    const candidates=projectEraEntryCandidates(copy,siteId,known);
    const entrant=candidates.find(row=>row.actorId===actorId),founder=candidates.find(row=>row.actorId===known);
    expect(entrant).toMatchObject({name:prototype.name,origin:{kind:'recruited',tick:20,settlementName:village.name},
      decision:{kind:'rest_or_cultivate'}});
    expect(founder).toMatchObject({name:prototype.name,origin:{kind:'founder',tick:1}});
    expect(findEraEntryCandidate(copy,siteId,known,impostor)).toBeUndefined();
    expect(JSON.stringify(copy)).toBe(before);
    expect(projectEraEntryCandidates(copy,siteId,impostor).some(row=>row.actorId===impostor)).toBe(false);
  });

  it('never infers founder in a legacy old world; still finds a living genuine recruit from surviving household records',()=>{
    const {world,known,actorId,siteId,village}=actualHouseholdRecruit();
    const legacy:WorldState={...world,worldgen:undefined};
    legacy.settlements.records=[];
    village.volunteers=village.volunteers.filter(row=>row.enlistedCultivatorId!==actorId);
    expect(findEraEntryCandidate(legacy,siteId,known,known)).toBeUndefined();
    expect(findEraEntryCandidate(legacy,siteId,known,actorId)?.origin.kind).toBe('recruited');
    legacy.cultivators.find(row=>row.id===actorId)!.alive=false;
    expect(findEraEntryCandidate(legacy,siteId,known,actorId)).toBeUndefined();
  });

  it('requires an exact nearby actual viewing scope and refuses a stale/absent/dead perspective',()=>{
    const world=createInitialWorld(45),[selected,local,remote]=world.cultivators;
    const siteId='loc-market';
    selected.locationId=siteId;local.locationId=siteId;
    remote.locationId='loc-blood';remote.realm='练气';
    expect(findEraEntryCandidate(world,siteId,selected.id,local.id)).toBeDefined();
    expect(projectEraEntryCandidates(world,siteId)).toEqual([]);
    expect(projectEraEntryCandidates(world,siteId,'someone-not-registered')).toEqual([]);
    selected.alive=false;
    expect(projectEraEntryCandidates(world,siteId,selected.id)).toEqual([]);
    expect(projectEraEntryCandidates(world,'loc-secret-1',local.id)).toEqual([]);
  });

  it('keeps genuine contest enrollment observe-only, and no pending order or essence is consumed by looking',()=>{
    const world=createInitialWorld(2031),[selected,entrant]=world.cultivators;
    world.tick=60;
    expect(advanceOccasions(world,()=>0)).toHaveLength(1);
    const occasion=world.occasions[0],siteId=occasion.locationId;
    selected.locationId=siteId;entrant.locationId=siteId;
    expect(occasion.kind).toBe('tournament');
    expect(joinOccasion(world,entrant,{chosenAction:'JOIN_OCCASION',targetOccasionId:occasion.id,innerMonologue:'真实报名。'})).not.toBeNull();
    const before=structuredClone(world.playerAvatar);
    expect(findEraEntryCandidate(world,siteId,selected.id,entrant.id)?.decision).toEqual({kind:'observe_only',reason:'contest'});
    expect(findEraEntryCandidate(world,siteId,selected.id,selected.id)?.decision.kind).toBe('rest_or_cultivate');
    expect(world.playerAvatar).toEqual(before);
    world.playerAvatar.essence=24;
    expect(findEraEntryCandidate(world,siteId,selected.id,selected.id)?.decision).toEqual({kind:'observe_only',reason:'order_essence'});
  });
});
