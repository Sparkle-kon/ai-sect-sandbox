import type { ArbitrationAppointment, ArbitrationRecusal, Cultivator, LLMDecisionPayload, OathArbitrationCase,
  OathArbitrationMove, OathArbitrationState, OathContract, OathEvidence, OathTenderObservation, WorldEvent, WorldState } from '../types/world';

export const ARBITRATION_JOIN_WINDOW = 3;
export const ARBITRATION_HEARING_WINDOW = 7;
export const ARBITRATION_MAX_OBSERVERS = 6;
export const ARBITRATION_MAX_APPOINTMENTS_PER_SIDE = 2;
export const ARBITRATION_CLOSED_HISTORY = 48;
const MAX_NOMINATIONS = 6;

export interface OathArbitrationOption {
  action: 'OATH_ARBITRATION';
  arbitrationMove: OathArbitrationMove;
  targetOathId: string;
  targetCultivatorId?: string;
  targetTenderTick?: number;
}
export type OathArbitrationView = Pick<OathArbitrationCase, 'id' | 'oathId' | 'siteId' | 'tenderTick' | 'openedTick' |
  'joinUntilTick' | 'joinedTick' | 'expiresTick' | 'status' | 'closedTick' | 'disposition'> & {
  role: 'requester' | 'provider' | 'adjudicator' | 'observer';
  appointments: Omit<ArbitrationAppointment, 'appointeeId'>[];
  filedTick?: number;
  escrow?: OathContract['escrow'];
};

export const createOathArbitrationState = (): OathArbitrationState => ({ cases: [], observations: [] });
const person = (world: WorldState, id: string) => world.cultivators.find((actor) => actor.id === id);
const contract = (world: WorldState, id: string) => world.oaths.contracts.find((oath) => oath.id === id);
const alive = (actor: Cultivator | undefined): actor is Cultivator => !!actor?.alive && actor.hp > 0;
const samePair = (a: string, b: string, first: string, second: string) => a === first && b === second || a === second && b === first;
const sortActor = (a: Cultivator, b: Cultivator) => a.id.localeCompare(b.id);

function atSite(world: WorldState, actor: Cultivator, siteId: string): boolean {
  return alive(actor) && actor.locationId === siteId &&
    actor.tribulation?.stage !== 'lightning' && actor.tribulation?.stage !== 'heart_demon' &&
    !world.couriers.dispatches.some((row) => row.courierId === actor.id &&
      (row.status === 'in_transit' || row.status === 'returning' || row.lastAdvancedTick === world.tick)) &&
    !world.pilgrimages.journeys.some((row) => row.status === 'active' &&
      (row.organizerId === actor.id || row.companionId === actor.id) && (row.path.length > 0 || row.lastMovedTick === world.tick)) &&
    !world.escorts.contracts.some((row) => row.status === 'active' && row.escortId === actor.id) &&
    !world.relocations.plans.some((row) => row.status === 'in_transit' && row.garrisonIds.includes(actor.id)) &&
    !world.sieges.some((row) => (row.status === 'marching' || row.status === 'sieging') && row.participantIds.includes(actor.id));
}

function checkConflict(world: WorldState, actor: Cultivator | undefined, oath: OathContract): ArbitrationRecusal | undefined {
  if (!alive(actor) || actor.id === oath.requesterId || actor.id === oath.providerId) return 'unavailable';
  for (const id of [oath.requesterId, oath.providerId]) {
    const party = person(world, id);
    if (actor.sectId && actor.sectId === party?.sectId) return 'faction';
    if (world.relationships.some((edge) => samePair(edge.fromId, edge.toId, actor.id, id) &&
          (edge.type === '师徒' || edge.type === '道侣' || Math.abs(edge.affinity) >= 55)) ||
        world.mentorship.lineage.some((edge) => samePair(edge.mentorId, edge.studentId, actor.id, id)) ||
        world.households.guardianships.some((row) => row.status === 'active' && row.expiresTick > world.tick &&
          samePair(row.guardianId, row.wardId, actor.id, id))) return 'personal_tie';
    if (world.oaths.contracts.some((row) => row.id !== oath.id && (row.status === 'active' || row.status === 'breached') &&
      row.settledTick === undefined && samePair(row.requesterId, row.providerId, actor.id, id))) return 'prior_obligation';
  }
  return undefined;
}

function realTender(world: WorldState, oath: OathContract, tick: number): OathEvidence | undefined {
  return oath.evidence.find((row) => row.tick === tick && row.tick <= world.tick && row.tick >= oath.offeredTick &&
    row.tick < (oath.deadlineTick ?? 0) && row.actorId === oath.providerId && row.kind === 'tender' &&
    row.locationId === oath.locationId && row.requesterPresent === false && row.quantity === oath.quantity);
}

const observed = (world: WorldState, row: OathArbitrationCase): OathTenderObservation | undefined =>
  world.oathArbitrations.observations.find((entry) => entry.oathId === row.oathId && entry.tenderTick === row.tenderTick && entry.siteId === row.siteId);
const actuallyFunded = (oath: OathContract | undefined): oath is OathContract =>
  oath !== undefined && oath.settledTick === undefined && (oath.status === 'active' || oath.status === 'breached') &&
  oath.escrow.payment === oath.payment && oath.escrow.collateral === oath.collateral && oath.payment > 0 && oath.collateral > 0;

export function captureOathTenderObservers(world: WorldState, oath: OathContract, tender: OathEvidence): void {
  const state = world.oathArbitrations;
  if (!actuallyFunded(oath) || oath.status !== 'active' || !world.oaths.contracts.includes(oath) ||
      tender.tick !== world.tick || realTender(world, oath, world.tick) !== tender ||
      state.observations.some((row) => row.oathId === oath.id && row.tenderTick === tender.tick) ||
      !world.locations.some(({ id }) => id === oath.locationId)) return;
  const requester = person(world, oath.requesterId), provider = person(world, oath.providerId);
  if (!alive(provider) || !atSite(world, provider, oath.locationId) || (alive(requester) && atSite(world, requester, oath.locationId))) return;
  const observerIds = world.cultivators.filter((actor) => atSite(world, actor, oath.locationId) && !checkConflict(world, actor, oath))
    .sort(sortActor).slice(0, ARBITRATION_MAX_OBSERVERS).map(({ id }) => id);
  if (observerIds.length) state.observations.push({ oathId: oath.id, tenderTick: tender.tick, siteId: oath.locationId, observerIds });
}

const partySide = (row: OathArbitrationCase, actorId: string) =>
  row.requesterId === actorId ? 'requester' : row.providerId === actorId ? 'provider' : undefined;
const current = (row: OathArbitrationCase) => row.appointments.filter(({ endedTick }) => endedTick === undefined);
function filedProof(world: WorldState, row: OathArbitrationCase, oath: OathContract): boolean {
  const file = row.filing;
  return !!file && file.tick >= (row.joinedTick ?? Infinity) && file.tick <= world.tick &&
    observed(world, row)?.observerIds.includes(file.observerId) === true &&
    !row.appointments.some(({ appointeeId }) => appointeeId === file.observerId) &&
    !checkConflict(world, person(world, file.observerId), oath) && !!realTender(world, oath, row.tenderTick);
}

export function arbitrationHoldUntil(world: WorldState, oathId: string): number | undefined {
  const item = world.oathArbitrations.cases.find((row) => row.oathId === oathId && row.status === 'hearing');
  const oath = item && contract(world, oathId);
  return item && actuallyFunded(oath) && item.joinedTick !== undefined && item.joinedTick <= world.tick &&
    (item.expiresTick ?? 0) > world.tick ? item.expiresTick : undefined;
}

export function availableOathArbitrationActions(actor: Cultivator, world: WorldState, includeOpens = true): OathArbitrationOption[] {
  const state = world.oathArbitrations;
  if ((!state.cases.length && !state.observations.length) || !world.cultivators.includes(actor) ||
      !atSite(world, actor, actor.locationId) || !world.locations.some(({ id }) => id === actor.locationId)) return [];
  const result: OathArbitrationOption[] = [];
  const add = (arbitrationMove: OathArbitrationMove, targetOathId: string, extra: Partial<OathArbitrationOption> = {}) =>
    result.push({ action: 'OATH_ARBITRATION', arbitrationMove, targetOathId, ...extra });
  for (const row of state.cases) {
    if (row.status === 'closed' || row.siteId !== actor.locationId || row.openedTick > world.tick) continue;
    const oath = contract(world, row.oathId);
    if (!actuallyFunded(oath) || !alive(person(world, row.requesterId)) || !realTender(world, oath, row.tenderTick)) continue;
    if (row.status === 'offered') {
      if (row.requesterId === actor.id && world.tick < row.joinUntilTick && world.tick < (oath.appealUntilTick ?? Infinity)) add('join', row.oathId);
      continue;
    }
    if (world.tick >= (row.expiresTick ?? 0) || (row.joinedTick ?? Infinity) > world.tick) continue;
    const observation = observed(world, row);
    if (!observation) continue;
    const appointments = current(row);
    const side = partySide(row, actor.id);
    if (side && !appointments.some((entry) => entry.side === side) &&
        row.appointments.filter((entry) => entry.side === side).length < ARBITRATION_MAX_APPOINTMENTS_PER_SIDE) {
      const candidates = world.cultivators.filter((candidate) => atSite(world, candidate, row.siteId) &&
        !observation.observerIds.includes(candidate.id) && !row.appointments.some(({ appointeeId }) => appointeeId === candidate.id) &&
        !checkConflict(world, candidate, oath)).sort(sortActor).slice(0, MAX_NOMINATIONS);
      for (const candidate of candidates) add('appoint', row.oathId, { targetCultivatorId: candidate.id });
    }
    const assigned = appointments.find(({ appointeeId }) => appointeeId === actor.id);
    if (assigned) {
      add('recuse', row.oathId);
      if (checkConflict(world, actor, oath)) continue;
      if (assigned.acceptedTick === undefined) add('accept', row.oathId);
      else if (assigned.vote === undefined && assigned.acceptedTick < world.tick && oath.status === 'breached') {
        if (filedProof(world, row, oath)) add('vote_refund', row.oathId);
        add('vote_inconclusive', row.oathId);
      }
    }
    if (!row.filing && observation.observerIds.includes(actor.id) && !row.appointments.some(({ appointeeId }) => appointeeId === actor.id) &&
        !checkConflict(world, actor, oath)) add('file', row.oathId);
  }
  if (!includeOpens) return result;
  for (const observation of state.observations) {
    if (observation.siteId !== actor.locationId || state.cases.some(({ oathId }) => oathId === observation.oathId)) continue;
    const oath = contract(world, observation.oathId);
    if (actuallyFunded(oath) && oath.providerId === actor.id && alive(person(world, oath.requesterId)) &&
        world.tick < (oath.appealUntilTick ?? Infinity) && realTender(world, oath, observation.tenderTick)) {
      add('open', oath.id, { targetTenderTick: observation.tenderTick });
    }
  }
  return result;
}

function receipt(world: WorldState, row: OathArbitrationCase, actorId: string, verb: string, title: string): WorldEvent {
  const visible = [...new Set([row.requesterId, row.providerId, actorId])];
  return { id: `evt-${row.id}-${world.tick}-${verb}-${actorId}`, tick: world.tick, year: world.year, month: world.month,
    title, description: '依据真实契书和书面事证记入本案，未另立资金账。', actorIds: visible, category: 'diplomacy',
    witnessScope: 'participants', ...(world.locations.some(({ id }) => id === row.siteId) ? { locationId: row.siteId } : {}) };
}
function endAppointment(appointment: ArbitrationAppointment, tick: number, cause: ArbitrationRecusal): void {
  appointment.endedTick = tick;
  appointment.recusal = cause;
}

export function resolveOathArbitrationAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'OATH_ARBITRATION') return null;
  const option = availableOathArbitrationActions(actor, world, decision.arbitrationMove === 'open').find((entry) =>
    entry.arbitrationMove === decision.arbitrationMove && entry.targetOathId === decision.targetOathId &&
    entry.targetTenderTick === decision.targetTenderTick && entry.targetCultivatorId === decision.targetCultivatorId);
  if (!option) return null;
  const oath = contract(world, option.targetOathId)!;
  const state = world.oathArbitrations;
  if (option.arbitrationMove === 'open') {
    const row: OathArbitrationCase = { id: 'arbitration-' + oath.id, oathId: oath.id, siteId: oath.locationId, requesterId: oath.requesterId,
      providerId: oath.providerId, tenderTick: option.targetTenderTick!, openedTick: world.tick,
      joinUntilTick: Math.min(world.tick + ARBITRATION_JOIN_WINDOW, oath.appealUntilTick ?? Infinity), status: 'offered', appointments: [] };
    state.cases.push(row);
    return receipt(world, row, actor.id, 'open', '提交回避裁断邀议');
  }
  const row = state.cases.find(({ oathId }) => oathId === oath.id)!;
  switch (option.arbitrationMove) {
    case 'join':
      row.status = 'hearing';
      row.joinedTick = world.tick;
      row.expiresTick = Math.max(oath.deadlineTick ?? world.tick, world.tick) + ARBITRATION_HEARING_WINDOW;
      return receipt(world, row, actor.id, 'join', '双边应承原额托管复核');
    case 'appoint': {
      row.appointments.push({ side: partySide(row, actor.id)!, appointeeId: option.targetCultivatorId!, nominatedTick: world.tick });
      return receipt(world, row, actor.id, 'appoint', '提名独立裁断席位');
    }
    case 'file':
      row.filing = { observerId: actor.id, tick: world.tick };
      return receipt(world, row, actor.id, 'file', '独立现场见证提交');
    default: {
      const slot = current(row).find(({ appointeeId }) => appointeeId === actor.id)!;
      if (option.arbitrationMove === 'recuse') {
        endAppointment(slot, world.tick, checkConflict(world, actor, oath) ?? 'voluntary');
        return receipt(world, row, actor.id, 'recuse', '裁断席位回避');
      }
      if (option.arbitrationMove === 'accept') {
        slot.acceptedTick = world.tick;
        return receipt(world, row, actor.id, 'accept', '受任者独立接受裁断');
      }
      slot.vote = option.arbitrationMove === 'vote_refund' ? 'refund' : 'inconclusive';
      slot.votedTick = world.tick;
      return receipt(world, row, actor.id, 'vote', '裁断者独立提交判断');
    }
  }
}

export function advanceOathArbitrations(world: WorldState, settleCanonical: (oath: OathContract, caseId: string) => WorldEvent | null): WorldEvent[] {
  const state = world.oathArbitrations;
  if (!state.cases.length && !state.observations.length) return [];
  const events: WorldEvent[] = [];
  function close(row: OathArbitrationCase, disposition: NonNullable<OathArbitrationCase['disposition']>) {
    row.closedTick = world.tick;
    row.disposition = disposition;
    row.status = 'closed';
    if (disposition !== 'refund') events.push(receipt(world, row, row.providerId, disposition, '仲裁程序闭卷'));
  }
  for (const row of state.cases) {
    if (row.status === 'closed' || row.openedTick > world.tick) continue;
    const oath = contract(world, row.oathId);
    const hearing = row.status === 'hearing';
    const expiredHearing = hearing && world.tick >= (row.expiresTick ?? 0);
    const originalStatus = oath?.status;
    if (!actuallyFunded(oath)) {
      close(row, expiredHearing && originalStatus === 'breached' ? 'inconclusive' : 'external_settlement');
      continue;
    }
    if (!hearing) {
      if (world.tick >= row.joinUntilTick || world.tick >= (oath.appealUntilTick ?? Infinity)) close(row, 'unjoined');
      continue;
    }
    if (expiredHearing) { close(row, 'inconclusive'); continue; }
    for (const appointment of current(row)) {
      const cause = checkConflict(world, person(world, appointment.appointeeId), oath);
      if (!cause) continue;
      endAppointment(appointment, world.tick, cause);
      events.push(receipt(world, row, appointment.appointeeId, 'recuse', '裁断席位触发回避'));
    }
    const judges = current(row);
    if (oath.status !== 'breached' || judges.length !== 2 || new Set(judges.map(({ appointeeId }) => appointeeId)).size !== 2 ||
        new Set(judges.map(({ side }) => side)).size !== 2 || !judges.every(({ acceptedTick, votedTick }) =>
          acceptedTick !== undefined && votedTick !== undefined && votedTick > acceptedTick && votedTick <= world.tick)) continue;
    if (!judges.every(({ vote }) => vote === 'refund') || !filedProof(world, row, oath)) {
      close(row, 'inconclusive');
      continue;
    }
    const settlement = settleCanonical(oath, row.id);
    if (settlement) { close(row, 'refund'); events.push(settlement); }
  }
  const recent = new Set(state.cases.filter(({ status }) => status === 'closed')
    .sort((a, b) => (a.closedTick ?? 0) - (b.closedTick ?? 0)).slice(-ARBITRATION_CLOSED_HISTORY));
  state.cases = state.cases.filter((row) => row.status !== 'closed' || recent.has(row));
  const pinned = new Set(state.cases.map(({ oathId, tenderTick }) => `${oathId}/${tenderTick}`));
  const open = new Set(world.oaths.contracts.filter(actuallyFunded).map(({ id }) => id));
  state.observations = state.observations.filter(({ oathId, tenderTick }) => open.has(oathId) || pinned.has(`${oathId}/${tenderTick}`));
  return events;
}

export function visibleOathArbitrations(world: WorldState, viewer?: Cultivator): OathArbitrationView[] {
  if (!viewer || !world.oathArbitrations.cases.length) return [];
  const actor = person(world, viewer.id);
  if (!actor) return [];
  return world.oathArbitrations.cases.flatMap((row) => {
    if (row.openedTick > world.tick) return [];
    const role = partySide(row, actor.id) ?? (row.appointments.some(({ appointeeId }) => appointeeId === actor.id) ? 'adjudicator' :
      (row.filing?.observerId === actor.id || row.status === 'hearing' && atSite(world, actor, row.siteId) &&
       observed(world, row)?.observerIds.includes(actor.id)) ? 'observer' : undefined);
    if (!role) return [];
    const oath = contract(world, row.oathId);
    const { id, oathId, siteId, tenderTick, openedTick, joinUntilTick, joinedTick, expiresTick, status, closedTick, disposition } = row;
    return [{ id, oathId, siteId, role, tenderTick, openedTick, joinUntilTick, joinedTick, expiresTick, status, closedTick, disposition,
      appointments: row.appointments.filter(({ appointeeId }) => role !== 'observer' && (role !== 'adjudicator' || appointeeId === actor.id))
        .map(({ appointeeId: _private, ...appointment }) => ({ ...appointment })),
      ...(row.filing && (role !== 'observer' || row.filing.observerId === actor.id) ? { filedTick: row.filing.tick } : {}),
      ...((role === 'requester' || role === 'provider') && actuallyFunded(oath) ? { escrow: { ...oath.escrow } } : {}) }];
  });
}
