import type { WorldState } from '../types/world';
import { CARE_FOLLOWUP_JADE_LEAF } from './careFollowupTerms';
import { DANXIA_CLOSED_RETENTION_TICKS, DANXIA_SECT_ID, danxiaMedicineSite, danxiaShortageId, suppressedDanxiaRegrowth } from './danxiaShortageTerms';

const compare = (a: string,b: string) => a < b ? -1 : a > b ? 1 : 0;

export function validateDanxiaShortageHistory(world: WorldState, actorIds: ReadonlySet<string>, fail: (path: string) => never): void {
  if (!world.danxiaShortages.cases.length) return;
  // Original appointment/money/shift validation runs before this additional authored-incident proof.
  const pinnedShortages = new Set(world.danxiaMedicine.commitments.map(row=>row.shortageId));
  const appointments = new Map(world.careFollowups.appointments.map(row=>[row.id,row]));
  const household = new Map(world.households.groups.map(row=>[row.id,row]));
  const members = new Map(world.households.members.map(row=>[row.volunteerId,row]));
  const villages = new Set(world.settlements.villages.map(row=>row.id));
  const sites = new Set(world.locations.map(row=>row.id));
  const demandIds = new Set<string>(), ids = new Set<string>(), eventIds = new Set<string>();
  const events = new Map(world.events.map(row=>[row.id,row]));
  const capital = danxiaMedicineSite(world);
  let active = false;

  for (const row of world.danxiaShortages.cases) {
    const {id,siteId,openedTick,regrowth,discipleId,patientId,settlementId,householdId,volunteerId,
      appointmentId,sourceCaseId,requiredLeaves,availableLeaves,status,resolution} = row;
    const member = members.get(volunteerId), family = household.get(householdId), named = appointments.get(appointmentId);
    const openedMonth = ((world.month - 1 + openedTick - world.tick) % 12 + 12) % 12 + 1;
    if (ids.has(id) || id !== danxiaShortageId(appointmentId) || !sites.has(siteId) ||
        openedMonth < 10 || openedTick > world.tick || regrowth.tick !== openedTick || regrowth.siteId !== siteId ||
        !suppressedDanxiaRegrowth(regrowth) ||
        Math.abs(regrowth.intensity*100-Math.round(regrowth.intensity*100))>1e-8 ||
        requiredLeaves !== row.demandIds.length * CARE_FOLLOWUP_JADE_LEAF || availableLeaves !== regrowth.before + regrowth.grown ||
        availableLeaves >= requiredLeaves || !row.demandIds.includes(appointmentId)) fail('danxiaShortages.cases.opening');
    ids.add(id);
    if (!actorIds.has(discipleId) || !actorIds.has(patientId) || discipleId === patientId || !villages.has(settlementId) ||
        !family || family.createdTick > openedTick || !family.presences.some(place=>place.settlementId===settlementId) ||
        !member || member.householdId !== householdId || member.settlementId !== settlementId || member.recruitedId !== patientId ||
        patientId !== `recruit-${volunteerId}` || member.registeredTick >= openedTick || member.settledTick === undefined ||
        (member.status==='recruited' ? member.settledTick >= openedTick : member.status!=='deceased' || member.settledTick < openedTick) ||
        !named || named.patientId !== patientId || named.siteId !== siteId || named.sectId !== DANXIA_SECT_ID ||
        named.sourceCaseId !== sourceCaseId) fail('danxiaShortages.cases.provenance');
    let last: typeof named | undefined;
    let latestEligible = 0;
    const stillScheduled = [];
    for (const demandId of row.demandIds) {
      const item = appointments.get(demandId);
      if (demandIds.has(demandId) || !item || item.siteId !== siteId || item.sectId !== DANXIA_SECT_ID ||
          item.scheduledTick >= openedTick || item.dueTick > openedTick || item.expiresTick <= openedTick ||
          (item.settledTick !== undefined && item.settledTick < openedTick) ||
          (last && (last.dueTick-item.dueTick || last.scheduledTick-item.scheduledTick || compare(last.id,item.id)) > 0)) {
        fail('danxiaShortages.cases.demand');
      }
      demandIds.add(demandId);
      if(item.status==='scheduled')stillScheduled.push(item);
      latestEligible = Math.max(latestEligible,item.expiresTick-1);
      last=item;
    }
    if (status==='open') {
      if(active || resolution || capital?.id!==siteId || world.tick>=latestEligible || !stillScheduled.length ||
          capital.herbs.jade_leaf >= stillScheduled.length * CARE_FOLLOWUP_JADE_LEAF) fail('danxiaShortages.cases.lifecycle');
      active=true;
    } else if (!resolution || resolution.tick < openedTick || resolution.tick > Math.min(world.tick, latestEligible) ||
        (world.tick-resolution.tick>DANXIA_CLOSED_RETENTION_TICKS && !pinnedShortages.has(id)) || resolution.requiredLeaves > requiredLeaves ||
        (resolution.reason === 'adequate_stock' ? resolution.requiredLeaves === 0 || resolution.availableLeaves < resolution.requiredLeaves :
          resolution.requiredLeaves !== 0 || (resolution.reason==='authority_lost' && resolution.availableLeaves!==0))) {
      fail('danxiaShortages.cases.resolution');
    }
    for(const [phase,tick] of [['opened',openedTick],['closed',resolution?.tick]] as const){
      const key=`evt-${id}-${phase}`;
      eventIds.add(key);
      const event=events.get(key);
      if(event&&(event.tick!==tick||event.witnessScope!=='participants'||event.category!=='diplomacy'||event.locationId!==siteId||
        event.actorIds.length!==2||event.actorIds[0]!==discipleId||event.actorIds[1]!==patientId))
        fail('danxiaShortages.events.private');
    }
  }
  const privateAnchor=({id}:{id:string})=>eventIds.has(id);
  if (world.chronicleArchive.anchors.some(privateAnchor) ||
      world.chronicleArchive.chapters.some(chapter=>chapter.anchors.some(privateAnchor)) ||
      world.coldHistory.chapters.some(chapter=>chapter.anchors.some(privateAnchor))) fail('danxiaShortages.publicArchive');
}
