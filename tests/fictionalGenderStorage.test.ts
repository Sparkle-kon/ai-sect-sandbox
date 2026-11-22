import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {prepareEraCheckpoint,verifyEraCheckpoint} from '../src/engine/eraCheckpointEngine';
import {buildHighDramaPreset} from '../src/engine/highDramaPresetEngine';
import {decodeEraWorldSave,decodeWorldSave,encodeEraWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const sponsorId='elder-danxia-1',villageId='village-loc-vein-north',volunteerId='village-loc-vein-north-vol-1';
const recruitId=`recruit-${volunteerId}`;
const village=(world:WorldState)=>world.settlements.villages.find(row=>row.id===villageId)!;
const volunteer=(world:WorldState)=>village(world).volunteers.find(row=>row.id===volunteerId)!;
const recruit=(world:WorldState)=>world.cultivators.find(actor=>actor.id===recruitId)!;
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'按原月序静候。'};
const next=(world:WorldState,chosen:LLMDecisionPayload=rest)=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(actor=>[actor.id,actor.id===sponsorId?chosen:rest])),
  undefined,'deferred',undefined,{captureTrace:false});
const clearMetadata=(world:WorldState)=>{
  for(const actor of world.cultivators)delete actor.gender;
  for(const settlement of world.settlements.villages)for(const person of settlement.volunteers)delete person.gender;
  return world;
};
const readEra={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const file=(bytes:Uint8Array)=>({size:bytes.byteLength,arrayBuffer:async()=>bytes.slice().buffer});

describe('strict optional native fictional portrait metadata',()=>{
  it('round-trips a legacy save without retroactively assigning neutral originals a gender',()=>{
    const legacy=clearMetadata(createInitialWorld(1,'spirit-bloom'));
    const raw=encodeWorldSave(legacy);
    expect(raw).not.toContain('"gender"');
    expect(encodeWorldSave(decodeWorldSave(raw))).toBe(raw);
    expect(encodeEraWorldSave(decodeEraWorldSave(raw))).toBe(raw);
    const nextNative=next(decodeWorldSave(raw));
    expect(encodeWorldSave(nextNative)).not.toContain('"gender"');
  });

  it('does not fill fictional appearance when an actually older first-tick snapshot lacks the whole settlement registry',()=>{
    const {settlements:_missing,...world}=clearMetadata(createInitialWorld(9));
    const restored=decodeWorldSave(JSON.stringify({format:'ai-sect-sandbox',version:1,world}));
    expect(restored.settlements.villages.length).toBeGreaterThan(0);
    expect(restored.settlements.villages.flatMap(village=>village.volunteers).every(person=>!Object.hasOwn(person,'gender'))).toBe(true);
  });

  it('copies only the exact recruited local volunteer metadata, preserving genuinely absent legacy value',()=>{
    const start=createInitialWorld(1,'spirit-bloom');
    const walk:LLMDecisionPayload={chosenAction:'EXPLORE',innerMonologue:'亲往原村查访。'};
    const candidate:LLMDecisionPayload={chosenAction:'RECRUIT_SETTLER',targetSettlementId:villageId,
      targetVolunteerId:volunteerId,innerMonologue:'依法招收原登记人。'};
    const reached=next(start,walk);
    expect(reached.cultivators.find(actor=>actor.id===sponsorId)?.locationId).toBe(village(reached).locationId);
    expect(['woman','man']).toContain(volunteer(reached).gender);
    const enrolled=next(decodeWorldSave(encodeWorldSave(reached)),candidate);
    expect(enrolled.settlements.records).toContainEqual(expect.objectContaining({
      kind:'recruitment',volunteerId,cultivatorId:recruitId,tick:enrolled.tick,
    }));
    expect(recruit(enrolled).gender).toBe(volunteer(reached).gender);
    expect(volunteer(enrolled).enlistedCultivatorId).toBe(recruitId);
    const disputed=structuredClone(enrolled);
    recruit(disputed).gender=volunteer(disputed).gender==='woman'?'man':'woman';
    expect(()=>encodeWorldSave(disputed)).toThrow(/settlements.volunteers.genderLink/);
    const partial=structuredClone(enrolled);
    delete recruit(partial).gender;
    expect(Object.hasOwn(recruit(decodeWorldSave(encodeWorldSave(partial))),'gender')).toBe(false);
    delete volunteer(disputed).gender;
    expect(recruit(decodeWorldSave(encodeWorldSave(disputed))).gender).toBe(recruit(disputed).gender);
    const legacyReached=clearMetadata(structuredClone(reached));
    const legacy=next(decodeEraWorldSave(encodeEraWorldSave(legacyReached)),candidate);
    expect(Object.hasOwn(recruit(legacy),'gender')).toBe(false);
    expect(Object.hasOwn(recruit(decodeWorldSave(encodeWorldSave(legacy))),'gender')).toBe(false);
    expect(Object.hasOwn(volunteer(legacy),'gender')).toBe(false);
  });

  it('rejects invalid raw enums on either exact kind, including explicit null',()=>{
    const raw=encodeEraWorldSave(createInitialWorld(1,'spirit-bloom'));
    for(const invalid of [null,'',false,0,'Woman','unknown',{}]){
      for(const who of ['actor','volunteer'] as const){
        const envelope:{world:WorldState}=JSON.parse(raw);
        const row=who==='actor'?envelope.world.cultivators[0]:volunteer(envelope.world);
        Object.assign(row,{gender:invalid});
        const shape=who==='actor'?/cultivators\[0\]\.gender/:/volunteers\[0\]\.gender/;
        expect(()=>decodeEraWorldSave(JSON.stringify(envelope))).toThrow(shape);
      }
    }
  });

  it('keeps actual preset recruit metadata in a verified detached checkpoint without a new format',async()=>{
    const world=buildHighDramaPreset('cold-jade-disciple')!.world;
    expect(world.builtinScenarioOrigin?.openedTick).toBe(3);
    expect(volunteer(world).enlistedCultivatorId).toBe(recruitId);
    expect(['woman','man']).toContain(recruit(world).gender);
    const source=encodeEraWorldSave(world);
    const packageData=await prepareEraCheckpoint(world,{branchId:'main'},readEra,{engineRuleVersion:'d'.repeat(64)});
    expect(packageData.manifest).toMatchObject({version:1,tick:3});
    const restored=await verifyEraCheckpoint(file(packageData.manifestFile.bytes),packageData.parts.map(row=>file(row.bytes)),readEra);
    expect(recruit(restored.world).gender).toBe(volunteer(restored.world).gender);
    expect(encodeEraWorldSave(restored.world)).toBe(source);
    expect(encodeEraWorldSave(world)).toBe(source);
  });
});
