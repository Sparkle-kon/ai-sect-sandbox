import {createInitialWorld} from '../../src/data/initialWorld';
import {createEraDesignDraft,encodeEraDesignDraft} from '../../src/engine/eraDesignSchema';
import {applyAuthoredEraDesign} from '../../src/engine/authoredEraEngine';
import {authoredEraBuildSha256} from '../../src/engine/authoredEraBuildEngine';
import {encodeEraWorldSave} from '../../src/engine/storageEngine';
import {advanceWorldTick,executeGodIntervention} from '../../src/engine/worldEngine';
import {possessAvatar} from '../../src/engine/avatarEngine';
import {appendAuthoredTimelineRoot,createTimeline,forkTimelineCampaignCheckpoint,readTimelineHead,recordTimelineWorld,selectTimelineBranch}
  from '../../src/engine/timelineEngine';
declare const __SECT_UTILITY_RULE_VERSION__:string;
const RULE=__SECT_UTILITY_RULE_VERSION__;
const seed=70,profile='spirit-bloom' as const;
export const north='loc-vein-north',villageId='village-loc-market',reader='npc-2',villageReader='npc-6';
const intended=['elder-danxia-1','elder-danxia-2','founder-spirit-bloom-sect-danxia-1'];
const encoder=new TextEncoder();

function actualWorld(){
  const genesis=createInitialWorld(seed,profile);
  let natural=genesis;
  for(let i=0;i<5;i++)natural=advanceWorldTick(natural,undefined,undefined,'utility');
  return {genesis,natural};
}
export async function prepareE210PairedDemo(){
  const {genesis,natural}=actualWorld();
  const village=natural.settlements.villages.find(row=>row.id===villageId)!;
  const draft=createEraDesignDraft(seed,profile,{year:genesis.year,month:genesis.month},{year:natural.year,month:natural.month},[
    {kind:'jade_vein_depleted',siteId:north,spiritQi:50,jadeCapacity:0},
    {kind:'danxia_branch_moves_north',destinationId:north,memberIds:intended,stones:100},
    {kind:'village_capacity',settlementId:village.id,capacity:village.capacity+8},
  ]);
  const [baselineDigest,designDigest]=await Promise.all([authoredEraBuildSha256(encoder.encode(encodeEraWorldSave(natural))),
    authoredEraBuildSha256(encoder.encode(encodeEraDesignDraft(draft)))]);
  const authored=applyAuthoredEraDesign(draft,natural,{baselineDigest,designDigest,rulesRevision:RULE});
  return {genesis,natural,authored,draft,baselineDigest,village};
}

/** Keep the genuine untouched T6 native receipt by taking actions after both actually advance to T7. */
export async function prepareE210ReadingFixture() {
  const source=await prepareE210PairedDemo();
  const {genesis,natural,authored}=source;
  const initial=createTimeline(genesis);
  const withNatural=forkTimelineCampaignCheckpoint(initial,'main',genesis.tick,{world:natural,startTick:genesis.tick,
    requestedTicks:5,completedTicks:5,baseRandomState:genesis.random.state,baseInterventionSequence:genesis.interventionSequence});
  const naturalId=withNatural.activeBranchId;
  const head=withNatural.branches.find(row=>row.id===naturalId)?.snapshots.at(-1);
  if(!head)throw Error('未找到真实自然线的开局。');
  let timeline=appendAuthoredTimelineRoot(withNatural,naturalId,head,authored);
  const authoredId=timeline.activeBranchId;
  const touredAuthor=advanceWorldTick(readTimelineHead(timeline)!);
  const touredNatural=advanceWorldTick(readTimelineHead(timeline,naturalId)!);
  if(!possessAvatar(touredAuthor,reader)||!possessAvatar(touredNatural,reader))throw Error('隔离角色不能按实际资格入世。');
  const authoredLater=executeGodIntervention(touredAuthor,{type:'WHISPER_MIND',targetCultivatorId:reader,
    whisperText:'按约观象，先核对现场实况。'});
  const naturalLater=executeGodIntervention(touredNatural,{type:'SPAWN_TREASURE',targetLocationId:north});
  timeline=recordTimelineWorld(timeline,authoredLater,authoredId);
  timeline=recordTimelineWorld(selectTimelineBranch(timeline,naturalId),naturalLater,naturalId);
  timeline=selectTimelineBranch(timeline,authoredId);
  return {...source,timeline,naturalId,authoredId,authoredLater,naturalLater};
}
