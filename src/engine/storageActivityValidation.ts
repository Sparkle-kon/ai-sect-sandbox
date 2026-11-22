import type { FurnaceSafetyCase, FurnaceSafetyReceipt, ResourceFlowEntry, VillageGranaryReceipt, WorldState } from '../types/world';
import { SPARRING_ACTIVE_TICKS, SPARRING_OFFER_TICKS } from './sparringEngine';
import { EXPEDITION_RESCUE_OFFER_TICKS, EXPEDITION_RESCUE_STRIDE } from './expeditionRescueEngine';
import { VILLAGE_GRANARY_CAPACITY, VILLAGE_GRANARY_DISASTER_WINDOW, VILLAGE_GRANARY_DONATION, VILLAGE_GRANARY_DRAW,
  VILLAGE_GRANARY_MIN_STRESS, VILLAGE_GRANARY_RECEIPT_LIMIT, VILLAGE_GRANARY_RELIEF_COOLDOWN,
  VILLAGE_GRANARY_STRESS_REDUCTION, villageGranaryDonationAssets } from './villageGranaryEngine';
import { villageSupplyNativeDeltas,villageSupplyNet } from './villageSupplyAccounting';
import { northRenewalGranaryRootDeltas } from './waterVeinTerms';
import { furnaceSafetyDamage, FURNACE_SAFETY_INSPECT_STONES, FURNACE_SAFETY_REOPEN_INTEGRITY,
  FURNACE_SAFETY_REPAIR } from './furnaceSafetyEngine';
import { terrainTileAt } from './terrainEngine';
import { OBSERVATORY_LEAD_TICKS } from './fieldObservatoryEngine';
import { COHORT_GRADUATION_MASTERY, COHORT_LESSON_DELAY } from './apprenticeCohortEngine';
import { HOUSEHOLD_NAME_OFFER_TICKS } from './householdNameEngine';
import { SHORT_SHIFT_OFFER_TICKS, SHORT_SHIFT_WAGE } from './shortShiftEngine';
import { BOUNDARY_RELIEF_LATE_GRACE_TICKS, BOUNDARY_RELIEF_OFFER_TICKS, BOUNDARY_RELIEF_QI_PER_TILE, BOUNDARY_RELIEF_STRIDE } from './boundaryReliefEngine';

export function validateSparringRelationships(w: WorldState, actor: ReadonlySet<string>,
  locations: ReadonlySet<string>, fail: (path: string) => never): void {
  if (new Set(w.sparring.agreements.map(({ id }) => id)).size !== w.sparring.agreements.length) fail('sparring.agreements.id');
  const heldPractice = new Set<string>();
  for (const agreement of w.sparring.agreements) {
    const { proposerId, partnerId, acceptedTick: accepted, closedTick: closed, deadlineTick: deadline, status } = agreement;
    const serial = Number(agreement.id.match(/^sparring-([1-9][0-9]*)$/)?.[1]);
    const participants = [proposerId, partnerId];
    const open = status === 'offered' || status === 'active';
    if (!Number.isSafeInteger(serial) || serial >= w.sparring.nextId || proposerId === partnerId ||
        participants.some((person) => !actor.has(person)) || agreement.offeredTick > w.tick ||
        agreement.offerExpiresTick !== agreement.offeredTick + SPARRING_OFFER_TICKS ||
        (open && !locations.has(agreement.siteId)) ||
        (status === 'offered' && (accepted !== undefined || w.tick >= agreement.offerExpiresTick)) ||
        (accepted === undefined) !== (deadline === undefined) ||
        (accepted !== undefined && (accepted < agreement.offeredTick || accepted >= agreement.offerExpiresTick ||
          accepted > w.tick || deadline !== accepted + SPARRING_ACTIVE_TICKS)) ||
        (open !== (closed === undefined)) ||
        (closed !== undefined && (closed < (accepted ?? agreement.offeredTick) || closed > w.tick)) ||
        (status === 'active' && (accepted === undefined || w.tick >= (deadline ?? 0))) ||
        (status === 'declined' ? agreement.closedById !== partnerId || accepted !== undefined :
          status === 'withdrawn' ? agreement.closedById !== proposerId || accepted !== undefined :
          status === 'yielded' ? !participants.includes(agreement.closedById ?? '') || accepted === undefined :
          agreement.closedById !== undefined) ||
        (status === 'expired' && (closed ?? 0) < (deadline ?? agreement.offerExpiresTick)) ||
        (agreement.rounds.length > agreement.roundsPlanned) ||
        (status === 'completed' && agreement.rounds.at(-1)?.tick !== closed) ||
        ((status === 'completed') !== (agreement.rounds.length === agreement.roundsPlanned))) {
      fail('sparring.agreements.source');
    }
    if (open) for (const person of participants) {
      if (heldPractice.has(person)) fail('sparring.agreements.overlap');
      heldPractice.add(person);
    }
    let previousRound = accepted ?? Infinity;
    for (const round of agreement.rounds) {
      if (round.tick <= previousRound || round.tick > (closed ?? w.tick) || round.tick >= (deadline ?? 0) ||
          round.members.length !== 2 || new Set(round.members.map(({ actorId }) => actorId)).size !== 2 ||
          round.members.some(({ actorId }) => !participants.includes(actorId)))
        fail('sparring.rounds.source');
      previousRound = round.tick;
    }
    const ready = agreement.readiness;
    if (ready && (status !== 'active' || ready.tick !== w.tick || ready.tick <= previousRound ||
        !ready.actorIds.length || new Set(ready.actorIds).size !== ready.actorIds.length ||
        ready.actorIds.some((id) => !participants.includes(id)))) fail('sparring.readiness.source');
  }
}

export function validateExpeditionRescueRelationships(world: WorldState, actors: ReadonlySet<string>,
  fail: (path: string) => never): void {
  const state = world.expeditionRescues;
  if (!state.requests.length) return;
  const cases = new Set<string>();
  const actualSignals = new Set<string>();
  const held = new Set<string>();
  const locations = new Map(world.locations.map((site) => [site.id, site]));
  const occasions = new Map(world.occasions.map((row) => [row.id, row]));
  for (const row of state.requests) {
    const serial = Number(row.id.match(/^expedition-rescue-([1-9][0-9]*)$/)?.[1]);
    const signalKey = JSON.stringify([row.occasionId, row.explorerId]);
    const occasion = occasions.get(row.occasionId);
    if (!occasion || occasion.kind !== 'expedition') return fail('expeditionRescues.requests.source');
    const members = new Set(occasion.participantIds);
    const gate = locations.get(row.gateSiteId);
    const accepted = row.acceptedTick;
    const open = row.status === 'signaled' || row.status === 'extracting';
    const reached = row.arrivedIds ?? [];
    const people = [row.explorerId, ...(row.rescuerId === undefined ? [] : [row.rescuerId])];
    if (!Number.isSafeInteger(serial) || serial >= state.nextId || cases.has(row.id) || actualSignals.has(signalKey) ||
        !actors.has(row.explorerId) || !members.has(row.explorerId) || row.gateSiteId !== occasion.locationId ||
        row.openedTick < occasion.registrationClosesTick || row.openedTick >= occasion.expiresTick || row.openedTick > world.tick ||
        row.offerExpiresTick !== row.openedTick + EXPEDITION_RESCUE_OFFER_TICKS ||
        !row.witnessIds.length || new Set(row.witnessIds).size !== row.witnessIds.length ||
        row.witnessIds.some((id) => id === row.explorerId || !actors.has(id) || !members.has(id)) ||
        (open && (!gate || gate.type !== 'secret_realm' || occasion.status !== 'running' || world.tick >= occasion.expiresTick ||
          row.finishedTick !== undefined || row.reason !== undefined || row.arrivedIds !== undefined)) ||
        (row.status === 'signaled' && (accepted !== undefined || world.tick >= row.offerExpiresTick)) ||
        ((!open) && (row.finishedTick === undefined || row.finishedTick < (accepted ?? row.openedTick) || row.finishedTick > world.tick)) ||
        (row.status === 'rescued' && (row.reason !== undefined || accepted === undefined || reached.length !== 2)) ||
        (row.status === 'withdrawn' && row.reason !== 'withdrawn') ||
        (row.status === 'expired' && (accepted !== undefined ||
          (row.reason === 'offer_expired' ? (row.finishedTick ?? 0) < row.offerExpiresTick : row.reason !== 'gate_closed'))) ||
        (row.status === 'interrupted' && !row.reason) ||
        (row.arrivedIds !== undefined && (!reached.length || new Set(reached).size !== reached.length ||
          reached.some((id) => !people.includes(id)) ||
          (row.status !== 'rescued' && (row.status !== 'interrupted' || row.reason !== 'participant_lost' || reached.length !== 1))))) {
      fail('expeditionRescues.requests.source');
    }
    cases.add(row.id);
    actualSignals.add(signalKey);
    if (open) for (const id of people) {
      if (held.has(id)) fail('expeditionRescues.requests.overlap');
      held.add(id);
    }
    if (accepted === undefined) {
      if (row.rescuerId !== undefined || row.exitSiteId !== undefined || row.path.length !== 0 || row.pathIndex !== 0 ||
          row.lastAdvancedTick !== undefined || row.supplySpent !== undefined || row.arrivedIds !== undefined || row.status === 'extracting')
        fail('expeditionRescues.requests.unpaid');
      continue;
    }
    const exit = row.exitSiteId ? locations.get(row.exitSiteId) : undefined;
    const first = row.path[0];
    const last = row.path.at(-1);
    if (accepted <= row.openedTick || accepted >= row.offerExpiresTick || accepted > world.tick ||
        !row.rescuerId || !row.witnessIds.includes(row.rescuerId) || row.supplySpent !== 1 ||
        !row.exitSiteId || row.exitSiteId === row.gateSiteId || (open && !exit) ||
        (exit && (exit.type === 'secret_realm' || exit.type === 'abyss')) ||
        row.path.length < 2 || row.pathIndex >= row.path.length ||
        (gate && (first?.x !== gate.x || first.y !== gate.y)) ||
        (exit && (last?.x !== exit.x || last.y !== exit.y)) ||
        accepted + Math.ceil((row.path.length - 1) / EXPEDITION_RESCUE_STRIDE) >= occasion.expiresTick ||
        ((row.pathIndex === 0) !== (row.lastAdvancedTick === undefined)) ||
        (row.lastAdvancedTick !== undefined && (row.lastAdvancedTick <= accepted ||
          row.lastAdvancedTick > (row.finishedTick ?? world.tick) || row.lastAdvancedTick >= occasion.expiresTick ||
          row.pathIndex > (row.lastAdvancedTick - accepted) * EXPEDITION_RESCUE_STRIDE)) ||
        (row.status === 'extracting' && row.pathIndex >= row.path.length - 1) ||
        (reached.length > 0 && (row.pathIndex !== row.path.length - 1 || row.finishedTick !== row.lastAdvancedTick)))
      fail('expeditionRescues.requests.route');
    const tiles = row.path.map(({ x, y }) => terrainTileAt(world, x, y));
    if (tiles.some((tile, index) => {
      const previous = tiles[index - 1];
      return !tile || (index > 0 && (!previous || Math.abs(tile.col - previous.col) + Math.abs(tile.row - previous.row) !== 1));
    })) fail('expeditionRescues.requests.path_steps');
  }
}

export function validateShortShiftRelationships(world: WorldState, actors: ReadonlySet<string>,
  sects: ReadonlySet<string>, fail: (path: string) => never): void {
  const state = world.shortShifts;
  if (!state.shifts.length) return;
  const ids = new Set<string>();
  const activeParties = new Set<string>();
  const activeSites = new Set<string>();
  const realAttendance = new Set<string>();
  for (const row of state.shifts) {
    const serial = Number(row.id.match(/^short-shift-([1-9][0-9]*)$/)?.[1]);
    const isOpen = row.status === 'offered' || row.status === 'active';
    const accepted = row.acceptedTick;
    const source = Object.hasOwn(world.fieldObservatories.byActor, row.hostId)
      ? world.fieldObservatories.byActor[row.hostId].runs.find(({ openedTick }) => openedTick === row.observatoryOpenedTick) : undefined;
    if (!Number.isSafeInteger(serial) || serial >= state.nextId || ids.has(row.id) ||
        row.hostId === row.workerId || !actors.has(row.hostId) || !actors.has(row.workerId) ||
        row.hostSectId === row.workerSectId || !sects.has(row.hostSectId) || !sects.has(row.workerSectId) ||
        row.observatoryOpenedTick + OBSERVATORY_LEAD_TICKS > row.offeredTick ||
        row.offeredTick > world.tick || row.offerExpiresTick !== row.offeredTick + SHORT_SHIFT_OFFER_TICKS ||
        (isOpen && !source) || (source && (source.status !== 'measured' || source.locationId !== row.siteId)) ||
        (row.status === 'offered' && (accepted !== undefined || world.tick >= row.offerExpiresTick)) ||
        (accepted === undefined) !== (row.shiftTick === undefined) ||
        (accepted !== undefined && (accepted <= row.offeredTick || accepted >= row.offerExpiresTick ||
          accepted > world.tick || row.shiftTick !== accepted + 1)) ||
        (row.status === 'active' && (accepted === undefined || (row.shiftTick ?? 0) < world.tick)) ||
        (isOpen !== (row.closedTick === undefined)) ||
        (row.closedTick !== undefined && (row.closedTick < (accepted ?? row.offeredTick) || row.closedTick > world.tick)) ||
        (row.escrowStones !== (row.status === 'active' ? SHORT_SHIFT_WAGE : 0)) ||
        (row.paidStones !== (row.status === 'completed' ? SHORT_SHIFT_WAGE : 0)) ||
        (row.refundedStones !== (accepted !== undefined && !isOpen && row.status !== 'completed' ? SHORT_SHIFT_WAGE : 0)) ||
        (row.status === 'declined' ? row.closeReason !== 'declined' || row.closedById !== row.workerId || accepted !== undefined :
          row.status === 'withdrawn' ? ((row.closeReason === 'host_withdrew' && row.closedById === row.hostId) ||
            (row.closeReason === 'worker_withdrew' && row.closedById === row.workerId)) === false :
          row.closedById !== undefined) ||
        (row.status === 'revoked' && row.closeReason !== 'access_revoked' && row.closeReason !== 'party_lost') ||
        (row.status === 'expired' && (accepted === undefined ?
          row.closeReason !== 'offer_expired' || (row.closedTick ?? 0) < row.offerExpiresTick :
          row.closeReason !== 'shift_missed' || (row.closedTick ?? 0) < (row.shiftTick ?? Infinity))) ||
        ((isOpen || row.status === 'completed') && row.closeReason !== undefined) ||
        ((row.status === 'completed') !== (row.attendance !== undefined))) fail('shortShifts.shifts.source');
    ids.add(row.id);
    if (isOpen) {
      if (activeParties.has(row.workerId) || activeParties.has(row.hostId) || activeSites.has(row.siteId)) fail('shortShifts.shifts.overlap');
      activeParties.add(row.workerId);
      activeParties.add(row.hostId);
      activeSites.add(row.siteId);
    }
    if (row.attendance) {
      const { tick, reading: { kind, intensity } } = row.attendance;
      const workerAt = JSON.stringify(['worker', row.workerId, tick]), siteAt = JSON.stringify(['site', row.siteId, tick]);
      if (accepted === undefined || tick !== row.shiftTick || tick !== row.closedTick ||
          Math.abs(intensity * 100 - Math.round(intensity * 100)) > 1e-8 ||
          (kind === '平息' ? intensity !== 0 : intensity < .05) ||
          realAttendance.has(workerAt) || realAttendance.has(siteAt))
        fail('shortShifts.attendance.source');
      realAttendance.add(workerAt);
      realAttendance.add(siteAt);
    }
  }
}

export function validateBoundaryReliefRelationships(world: WorldState, actors: ReadonlySet<string>,
  sects: ReadonlySet<string>, fail: (path: string) => never): void {
  const state = world.boundaryReliefs;
  if (!state.cases.length) return;
  const ids = new Set<string>();
  const livePosts = new Set<string>();
  const liveNominees = new Set<string>();
  const sites = new Map(world.locations.map((site) => [site.id, site]));
  for (const row of state.cases) {
    const serial = Number(row.id.match(/^boundary-relief-([1-9][0-9]*)$/)?.[1]);
    const open = row.status === 'offered' || row.status === 'travelling' || row.status === 'returning';
    const accepted = row.acceptedTick;
    const post = sites.get(row.postSiteId);
    const origin = sites.get(row.originSiteId);
    const coverage = row.coverage;
    if (!Number.isSafeInteger(serial) || serial >= state.nextId || ids.has(row.id) || !sects.has(row.sectId) ||
        !actors.has(row.leaderId) || !actors.has(row.incumbentId) || !actors.has(row.incomingId) ||
        new Set([row.leaderId, row.incumbentId, row.incomingId]).size !== 3 ||
        row.originSiteId === row.postSiteId || (open && (!origin || !post || post.type !== 'spirit_vein')) ||
        row.incumbentAssignedTick > row.offeredTick || row.offeredTick > world.tick ||
        row.offerExpiresTick !== row.offeredTick + BOUNDARY_RELIEF_OFFER_TICKS ||
        (row.status === 'offered' && (accepted !== undefined || row.closeReason !== undefined || world.tick >= row.offerExpiresTick)) ||
        (accepted === undefined) !== (row.deadlineTick === undefined) ||
        (open !== (row.closedTick === undefined)) ||
        (row.closedTick !== undefined && (row.closedTick < (accepted ?? row.offeredTick) || row.closedTick > world.tick)) ||
        (row.closedById !== undefined && row.closedById !== row.leaderId && row.closedById !== row.incomingId) ||
        (row.status === 'declined' && (row.closeReason !== 'declined' || row.closedById !== row.incomingId || accepted !== undefined)) ||
        (row.status === 'withdrawn' && (row.closeReason !== 'withdrawn' || !row.closedById)) ||
        (row.status === 'expired' && (accepted === undefined ?
          row.closeReason !== 'offer_expired' || (row.closedTick ?? 0) < row.offerExpiresTick :
          row.closeReason !== 'late' || (row.closedTick ?? 0) < (row.deadlineTick ?? Infinity) || row.pathIndex !== 0)) ||
        (row.status === 'interrupted' && row.closeReason === undefined) ||
        (row.status === 'returning' && row.closeReason === undefined) ||
        ((row.status === 'completed' || row.status === 'travelling') && row.closeReason !== undefined) ||
        coverage.tick < row.offeredTick || coverage.tick > (row.closedTick ?? world.tick) ||
        (row.firstGapTick !== undefined && (row.firstGapTick < row.offeredTick || row.firstGapTick > coverage.tick)) ||
        (coverage.kind === 'gap' ? coverage.guardId !== undefined || row.firstGapTick === undefined :
          !coverage.guardId || !actors.has(coverage.guardId) ||
          (coverage.kind === 'relief' ? coverage.guardId !== row.incomingId || row.status !== 'completed' :
            coverage.kind === 'incumbent' ? coverage.guardId !== row.incumbentId :
            coverage.guardId === row.incumbentId || coverage.guardId === row.incomingId))) {
      fail('boundaryReliefs.cases.source');
    }
    ids.add(row.id);
    if (open) {
      if (livePosts.has(row.postSiteId) || liveNominees.has(row.incomingId)) fail('boundaryReliefs.cases.overlap');
      livePosts.add(row.postSiteId);
      liveNominees.add(row.incomingId);
    }
    const pathLength = row.path.length - 1;
    const travelled = row.outboundSteps + row.returnSteps;
    if (accepted === undefined) {
      if (row.path.length !== 0 || row.pathIndex !== 0 || travelled !== 0 || row.lastAdvancedTick !== undefined ||
          row.strainSpent !== 0 || row.status === 'travelling' || row.status === 'returning' || row.status === 'completed')
        fail('boundaryReliefs.cases.unaccepted');
      continue;
    }
    const first = row.path[0];
    const last = row.path.at(-1);
    if (accepted <= row.offeredTick || accepted >= row.offerExpiresTick || accepted > world.tick ||
        pathLength < 1 || row.deadlineTick !== accepted + Math.ceil(pathLength / BOUNDARY_RELIEF_STRIDE) + BOUNDARY_RELIEF_LATE_GRACE_TICKS ||
        row.pathIndex > pathLength || row.outboundSteps > pathLength || row.outboundSteps - row.returnSteps !== row.pathIndex ||
        row.strainSpent !== travelled * BOUNDARY_RELIEF_QI_PER_TILE || (travelled === 0) !== (row.lastAdvancedTick === undefined) ||
        (row.lastAdvancedTick !== undefined && (row.lastAdvancedTick <= accepted || row.lastAdvancedTick > (row.closedTick ?? world.tick) ||
          travelled > (row.lastAdvancedTick - accepted) * BOUNDARY_RELIEF_STRIDE)) ||
        (origin && (first?.x !== origin.x || first.y !== origin.y)) ||
        (post && (last?.x !== post.x || last.y !== post.y)) ||
        (row.status === 'travelling' && (row.pathIndex >= pathLength || row.returnSteps !== 0)) ||
        (row.status === 'completed' && (row.pathIndex !== pathLength || row.returnSteps !== 0 ||
          row.coverage.kind !== 'relief' || row.coverage.tick !== row.closedTick || row.lastAdvancedTick !== row.closedTick))) {
      fail('boundaryReliefs.cases.route');
    }
    const tiles = row.path.map(({ x, y }) => terrainTileAt(world, x, y));
    if (tiles.some((tile, index) => {
      const previous = tiles[index - 1];
      return !tile || (index > 0 && (!previous || Math.abs(tile.col - previous.col) + Math.abs(tile.row - previous.row) !== 1));
    })) fail('boundaryReliefs.cases.path_steps');
  }
}

export function validateApprenticeCohortRelationships(world: WorldState, actors: ReadonlySet<string>,
  sects: ReadonlySet<string>, locations: ReadonlySet<string>, fail: (path: string) => never): void {
  const state = world.apprenticeCohorts;
  if (!state.cohorts.length && !state.graduations.length) return;
  const originals = new Map(world.scriptures.originals.map((row) => [row.id, row]));
  const cohorts = new Map(state.cohorts.map((row) => [row.id, row]));
  const teachingOnce = new Set<string>();
  const openMentors = new Set<string>();
  const actualSeats = new Set<string>();
  if (cohorts.size !== state.cohorts.length) fail('apprenticeCohorts.cohorts.unique');
  for (const row of state.cohorts) {
    const serial = Number(row.id.match(/^apprentice-cohort-([1-9][0-9]*)$/)?.[1]);
    const original = originals.get(row.techniqueId);
    const open = row.status === 'offered';
    if (!Number.isSafeInteger(serial) || serial >= state.nextId || !actors.has(row.mentorId) || !sects.has(row.sectId) ||
        !original || original.firstSeenTick > row.openedTick || (open && !locations.has(row.siteId)) ||
        row.openedTick > world.tick || row.lessonTick !== row.openedTick + COHORT_LESSON_DELAY ||
        row.seats.length < 2 || new Set(row.seats.map(({ studentId }) => studentId)).size !== row.seats.length ||
        (open !== (row.closedTick === undefined)) || (open && (world.tick > row.lessonTick || row.reason !== undefined)) ||
        (row.closedTick !== undefined && (row.closedTick < row.openedTick || row.closedTick > world.tick)) ||
        (row.status === 'expired' && (row.closedTick ?? 0) < row.lessonTick) ||
        (row.teachingTick !== undefined && (row.teachingTick !== row.lessonTick || row.teachingTick > (row.closedTick ?? world.tick))) ||
        ((row.status === 'held') !== (row.instructionSpent === 1)) ||
        (row.status === 'held' && (row.teachingTick !== row.lessonTick || row.closedTick !== row.lessonTick || row.reason !== undefined ||
          !row.seats.some(({ status }) => status === 'attended'))) ||
        ((row.status === 'cancelled' || row.status === 'expired') && row.reason === undefined))
      fail('apprenticeCohorts.cohorts.source');
    if (open) {
      if (openMentors.has(row.mentorId)) fail('apprenticeCohorts.cohorts.openMentor');
      openMentors.add(row.mentorId);
    }
    if (row.status === 'held') {
      const key = JSON.stringify([row.mentorId, row.lessonTick]);
      if (teachingOnce.has(key)) fail('apprenticeCohorts.cohorts.teacherTurn');
      teachingOnce.add(key);
    }
    for (const seat of row.seats) {
      const { studentId, acceptedTick: accepted, leftTick: left, attendedTick: attended, readyTick: ready } = seat;
      if (studentId === row.mentorId || !actors.has(studentId) ||
          (accepted !== undefined && (accepted <= row.openedTick || accepted >= row.lessonTick || accepted > world.tick)) ||
          (ready !== undefined && (accepted === undefined || ready !== row.lessonTick || ready > world.tick)) ||
          (left !== undefined && (left <= row.openedTick || left > world.tick ||
            (accepted !== undefined && left < accepted) || (attended !== undefined && left <= attended))) ||
          (seat.status === 'invited' && accepted !== undefined) ||
          (seat.status === 'accepted' && (accepted === undefined || !open)) ||
          (seat.status === 'left' && left === undefined) ||
          ((seat.status === 'attended') !== (attended !== undefined && seat.masteryGained !== undefined)) ||
          (seat.status === 'attended' && (accepted === undefined || attended !== row.lessonTick || row.status !== 'held')) ||
          (seat.status !== 'attended' && (attended !== undefined || seat.masteryGained !== undefined)))
        fail('apprenticeCohorts.seats.source');
      if (seat.status === 'attended') {
        const key = JSON.stringify([studentId, row.lessonTick]);
        if (actualSeats.has(key)) fail('apprenticeCohorts.seats.studentTurn');
        actualSeats.add(key);
      }
    }
  }
  const graduations = new Set<string>();
  for (const receipt of state.graduations) {
    const key = JSON.stringify([receipt.studentId, receipt.techniqueId]);
    const source = cohorts.get(receipt.cohortId);
    const seat = source?.seats.find(({ studentId }) => studentId === receipt.studentId);
    if (graduations.has(key) || source?.status !== 'held' || source.techniqueId !== receipt.techniqueId ||
        source.mentorId !== receipt.mentorId || seat?.status !== 'attended' ||
        receipt.tick <= (seat.attendedTick ?? Infinity) || receipt.tick > world.tick ||
        (seat.leftTick !== undefined && seat.leftTick <= receipt.tick) ||
        receipt.masteryAfter < COHORT_GRADUATION_MASTERY || receipt.masteryAfter <= receipt.masteryBefore ||
        receipt.masteryAfter > receipt.masteryBefore + 3 + 1e-8)
      fail('apprenticeCohorts.graduations.source');
    graduations.add(key);
  }
}

export function validateHouseholdNameRelationships(world: WorldState, actors: ReadonlySet<string>,
  fail: (path: string) => never): void {
  const state = world.householdNames;
  if (!state.entries.length) return;
  const members = new Map(world.households.members.map((member) => [member.volunteerId, member]));
  const settlements = new Set(world.settlements.villages.map(({ id }) => id));
  const groups = new Set(world.households.groups.map(({ id }) => id));
  const keys = new Set<string>();
  const liveActors = new Set<string>();
  const receipts = new Set<string>();
  for (const row of state.entries) {
    const serial = Number(row.id.match(/^household-name-([1-9][0-9]*)$/)?.[1]);
    const member = members.get(row.volunteerId);
    const closed = row.closedTick;
    if (!Number.isSafeInteger(serial) || serial >= state.nextId || keys.has(row.id) ||
        !actors.has(row.actorId) || row.actorId !== `recruit-${row.volunteerId}` ||
        member?.recruitedId !== row.actorId || member.householdId !== row.householdId || member.settlementId !== row.settlementId ||
        !groups.has(row.householdId) || !settlements.has(row.settlementId) ||
        row.openedTick < member.registeredTick || row.openedTick > world.tick ||
        row.expiresTick !== row.openedTick + HOUSEHOLD_NAME_OFFER_TICKS ||
        ((row.kind === 'alias') !== (row.alias !== undefined)) ||
        ((row.status === 'proposed') !== (closed === undefined)) ||
        (row.status === 'proposed' && world.tick >= row.expiresTick) ||
        (closed !== undefined && (closed < row.openedTick || closed > world.tick)) ||
        (row.status === 'verified' && (closed === undefined || closed <= row.openedTick || closed >= row.expiresTick ||
          !row.witnessId || row.witnessId === row.actorId || !actors.has(row.witnessId))) ||
        (row.status !== 'verified' && row.witnessId !== undefined) ||
        (row.status === 'withdrawn' && (closed ?? Infinity) >= row.expiresTick))
      fail('householdNames.entries.identity');
    keys.add(row.id);
    if (row.status === 'proposed') {
      if (liveActors.has(row.actorId)) fail('householdNames.entries.active');
      liveActors.add(row.actorId);
    }
    if (row.status === 'verified') {
      const key = JSON.stringify([row.actorId, closed]);
      if (receipts.has(key)) fail('householdNames.entries.receipt');
      receipts.add(key);
    }
  }
}

export function validateCaravanRestitutionRelationships(world: WorldState, actors: ReadonlySet<string>,
  fail: (path: string) => never): void {
  if (!world.caravanRestitution.lots.length) return;
  const shipments = new Map(world.markets.shipments.map((shipment) => [shipment.id, shipment]));
  const sites = new Map(world.locations.map((site) => [site.id, site]));
  const hazards = new Map(world.mapHazards.map((hazard) => [hazard.id, hazard]));
  const tiles = new Set(world.terrain.tiles.map(({ id }) => id));
  const ids = new Set<string>();
  const ledgerBySeal = new Map<string, ResourceFlowEntry[]>();
  for (const { entries } of world.resourceFlow.months) for (const entry of entries) {
    const endpoints = new Set([
      'from' in entry && entry.from?.kind === 'salvage' ? entry.from.id : undefined,
      'to' in entry && entry.to?.kind === 'salvage' ? entry.to.id : undefined,
    ]);
    for (const id of endpoints) if (id !== undefined) {
      const entriesForSeal = ledgerBySeal.get(id);
      if (entriesForSeal) entriesForSeal.push(entry);
      else ledgerBySeal.set(id, [entry]);
    }
  }
  for (const row of world.caravanRestitution.lots) {
    const old = shipments.get(row.shipmentId);
    const site = sites.get(row.siteId);
    const hazard = hazards.get(row.hazardId);
    const seen = row.discoveredTick;
    const returned = row.returnedTick;
    const source = world.events.filter(({ id }) => id === row.sourceLossEventId);
    if (ids.has(row.id) || row.id !== `salvage-${row.shipmentId}` || !/^caravan-[1-9][0-9]*$/.test(row.shipmentId) ||
        row.sourceLossEventId !== `evt-${row.openedTick}-market-${row.shipmentId}` || row.openedTick > world.tick ||
        !actors.has(row.buyerId) || !actors.has(row.sellerId) || row.buyerId === row.sellerId ||
        row.originalQuantity < 2 || row.destroyedQuantity + row.units !== row.originalQuantity ||
        !tiles.has(row.tileId) || (site && (site.type === 'secret_realm' || site.type === 'abyss' ||
          terrainTileAt(world, site.x, site.y)?.id !== row.tileId)) ||
        (hazard && (hazard.kind !== 'beast_tide' || hazard.intensity !== 2 || hazard.tileId !== row.tileId ||
          hazard.createdTick > row.openedTick || hazard.expiresTick <= row.openedTick)) ||
        (old && (old.status !== 'lost' || old.settledTick !== row.openedTick || old.good !== row.good ||
          old.quantity !== row.originalQuantity || old.buyerId !== row.buyerId || old.sellerId !== row.sellerId)) ||
        (source.length > 0 && (source.length !== 1 || source[0].witnessScope === 'participants' ||
          source[0].tick !== row.openedTick || source[0].category !== 'diplomacy' ||
          !source[0].actorIds.includes(row.buyerId) || !source[0].actorIds.includes(row.sellerId))) ||
        ((row.status === 'buried') !== (seen === undefined)) ||
        (seen === undefined ? row.finderId !== undefined : (!row.finderId || row.finderId === row.sellerId ||
          !actors.has(row.finderId) || seen <= row.openedTick || seen > world.tick)) ||
        ((row.status === 'returned') !== (returned !== undefined)) ||
        (returned === undefined ? row.returnedById !== undefined : (seen === undefined || returned <= seen || returned > world.tick ||
          (row.returnedById !== row.finderId && row.returnedById !== row.sellerId))))
      fail('caravanRestitution.lots.source');
    ids.add(row.id);
    const ledger = ledgerBySeal.get(row.id) ?? [];
    let inflow = 0, outflow = 0;
    for (const entry of ledger) {
      if (entry.kind !== 'transfer' || entry.good !== row.good || entry.amount !== row.units) return fail('caravanRestitution.lots.custody');
      if (entry.to?.kind === 'salvage') {
        inflow++;
        if (entry.tick !== row.openedTick || entry.from?.kind !== 'shipment' || entry.from.id !== row.shipmentId)
          fail('caravanRestitution.lots.custody');
      } else {
        outflow++;
        if (entry.tick !== returned || entry.to?.kind !== 'actor' || entry.to.id !== row.sellerId)
          fail('caravanRestitution.lots.custody');
      }
    }
    if (inflow > 1 || outflow > 1) fail('caravanRestitution.lots.custody');
  }
}

export function validateVillageGranaryRelationships(world: WorldState, actors: ReadonlySet<string>,
  fail: (path: string) => never): void {
  const villages = new Map(world.settlements.villages.map((village) => [village.id, village]));
  const disasterKey = (id: string, tick: number) => JSON.stringify([id, tick]);
  const disasters = new Set(world.settlements.records.filter(({kind}) => kind === 'disaster')
    .map(({ settlementId, tick }) => disasterKey(settlementId, tick)));
  const settlementHead = world.settlements.records[0]?.tick;
  const key = (id: string, tick: number, actorId: string) => JSON.stringify([id, tick, actorId]);
  const durableReceipts = new Map<string, VillageGranaryReceipt>();
  const oldestReceipt = new Map<string, number>();
  const signedAssets=(row:VillageGranaryReceipt):{roots:number;stones:number}=>row.kind==='draw'
    ? {roots:-VILLAGE_GRANARY_DRAW.roots,stones:-VILLAGE_GRANARY_DRAW.stones}
    : villageGranaryDonationAssets(row.kind);
  const withinVault=(roots:number,stones:number)=>Number.isSafeInteger(roots) && Number.isSafeInteger(stones) &&
    roots>=0 && stones>=0 && roots<=VILLAGE_GRANARY_CAPACITY.roots && stones<=VILLAGE_GRANARY_CAPACITY.stones;
  for (const granary of world.villageGranaries.granaries) {
    const id=granary.settlementId;
    const village = villages.get(id);
    const receipts = granary.receipts;
    const rootsOnly=granary.rootOnlyDonations??0;
    const stonesOnly=granary.stoneOnlyDonations??0;
    const mixed=granary.donatedRoots/VILLAGE_GRANARY_DONATION.roots-rootsOnly;
    const allDonations=mixed+rootsOnly+stonesOnly;
    const draws=granary.spentRoots/VILLAGE_GRANARY_DRAW.roots;
    const lifetime=allDonations+draws;
    const supply=villageSupplyNet(world,id);
    const renewed=northRenewalGranaryRootDeltas(world,id);
    const external=[...villageSupplyNativeDeltas(world,id),...renewed];
    if (!village || oldestReceipt.has(id) || ![rootsOnly,stonesOnly,mixed,draws,lifetime].every(n=>Number.isSafeInteger(n)&&n>=0) ||
        allDonations < 1 || granary.rootOnlyDonations===0 || granary.stoneOnlyDonations===0 ||
        granary.donatedStones !== (mixed+stonesOnly)*VILLAGE_GRANARY_DONATION.stones ||
        granary.spentStones !== draws*VILLAGE_GRANARY_DRAW.stones ||
        granary.roots !== granary.donatedRoots-granary.spentRoots+supply.roots+renewed.reduce((sum,row)=>sum+row.roots,0) ||
        granary.stones !== granary.donatedStones-granary.spentStones+supply.stones ||
        !withinVault(granary.roots+supply.reserveRoots,granary.stones+supply.reserveStones) ||
        receipts.length !== Math.min(VILLAGE_GRANARY_RECEIPT_LIMIT,lifetime))
      return fail('villageGranaries.inventory');
    const head = receipts[0]?.tick ?? -1;
    oldestReceipt.set(id,receipts.length===VILLAGE_GRANARY_RECEIPT_LIMIT?head:-1);
    if ((draws>0) !== (granary.lastDrawTick!==undefined) ||
      (granary.lastDrawTick!==undefined && (granary.lastDrawTick>world.tick ||
        granary.lastDrawTick>(village.lastReliefTick??-1) ||
        granary.lastDrawTick>=(external.length && lifetime>receipts.length?head+1:head) &&
        !receipts.some(receipt=>receipt.kind==='draw' && receipt.tick===granary.lastDrawTick))))
      return fail('villageGranaries.lastDrawTick');
    let previousTick=-1;
    let previousDraw=-Infinity;
    const kept={donate:0,donate_roots:0,donate_stones:0,draw:0};
    for (const receipt of receipts) {
      const receiptKey=key(id,receipt.tick,receipt.actorId);
      if (!actors.has(receipt.actorId) || receipt.tick<previousTick || receipt.tick>world.tick || durableReceipts.has(receiptKey))
        return fail('villageGranaries.receipts.source');
      previousTick=receipt.tick;
      if (receipt.kind==='draw') {
        if (receipt.tick-previousDraw < VILLAGE_GRANARY_RELIEF_COOLDOWN ||
            receipt.tick > (granary.lastDrawTick??-1) ||
            receipt.disasterTick>receipt.tick || receipt.tick-receipt.disasterTick>VILLAGE_GRANARY_DISASTER_WINDOW ||
            receipt.disasterTick>(village.lastDisasterTick??-1) || receipt.stressBefore<VILLAGE_GRANARY_MIN_STRESS ||
            receipt.stressBefore-VILLAGE_GRANARY_STRESS_REDUCTION!==receipt.stressAfter ||
            (settlementHead!==undefined && receipt.disasterTick>settlementHead && !disasters.has(disasterKey(id,receipt.disasterTick))))
          return fail('villageGranaries.receipts.draw');
        previousDraw=receipt.tick;
      }
      kept[receipt.kind]++;
      durableReceipts.set(receiptKey,receipt);
    }
    if (kept.donate>mixed || kept.donate_roots>rootsOnly || kept.donate_stones>stonesOnly || kept.draw>draws)
      return fail('villageGranaries.receipts.balance');

    // Independently reconcile the dated native and external lanes. Same-tick order
    // across lanes is not stored, so only a complete closing balance is provable there.
    if (!external.length) {
      let roots=granary.roots,stones=granary.stones;
      for (const row of [...receipts].reverse()) {
        const delta=signedAssets(row);
        roots-=delta.roots;
        stones-=delta.stones;
        if (!withinVault(roots,stones)) return fail('villageGranaries.receipts.source');
      }
      if (lifetime===receipts.length && (roots!==0 || stones!==0)) return fail('villageGranaries.receipts.balance');
    } else {
      const start=(head<0?world.tick+1:head)+(lifetime>receipts.length?1:0);
      const periods=new Map<number,{native:VillageGranaryReceipt[];roots:number;stones:number;external:boolean}>();
      const period=(tick:number)=>{
        const saved=periods.get(tick);
        if (saved) return saved;
        const value={native:[],roots:0,stones:0,external:false};
        periods.set(tick,value);
        return value;
      };
      for(const row of receipts) if(row.tick>=start) period(row.tick).native.push(row);
      for(const item of external) if(item.tick>=start) {
        const bucket=period(item.tick);
        bucket.roots+=item.roots;
        bucket.stones+=item.stones;
        bucket.external=true;
      }
      let roots=granary.roots,stones=granary.stones;
      for(const [,entry] of [...periods].sort((a,b)=>b[0]-a[0])) {
        roots-=entry.roots;
        stones-=entry.stones;
        for(const row of [...entry.native].reverse()) {
          const delta=signedAssets(row);
          roots-=delta.roots;
          stones-=delta.stones;
          if(!entry.external && !withinVault(roots,stones)) return fail('villageGranaries.receipts.source');
        }
        if(!withinVault(roots,stones)) return fail('villageGranaries.receipts.balance');
      }
    }
  }
  const complete = new Set(world.resourceFlow.months.filter((month) => month.entries.length === month.totalEntries)
    .map(({tick}) => tick));
  const journal = new Map<string, Set<string>>();
  for (const month of world.resourceFlow.months) for (const row of month.entries) {
    const from = 'from' in row ? row.from : undefined;
    const to = 'to' in row ? row.to : undefined;
    if (row.mechanism === 'village_supply') continue; // Validated by the separate exact two-endpoint custody ledger.
    if (row.mechanism !== 'granary' && from?.kind !== 'granary' && to?.kind !== 'granary') continue;
    const kind = row.reason==='granary_draw'?'draw':row.reason==='granary_donation'?'donate':
      row.reason==='granary_donation_roots'?'donate_roots':row.reason==='granary_donation_stones'?'donate_stones':undefined;
    const participant = row.visibility.kind==='participants' && row.visibility.actorIds.length===1?row.visibility.actorIds[0]:undefined;
    const quantity = kind==='draw'?VILLAGE_GRANARY_DRAW:kind?villageGranaryDonationAssets(kind):undefined;
    if (row.mechanism!=='granary' || !quantity || !participant || !actors.has(participant) || !oldestReceipt.has(row.refId) ||
      (row.good!=='stone' && row.good!=='earth_root') ||
      row.amount!==(row.good==='stone'?quantity.stones:quantity.roots) || row.amount<=0 ||
      (kind==='draw'?row.kind!=='consumption'||from?.kind!=='granary'||from.id!==row.refId:
        row.kind!=='transfer'||from?.kind!=='actor'||from.id!==participant||to?.kind!=='granary'||to.id!==row.refId))
      return fail('villageGranaries.journal.coordinates');
    const receiptKey=key(row.refId,row.tick,participant);
    const receipt=durableReceipts.get(receiptKey);
    if (receipt && receipt.kind!==kind || !receipt && row.tick>oldestReceipt.get(row.refId)!)
      return fail('villageGranaries.journal.source');
    const goods=journal.get(receiptKey)??new Set<string>();
    if(goods.has(row.good)) return fail('villageGranaries.journal.duplicate');
    goods.add(row.good);
    journal.set(receiptKey,goods);
  }
  for (const [receiptKey, {tick,kind}] of durableReceipts) {
    const expected=kind==='donate_roots'||kind==='donate_stones'?1:2;
    if(complete.has(tick) && journal.get(receiptKey)?.size!==expected) return fail('villageGranaries.journal.missing');
  }
}

export function validateFurnaceSafetyRelationships(world: WorldState, actors: ReadonlySet<string>, sects: ReadonlySet<string>,
  fail: (path: string) => never): void {
  const locations = new Map(world.locations.map(location => [location.id,location]));
  const hazards = new Map(world.mapHazards.map(hazard => [hazard.id,hazard]));
  const ids = new Set<string>();
  const impacts = new Set<string>();
  const siteHeads = new Map<string,FurnaceSafetyCase>();
  const receipts = new Map<string,FurnaceSafetyReceipt>();
  const cases = [...world.furnaceSafety.cases].sort((a,b)=>a.damagedTick-b.damagedTick);
  const key = (id:string,tick:number)=>JSON.stringify([id,tick]);
  for (const row of cases) {
    const site = locations.get(row.siteId);
    const hazard = hazards.get(row.hazardId);
    const impact = JSON.stringify([row.siteId,row.hazardId]);
    const serial = Number(row.id.match(/^furnace-safety-([1-9][0-9]*)$/)?.[1]);
    const previous = siteHeads.get(row.siteId);
    if (!Number.isSafeInteger(serial) || serial >= world.furnaceSafety.nextId || ids.has(row.id) || impacts.has(impact) ||
        !sects.has(row.ownerAtDamage) || !site || !site.furnaceGrade || site.type === 'secret_realm' || site.type === 'abyss' ||
        terrainTileAt(world,site.x,site.y)?.id !== row.hazardTileId ||
        row.damagedTick <= row.hazardCreatedTick || row.damagedTick > world.tick ||
        row.integrityBefore < FURNACE_SAFETY_REOPEN_INTEGRITY ||
        (previous && (previous.reopenedTick === undefined || previous.reopenedTick >= row.damagedTick || row.integrityBefore !== previous.integrity)) ||
        (hazard && (hazard.kind !== 'beast_tide' || hazard.tileId !== row.hazardTileId || hazard.intensity !== row.severity ||
          hazard.createdTick !== row.hazardCreatedTick || hazard.expiresTick <= row.damagedTick)))
      return fail('furnaceSafety.cases.impact');
    ids.add(row.id);
    impacts.add(impact);
    siteHeads.set(row.siteId,row);
    let actual = Math.max(0,row.integrityBefore-furnaceSafetyDamage(row.severity));
    let last = row.damagedTick;
    for (const [index,receipt] of row.receipts.entries()) {
      if (!actors.has(receipt.actorId) || !sects.has(receipt.ownerSectId) || receipt.tick <= last || receipt.tick > world.tick ||
          receipt.integrityBefore !== actual || (index === 0) !== (receipt.kind === 'inspect'))
        return fail('furnaceSafety.cases.receipts');
      if (receipt.kind === 'repair') {
        if (actual >= FURNACE_SAFETY_REOPEN_INTEGRITY) return fail('furnaceSafety.cases.repair');
        actual = Math.min(100,actual+FURNACE_SAFETY_REPAIR.recovery);
      }
      if (receipt.kind === 'reopen' && (actual < FURNACE_SAFETY_REOPEN_INTEGRITY || index !== row.receipts.length-1 ||
          row.reopenedTick !== receipt.tick)) return fail('furnaceSafety.cases.reopen');
      if (receipt.integrityAfter !== actual) return fail('furnaceSafety.cases.integrity');
      receipts.set(key(row.id,receipt.tick),receipt);
      last = receipt.tick;
    }
    if (actual !== row.integrity || (row.reopenedTick !== undefined) !== (row.receipts.at(-1)?.kind === 'reopen'))
      return fail('furnaceSafety.cases.integrity');
  }
  const bySite = new Map<string,FurnaceSafetyCase[]>();
  for (const row of cases) {
    const prior = bySite.get(row.siteId) ?? [];
    prior.push(row);
    bySite.set(row.siteId,prior);
  }
  const closedAt = (siteId:string,tick:number) => bySite.get(siteId)?.some(row =>
    row.damagedTick <= tick && (row.reopenedTick === undefined || row.reopenedTick >= tick));
  for (const use of world.furnaceReservations.uses) if (closedAt(use.siteId,use.tick)) return fail('furnaceSafety.closed_use');
  for (const row of world.furnaceReservations.reservations) {
    if (row.status === 'reserved' && row.assignedTick !== undefined && closedAt(row.siteId,row.assignedTick))
      return fail('furnaceSafety.closed_reservation');
    const last = row.lastSuspendedTick;
    const head = siteHeads.get(row.siteId);
    if (last !== undefined && (!head || last >= head.damagedTick && !closedAt(row.siteId,last)))
      return fail('furnaceSafety.reservation_pause');
  }
  for (const month of world.resourceFlow.months) {
    const booked = new Map<string,Set<string>>();
    for (const entry of month.entries) if (entry.mechanism === 'furnace_safety') {
      const ref = key(entry.refId,entry.tick);
      const receipt = receipts.get(ref);
      // Details from a compacted historical case can remain in the rolling general journal.
      if (!receipt) {
        if (ids.has(entry.refId)) return fail('furnaceSafety.journal.source');
        continue;
      }
      const charge = receipt.kind === 'inspect' && entry.good === 'stone' ? FURNACE_SAFETY_INSPECT_STONES :
        receipt.kind === 'repair' && entry.good === 'stone' ? FURNACE_SAFETY_REPAIR.stones :
        receipt.kind === 'repair' && entry.good === 'earth_root' ? FURNACE_SAFETY_REPAIR.roots : undefined;
      const reason = receipt.kind === 'inspect' ? 'furnace_safety_inspection' : 'furnace_safety_repair';
      const goods = booked.get(ref) ?? new Set<string>();
      if (charge === undefined || entry.reason !== reason || entry.amount !== charge || entry.kind !== 'consumption' ||
          entry.from.kind !== 'actor' || entry.from.id !== receipt.actorId || entry.visibility.kind !== 'participants' ||
          entry.visibility.actorIds.length !== 1 || entry.visibility.actorIds[0] !== receipt.actorId || goods.has(entry.good))
        return fail('furnaceSafety.journal.custody');
      goods.add(entry.good);
      booked.set(ref,goods);
    }
    if (month.entries.length === month.totalEntries) for (const row of cases) for (const receipt of row.receipts) {
      if (receipt.tick === month.tick && receipt.kind !== 'reopen' &&
          booked.get(key(row.id,receipt.tick))?.size !== (receipt.kind === 'inspect' ? 1 : 2)) return fail('furnaceSafety.journal.missing');
    }
  }
}
