import {describe,expect,it} from 'vitest';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {prepareEraCheckpoint,verifyEraCheckpoint,type EraInput} from '../src/engine/eraCheckpointEngine';
import {advanceWorldTick,executeGodIntervention} from '../src/engine/worldEngine';
import {activeAvatar,availableAvatarHosts,possessAvatar} from '../src/engine/avatarEngine';
import {projectFieldObservatory} from '../src/engine/fieldObservatoryEngine';
import {householdCensus} from '../src/engine/householdEngine';
import {presentAtVillageGranary} from '../src/engine/villageGranaryEngine';
import {appendAuthoredTimelineRoot,createTimeline,forkTimelineCampaignCheckpoint,readTimelineHead,recordTimelineWorld,selectTimelineBranch} from '../src/engine/timelineEngine';
import type {WorldState} from '../src/types/world';
import {listEraCounterpointTicks,projectEraCounterpoint,verifyEraCounterpoint} from '../src/engine/eraCounterpointEngine';
import {prepareE210PairedDemo,prepareE210ReadingFixture,north,villageId,reader,villageReader} from './fixtures/eraCounterpointFixture';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const RULE=__SECT_UTILITY_RULE_VERSION__;
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const asFile=(data:Uint8Array):EraInput=>({size:data.byteLength,async arrayBuffer(){return data.slice().buffer;}});
const actor=(world:WorldState,id:string)=>world.cultivators.find(value=>value.id===id)!;
const site=(world:WorldState,id:string)=>world.locations.find(value=>value.id===id)!;
const view=(world:WorldState)=>projectFieldObservatory(world,actor(world,reader)).runs.find(row=>row.openedTick===6&&row.targetTick===8);

async function checkpoint(world:WorldState,branchId:string) {
  const exported=await prepareEraCheckpoint(world,{timelineId:'e210-native-seed70',branchId},codec,{engineRuleVersion:RULE});
  const checked=await verifyEraCheckpoint(asFile(exported.manifestFile.bytes),exported.parts.map(file=>asFile(file.bytes)),codec);
  expect(encodeEraWorldSave(checked.world)).toBe(encodeEraWorldSave(world));
  return checked;
}
describe('real E2-10 natural versus declared reading demo',()=>{
  it('proves the untouched natural opening before contrasting actual role-scoped retained parallel facts',async()=>{
    const demo=await prepareE210ReadingFixture();
    const verified=await verifyEraCounterpoint(demo.timeline,demo.naturalId,demo.authoredId);
    expect(verified).toMatchObject({ok:true,proof:{opening:{tick:6,year:1001,month:6}}});
    if(!verified.ok)throw Error('没有取得真实配对凭据。');
    expect(listEraCounterpointTicks(demo.timeline,verified.proof)).toEqual([6,7]);
    const siteProof=projectEraCounterpoint(demo.timeline,verified.proof,6,{naturalViewerId:reader,authoredViewerId:reader});
    expect(siteProof).toMatchObject({ok:true,natural:{north:{name:'极北寒玉脉',ownership:{kind:'unowned'},qi:97,
      qiEvidence:{kind:'native_snapshot',tick:6},ownershipEvidence:{kind:'native_snapshot',tick:6}},obligations:[expect.objectContaining({kind:'observatory',openedTick:6,dueTick:8})]},
      authored:{north:{name:'极北寒玉脉',ownership:{kind:'owned'},qi:50,qiEvidence:{kind:'authored_opening',tick:6},ownershipEvidence:{kind:'authored_opening',tick:6}},
        obligations:[expect.objectContaining({kind:'observatory',openedTick:6,dueTick:8})]}});
    const villageProof=projectEraCounterpoint(demo.timeline,verified.proof,6,{
      naturalViewerId:villageReader,authoredViewerId:villageReader,settlementId:villageId});
    expect(villageProof).toMatchObject({ok:true,natural:{village:{name:'万仙坊市外村',population:68,capacity:90}},
      authored:{village:{name:'万仙坊市外村',population:68,capacity:98}}});
    const empty=projectEraCounterpoint(demo.timeline,verified.proof,6,{naturalViewerId:'unknown-marker',authoredViewerId:villageReader});
    expect(empty).toMatchObject({ok:true,natural:{obligations:[]}});
    if(empty.ok)expect(empty.natural.north).toBeUndefined();
    const sameDateOtherSide=projectEraCounterpoint(demo.timeline,verified.proof,7,{naturalViewerId:reader,authoredViewerId:reader});
    expect(sameDateOtherSide).toMatchObject({ok:true,natural:{asOf:{tick:7}},authored:{asOf:{tick:7}}});
    expect(projectEraCounterpoint(demo.timeline,{...verified.proof},6)).toMatchObject({ok:false,reason:'stale_proof'});
  });

  it('preserves a genuine pre-opening instrument promise and household position, and both timelines independently act and round-trip',async()=>{
    const {genesis,natural,authored,baselineDigest,village}=await prepareE210PairedDemo();
    expect([natural.tick,natural.year,natural.month]).toEqual([6,1001,6]);
    expect(site(natural,north).ownerSectId).toBeUndefined();
    const declared=authored.authoredEraOrigin!.effects.find(row=>row.kind==='danxia_branch_moves_north')!;
    expect(site(authored,north).ownerSectId).toBe(declared.branchSectId);
    expect(authored.authoredEraOrigin?.baselineDigest).toBe(baselineDigest);
    expect(actor(natural,reader).locationId).toBe(north);
    expect(actor(authored,reader).locationId).toBe(north);
    expect(view(natural)).toMatchObject({status:'pending',locationId:north,openedTick:6,targetTick:8});
    expect(view(authored)).toEqual(view(natural));
    expect(natural.resourceFlow.months.find(month=>month.tick===6)?.entries.some(row=>row.reason==='observatory_instrument'&&
      row.kind==='consumption'&&row.from.id===reader&&row.good==='stone'&&row.amount===5)).toBe(true);
    const otherLocal=natural.cultivators.find(row=>row.id!==reader&&presentAtVillageGranary(natural,row)?.id===villageId);
    expect(otherLocal).toBeDefined();
    expect(presentAtVillageGranary(authored,actor(authored,otherLocal!.id))?.id).toBe(villageId);
    expect(householdCensus(authored,villageId)).toEqual(householdCensus(natural,villageId));
    expect(authored.settlements.villages.find(row=>row.id===villageId)?.capacity).toBe(village.capacity+8);
    expect(await checkpoint(natural,'branch-1')).toMatchObject({manifest:{payloadSha256:baselineDigest,tick:6}});

    const initial=createTimeline(genesis);
    const withNatural=forkTimelineCampaignCheckpoint(initial,'main',genesis.tick,{world:natural,startTick:genesis.tick,
      requestedTicks:5,completedTicks:5,baseRandomState:genesis.random.state,baseInterventionSequence:genesis.interventionSequence});
    const naturalId=withNatural.activeBranchId;
    const originalRef=withNatural.branches[0];
    const joined=appendAuthoredTimelineRoot(withNatural,naturalId,withNatural.branches.find(row=>row.id===naturalId)!.snapshots.at(-1)!,authored);
    const authoredId=joined.activeBranchId;
    expect(joined.branches).toHaveLength(3);
    expect(joined.branches[0]).toBe(originalRef);
    expect(joined.branches.find(row=>row.id===authoredId)?.parentBranchId).toBeUndefined();

    const actedAuthored=readTimelineHead(joined)!;
    expect(availableAvatarHosts(actedAuthored).some(row=>row.id===reader)).toBe(true);
    expect(possessAvatar(actedAuthored,reader)).toBe(true);
    const alteredAuthored=executeGodIntervention(actedAuthored,{type:'WHISPER_MIND',targetCultivatorId:reader,
      whisperText:'按约观象，先核对现场实况。'});
    expect(alteredAuthored.interventionSequence).toBe(authored.interventionSequence+1);
    const onAuthored=recordTimelineWorld(joined,alteredAuthored);

    const back=selectTimelineBranch(onAuthored,naturalId);
    const actedNatural=readTimelineHead(back)!;
    expect(possessAvatar(actedNatural,reader)).toBe(true);
    const alteredNatural=executeGodIntervention(actedNatural,{type:'SPAWN_TREASURE',targetLocationId:north});
    expect(alteredNatural.interventionSequence).toBe(natural.interventionSequence+1);
    const separated=recordTimelineWorld(back,alteredNatural);
    expect(separated.branches[0]).toBe(originalRef);
    expect(separated.branches).toHaveLength(3);
    const canonical=await prepareE210ReadingFixture();
    expect(canonical.timeline.branches.find(row=>row.id===canonical.naturalId)?.snapshots.some(point=>point.tick===6&&
      encodeEraWorldSave(point.world)===encodeEraWorldSave(natural))).toBe(true);
    const afterNatural=canonical.naturalLater;
    const afterAuthored=canonical.authoredLater;
    const [naturalRead,authoredRead]=await Promise.all([checkpoint(afterNatural,naturalId),checkpoint(afterAuthored,authoredId)]);
    expect(authoredRead.world.authoredEraOrigin?.baselineDigest).toBe(baselineDigest);
    expect(naturalRead.world.authoredEraOrigin).toBeUndefined();
    expect([naturalRead.world.tick,authoredRead.world.tick]).toEqual([7,7]);
    expect(activeAvatar(naturalRead.world)?.id).toBe(reader);
    expect(activeAvatar(authoredRead.world)?.id).toBe(reader);
    const next=[naturalRead.world,authoredRead.world].map(world=>advanceWorldTick(world,undefined,undefined,'utility'));
    expect(next.map(world=>world.tick)).toEqual([8,8]);
    expect(next.map(world=>view(world)?.status)).toEqual(['measured','measured']);
  });
});
