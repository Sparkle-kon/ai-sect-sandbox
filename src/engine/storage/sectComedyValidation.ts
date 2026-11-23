import { findSectComedyTemplate } from '../../data/sectComedy';
import type { SectComedyState, SectComicMoment } from '../../types/sectComedy';
import type { SectManagementState } from '../../types/sectManagement';
import type { WorldState } from '../../types/world';
import {sectFestivalForJob,sectMonthAt} from '../sectFestivals';
import { SECT_JOB_IDS } from '../sectQuirkCatalog';
import { arr, fail as rejectShape, id, num, oid, one, structure, tick, type Validator } from './primitives';

const jobId=one(...SECT_JOB_IDS);
const ambient=structure({phase:one('ambient'),presence:one('home','away')});
const performed=structure({phase:one('performed'),jobId,tier:one('windfall','mishap','success'),reportEventId:oid});
const partial=structure({phase:one('on_route','unavailable'),jobId,reportEventId:oid});
const source:Validator=(value,path)=>{
  if(!value||typeof value!=='object'||!('phase' in value))return rejectShape(path);
  switch(value.phase){
    case 'ambient':return ambient(value,path);
    case 'performed':return performed(value,path);
    case 'on_route':
    case 'unavailable':return partial(value,path);
    default:return rejectShape(`${path}.phase`);
  }
};
const qi=structure({kind:one('qi'),amount:num(-2,2)});
const kitchen=structure({kind:one('kitchen_damage'),amount:one(-1)});
const effect:Validator=(value,path)=>{
  if(!value||typeof value!=='object'||!('kind' in value))return rejectShape(path);
  return (value.kind==='kitchen_damage'?kitchen:qi)(value,path);
};
const moment=structure({tick,templateId:id,speakerId:id,siteId:oid,source,effects:arr(2,effect)});
const recentMonthCount=12;
export const sectComedyShape=structure({moments:arr(recentMonthCount,moment)});

function matchesDatedReport(world:WorldState,state:SectManagementState,row:SectComicMoment):boolean {
  const comic=row.source,report=state.latestReport;
  if(comic.phase==='ambient')return true;
  if(report?.settledTick!==row.tick)return row.tick<world.tick;
  const entries=report.rows.filter(entry=>entry.discipleId===row.speakerId);
  const entry=entries[0];
  if(entries.length===1&&row.effects.some(effect=>effect.kind==='kitchen_damage')&&
      !entry.effects.some(effect=>effect.kind==='herb'&&effect.stage==='native'&&effect.amount===-1&&
        (effect.herbId==='jade_leaf'||effect.herbId==='earth_root')))return false;
  return entries.length===1&&entry.jobId===comic.jobId&&entry.phase===comic.phase&&
    entry.sourceEventId===comic.reportEventId&&entry.siteId===row.siteId&&
    (comic.phase!=='performed'||entry.tier===comic.tier);
}

/** The bounded notebook stores display references, not prose or authority to apply effects again. */
export function validateSectComedy(
  world:WorldState,state:SectManagementState,comedy:SectComedyState,fail:(field:string)=>never,
):void {
  const newest=comedy.moments.at(-1);
  if(!newest||newest.tick>world.tick||newest.tick-comedy.moments[0].tick>=recentMonthCount)
    return fail('sectManagement.comedy.clock');
  const speakers=new Map(world.cultivators.map(person=>[person.id,person]));
  const sites=new Set(world.locations.filter(site=>site.expeditionOmenId===undefined).map(site=>site.id));
  let previous=state.foundedTick;
  for(const row of comedy.moments){
    if(row.tick<=previous||row.tick>(state.growth?.failure?.tick??world.tick))
      return fail('sectManagement.comedy.clock');
    previous=row.tick;
    const speaker=speakers.get(row.speakerId);
    const authored=findSectComedyTemplate(row.templateId);
    if(!speaker||!authored||row.siteId!==undefined&&!sites.has(row.siteId)||
        authored.match.quirks?.some(quirk=>!speaker.quirks?.includes(quirk)))
      return fail('sectManagement.comedy.identity');
    const {source}=row,{match}=authored;
    const seasonal=source.phase==='ambient'?undefined:sectFestivalForJob(source.jobId);
    if(seasonal&&sectMonthAt(world,row.tick)!==seasonal.month||match.phase!==source.phase||
        source.phase==='ambient'&&(
          match.phase!=='ambient'||match.presence!==undefined&&match.presence!==source.presence||
          source.presence==='home'&&row.siteId!==state.homeSiteId||source.presence==='away'&&row.siteId===state.homeSiteId)||
        source.phase!=='ambient'&&(
          match.phase==='ambient'||match.job!==undefined&&match.job!==source.jobId||row.speakerId===state.leaderId||
          source.phase==='performed'&&(match.phase!=='performed'||match.tier!==source.tier)||
          source.reportEventId!==undefined&&!source.reportEventId.startsWith('evt-'))||
        !matchesDatedReport(world,state,row))
      return fail('sectManagement.comedy.source');

    const receiptId=`evt-${row.tick}-${state.sectId}-comic`;
    const retained=world.events.filter(event=>event.id===receiptId);
    const calendar=world.year*12+world.month-(world.tick-row.tick);
    if(retained.length>1||row.tick===world.tick&&!retained.length||
        retained.some(event=>event.tick!==row.tick||event.year*12+event.month!==calendar||event.category!=='diplomacy'||
          event.witnessScope!=='participants'||event.locationId!==undefined||
          event.actorIds.length!==1||event.actorIds[0]!==row.speakerId))
      return fail('sectManagement.comedy.receipt');

    const seen=new Set<string>();
    if(row.effects.length!==authored.effects.length||source.phase!=='performed'&&row.effects.length)
      return fail('sectManagement.comedy.effects');
    for(const applied of row.effects){
      if(seen.has(applied.kind)||!authored.effects.some(offered=>{
        if(applied.kind==='qi')return offered.kind==='qi'&&applied.amount!==0&&Math.sign(applied.amount)===Math.sign(offered.amount)&&
          Math.abs(applied.amount)<=Math.abs(offered.amount)+1e-9;
        return offered.kind==='kitchen_damage'&&applied.amount===-offered.amount&&
          source.phase==='performed'&&source.tier==='mishap'&&source.jobId==='kitchen'&&row.siteId===state.homeSiteId;
      }))return fail('sectManagement.comedy.effects');
      seen.add(applied.kind);
    }
  }
}
