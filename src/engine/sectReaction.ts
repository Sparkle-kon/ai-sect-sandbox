import type {SectReactionCue,SectReactionKind} from '../types/sectReaction';
import type {SectJobReport,SectJobReportRow} from '../types/sectJobs';
import type {Cultivator,WorldState} from '../types/world';
import {activeBellWatchForActor} from './bellWatchPresence';
import {isGrandSiegeFighterPresent} from './grandSiegePresence';
import {projectSectComicMoment} from './sectComedy';
import {isRetiredFromService} from './serviceRetirementEngine';

function unique<T>(rows:readonly T[],matches:(row:T)=>boolean):T|undefined{
  const found=rows.filter(matches);
  return found.length===1?found[0]:undefined;
}
function ownedHome(world:WorldState){
  const management=world.sectManagement;
  if(!management)return;
  const sect=unique(world.sects,row=>row.id===management.sectId);
  if(sect?.headquartersId!==management.homeSiteId||sect.leaderId!==management.leaderId)return;
  return unique(world.locations,site=>site.id===management.homeSiteId&&site.type==='sect_hq'&&
    site.ownerSectId===sect.id&&site.expeditionOmenId===undefined);
}
const canShow=(actor:Cultivator)=>actor.alive&&actor.hp>0&&actor.positionPlane!=='immortal'&&!isRetiredFromService(actor);
const physicallyPresent=(world:WorldState,actor:Cultivator,siteId:string)=>
  isGrandSiegeFighterPresent(world,actor,siteId)&&!activeBellWatchForActor(world,actor);
const grievous=(actor:Cultivator)=>actor.hp/Math.max(1,actor.maxHp)<.30;

export function projectSectReportReaction(world:WorldState,report:SectJobReport,row:SectJobReportRow):SectReactionCue|undefined{
  const management=world.sectManagement;
  if(!management||management.latestReport!==report||report.settledTick!==world.tick||report.openedTick!==world.tick-1||
    report.sectId!==management.sectId||report.leaderId!==management.leaderId||row.phase!=='performed'||!row.tier||
    unique(report.rows,candidate=>candidate.discipleId===row.discipleId)!==row)return;
  const actor=unique(world.cultivators,person=>person.id===row.discipleId);
  if(!actor||!canShow(actor))return;
  const home=ownedHome(world);
  const siteId=home&&actor.sectId===report.sectId&&physicallyPresent(world,actor,home.id)?home.id:undefined;
  const base={id:`sect-reaction:${world.tick}:${actor.id}:${row.jobId}`,
    tick:world.tick,actorId:actor.id,cause:'report' as const,...(siteId?{siteId}:{})};
  if(row.tier==='disaster'||row.effects.some(effect=>effect.kind==='hp'&&effect.amount<0)||grievous(actor))return {...base,kind:'hurt'};
  const comic=projectSectComicMoment(world),source=comic?.moment.source;
  const exactComic=comic&&comic.moment.tick===report.settledTick&&comic.speakerId===actor.id&&
    source?.phase==='performed'&&source.jobId===row.jobId&&source.tier===row.tier&&source.reportEventId===row.sourceEventId&&
    comic.moment.siteId===row.siteId?comic:undefined;
  const kitchenReceipt=row.sourceEventId===`evt-${world.tick}-${actor.id}-management-kitchen`&&
    unique(world.events,event=>event.id===row.sourceEventId&&event.tick===world.tick&&event.locationId===siteId&&
      event.title==='饭堂开了一灶'&&event.actorIds.includes(actor.id)&&event.witnessScope==='participants');
  const shake=kitchenReceipt&&siteId&&row.siteId===siteId&&row.jobId==='kitchen'&&row.tier==='mishap'&&
    row.effects.some(effect=>effect.kind==='herb'&&effect.stage==='native'&&effect.amount===-1)&&
    exactComic?.effects.some(effect=>effect.kind==='kitchen_damage'&&effect.amount===-1);
  const kind:SectReactionKind=shake?'smoke':exactComic?.animation??(
    row.tier==='windfall'?'sparkle':row.tier==='success'?'sweat':
    row.jobId==='challenge'||row.jobId==='explore'?'soul':'black_line');
  return {...base,kind,...(shake?{shake:'kitchen'}:{})};
}

/** Lost alchemy ingredients indicate a failed brew, never structural destruction. */
export function projectSectFurnaceReaction(world:WorldState):SectReactionCue|undefined{
  const home=ownedHome(world),management=world.sectManagement;
  if(!home||!management||home.furnaceGrade<=0)return;
  const current=unique(world.resourceFlow.months,row=>row.tick===world.tick);
  if(!current||current.year!==world.year||current.month!==world.month)return;
  const uses=world.furnaceReservations.uses.filter(row=>row.tick===world.tick&&row.siteId===home.id&&row.kind==='brew');
  for(const use of [...uses].sort((a,b)=>a.slot-b.slot||a.actorId.localeCompare(b.actorId))){
    if(unique(uses,row=>row.actorId===use.actorId)!==use)continue;
    const actor=unique(world.cultivators,person=>person.id===use.actorId);
    if(!actor||actor.sectId!==management.sectId||!canShow(actor)||grievous(actor)||!physicallyPresent(world,actor,home.id))continue;
    const event=unique(world.events,row=>row.id===`evt-${world.tick}-${actor.id}-alchemy`);
    if(!event||event.tick!==world.tick||event.year!==world.year||event.month!==world.month||event.locationId!==home.id||
      event.category!=='breakthrough'||event.witnessScope!==undefined||event.actorIds.length!==1||event.actorIds[0]!==actor.id||
      event.title!==`${actor.name}炼丹失手`)continue;
    const receipts=current.entries.filter(row=>row.mechanism==='alchemy'&&row.kind==='consumption'&&row.refId===home.id&&
      row.visibility.kind==='participants'&&row.visibility.actorIds.length===1&&row.visibility.actorIds[0]===actor.id&&row.amount>0);
    const fee=unique(receipts,row=>row.reason==='brew_fee'&&row.good==='stone'&&'from' in row&&row.from.kind==='actor'&&row.from.id===actor.id);
    const material=receipts.some(row=>row.reason==='brew_material'&&(row.good==='jade_leaf'||row.good==='earth_root'||row.good==='star_bloom'||row.good==='shadow_moss')&&'from' in row&&row.from.kind==='actor'&&row.from.id===actor.id);
    if(!fee||!material)continue;
    return {id:event.id,tick:world.tick,actorId:actor.id,cause:'furnace',siteId:home.id,kind:'smoke'};
  }
}
