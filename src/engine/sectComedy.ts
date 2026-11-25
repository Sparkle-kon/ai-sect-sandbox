import {findSectComedyTemplate,SECT_COMEDY_TEMPLATES} from '../data/sectComedy';
import type {SectComedyMatch,SectComedyTemplate,SectComicMoment,SectComicSource} from '../types/sectComedy';
import type {SectJobReportRow} from '../types/sectJobs';
import type {Cultivator,WorldEvent,WorldState} from '../types/world';
import {isGrandSiegeFighterPresent} from './grandSiegePresence';
import {sectFestivalForJob,sectMonthAt} from './sectFestivals';
import {isSectActive} from './sectActivity';
import {SECT_JOB_DEFINITIONS} from './sectJobs';
import {effectiveSectQuirks} from './sectQuirkAssignment';
import {isRetiredFromService} from './serviceRetirementEngine';
import {planComedyEffects} from './sectComedyEffects';
import {comedyPriority,comedyRelationTarget,type ComedyContext} from './sectComedyTerms';
import {sameGeneratedWorld} from './worldIdentity';

const HISTORY=12;
export const sectComicEventId=(tick:number,sectId:string)=>`evt-${tick}-${sectId}-comic`;
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
function unique<T extends {id:string}>(rows:readonly T[],id:string):T|undefined{
  const matches=rows.filter(row=>row.id===id);
  return matches.length===1?matches[0]:undefined;
}
const alive=(actor:Cultivator)=>actor.alive&&actor.hp>0&&actor.positionPlane!=='immortal'&&!isRetiredFromService(actor);
const spelling=(name:string)=>name.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu,' ').trim().slice(0,80);

interface Beat {
  readonly speaker:Cultivator;
  readonly source:SectComicSource;
  readonly siteId?:string;
  readonly row?:SectJobReportRow;
}
interface Candidate extends Beat {
  readonly context:ComedyContext;
  readonly template:SectComedyTemplate;
  readonly score:number;
  readonly jitter:number;
}
function options(world:WorldState):Beat[]{
  const management=world.sectManagement;
  if(!management||management.growth?.failure)return [];
  const sect=unique(world.sects,management.sectId),leader=unique(world.cultivators,management.leaderId);
  if(!isSectActive(sect)||!leader||sect.leaderId!==leader.id||leader.sectId!==sect.id||!alive(leader))return [];
  const counts=new Map<string,number>();
  for(const actor of world.cultivators)counts.set(actor.id,(counts.get(actor.id)??0)+1);
  const cast=world.cultivators.filter(actor=>counts.get(actor.id)===1&&alive(actor)&&actor.sectId===sect.id&&
    actor.hp>=actor.maxHp*.3);
  const beats:Beat[]=[];
  const report=management.latestReport;
  if(report?.settledTick===world.tick&&report.openedTick===world.tick-1&&report.sectId===sect.id&&report.leaderId===leader.id){
    for(const row of report.rows){
      const speaker=cast.find(actor=>actor.id===row.discipleId);
      if(!speaker||report.rows.filter(entry=>entry.discipleId===speaker.id).length!==1||
        row.phase==='performed'&&(!row.tier||row.tier==='disaster'))continue;
      // The finished board is the authority for a past action, not a claim that either party has returned.
      const seasonal=sectFestivalForJob(row.jobId);
      if(seasonal&&sectMonthAt(world,report.settledTick)!==seasonal.month)continue;
      const reportEventId=row.sourceEventId;
      const source:SectComicSource=row.phase==='performed'&&row.tier&&row.tier!=='disaster'?
        {phase:'performed',jobId:row.jobId,tier:row.tier,...(reportEventId?{reportEventId}:{})}:
        row.phase!=='performed'?{phase:row.phase,jobId:row.jobId,...(reportEventId?{reportEventId}:{})}:
        {phase:'ambient',presence:'away'};
      beats.push({speaker,source,row,...(row.siteId&&row.phase!=='unavailable'?{siteId:row.siteId}:{})});
    }
  }
  // A quiet month may still have living members. This beat needs no completed job or invented return.
  for(const speaker of cast.length?cast:[leader]){
    const site=unique(world.locations,speaker.locationId);
    const physicallyHere=!!site&&isGrandSiegeFighterPresent(world,speaker,site.id)&&site.expeditionOmenId===undefined;
    const presence=physicallyHere&&site.id===management.homeSiteId?'home':'away';
    beats.push({speaker,source:{phase:'ambient',presence},...(physicallyHere?{siteId:site.id}:{})});
  }
  return beats;
}
function matches(world:WorldState,beat:Beat,match:SectComedyMatch){
  const {source,speaker}=beat;
  if(source.phase!==match.phase)return false;
  if(match.quirks?.length){
    const owned=effectiveSectQuirks(world,speaker);
    if(!match.quirks.every(id=>owned.includes(id)))return false;
  }
  if(match.phase==='ambient')return source.phase==='ambient'&&(!match.presence||source.presence===match.presence);
  if(source.phase==='ambient'||match.job&&source.jobId!==match.job)return false;
  return match.phase!=='performed'||source.phase==='performed'&&source.tier===match.tier;
}
function contextFor(world:WorldState,beat:Beat,template:SectComedyTemplate):ComedyContext{
  return {tick:world.tick,templateId:template.id,speakerId:beat.speaker.id,
    source:beat.source,...(beat.siteId?{siteId:beat.siteId}:{})};
}
function effectsFor(world:WorldState,beat:Beat,template:SectComedyTemplate,context:ComedyContext){
  if(template.effects.length&&beat.source.phase!=='performed'&&
    !(beat.source.phase==='ambient'&&beat.source.presence==='home'))return;
  if(template.effects.some(effect=>effect.kind==='kitchen_damage')){
    const management=world.sectManagement;
    if(!management||beat.source.phase!=='performed'||beat.source.jobId!=='kitchen'||beat.source.tier!=='mishap'||
      beat.siteId!==management.homeSiteId||!isGrandSiegeFighterPresent(world,beat.speaker,management.homeSiteId)||
      !beat.row?.effects.some(row=>row.kind==='herb'&&row.stage==='native'&&row.amount===-1&&
        (row.herbId==='earth_root'||row.herbId==='jade_leaf')))return;
  }
  return planComedyEffects(world,context,template.effects);
}
function score(beat:Beat,template:SectComedyTemplate){
  const {match}=template;
  const urgency=beat.source.phase==='performed'?beat.source.tier==='windfall'||beat.source.tier==='mishap'?45:24:
    beat.source.phase==='ambient'?0:12;
  const specific=(match.quirks?.length??0)*25+(match.phase!=='ambient'&&match.job?9:0);
  return urgency+specific+(beat.source.phase!=='ambient'?12:0)+(match.phase!=='ambient'&&match.job&&sectFestivalForJob(match.job)?60:0);
}

/** A comedy beat is a new scoped reaction, never a second settlement of the job it refers to. */
export function settleSectComedyMonth(world:WorldState,prevWorld:WorldState):WorldEvent|undefined{
  const management=world.sectManagement;
  if(!management||!prevWorld.sectManagement||world.tick!==prevWorld.tick+1||!sameGeneratedWorld(world,prevWorld)||
    management.growth?.failure||management.comedy?.moments.some(moment=>moment.tick===world.tick))return;
  const history=management.comedy?.moments??[];
  const recent=new Map(history.map((row,i)=>[row.templateId,i]));
  const candidates:Candidate[]=[];
  for(const beat of options(world))for(const template of SECT_COMEDY_TEMPLATES){
    if(!matches(world,beat,template.match))continue;
    candidates.push({...beat,template,context:contextFor(world,beat,template),score:score(beat,template),
      jitter:comedyPriority(world.random.seed,world.tick,`${template.id}:${beat.speaker.id}`)});
  }
  const ordered=candidates.sort((a,b)=>(recent.get(a.template.id)??-1)-(recent.get(b.template.id)??-1)||
    b.score-a.score||a.jitter-b.jitter||compare(a.template.id,b.template.id)||compare(a.speaker.id,b.speaker.id));
  // An invalid scene is skipped atomically. Give the same job and outcome the first chance at a fallback.
  const first=ordered[0];
  if(!first)return;
  const sameBeat=(candidate:Candidate)=>candidate.row===first.row&&candidate.speaker.id===first.speaker.id&&
    candidate.source.phase===first.source.phase;
  let pick:Candidate|undefined,planned:ReturnType<typeof planComedyEffects>;
  for(const candidate of [...ordered.filter(sameBeat),...ordered.filter(candidate=>!sameBeat(candidate))]){
    const candidatePlan=effectsFor(world,candidate,candidate.template,candidate.context);
    if(candidatePlan){pick=candidate;planned=candidatePlan;break;}
  }
  if(!pick||!planned)return;
  planned.commit();
  const moment:SectComicMoment={...pick.context,source:{...pick.source},effects:planned.applied};
  const pending=[...(management.comedy?.pending??[]),...planned.pending];
  management.comedy={moments:[...history.slice(-(HISTORY-1)),moment],...(pending.length?{pending}:{})};
  return {id:sectComicEventId(world.tick,management.sectId),tick:world.tick,year:world.year,month:world.month,
    actorIds:[pick.speaker.id],witnessScope:'participants',category:'diplomacy',
    title:'宗门月末一记',description:'这一月的宗门小事已记下。'};
}

/** Reads only a stored local record. Quote and hook text are never promoted to historical facts. */
export function projectSectComicMoment(world:WorldState,moment=world.sectManagement?.comedy?.moments.at(-1)){
  const management=world.sectManagement;
  if(!management||!moment||moment.tick>world.tick||!management.comedy?.moments.includes(moment))return;
  const template=findSectComedyTemplate(moment.templateId);
  const speaker=unique(world.cultivators,moment.speakerId),sect=unique(world.sects,management.sectId);
  if(!template||!speaker||!sect)return;
  const seasonal=moment.source.phase==='ambient'?undefined:sectFestivalForJob(moment.source.jobId);
  if(seasonal&&sectMonthAt(world,moment.tick)!==seasonal.month)return;
  const site=moment.siteId?unique(world.locations,moment.siteId):undefined;
  const jobId=moment.source.phase!=='ambient'?moment.source.jobId:undefined;
  const speakerName=spelling(speaker.name);
  const rival=world.sects.find(row=>row.id===comedyRelationTarget(world,moment,'rival'));
  const substitute=(text:string)=>text.replace(/\{(name|sect|site|job|rivalSect)\}/gu,(_,field:string)=>(
    field==='name'?speakerName:field==='sect'?spelling(sect.name):field==='site'?spelling(site?.name??'眼下这处'):
      field==='rivalSect'?spelling(rival?.name??'邻宗'):jobId?SECT_JOB_DEFINITIONS[jobId].label:'本月的事'
  ));
  const proofId=moment.source.phase!=='ambient'?moment.source.reportEventId:undefined;
  const shareable=proofId?world.events.some(row=>row.id===proofId&&row.tick===moment.tick&&row.witnessScope===undefined):false;
  const hook=template.chatHook&&((template.chatHook.group==='own')||shareable)?
    {group:template.chatHook.group,line:substitute(template.chatHook.line)}:undefined;
  const rumor=template.effects.find(effect=>effect.kind==='rumor'&&moment.effects.some(row=>row.kind==='rumor'&&row.group===effect.group));
  const rumorHook=rumor?.kind==='rumor'&&(rumor.group==='own'||shareable)
    ?{group:rumor.group,line:substitute(rumor.line)}:undefined;
  return {moment:structuredClone(moment),templateId:template.id,speakerId:speaker.id,speakerName,
    report:substitute(template.report),quote:substitute(template.quote),effects:moment.effects.map(row=>({...row})),
    ...(rumorHook?{rumorHook}:{}),...(template.animation?{animation:template.animation}:{}),...(hook?{chatHook:hook}:{})};
}
