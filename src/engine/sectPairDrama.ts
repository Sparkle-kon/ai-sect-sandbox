import type {SectJobAssignment,SectJobReport,SectJobReportRow} from '../types/sectJobs';
import type {SectQuirkId} from '../types/sectManagement';
import {SECT_PAIR_DRAMA_EVENT_DESCRIPTION,SECT_PAIR_DRAMA_EVENT_TITLE,sectPairDramaEventId,type SectPairDrama,type SectPairDramaKind,type SectPairDramaPlan} from '../types/sectPairDrama';
import type {Cultivator,RelationshipEdge,WorldEvent,WorldState} from '../types/world';
import {activeAvatar} from './avatarEngine';
import {activeBellWatchForActor} from './bellWatchPresence';
import {isGrandSiegeFighterPresent} from './grandSiegePresence';
import {adjustRelationship} from './relationships';
import {eligibleSectDisciples,planSectJob,SECT_JOB_DEFINITIONS,type SectJobId} from './sectJobs';

type Pair=readonly [Cultivator,Cultivator];
interface PairTemplate {
  readonly kind:SectPairDramaKind;
  readonly types:readonly RelationshipEdge['type'][];
  readonly minimum:number;
  readonly maximum:number;
  readonly affinity:number;
  readonly title:string;
  readonly voices:readonly [string,string];
  readonly quirks?:readonly SectQuirkId[];
  readonly both?:boolean;
}
const TEMPLATES:readonly PairTemplate[]=[
  {kind:'blame',types:['同门','竞争'],minimum:-59,maximum:40,affinity:-2,title:'一差两推',
    quirks:['drama','contrarian','jinx','coward_king'],both:true,
    voices:['我只等同门先开口，哪知这门道竟有人同我想到一处。','分明说好谁先出声谁先动手。我倒盼自己嘴再快些。']},
  {kind:'crush',types:['同门','挚友'],minimum:15,maximum:100,affinity:1,title:'一句未说出口',
    quirks:['lovestruck'],
    voices:['原想多问道友一句，临到开口，竟只问了句这月几日。','差事已回完了。还有别的事么？']},
  {kind:'rivalry',types:['竞争'],minimum:-59,maximum:79,affinity:1,title:'差毕还要分高下',
    voices:['下回且再排一处。我不争先，但要知道是谁第二。','师门自有考评，何苦另立一榜，还把自己的名字写头一行。']},
  {kind:'prank',types:['挚友'],minimum:20,maximum:100,affinity:2,title:'谢礼留到下回',
    quirks:['drama','chatterbox','jinx'],
    voices:['今儿这点小玩笑，明日定不会再使同一招。','这份盛情我先记下。下个月一定原样奉还。']},
];
const isChore=(jobId:SectJobId):jobId is 'kitchen'|'guard'=>jobId==='kitchen'||jobId==='guard';
const edgeMatches=(edge:RelationshipEdge,a:string,b:string)=>
  edge.fromId===a&&edge.toId===b||edge.fromId===b&&edge.toId===a;
const healthy=(actor:Cultivator)=>actor.alive&&actor.hp>0&&actor.maxHp>0&&actor.hp>=actor.maxHp*.3;
const nearby=(world:WorldState,actor:Cultivator,siteId:string)=>
  actor.age>=18&&healthy(actor)&&isGrandSiegeFighterPresent(world,actor,siteId)&&!activeBellWatchForActor(world,actor);
const single=<T,>(rows:readonly T[],matches:(row:T)=>boolean):T|undefined=>{
  const found=rows.filter(matches);
  return found.length===1?found[0]:undefined;
};
const siteExists=(world:WorldState,id:string)=>{
  const site=single(world.locations,row=>row.id===id);
  return !!site&&site.type!=='abyss'&&site.expeditionOmenId===undefined;
};
const relationship=(world:WorldState,pair:readonly [string,string])=>
  single(world.relationships,row=>edgeMatches(row,...pair));
const ids=([first,second]:Pair):readonly [string,string]=>[first.id,second.id];

function members(world:WorldState,plan:SectPairDramaPlan):Pair|undefined{
  const roster=eligibleSectDisciples(world);
  const [a,b]=plan.pair;
  if(a>=b||!siteExists(world,plan.siteId))return;
  const first=roster.find(actor=>actor.id===a),second=roster.find(actor=>actor.id===b);
  if(first&&second&&nearby(world,first,plan.siteId)&&nearby(world,second,plan.siteId))return [first,second];
}

function localChores(world:WorldState,pair:Pair,jobId:SectJobId,siteId:string){
  return isChore(jobId)&&pair.every(actor=>{
    const job=planSectJob(world,actor,jobId);
    return job.kind==='chore'&&job.chore===jobId&&job.siteId===siteId&&job.decision.chosenAction==='REST';
  });
}

function initiator(world:WorldState,pair:Pair,edge:RelationshipEdge,template:PairTemplate):Cultivator|undefined{
  if(!Number.isFinite(edge.affinity)||!template.types.includes(edge.type)||
    edge.affinity<template.minimum||edge.affinity>template.maximum)return;
  const eligible=template.quirks
    ? pair.filter(actor=>actor.quirks?.some(quirk=>template.quirks?.includes(quirk)))
    : pair;
  if(template.both&&eligible.length!==2)return;
  if(template.kind==='crush'){
    const [a,b]=ids(pair);
    if(eligible.length!==1||world.relationships.some(row=>row.type==='道侣'&&
      [row.fromId,row.toId].some(id=>id===a||id===b))||
      world.mentorship.lineage.some(line=>line.mentorId===a&&line.studentId===b||line.mentorId===b&&line.studentId===a))return;
  }
  return eligible[0];
}

/** Plan from the open meeting; keep the world RNG untouched and don't conjure an acquaintance. */
export function planSectPairDrama(world:WorldState,orders:ReadonlyMap<string,SectJobAssignment>):SectPairDramaPlan|undefined{
  const roster=eligibleSectDisciples(world).filter(actor=>orders.get(actor.id)?.discipleId===actor.id&&
    nearby(world,actor,actor.locationId));
  for(const template of TEMPLATES){
    for(const [index,first] of roster.entries()){
      const order=orders.get(first.id),siteId=first.locationId;
      if(!order||!siteExists(world,siteId))continue;
      for(const second of roster.slice(index+1)){
        const peer=orders.get(second.id);
        if(!peer||peer.jobId!==order.jobId||second.locationId!==siteId)continue;
        const pair:Pair=[first,second],pairIds=ids(pair),edge=relationship(world,pairIds);
        const lead=edge&&initiator(world,pair,edge,template);
        if(!lead||template.kind==='blame'&&!localChores(world,pair,order.jobId,siteId))continue;
        return {tick:world.tick+1,pair:pairIds,initiatorId:lead.id,kind:template.kind,jobId:order.jobId,siteId};
      }
    }
  }
}

function activeDrama(world:WorldState,plan:SectPairDramaPlan){
  if(world.tick!==plan.tick)return;
  const pair=members(world,plan),edge=relationship(world,plan.pair),template=TEMPLATES.find(row=>row.kind===plan.kind);
  if(!pair||!edge||!template||initiator(world,pair,edge,template)?.id!==plan.initiatorId)return;
  return {pair,edge,template};
}

/** Called after both real REST actions, just before either chore would alter a resource. */
export function canFinishSectPairBlame(world:WorldState,plan:SectPairDramaPlan):boolean{
  const active=plan.kind==='blame'&&activeDrama(world,plan);
  return !!active&&active.pair.every(actor=>actor.currentAction==='REST')&&localChores(world,active.pair,plan.jobId,plan.siteId);
}

const reportRow=(report:SectJobReport,id:string)=>single(report.rows,row=>row.discipleId===id);
function matchesReport(row:SectJobReportRow|undefined,plan:SectPairDramaPlan,aborted:boolean):boolean{
  if(!row||row.jobId!==plan.jobId)return false;
  return aborted
    ? row.phase==='unavailable'&&row.tier===undefined&&row.sourceEventId===undefined&&row.effects.length===0&&
      (row.siteId===undefined||row.siteId===plan.siteId)
    : row.phase==='performed'&&row.siteId===plan.siteId&&row.tier!==undefined&&row.tier!=='disaster';
}
function boundedDelta(edge:RelationshipEdge,wanted:number):number{
  // Native affinity may turn colleagues into blood enemies or competitors into close friends.
  // A small joke never overwrites the existing type, note, or commitments.
  return wanted<0?Math.max(wanted,-59-edge.affinity):Math.min(wanted,(edge.type==='竞争'?79:100)-edge.affinity);
}

export function settleSectPairDrama(world:WorldState,plan:SectPairDramaPlan,report:SectJobReport,
  actualAbortedBlame=false):WorldEvent|undefined{
  const managed=world.sectManagement,active=activeDrama(world,plan),aborted=plan.kind==='blame';
  if(!managed||!active||managed.latestReport!==report||managed.pairDrama?.tick===world.tick||
    aborted&&!canFinishSectPairBlame(world,plan)||
    report.settledTick!==world.tick||report.openedTick!==world.tick-1||
    report.sectId!==managed.sectId||report.leaderId!==managed.leaderId||actualAbortedBlame!==aborted||
    !plan.pair.every(id=>matchesReport(reportRow(report,id),plan,aborted)))return;
  const id=sectPairDramaEventId(world.tick,managed.sectId);
  if(world.events.some(event=>event.id===id))return;
  const before=active.edge.affinity,delta=boundedDelta(active.edge,active.template.affinity);
  if(delta!==0)adjustRelationship(world,...plan.pair,delta,active.edge.type);
  managed.pairDrama={...plan,sectId:managed.sectId,outcome:aborted?'aborted':'completed',affinityChange:active.edge.affinity-before};
  const privateBeat=plan.kind==='crush';
  return {id,tick:world.tick,year:world.year,month:world.month,category:'diplomacy',witnessScope:'participants',
    title:SECT_PAIR_DRAMA_EVENT_TITLE,description:SECT_PAIR_DRAMA_EVENT_DESCRIPTION,
    actorIds:privateBeat?[plan.initiatorId]:[...plan.pair],...(!privateBeat?{locationId:plan.siteId}:{})};
}

export interface SectPairDramaView {
  readonly sectId:string;
  readonly tick:number;
  readonly jobId:SectJobId;
  readonly siteId:string;
  readonly pair:readonly [string,string];
  readonly outcome:SectPairDrama['outcome'];
  readonly affinityChange:number;
  readonly title:string;
  readonly facts:string;
  readonly voices:readonly {readonly actorId:string;readonly name:string;readonly text:string}[];
}

export function projectSectPairDrama(world:WorldState):SectPairDramaView|undefined{
  const managed=world.sectManagement,drama=managed?.pairDrama,report=managed?.latestReport;
  if(!managed||!drama||!report||drama.sectId!==managed.sectId||report.sectId!==managed.sectId||
    report.leaderId!==managed.leaderId||world.tick!==drama.tick||report.settledTick!==drama.tick||
    !drama.pair.every(id=>matchesReport(reportRow(report,id),drama,drama.outcome==='aborted')))return;
  const template=TEMPLATES.find(row=>row.kind===drama.kind);
  const marker=single(world.events,event=>event.id===sectPairDramaEventId(drama.tick,drama.sectId));
  const actorIds=drama.kind==='crush'?[drama.initiatorId]:drama.pair;
  if(!template||marker?.tick!==drama.tick||marker.category!=='diplomacy'||marker.witnessScope!=='participants'||
    marker.actorIds.length!==actorIds.length||!actorIds.every((id,i)=>marker.actorIds[i]===id)||
    marker.locationId!==(drama.kind==='crush'?undefined:drama.siteId))return;
  const peerId=drama.pair.find(id=>id!==drama.initiatorId);
  const speaker=single(world.cultivators,actor=>actor.id===drama.initiatorId);
  const peer=single(world.cultivators,actor=>actor.id===peerId);
  if(!speaker||!peer||speaker.sectId!==drama.sectId||peer.sectId!==drama.sectId)return;
  const hidden=drama.kind==='crush'&&activeAvatar(world)?.id!==drama.initiatorId;
  const title=hidden?'一同办差':template.title;
  const job=SECT_JOB_DEFINITIONS[drama.jobId].label;
  const people=drama.pair[0]===speaker.id?[speaker,peer]:[peer,speaker];
  const facts=`${people[0].name}、${people[1].name}这次都${drama.outcome==='aborted'?`没办完「${job}」`:`办完了「${job}」`}。`;
  const lines=hidden?['一同领的差，一同回的话。','这一趟算交差了。'] as const:template.voices;
  const ordered=hidden?people:[speaker,peer];
  const voices=ordered.flatMap((actor,i)=>actor.alive&&actor.hp>0?[{actorId:actor.id,name:actor.name,text:lines[i]}]:[]);
  return {sectId:drama.sectId,tick:drama.tick,jobId:drama.jobId,siteId:drama.siteId,pair:drama.pair,outcome:drama.outcome,
    affinityChange:drama.affinityChange,title,facts,voices};
}
