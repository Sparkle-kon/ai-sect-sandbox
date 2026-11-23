import { SECT_JOB_TIERS, type SectJobReport, type SectJobReportEffect, type SectJobReportRow } from '../../types/sectJobs';
import type { ChronicleAnchor, WorldState } from '../../types/world';
import { SECT_JOB_IDS } from '../sectQuirkCatalog';
import { arr, fail as rejectShape, id, num, oid, one, optional, SAVE_COLLECTION_LIMIT, structure, tick, type Validator } from './primitives';

const amount = num(-100, 100);
const herb = structure({kind:one('herb'),herbId:one('jade_leaf','earth_root','star_bloom','shadow_moss'),amount,stage:one('native')});
const ordinary = structure({kind:one('qi','hp','contribution'),amount,stage:one('native','follow_up')});
const effect:Validator = (value,path) => {
  if(!value||typeof value!=='object'||!('kind' in value))return rejectShape(path);
  return (value.kind==='herb'?herb:ordinary)(value,path);
};
const rowShape=structure({
  discipleId:id, jobId:one(...SECT_JOB_IDS), phase:one('performed','on_route','unavailable'),
  tier:optional(one(...SECT_JOB_TIERS)), siteId:oid, sourceEventId:oid, effects:arr(3,effect),
});
export const sectJobReportShape=structure({
  openedTick:tick,settledTick:tick,sectId:id,leaderId:id,rows:arr(SAVE_COLLECTION_LIMIT,rowShape),
});

function nativeAmount(row:SectJobReportRow,effect:SectJobReportEffect):boolean{
  switch(effect.kind){
    case 'qi': return effect.amount>0&&(row.jobId==='cultivate'&&effect.amount<=100||row.jobId==='kitchen'&&effect.amount<=3);
    case 'herb': return row.jobId==='gather'&&(effect.amount===1||effect.amount===2)||
      row.jobId==='kitchen'&&effect.amount===-1&&(effect.herbId==='jade_leaf'||effect.herbId==='earth_root');
    case 'contribution': return row.jobId==='guard'&&effect.amount>0&&effect.amount<=3;
    case 'hp': return false;
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
  const prefix=`evt-${tick}-${row.discipleId}-`;
  if(row.phase!=='performed')return true;
  switch(row.jobId){
    case 'explore': return row.sourceEventId===undefined||row.sourceEventId===`${prefix}explore`;
    case 'gather': return row.sourceEventId===`${prefix}alchemy`;
    case 'kitchen': return row.sourceEventId===`${prefix}management-kitchen`;
    case 'guard': return row.sourceEventId===`${prefix}management-guard`||row.sourceEventId===`${prefix}guard_duty`;
    default:return true;
  }
}

function matchesReceipt(world:WorldState,report:SectJobReport,row:SectJobReportRow,event:ChronicleAnchor):boolean{
  const {settledTick}=report;
  const calendar=world.year*12+world.month-(world.tick-settledTick);
  if(event.tick!==settledTick||event.year*12+event.month!==calendar)return false;
  if(event.locationId!==undefined)return event.locationId===row.siteId&&event.actorIds.includes(row.discipleId);
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
    if(row.phase==='unavailable'&&(row.siteId!==undefined||row.sourceEventId!==undefined)||
        row.phase!=='unavailable'&&(row.siteId===undefined||!sites.has(row.siteId))||
        (row.phase==='performed')!==(row.tier!==undefined)||
        row.phase!=='performed'&&row.effects.length!==0)return fail('sectManagement.latestReport.phase');
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
    if(followUps!==(row.tier!==undefined&&row.tier!=='success'?1:0))
      return fail('sectManagement.latestReport.effects');
  }
}
