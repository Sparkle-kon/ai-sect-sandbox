import type { SectManagementState } from '../../types/sectManagement';
import { SECT_PAIR_DRAMA_EVENT_DESCRIPTION, SECT_PAIR_DRAMA_EVENT_TITLE, SECT_PAIR_DRAMA_KINDS, sectPairDramaEventId } from '../../types/sectPairDrama';
import type { WorldState } from '../../types/world';
import { SHARE_SAVE_REDACTED_TEXT } from '../shareSaveRedactionText';
import { SECT_JOB_IDS } from '../sectQuirkCatalog';
import { arr, id, num, one, structure, tick } from './primitives';

// Measured deltas are subtractions of native scores; tolerate only floating-point roundoff.
const AFFINITY_EPSILON=1e-12;
export const sectPairDramaShape=structure({
  tick, pair:arr(2,id), initiatorId:id, jobId:one(...SECT_JOB_IDS), kind:one(...SECT_PAIR_DRAMA_KINDS),
  siteId:id, sectId:id, outcome:one('completed','aborted'), affinityChange:num(-2-AFFINITY_EPSILON,2+AFFINITY_EPSILON),
});

/** Check dated facts without deriving them from the participants' present-day membership or whereabouts. */
export function validateSectPairDrama(world:WorldState,management:SectManagementState,fail:(field:string)=>never):void {
  const {pairDrama:scene,latestReport:report}=management;
  const eventSuffix=`-${management.sectId}-pair-drama`;
  const isMarker=(entry:{id:string})=>entry.id.startsWith('evt-')&&entry.id.endsWith(eventSuffix);
  const privateArchive=(rows:readonly {id:string}[])=>rows.some(isMarker);
  if(privateArchive(world.chronicleArchive.anchors)||
      world.chronicleArchive.chapters.some(chapter=>privateArchive(chapter.anchors))||
      world.coldHistory.chapters.some(chapter=>privateArchive(chapter.anchors)))
    return fail('sectManagement.pairDrama.publicReceipt');

  const markers=world.events.filter(isMarker);
  const knownPeople=new Set(world.cultivators.map(actor=>actor.id));
  const nativeSites=new Set(world.locations.filter(site=>site.expeditionOmenId===undefined&&site.type!=='abyss').map(site=>site.id));
  const uniqueTicks=new Set<number>();
  for(const marker of markers){
    if(marker.id!==sectPairDramaEventId(marker.tick,management.sectId)||uniqueTicks.has(marker.tick)||
        marker.tick<=management.foundedTick||marker.tick>(management.growth?.failure?.tick??world.tick)||
        marker.year*12+marker.month!==world.year*12+world.month-(world.tick-marker.tick)||
        marker.category!=='diplomacy'||marker.witnessScope!=='participants'||
        (marker.actorIds.length===1?marker.locationId!==undefined:!marker.locationId||!nativeSites.has(marker.locationId))||
        (marker.title!==SECT_PAIR_DRAMA_EVENT_TITLE||marker.description!==SECT_PAIR_DRAMA_EVENT_DESCRIPTION)&&
          (marker.title!==SHARE_SAVE_REDACTED_TEXT||marker.description!==SHARE_SAVE_REDACTED_TEXT)||
        marker.dialogue!==undefined||marker.dialogueRedacted!==undefined||marker.daoIntents!==undefined||
        marker.forbiddenArt!==undefined||marker.damage!==undefined||marker.duelWinnerId!==undefined||marker.actorIds.length<1||marker.actorIds.length>2||
        marker.actorIds.some(actorId=>!knownPeople.has(actorId)||actorId===management.leaderId)||
        marker.actorIds.length===2&&marker.actorIds[0]>=marker.actorIds[1])
      return fail('sectManagement.pairDrama.receipt');
    uniqueTicks.add(marker.tick);
  }
  if(!scene){
    if(markers.length) return fail('sectManagement.pairDrama.receipt');
    return;
  }

  const [first,second]=scene.pair;
  if(scene.sectId!==management.sectId||scene.tick<=management.foundedTick||
      scene.tick>(management.growth?.failure?.tick??world.tick)||scene.pair.length!==2||first>=second||
      scene.pair.some(actorId=>!knownPeople.has(actorId)||actorId===management.leaderId)||
      !scene.pair.includes(scene.initiatorId)||!nativeSites.has(scene.siteId))
    return fail('sectManagement.pairDrama.origin');

  const aborted=scene.kind==='blame';
  const delta=scene.affinityChange;
  const positiveCap=scene.kind==='prank'?2:1;
  const localChore=(scene.jobId==='kitchen'||scene.jobId==='guard')&&scene.siteId===management.homeSiteId;
  if(aborted?(scene.outcome!=='aborted'||delta>0||delta<-2-AFFINITY_EPSILON||!localChore):
      (scene.outcome!=='completed'||delta<0||delta>positiveCap+AFFINITY_EPSILON))
    return fail('sectManagement.pairDrama.outcome');

  if(!report||report.settledTick<scene.tick) return fail('sectManagement.pairDrama.source');
  if(report.settledTick===scene.tick){
    const rows=report.rows.filter(row=>scene.pair.includes(row.discipleId));
    if(rows.length!==2||rows.some(row=>row.jobId!==scene.jobId||
        (aborted?row.phase!=='unavailable':row.phase!=='performed'||row.tier==='disaster'||row.siteId!==scene.siteId)))
      return fail('sectManagement.pairDrama.source');
  }
  const audience=scene.kind==='crush'?[scene.initiatorId]:scene.pair;
  const ownMarker=markers.find(marker=>marker.tick===scene.tick);
  const expectedSiteId=scene.kind==='crush'?undefined:scene.siteId;
  const withinHotTail=world.events.length<120||world.events.some(entry=>entry.tick<scene.tick);
  if(markers.some(marker=>marker.tick>scene.tick)||!ownMarker&&withinHotTail||
      ownMarker&&(ownMarker.locationId!==expectedSiteId||ownMarker.actorIds.length!==audience.length||
        ownMarker.actorIds.some((actorId,index)=>actorId!==audience[index])))
    return fail('sectManagement.pairDrama.receipt');
}
