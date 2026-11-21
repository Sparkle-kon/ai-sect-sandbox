import {createInitialWorld} from '../src/data/initialWorld';
import {availableAvatarHosts,possessAvatar,queueAvatarOrder} from '../src/engine/avatarEngine';
import {createAuthoredEraWorkerController,type AuthoredEraWorkerResponse} from '../src/engine/authoredEraBuildEngine';
import {createEraDesignDraft,type EraDesignDraft} from '../src/engine/eraDesignSchema';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {appendAuthoredTimelineRoot,createTimeline,forkTimeline,readTimelineHead,selectTimelineBranch} from '../src/engine/timelineEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {WorldState} from '../src/types/world';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const build=(draft:EraDesignDraft,runId:string)=>new Promise<Extract<AuthoredEraWorkerResponse,{type:'authored_era_ready'|'authored_era_error'}>>(resolve=>{
  const receive=createAuthoredEraWorkerController({ruleVersion:__SECT_UTILITY_RULE_VERSION__,
    post:message=>{if(message.type==='authored_era_ready'||message.type==='authored_era_error')resolve(message);},
    schedule:callback=>setTimeout(callback,0),cancelSchedule:token=>clearTimeout(token as ReturnType<typeof setTimeout>)});
  receive({type:'authored_era_start',draft,runId});
});
const seed=2031,profile='spirit-bloom',north='loc-vein-north';
const native=createInitialWorld(seed,profile);
const old=selectTimelineBranch(forkTimeline(createTimeline(native),native.tick,{type:'SPAWN_TREASURE',targetLocationId:'loc-market'}),'main');
const head=old.branches.find(row=>row.id===old.activeBranchId)?.snapshots.at(-1);
if(!head)throw Error('旧线缺少原生起点。');
const oldFrames=(timeline:typeof old)=>timeline.branches.slice(0,old.branches.length).map(row=>row.snapshots.map(entry=>encodeEraWorldSave(entry.world)));
const bytesBefore=JSON.stringify(oldFrames(old));
const intended=['elder-danxia-1','elder-danxia-2','founder-spirit-bloom-sect-danxia-1'];
const draft=(members:readonly string[])=>createEraDesignDraft(seed,profile,{year:1001,month:1},{year:1001,month:2},[
  {kind:'jade_vein_depleted',siteId:north,spiritQi:50,jadeCapacity:0},
  {kind:'danxia_branch_moves_north',destinationId:north,memberIds:members,stones:100},
]);
const good=await build(draft(intended),'demo-good');
if(good.type!=='authored_era_ready')throw Error('未生成核验过的作者纪元 '+JSON.stringify(good));
const bad=await build(draft(['npc-6',...intended.slice(1)]),'demo-unavailable');
if(bad.type!=='authored_era_error'||bad.reason!=='constraints')throw Error('不在场的对象不应被替换。');
const opening=decodeEraWorldSave(good.candidate.resultText);
const next=appendAuthoredTimelineRoot(old,old.activeBranchId,head,opening);
if(old.branches.length!==2||next.branches.length!==3||JSON.stringify(oldFrames(next))!==bytesBefore)
  throw Error('独立支的创建改变了原线。');
const origin=opening.authoredEraOrigin;
if(!origin)throw Error('开局缺少作者来源。');
const actor=availableAvatarHosts(opening).find(row=>intended.includes(row.id));
if(!actor||opening.playerAvatar.possessedId)throw Error('开局应旁观，并保留实际合资格人物。');
const restored=decodeEraWorldSave(encodeEraWorldSave(opening));
const follow=(world:WorldState)=>{
  if(!possessAvatar(world,actor.id)||!queueAvatarOrder(world,'REST'))throw Error('无法通过现有规则安排行动。');
  return advanceWorldTick(world);
};
const followA=follow(restored),followB=follow(decodeEraWorldSave(good.candidate.resultText));
if(encodeEraWorldSave(followA)!==encodeEraWorldSave(followB)||followA.cultivators.find(row=>row.id===actor.id)?.currentAction!=='REST')
  throw Error('未正常读回后续实际行动。');
console.log(JSON.stringify({seed,profile,rule:__SECT_UTILITY_RULE_VERSION__,opening:good.candidate.target,
  baselineSha:good.candidate.baselineSha256,resultSha:good.candidate.resultSha256,resultBytes:good.candidate.resultBytes,
  effects:origin.effects,priorAtOpening:origin.openingEventIds.length,oldBranches:old.branches.length,
  nextBranches:next.branches.length,oldUnchanged:true,independentRoot:!next.branches.at(-1)?.parentBranchId,
  unsuccessful:bad,next:{tick:followA.tick,role:actor.name,actual:'REST',originalTick:readTimelineHead(old)?.tick,byteExactRestore:true}}));
