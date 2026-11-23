import { describe, expect, it } from 'vitest';
import { buildConfirmedShareSave, prepareShareSavePrivacy } from '../src/engine/shareSavePrivacy';
import { createManagedSectWorld } from '../src/engine/starterSectWorld';
import { decodeEraWorldSave, decodeWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { SectJobAssignment } from '../src/types/sectJobs';
import { sectPairDramaEventId } from '../src/types/sectPairDrama';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'这一回先歇着。'};
const monthly=(world:WorldState,sectJobAssignments:readonly SectJobAssignment[]=[])=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(actor=>[actor.id,rest])),undefined,'utility',undefined,
  {sectJobAssignments,capturePresentation:false,captureTrace:false});
const start=()=>createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0)!;

function realPair(kind:'crush'|'blame'='crush'){
  const before=start(),state=before.sectManagement!;
  const [,a,b]=state.foundingDiscipleIds;
  Object.assign(before.cultivators.find(actor=>actor.id===a)!,{age:20,quirks:[kind==='crush'?'lovestruck':'contrarian']});
  Object.assign(before.cultivators.find(actor=>actor.id===b)!,{age:21,quirks:[kind==='crush'?'shy':'coward_king']});
  before.relationships=before.relationships.filter(edge=>
    !(edge.fromId===a&&edge.toId===b||edge.fromId===b&&edge.toId===a));
  before.relationships.push({fromId:a,toId:b,type:'同门',affinity:kind==='crush'?65:32,note:'熟识。'});
  const jobId=kind==='crush'?'cultivate':'guard';
  const world=monthly(before,[{discipleId:a,jobId},{discipleId:b,jobId}]);
  const scene=world.sectManagement?.pairDrama;
  if(!scene||scene.kind!==kind)throw new Error(`Expected a genuine ${kind} scene from the live meeting`);
  return {world,scene,markerId:sectPairDramaEventId(scene.tick,scene.sectId)};
}

describe('portable same-job disciple drama',()=>{
  it('preserves legacy absence; genuine dated history survives share redaction and later departures',()=>{
    const initial=encodeEraWorldSave(start());
    const restored=decodeEraWorldSave(initial);
    expect(restored.sectManagement?.pairDrama).toBeUndefined();
    expect(encodeEraWorldSave(restored)).toBe(initial);
    const {world,scene}=realPair();
    const raw=encodeEraWorldSave(world);
    expect(encodeEraWorldSave(decodeEraWorldSave(raw))).toBe(raw);
    const review=prepareShareSavePrivacy(world);
    expect(review.status).toBe('ready');
    const share=buildConfirmedShareSave(world,review);
    expect(share&&decodeWorldSave(share.json).sectManagement?.pairDrama).toEqual(scene);

    const other=world.sectManagement!.foundingDiscipleIds[0];
    const later=monthly(world,[{discipleId:other,jobId:'guard'}]);
    const former=later.cultivators.find(actor=>actor.id===scene.initiatorId)!;
    former.locationId='loc-market';former.sectId='';former.sectRank='外门弟子';
    expect(later.sectManagement?.latestReport?.settledTick).toBe(later.tick);
    expect(decodeEraWorldSave(encodeEraWorldSave(later)).sectManagement?.pairDrama).toEqual(scene);
  });


  it('accepts two genuinely abandoned chores, but will not attach blame to two performed duties',()=>{
    const {world,scene}=realPair('blame');
    const done=decodeEraWorldSave(encodeEraWorldSave(world));
    expect(done.sectManagement?.pairDrama).toEqual(scene);
    const state=done.sectManagement!,report=state.latestReport!;
    expect(report.rows.map(row=>row.phase)).toEqual(['unavailable','unavailable']);
    state.latestReport={...report,rows:report.rows.map(row=>({...row,phase:'performed',tier:'success',
      siteId:scene.siteId,sourceEventId:`evt-${scene.tick}-${row.discipleId}-management-guard`}))};
    expect(()=>encodeEraWorldSave(done)).toThrow(/sectManagement.pairDrama.source/u);
  });

  it('rejects wrong/tampered runtime coordinates and a private marker expanded into public evidence',()=>{
    const {world,scene,markerId}=realPair(),[a,b]=scene.pair;
    const marker=world.events.find(event=>event.id===markerId)!;
    for(const mutate of [
      (copy:WorldState)=>{delete copy.sectManagement!.pairDrama;},
      (copy:WorldState)=>{copy.sectManagement!.pairDrama={...scene,pair:[b,a]};},
      (copy:WorldState)=>{copy.sectManagement!.pairDrama={...scene,pair:[a,a]};},
      (copy:WorldState)=>{copy.sectManagement!.pairDrama={...scene,initiatorId:copy.sectManagement!.leaderId};},
      (copy:WorldState)=>{copy.sectManagement!.pairDrama={...scene,siteId:'loc-market'};},
      (copy:WorldState)=>{copy.sectManagement!.pairDrama={...scene,jobId:'guard'};},
      (copy:WorldState)=>{copy.sectManagement!.pairDrama={...scene,affinityChange:1.5};},
      (copy:WorldState)=>{copy.sectManagement!.pairDrama={...scene,tick:scene.tick+1};},
      (copy:WorldState)=>{copy.sectManagement!.pairDrama={...scene,outcome:'aborted'};},
      (copy:WorldState)=>{Object.assign(copy.sectManagement!.pairDrama!,{quote:'不该进存档。'});},
      (copy:WorldState)=>{copy.events.find(event=>event.id===markerId)!.actorIds=[a,b];},
      (copy:WorldState)=>{copy.events.find(event=>event.id===markerId)!.description='泄露私心。';},
      (copy:WorldState)=>{delete copy.events.find(event=>event.id===markerId)!.witnessScope;},
      (copy:WorldState)=>{copy.chronicleArchive.anchors.push({id:marker.id,tick:marker.tick,
        year:marker.year,month:marker.month,title:marker.title,description:marker.description,category:marker.category,actorIds:[a]});},
    ]){
      const copy=structuredClone(world);
      mutate(copy);
      expect(()=>encodeEraWorldSave(copy)).toThrow(/sectManagement.pairDrama/u);
    }
  });
});
