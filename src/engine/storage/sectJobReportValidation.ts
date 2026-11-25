import { SECT_ERRAND_OUTCOMES, SECT_JOB_TIERS, type SectJobReport, type SectJobReportEffect, type SectJobReportRow } from '../../types/sectJobs';
import type { ChronicleAnchor, WorldState } from '../../types/world';
import {isSectErrandJob,sectErrandEventId} from '../sectErrands';
import {terrainTileAt} from '../terrainEngine';
import { SECT_JOB_IDS } from '../sectQuirkCatalog';
import { sectFestivalForJob, sectMonthAt } from '../sectFestivals';
import { arr, fail as rejectShape, id, num, oid, one, optional, SAVE_COLLECTION_LIMIT, structure, tick, type Validator } from './primitives';

const amount = num(-100, 100);
const herb = structure({kind:one('herb'),herbId:one('jade_leaf','earth_root','star_bloom','shadow_moss'),amount,stage:one('native')});
const ordinary = structure({kind:one('qi','hp','contribution'),amount,stage:one('native','follow_up')});
const effect:Validator = (value,path) => {
  if(!value||typeof value!=='object'||!('kind' in value))return rejectShape(path);
  return (value.kind==='herb'?herb:ordinary)(value,path);
};
const errand=structure({fromId:id,homeId:id,turnAt:num(0,6401,true),
  path:arr(6402,structure({x:num(0,1000),y:num(0,600)})),outcome:one(...SECT_ERRAND_OUTCOMES)});
const rowShape=structure({
  discipleId:id, jobId:one(...SECT_JOB_IDS), phase:one('performed','on_route','unavailable'),
  tier:optional(one(...SECT_JOB_TIERS)), siteId:oid, sourceEventId:oid,errand:optional(errand), effects:arr(3,effect),
});
export const sectJobReportShape=structure({
  openedTick:tick,settledTick:tick,sectId:id,leaderId:id,rows:arr(SAVE_COLLECTION_LIMIT,rowShape),
});

function nativeAmount(row:SectJobReportRow,effect:SectJobReportEffect):boolean{
  switch(effect.kind){
    case 'qi': return effect.amount>0&&((row.jobId==='cultivate'||row.jobId==='festival-review')&&effect.amount<=100||row.jobId==='kitchen'&&effect.amount<=3);
    case 'herb': return row.jobId==='gather'&&(effect.amount===1||effect.amount===2)||
      row.jobId==='kitchen'&&effect.amount===-1&&(effect.herbId==='jade_leaf'||effect.herbId==='earth_root');
    case 'contribution': return (row.jobId==='guard'||row.jobId==='festival-debt')&&effect.amount>0&&effect.amount<=3;
    case 'hp': return row.errand!==undefined&&Number.isInteger(effect.amount)&&effect.amount>=-60&&effect.amount<0;
  }
}

function followUpAmount(row:SectJobReportRow,effect:SectJobReportEffect):boolean{
  switch(row.tier){
    case 'windfall': return effect.kind==='qi'&&effect.amount>0&&effect.amount<=6+1e-9||
      effect.kind==='contribution'&&effect.amount===1;
    case 'mishap': return effect.kind==='qi'&&effect.amount<0&&effect.amount>=-5-1e-9;
    case 'disaster': return effect.kind==='hp'&&Number.isInteger(effect.amount)&&effect.amount<=-1&&effect.amount>=-60;
    default:return false;
  }
}

function matchesExactJobId(row:SectJobReportRow,tick:number):boolean{
  if(row.errand)return row.phase==='performed'&&isSectErrandJob(row.jobId)&&row.sourceEventId===sectErrandEventId(tick,row.discipleId,row.jobId);
  const prefix=`evt-${tick}-${row.discipleId}-`;
  // Seasonal routes cannot be persisted as completed trades, and a travelled recruit
  // is not an enrollment. Retained event/ledger evidence is checked separately.
  if(row.jobId==='festival-market'){
    return row.phase!=='performed'&&(row.sourceEventId===undefined||
      row.sourceEventId.startsWith(`evt-${tick}-market-order-`)||row.sourceEventId===`${prefix}explore`);
  }
  if(row.phase!=='performed')return !sectFestivalForJob(row.jobId)||row.sourceEventId===undefined||row.sourceEventId===`${prefix}explore`;
  switch(row.jobId){
    case 'explore': return row.sourceEventId===undefined||row.sourceEventId===`${prefix}explore`;
    case 'gather': return row.sourceEventId===`${prefix}alchemy`;
    case 'kitchen': return row.sourceEventId===`${prefix}management-kitchen`;
    case 'festival-recruit': return row.sourceEventId?.startsWith(`evt-settlement-${tick}-recruitment-`)===true;
    case 'festival-social': return row.sourceEventId===`${prefix}social`;
    case 'festival-debt': return row.sourceEventId===`${prefix}management-festival-debt`;
    case 'guard': return row.sourceEventId===`${prefix}management-guard`||row.sourceEventId===`${prefix}guard_duty`;
    default:return true;
  }
}

function matchesReceipt(world:WorldState,report:SectJobReport,row:SectJobReportRow,event:ChronicleAnchor):boolean{
  const {settledTick}=report;
  const calendar=world.year*12+world.month-(world.tick-settledTick);
  if(event.tick!==settledTick||event.year*12+event.month!==calendar)return false;
  if(row.errand){
    return event.locationId===row.siteId&&event.actorIds[0]===row.discipleId&&
      (event.category==='combat'&&row.jobId==='challenge'||event.category==='diplomacy');
  }
  if(event.locationId!==undefined){
    if(event.locationId!==row.siteId||!event.actorIds.includes(row.discipleId))return false;
    if(row.jobId==='festival-recruit'&&row.phase==='performed'){
      const record=world.settlements.records.find(entry=>`evt-${entry.id}`===event.id);
      return event.category==='diplomacy'&&event.actorIds.length===2&&event.actorIds[0]===row.discipleId&&
        (!record||record.tick===settledTick&&record.kind==='recruitment'&&record.actorId===row.discipleId&&
          record.cultivatorId===event.actorIds[1]&&record.sectId===report.sectId);
    }
    if(row.jobId==='festival-social'&&row.phase==='performed')
      return event.category==='diplomacy'&&event.actorIds.length===2&&event.actorIds[0]===row.discipleId;
    if(row.jobId==='festival-debt'&&row.phase==='performed')
      return event.category==='diplomacy'&&event.actorIds.length===1&&
        (!('witnessScope' in event)||event.witnessScope==='participants');
    if(row.jobId==='festival-market'&&event.id.startsWith(`evt-${settledTick}-market-order-`)){
      const order=world.markets.orders.find(entry=>event.id===`evt-${settledTick}-market-${entry.id}`);
      return event.category==='diplomacy'&&event.actorIds.length===1&&
        (!order||order.side==='sell'&&order.actorId===row.discipleId&&order.locationId===row.siteId&&order.placedTick===settledTick);
    }
    return true;
  }
  // The sealed courier deliberately hides identities and location in its raw shell. Check its
  // matching actual holder/clock without reading private content; no other roomless event qualifies.
  return row.jobId==='deliver'&&row.phase==='on_route'&&event.category==='diplomacy'&&event.actorIds.length===0&&
    'witnessScope' in event&&event.witnessScope==='participants'&&world.couriers.dispatches.some(dispatch=>
      event.id===`evt-${dispatch.id}-accepted-${settledTick}`&&dispatch.courierId===row.discipleId&&
      dispatch.acceptedTick===settledTick&&dispatch.originId===row.siteId);
}

/** Latest report is display history, not a means of applying rewards or restoring historical membership. */
export function validateSectJobReport(
  world:WorldState,report:SectJobReport,fail:(field:string)=>never,
):void{
  const state=world.sectManagement;
  if(!state||report.sectId!==state.sectId||report.leaderId!==state.leaderId||
      report.openedTick<state.foundedTick||report.settledTick!==report.openedTick+1||report.settledTick>world.tick||
      report.rows.length<1||report.rows.length>world.cultivators.length)return fail('sectManagement.latestReport.origin');
  const knownActors=new Set(world.cultivators.map(actor=>actor.id));
  const sites=new Set(world.locations.filter(site=>site.expeditionOmenId===undefined&&site.type!=='abyss').map(site=>site.id));
  const retained=new Map<string,ChronicleAnchor[]>();
  const rawIds=new Set<string>();
  const duplicateRawIds=new Set<string>();
  const wanted=new Set(report.rows.flatMap(row=>row.sourceEventId??[]));
  const index=(event:ChronicleAnchor)=>{
    if(!wanted.has(event.id))return;
    const matches=retained.get(event.id);
    if(matches)matches.push(event);
    else retained.set(event.id,[event]);
  };
  for(const event of world.events){
    if(wanted.has(event.id)){
      if(rawIds.has(event.id))duplicateRawIds.add(event.id);
      rawIds.add(event.id);
      index(event);
    }
  }
  if(wanted.size){
    for(const event of world.chronicleArchive.anchors)index(event);
    for(const chapter of [...world.chronicleArchive.chapters,...world.coldHistory.chapters]){
      if(chapter.startTick<=report.settledTick&&chapter.endTick>=report.settledTick)
        for(const event of chapter.anchors)index(event);
    }
  }
  const seenActors=new Set<string>(),seenSourceIds=new Set<string>();
  for(const row of report.rows){
    if(!knownActors.has(row.discipleId)||row.discipleId===report.leaderId||seenActors.has(row.discipleId))
      return fail('sectManagement.latestReport.disciples');
    seenActors.add(row.discipleId);
    const festival=sectFestivalForJob(row.jobId);
    if(festival&&(sectMonthAt(world,report.settledTick)!==festival.month||
      row.jobId==='festival-review'&&(report.settledTick-state.foundedTick<12||(report.settledTick-state.foundedTick)%12!==0)||
      row.jobId==='festival-debt'&&(state.starterId!=='qingyun-odd-jobs'||report.settledTick-state.foundedTick<6)))
      return fail('sectManagement.latestReport.festival');
    if(row.phase==='unavailable'&&(row.siteId!==undefined||row.sourceEventId!==undefined)||
        row.phase!=='unavailable'&&(row.siteId===undefined||!sites.has(row.siteId))||
        (row.phase==='performed')!==(row.tier!==undefined)||
        row.phase!=='performed'&&row.effects.length!==0)return fail('sectManagement.latestReport.phase');
    if(row.errand){
      const route=row.errand;
      const start=world.locations.find(site=>site.id===route.fromId),end=world.locations.find(site=>site.id===route.homeId);
      const target=world.locations.find(site=>site.id===row.siteId);
      const at=(i:number,site:typeof target)=>!!site&&route.path[i]?.x===site.x&&route.path[i]?.y===site.y;
      const cells=route.path.map(point=>terrainTileAt(world,point.x,point.y));
      if(route.homeId!==state.homeSiteId||route.path.length<2||!at(0,start)||!at(route.turnAt,target)||
        !at(route.path.length-1,end)||cells.some((cell,i)=>!cell||i>0&&cells[i-1]&&
          Math.abs(cells[i-1]!.col-cell.col)+Math.abs(cells[i-1]!.row-cell.row)>1)||
        route.outcome==='road_disaster'&&row.tier!=='disaster'||
        (route.outcome==='refused'||route.outcome==='road_mishap'||route.outcome==='contest_lost')&&row.tier!=='mishap'||
        route.outcome==='contest_lost'&&row.jobId!=='challenge')return fail('sectManagement.latestReport.errand');
    }
    if(!matchesExactJobId(row,report.settledTick))return fail('sectManagement.latestReport.source');
    if(row.sourceEventId!==undefined){
      const eventId=row.sourceEventId;
      if(!eventId.startsWith('evt-')||seenSourceIds.has(eventId)||duplicateRawIds.has(eventId)||
          retained.get(eventId)?.some(event=>!matchesReceipt(world,report,row,event)))
        return fail('sectManagement.latestReport.source');
      seenSourceIds.add(eventId);
    }
    const effectKeys=new Set<string>();
    let followUps=0;
    for(const effect of row.effects){
      const key=effect.kind==='herb'?`native:herb:${effect.herbId}`:`${effect.stage}:${effect.kind}`;
      if(effectKeys.has(key)||!(effect.stage==='native'?nativeAmount(row,effect):followUpAmount(row,effect)))
        return fail('sectManagement.latestReport.effects');
      effectKeys.add(key);
      if(effect.stage==='follow_up')followUps++;
    }
    if(row.phase==='performed'&&(row.jobId==='festival-review'&&!effectKeys.has('native:qi')||
        row.jobId==='festival-debt'&&!effectKeys.has('native:contribution')))
      return fail('sectManagement.latestReport.effects');
    if(!(row.errand&&followUps===0)&&followUps!==(row.tier!==undefined&&row.tier!=='success'?1:0))
      return fail('sectManagement.latestReport.effects');
  }
}
