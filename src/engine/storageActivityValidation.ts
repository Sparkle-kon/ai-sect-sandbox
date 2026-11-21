import type { WorldState } from '../types/world';
import { SPARRING_ACTIVE_TICKS, SPARRING_OFFER_TICKS } from './sparringEngine';
import { EXPEDITION_RESCUE_OFFER_TICKS, EXPEDITION_RESCUE_STRIDE } from './expeditionRescueEngine';
import { terrainTileAt } from './terrainEngine';
import { OBSERVATORY_LEAD_TICKS } from './fieldObservatoryEngine';
import { COHORT_GRADUATION_MASTERY, COHORT_LESSON_DELAY } from './apprenticeCohortEngine';
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
