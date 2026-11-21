import {describe,expect,it} from 'vitest';
import {listEraCounterpointCandidateTicks,listEraCounterpointTicks,projectEraCounterpoint,verifyEraCounterpoint} from '../src/engine/eraCounterpointEngine';
import {applyAuthoredEraDesign} from '../src/engine/authoredEraEngine';
import {encodeEraDesignDraft} from '../src/engine/eraDesignSchema';
import {authoredEraId} from '../src/engine/authoredEraProof';
import {campaignSHA256,readCampaignSource,sealCampaignSource} from '../src/engine/campaignMemento';
import {encodeEraWorldSave} from '../src/engine/storageEngine';
import {appendAuthoredTimelineRoot,forkTimeline,selectTimelineBranch,type TimelineSnapshot,type WorldTimeline} from '../src/engine/timelineEngine';
import type {WorldState} from '../src/types/world';
import {prepareE210ReadingFixture,north,reader,villageId,villageReader} from './fixtures/eraCounterpointFixture';

type Fixture=Awaited<ReturnType<typeof prepareE210ReadingFixture>>;
const shape=(timeline:WorldTimeline)=>timeline.branches.map(row=>row.snapshots.map(point=>encodeEraWorldSave(point.world)));
function corresponding(timeline:WorldTimeline,id:string,edit:(snapshots:readonly TimelineSnapshot[])=>readonly TimelineSnapshot[]):WorldTimeline{
  return {...timeline,branches:timeline.branches.map(row=>row.id===id?{...row,snapshots:edit(row.snapshots)}:row)};
}
function changedPoint(point:TimelineSnapshot,edit:(world:WorldState)=>void):TimelineSnapshot{
  const world=structuredClone(point.world);edit(world);
  return Object.freeze({tick:point.tick,world:Object.freeze(world)});
}
const verify=(f:Fixture)=>verifyEraCounterpoint(f.timeline,f.naturalId,f.authoredId);

describe('natural and authored futures are paired only by independently retained native SHA',()=>{
  it('authenticates the actual native T6 anchor and reads exact subsequent same-date snapshots after separate real interventions',async()=>{
    const f=await prepareE210ReadingFixture(),before=shape(f.timeline);
    expect(listEraCounterpointCandidateTicks(f.timeline,f.naturalId,f.authoredId)).toEqual([6,7]);
    const checked=await verify(f);
    expect(checked).toMatchObject({ok:true,proof:{naturalBranchId:f.naturalId,authoredBranchId:f.authoredId,
      naturalSourceBranchId:f.naturalId,opening:{tick:6,year:1001,month:6}}});
    if(!checked.ok)throw Error(checked.reason);
    const proof=checked.proof;
    expect(listEraCounterpointTicks(f.timeline,proof)).toEqual([6,7]);
    expect(projectEraCounterpoint(f.timeline,proof,5)).toEqual({ok:false,reason:'unaligned_frame'});
    expect(projectEraCounterpoint(f.timeline,proof,6.5)).toEqual({ok:false,reason:'invalid_tick'});
    const original=projectEraCounterpoint(f.timeline,proof,6,{naturalViewerId:reader,authoredViewerId:reader});
    expect(original).toMatchObject({ok:true,
      natural:{source:'native',asOf:{tick:6,year:1001,month:6},firstRetained:{tick:1},north:{
        siteId:north,ownership:{kind:'unowned'},evidence:{kind:'native_snapshot',tick:6}},
        obligations:[{kind:'observatory',openedTick:6,dueTick:8,status:'pending'}]},
      authored:{source:'authored',asOf:{tick:6,year:1001,month:6},firstRetained:{tick:6},north:{
        siteId:north,qi:50,ownership:{kind:'owned',sectName:expect.stringContaining('丹霞')},evidence:{kind:'authored_opening',tick:6}},
        obligations:[{kind:'observatory',openedTick:6,dueTick:8,status:'pending'}]},
    });
    const later=projectEraCounterpoint(f.timeline,proof,7,{naturalViewerId:reader,authoredViewerId:reader});
    expect(later).toMatchObject({ok:true,
      natural:{asOf:{tick:7},north:{ownership:{kind:'unowned'},evidence:{kind:'native_snapshot',tick:7}},
        obligations:[{kind:'observatory',openedTick:6,dueTick:8,status:'pending'}]},
      authored:{asOf:{tick:7},north:{ownership:{kind:'owned'},evidence:{kind:'played_snapshot',tick:7}},
        obligations:[{kind:'observatory',openedTick:6,dueTick:8,status:'pending'}]}});
    expect(shape(f.timeline)).toEqual(before);
    const selected=f.timeline.branches.find(row=>row.id===f.authoredId)!.snapshots.at(-1)!.world;
    const archive=await sealCampaignSource(f.timeline,'actual-dual-era',selected);
    const restored=await readCampaignSource(archive);
    expect(projectEraCounterpoint(restored.timeline,proof,7)).toEqual({ok:false,reason:'stale_proof'});
    const reopened=await verifyEraCounterpoint(restored.timeline,f.naturalId,f.authoredId);
    expect(reopened.ok).toBe(true);
    if(reopened.ok)expect(projectEraCounterpoint(restored.timeline,reopened.proof,7,
      {naturalViewerId:reader,authoredViewerId:reader})).toEqual(later);
  });

  it('withholds each branch’s private commitment and local resident aggregates independently; never substitutes a viewer',async()=>{
    const {timeline,naturalId,authoredId,village}=await prepareE210ReadingFixture();
    const o=await verifyEraCounterpoint(timeline,naturalId,authoredId);
    if(!o.ok)throw Error(o.reason);
    const localBoth=projectEraCounterpoint(timeline,o.proof,6,{naturalViewerId:villageReader,authoredViewerId:villageReader,settlementId:villageId});
    expect(localBoth).toMatchObject({ok:true,
      natural:{obligations:[],village:{settlementId:villageId,population:village.population,capacity:village.capacity,
        householdGroups:expect.any(Number),registeredResidents:expect.any(Number),evidence:{kind:'native_snapshot',tick:6}}},
      authored:{obligations:[],village:{settlementId:villageId,population:village.population,capacity:village.capacity+8,
        householdGroups:expect.any(Number),registeredResidents:expect.any(Number),evidence:{kind:'authored_opening',tick:6},
        populationEvidence:{kind:'native_snapshot',tick:6},capacityEvidence:{kind:'authored_opening',tick:6}}}});
    if(!localBoth.ok)throw Error('Expected real village viewer');
    expect(localBoth.natural.north).toBeUndefined();
    expect(localBoth.authored.north).toBeUndefined();
    const leftOnly=projectEraCounterpoint(timeline,o.proof,6,{naturalViewerId:reader,authoredViewerId:villageReader,settlementId:villageId});
    expect(leftOnly).toMatchObject({ok:true,natural:{obligations:[{kind:'observatory'}]},authored:{obligations:[],village:{settlementId:villageId}}});
    if(!leftOnly.ok)throw Error('Expected independent audience');
    expect(leftOnly.natural.village).toBeUndefined();expect(leftOnly.authored.north).toBeUndefined();
    const none=projectEraCounterpoint(timeline,o.proof,6,{naturalViewerId:'fictional-viewer',authoredViewerId:'fictional-viewer'});
    if(!none.ok)throw Error('Expected withholding with retained port');
    expect([none.natural.obligations,none.authored.obligations]).toEqual([[],[]]);
    expect(none.natural.north).toBeUndefined();expect(none.authored.village).toBeUndefined();
    expect(JSON.stringify(leftOnly)).not.toMatch(/forecast|reading|actorId|courierId|patientId|private|baselineDigest/);
  });

  it('does not turn an authored Qi-only change into invented title or resident provenance',async()=>{
    const f=await prepareE210ReadingFixture();
    const draft={...f.draft,conditions:f.draft.conditions.filter(condition=>condition.kind!=='danxia_branch_moves_north')};
    const designDigest=await campaignSHA256(new TextEncoder().encode(encodeEraDesignDraft(draft)));
    const authored=applyAuthoredEraDesign(draft,f.natural,{baselineDigest:f.baselineDigest,designDigest,
      rulesRevision:f.authored.authoredEraOrigin!.rulesRevision});
    const active=selectTimelineBranch(f.timeline,f.naturalId);
    const head=active.branches.find(branch=>branch.id===f.naturalId)!.snapshots.at(-1)!;
    const separate=appendAuthoredTimelineRoot(active,f.naturalId,head,authored);
    const check=await verifyEraCounterpoint(separate,f.naturalId,separate.activeBranchId);
    if(!check.ok)throw Error(check.reason);
    const result=projectEraCounterpoint(separate,check.proof,6,{naturalViewerId:villageReader,authoredViewerId:reader});
    expect(result).toMatchObject({ok:true,
      authored:{north:{qi:50,ownership:{kind:'unowned'},qiEvidence:{kind:'authored_opening',tick:6},
        ownershipEvidence:{kind:'native_snapshot',tick:6}}},
      natural:{village:{populationEvidence:{kind:'native_snapshot',tick:6}}}});
  });

  it('rejects a same-seed but changed native frame, forged authored draft/effect, missing source, cloned proof and cancellation',async()=>{
    const f=await prepareE210ReadingFixture(),good=await verify(f);
    if(!good.ok)throw Error(good.reason);
    const altered=corresponding(f.timeline,f.naturalId,all=>all.map(point=>point.tick!==6?point:
      changedPoint(point,world=>{world.cultivators[0].spiritStones++;})));
    expect(listEraCounterpointCandidateTicks(altered,f.naturalId,f.authoredId)).toEqual([6,7]);
    expect(await verifyEraCounterpoint(altered,f.naturalId,f.authoredId)).toEqual({ok:false,reason:'baseline_mismatch'});
    const trimmed=corresponding(f.timeline,f.naturalId,all=>all.filter(row=>row.tick!==6));
    expect(await verifyEraCounterpoint(trimmed,f.naturalId,f.authoredId)).toEqual({ok:false,reason:'opening_unretained'});
    expect(projectEraCounterpoint(trimmed,good.proof,7)).toEqual({ok:false,reason:'stale_proof'});
    expect(projectEraCounterpoint(f.timeline,{...good.proof},7)).toEqual({ok:false,reason:'stale_proof'});
    for(const type of ['draft','effect'] as const){
      const corrupted=corresponding(f.timeline,f.authoredId,all=>all.map(point=>point.tick!==7?point:changedPoint(point,world=>{
        const tagged=world.authoredEraOrigin!;
        if(type==='draft'){
          tagged.draft={...tagged.draft,anchor:{year:1001,month:2}};
          tagged.id=authoredEraId(tagged);
        }else{
          const receipt=tagged.effects[0];
          if(receipt.kind==='jade_vein_depleted')receipt.before.spiritQi++;
        }
      })));
      expect(await verifyEraCounterpoint(corrupted,f.naturalId,f.authoredId)).toEqual({ok:false,reason:'invalid_origin'});
    }
    const aborted=new AbortController();aborted.abort();
    expect(await verifyEraCounterpoint(f.timeline,f.naturalId,f.authoredId,aborted.signal)).toEqual({ok:false,reason:'aborted'});
  });

  it('accepts the exact retained parent frame when its native child intervenes on opening day, but never a pre-opening ancestor',async()=>{
    const f=await prepareE210ReadingFixture();
    const child=forkTimeline(selectTimelineBranch(f.timeline,f.naturalId),6,{type:'SPAWN_TREASURE',targetLocationId:north});
    const selected=child.activeBranchId;
    const allowed=await verifyEraCounterpoint(child,selected,f.authoredId);
    expect(allowed).toMatchObject({ok:true,proof:{naturalBranchId:selected,naturalSourceBranchId:f.naturalId,opening:{tick:6}}});
    if(allowed.ok)expect(listEraCounterpointTicks(child,allowed.proof)).toEqual([6]);
    const impossible={...child,branches:child.branches.map(row=>row.id===selected?{...row,forkTick:5}:row)};
    expect(await verifyEraCounterpoint(impossible,selected,f.authoredId)).toEqual({ok:false,reason:'baseline_mismatch'});
  });
});
