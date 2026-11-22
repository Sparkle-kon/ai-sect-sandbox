import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { readCampaignSource, sealCampaignSource } from '../src/engine/campaignMemento';
import { cloneWorldWithColdHistory } from '../src/engine/coldHistoryEngine';
import { buildHighDramaPreset } from '../src/engine/highDramaPresetEngine';
import { validateBuiltinScenarioOrigin } from '../src/engine/storageBuiltinScenarioValidation';
import { createScenarioFixture,replayScenario } from '../src/engine/scenarioEngine';
import { createMemorySaveBackend, createSaveStore, decodeEraWorldSave, decodeWorldSave, encodeEraWorldSave,encodeWorldSave } from '../src/engine/storageEngine';
import { createTimeline,readTimelineHead,readTimelineSnapshot,recordTimelineWorld } from '../src/engine/timelineEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { sameGeneratedWorld } from '../src/engine/worldIdentity';
import type { BuiltinScenarioPresetId, WorldState } from '../src/types/world';

const fixtures=new Map<BuiltinScenarioPresetId,WorldState>();
function built(id:BuiltinScenarioPresetId){
  const cached=fixtures.get(id);
  if(cached)return cached;
  const candidate=buildHighDramaPreset(id);
  if(!candidate)throw Error(`Actual native preset ${id} did not qualify`);
  fixtures.set(id,candidate.world);
  return candidate.world;
}
const advance=(world:WorldState)=>advanceWorldTick(world,Object.fromEntries(world.cultivators.map(actor=>[
  actor.id,{chosenAction:'REST' as const,innerMonologue:'留守本处。'},
])),()=>.99,'utility');
const originOf=(world:WorldState)=>world.builtinScenarioOrigin!;
function editEnvelope(world:WorldState,edit:(data:Record<string,unknown>)=>void){
  const raw:{world:Record<string,unknown>}=JSON.parse(encodeWorldSave(world));
  edit(raw.world);
  return ()=>decodeWorldSave(JSON.stringify(raw));
}

describe('builtin native scenario origin persistence',()=>{
  it.each([
    ['storm-at-blood-moon',7,1001,7],
    ['tournament-eve',62,1006,2],
    ['cold-jade-disciple',3,1001,3],
  ] as const)('round-trips actual %s T%s; its first timeline frame is the real opening date',async (id,tick,year,month)=>{
    const world=built(id);
    const source=encodeEraWorldSave(world),decoded=decodeEraWorldSave(source);
    expect(decoded).toMatchObject({tick,year,month,builtinScenarioOrigin:{version:1,id,openedTick:tick}});
    expect(encodeEraWorldSave(decoded)).toBe(source);
    const timeline=createTimeline(world);
    expect(timeline.branches[0].snapshots.map(row=>row.tick)).toEqual([tick]);
    expect(readTimelineSnapshot(timeline,tick-1)).toBeUndefined();
    expect(readTimelineHead(timeline)?.builtinScenarioOrigin).toEqual(originOf(world));
    const next=advance(world),retained=recordTimelineWorld(timeline,next);
    expect(originOf(next)).toEqual(originOf(world));
    expect(retained.branches[0].snapshots.map(row=>row.tick)).toEqual([tick,tick+1]);
    const pack=await sealCampaignSource(retained,`preset-${id}`,next);
    const restored=await readCampaignSource(structuredClone(pack));
    expect(restored.timeline.branches[0].snapshots.map(row=>row.tick)).toEqual([tick,tick+1]);
    expect(encodeEraWorldSave(restored.world)).toBe(encodeEraWorldSave(cloneWorldWithColdHistory(next)));
    expect(restored.world.builtinScenarioOrigin).toEqual(originOf(world));
    expect(encodeEraWorldSave(world)).toBe(source);
  },20_000);

  it('does not conflate same seed/profile independent presets, unmarked genesis, or a mismarked active frame',async()=>{
    const world=built('cold-jade-disciple'),other=built('storm-at-blood-moon');
    const timeline=createTimeline(world);
    const unmarked=structuredClone(world);delete unmarked.builtinScenarioOrigin;
    expect(sameGeneratedWorld(world,other)).toBe(false);
    expect(sameGeneratedWorld(world,unmarked)).toBe(false);
    expect(recordTimelineWorld(timeline,other)).toBe(timeline);
    expect(recordTimelineWorld(timeline,unmarked)).toBe(timeline);
    await expect(sealCampaignSource(timeline,'other-origin-cannot-publish',other)).rejects.toMatchObject({code:'invalid'});
    const store=createSaveStore(createMemorySaveBackend(),()=>35);
    await store.save('slot-preset','寒玉初入',world,null,{branchId:'main',label:'原始时间线',timelineId:'ghost-frame-1'});
    await store.save('slot-independent','血月首战',other,null,{branchId:'main',label:'原始时间线',timelineId:'ghost-frame-1'});
    const reviewed=await store.inspect('slot-preset');
    expect((await store.loadSelected(reviewed.current!.selection)).builtinScenarioOrigin).toEqual(originOf(world));
    const comparison=await store.reviewResumePair({slotId:'slot-preset',point:'current'},{slotId:'slot-independent',point:'current'});
    expect(comparison.relation).toBe('different_origins');
  });

  it('rejects forged metadata without changing old scenario-file import semantics or absent bytes',()=>{
    const plain=encodeWorldSave(createInitialWorld(1,'spirit-bloom'));
    expect(plain).not.toContain('"builtinScenarioOrigin"');
    expect(encodeWorldSave(decodeWorldSave(plain))).toBe(plain);
    const old=replayScenario(createScenarioFixture(1,'spirit-bloom',3));
    const oldRaw=encodeWorldSave(old),restored=decodeWorldSave(oldRaw);
    expect(restored.scenarioOrigin).toEqual(old.scenarioOrigin);
    expect(restored.builtinScenarioOrigin).toBeUndefined();
    expect(encodeWorldSave(restored)).toBe(oldRaw);
    const world=built('cold-jade-disciple');
    const marker=originOf(world);
    for(const forged of [{...marker,id:'made-up'}, {...marker,version:2}, {...marker,openedTick:7}, {...marker,source:'model'}]){
      expect(editEnvelope(world,value=>{value.builtinScenarioOrigin=forged;})).toThrow(/builtinScenarioOrigin/);
    }
    expect(editEnvelope(world,value=>{value.scenarioOrigin=old.scenarioOrigin;})).toThrow(/builtinScenarioOrigin.references/);
    expect(editEnvelope(world,value=>{value.worldgen={...world.worldgen,profileId:'classic'};})).toThrow(/builtinScenarioOrigin.references/);
    expect(editEnvelope(world,value=>{value.worldgen={...world.worldgen,seed:8};})).toThrow(/builtinScenarioOrigin.references/);
    expect(editEnvelope(world,value=>{value.random={...world.random,seed:8};})).toThrow(/builtinScenarioOrigin.references/);
    expect(editEnvelope(world,value=>{delete value.worldgen;})).toThrow(/builtinScenarioOrigin.references/);
    // A retimed full frame also fails earlier census checks. Isolate the
    // builtin provenance gate to exercise the independent native calendar.
    expect(()=>validateBuiltinScenarioOrigin({...world,year:world.year+1},path=>{throw Error(path);})).toThrow(/builtinScenarioOrigin.references/);
    expect(()=>validateBuiltinScenarioOrigin({...world,tick:world.tick-1,month:world.month-1},path=>{throw Error(path);}))
      .toThrow(/builtinScenarioOrigin.references/);
  });
});
