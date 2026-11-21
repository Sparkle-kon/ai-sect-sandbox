import type { Cultivator, EscortContract, EscortMove, EscortReport, EscortState, LLMDecisionPayload, MapHazard, MapPoint,
  MarketShipment, WorldEvent, WorldState } from '../types/world';
import { findMapPath } from './mapMotionEngine';
import { currentVisibleTileIds, noteTerrainVisit, terrainTileAt } from './terrainEngine';

export const ESCORT_FEE = 30;
export const ESCORT_RATIONS = 3;
const ESCORT_RISK_MULTIPLIER = .65;
const MAX_ADDITIONAL_STEPS = 8;
const REPORT_TICKS = 3;
const MAX_REPORTS_PER_ESCORT = 16;
const live = (actor: Cultivator) => actor.alive && actor.hp > 0;
const findActor = (world: WorldState, id: string | undefined) => world.cultivators.find((actor) => actor.id === id);
const getMarket = (world: WorldState, id: string) => world.locations.find((site) => site.id === id && site.type === 'market');
const forShipment = (world: WorldState, shipmentId: string) => world.escorts.contracts.find((item) => item.shipmentId === shipmentId);
const tileId = (world: WorldState, point: MapPoint) => terrainTileAt(world, point.x, point.y)?.id;
const activeHazard = (world: WorldState, hazard: MapHazard) => hazard.createdTick <= world.tick && hazard.expiresTick > world.tick;
const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

export interface EscortOption {
  action: 'ESCORT';
  escortMove: EscortMove;
  targetShipmentId?: string;
  targetEscortId?: string;
  targetHazardId?: string;
}

export interface EscortDirective {
  managed: boolean;
  hold: boolean;
  baselineDelay: number;
  crossedTileIds: string[];
  arrived: boolean;
  arrivedTick?: number;
  riskMultiplier: number;
  forceReturn: boolean;
}

export interface EscortView {
  contract: Omit<EscortContract, 'path' | 'lastCrossedTileIds'>;
  checkpoint?: MapPoint;
  reportCount: number;
}

export const createEscortState = (): EscortState => ({ contracts: [], reports: [] });

export function activeEscortForActor(world: WorldState, actor: Cultivator): EscortContract | undefined {
  return world.escorts.contracts.find((item) => item.status === 'active' && item.escortId === actor.id);
}

export function visibleEscorts(world: WorldState, actor?: Cultivator): EscortView[] {
  if (!actor) return [];
  return world.escorts.contracts.filter((item) => item.clientId === actor.id || item.escortId === actor.id ||
    world.markets.shipments.some((shipment) => shipment.id === item.shipmentId && shipment.buyerId === actor.id))
    .map((item) => {
      const { path, lastCrossedTileIds: _excluded, ...contract } = item;
      const point = path[item.pathIndex];
      const tile = point && tileId(world, point);
      const checkpoint = item.escortId === actor.id || (tile && (actor.exploredTileIds.includes(tile) || currentVisibleTileIds(world, actor).has(tile))) ?
        point && { ...point } : undefined;
      return { contract: { ...contract, usedReportIds: [...contract.usedReportIds], detours: contract.detours.map((entry) => ({ ...entry })) },
        ...(checkpoint ? { checkpoint } : {}), reportCount: world.escorts.reports.filter(({ contractId }) => contractId === item.id).length };
    });
}

function unoccupied(world: WorldState, actor: Cultivator): boolean {
  return !activeEscortForActor(world, actor) &&
    !world.relocations.plans.some((plan) => plan.status === 'in_transit' && plan.garrisonIds.includes(actor.id)) &&
    !world.sieges.some((siege) => (siege.status === 'marching' || siege.status === 'sieging') && siege.participantIds.includes(actor.id)) &&
    !world.occasions.some((occasion) => (occasion.status === 'registration' || occasion.status === 'running') && occasion.participantIds.includes(actor.id)) &&
    actor.tribulation?.stage !== 'lightning' && actor.tribulation?.stage !== 'heart_demon';
}

function applyEligibleReport(world: WorldState, contract: EscortContract, actor: Cultivator, hazard: MapHazard,
  visible: Set<string>): boolean {
  const escort = findActor(world, contract.escortId);
  if (!escort || !live(escort) || contract.arrivedTick !== undefined || actor.id === escort.id || actor.id === contract.clientId ||
      !activeHazard(world, hazard) || !visible.has(hazard.tileId)) return false;
  const checkpoint = contract.path[contract.pathIndex];
  const checkpointId = checkpoint && tileId(world, checkpoint);
  const flyingSword = Boolean(actor.sectId && actor.sectId === escort.sectId);
  if (!flyingSword && (!checkpointId || !visible.has(checkpointId))) return false;
  if (!contract.path.slice(contract.pathIndex + 1).some((point) => tileId(world, point) === hazard.tileId)) return false;
  const reports = world.escorts.reports.filter(({ contractId }) => contractId === contract.id);
  return reports.length < MAX_REPORTS_PER_ESCORT && !reports.some(({ hazardId }) => hazardId === hazard.id);
}

export function availableEscortActions(actor: Cultivator, world: WorldState): EscortOption[] {
  if (!live(actor) || !world.cultivators.includes(actor) || !unoccupied(world, actor)) return [];
  const options: EscortOption[] = [];
  for (const shipment of world.markets.shipments) {
    if (shipment.status !== 'in_transit' || actor.locationId !== shipment.originId) continue;
    const existing = forShipment(world, shipment.id);
    if (!existing && shipment.sellerId === actor.id && world.tick === shipment.departedTick + 1 && actor.spiritStones >= ESCORT_FEE &&
        getMarket(world, shipment.originId) && getMarket(world, shipment.destinationId)) {
      options.push({ action: 'ESCORT', escortMove: 'offer', targetShipmentId: shipment.id });
    }
    if (!existing || existing.status !== 'offered' || world.tick > existing.expiresTick) continue;
    if (existing.clientId === actor.id) options.push({ action: 'ESCORT', escortMove: 'decline', targetEscortId: existing.id });
    else if (shipment.buyerId !== actor.id && actor.herbs.earth_root >= ESCORT_RATIONS &&
        world.cultivators.some((client) => client.id === existing.clientId && live(client))) {
      const origin = getMarket(world, shipment.originId);
      const destination = getMarket(world, shipment.destinationId);
      if (origin && destination && findMapPath(world, origin, destination).length > 1) {
        options.push({ action: 'ESCORT', escortMove: 'accept', targetEscortId: existing.id });
      }
    }
  }
  if (!world.mapHazards.length) return options;
  const reportable = world.escorts.contracts.filter((contract) => contract.status === 'active' && contract.rationsEscrow > 0);
  if (!reportable.length) return options;
  const visible = currentVisibleTileIds(world, actor);
  if (visible.size) {
    for (const escort of reportable) {
      for (const hazard of world.mapHazards.filter((entry) => applyEligibleReport(world, escort, actor, entry, visible)).sort(byId)) {
        options.push({ action: 'ESCORT', escortMove: 'report', targetEscortId: escort.id, targetHazardId: hazard.id });
      }
    }
  }
  return options;
}

function event(world: WorldState, contract: EscortContract, key: string, title: string, description: string, actorIds: string[], locationId?: string): WorldEvent {
  return { id: `evt-${world.tick}-${contract.id}-${key}`, tick: world.tick, year: world.year, month: world.month,
    title, description, actorIds, category: 'diplomacy', ...(locationId ? { locationId } : {}), witnessScope: 'participants' };
}

function expireOffer(world: WorldState, contract: EscortContract, reason: string): void {
  if (contract.status !== 'offered') return;
  const client = findActor(world, contract.clientId);
  if (client) {
    client.spiritStones += contract.feeEscrow;
    contract.feeRefunded = contract.feeEscrow;
    contract.feeEscrow = 0;
  }
  contract.status = 'expired';
  contract.settledTick = world.tick;
  contract.reason = reason;
}

export function resolveEscortAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'ESCORT') return null;
  const option = availableEscortActions(actor, world).find((candidate) => candidate.escortMove === decision.escortMove &&
    candidate.targetShipmentId === decision.targetShipmentId && candidate.targetEscortId === decision.targetEscortId && candidate.targetHazardId === decision.targetHazardId);
  if (!option) return null;
  if (option.escortMove === 'offer') {
    const shipment = world.markets.shipments.find(({ id }) => id === option.targetShipmentId)!;
    actor.spiritStones -= ESCORT_FEE;
    const contract: EscortContract = { id: `escort-${shipment.sequence}`, shipmentId: shipment.id, clientId: actor.id,
      originId: shipment.originId, destinationId: shipment.destinationId, status: 'offered', offeredTick: world.tick, expiresTick: world.tick + 1,
      feeEscrow: ESCORT_FEE, feePaid: 0, feeRefunded: 0, rationsEscrow: 0, rationsSpent: 0, rationsReturned: 0,
      path: [], pathIndex: 0, stride: 0, lastCrossedTileIds: [], usedReportIds: [], detours: [] };
    world.escorts.contracts.push(contract);
    return event(world, contract, 'offered', '商队委托护镖', `从委托人自有资产封存${ESCORT_FEE}灵石作报酬；只等候一回合，不接触货款。`,
      [actor.id], shipment.originId);
  }
  const contract = world.escorts.contracts.find(({ id }) => id === option.targetEscortId)!;
  if (option.escortMove === 'decline') {
    expireOffer(world, contract, '委托人撤回无人签署的委托，护镖报酬退回。');
    return event(world, contract, 'withdrawn', '护镖委托撤回', contract.reason!, [actor.id], contract.originId);
  }
  if (option.escortMove === 'report') {
    const hazard = world.mapHazards.find(({ id }) => id === option.targetHazardId)!;
    const report: EscortReport = { id: `escort-report-${contract.id}-${world.escorts.reports.filter((row) => row.contractId === contract.id).length + 1}`,
      contractId: contract.id, reporterId: actor.id, observedTick: world.tick, hazardId: hazard.id, tileId: hazard.tileId,
      expiresTick: Math.min(hazard.expiresTick, world.tick + REPORT_TICKS) };
    world.escorts.reports.push(report);
    return event(world, contract, report.id, '护镖收到目击简报', '独立观察者送来了确见且仍有效的险情简报，护卫可在已知道路中避让。',
      [actor.id, contract.escortId!]);
  }
  const shipment = world.markets.shipments.find(({ id }) => id === contract.shipmentId)!;
  const origin = getMarket(world, contract.originId)!;
  const destination = getMarket(world, contract.destinationId)!;
  const route = findMapPath(world, origin, destination);
  actor.herbs.earth_root -= ESCORT_RATIONS;
  contract.status = 'active';
  contract.escortId = actor.id;
  contract.acceptedTick = world.tick;
  contract.rationsEscrow = ESCORT_RATIONS - 1;
  contract.rationsSpent = 1;
  contract.path = route;
  contract.stride = Math.max(1, Math.ceil((route.length - 1) / Math.max(2, shipment.arrivalTick - shipment.departedTick)));
  return event(world, contract, 'accepted', '护镖护卫登程', '护卫送交自己的玄土根作行粮，已用去出发所需一份；未取用任何客户货物。',
    [contract.clientId, actor.id], origin.id);
}

function localKnownTiles(world: WorldState, escort: Cultivator, start: MapPoint, path: MapPoint[]): Set<string> {
  const current = terrainTileAt(world, start.x, start.y);
  const known = new Set(escort.exploredTileIds);
  for (const point of path) {
    const id = tileId(world, point);
    if (id) known.add(id); // The approved road is known even though adjacent branches may not be.
  }
  if (current) for (const tile of world.terrain.tiles) {
    if (Math.abs(tile.col - current.col) + Math.abs(tile.row - current.row) <= 2) known.add(tile.id);
  }
  return known;
}

function detour(world: WorldState, contract: EscortContract, escort: Cultivator): void {
  if (contract.rationsEscrow <= 0 || contract.arrivedTick !== undefined) return;
  const current = contract.path[contract.pathIndex];
  const destination = contract.path.at(-1);
  if (!current || !destination) return;
  const route = contract.path.slice(contract.pathIndex);
  const ahead = route.slice(1).map((point) => tileId(world, point));
  const recent = world.escorts.reports.filter((report) => report.contractId === contract.id &&
    report.observedTick <= world.tick && report.expiresTick > world.tick && !contract.usedReportIds.includes(report.id) &&
    ahead.includes(report.tileId) && world.mapHazards.some((hazard) => hazard.id === report.hazardId && hazard.tileId === report.tileId && activeHazard(world, hazard)))
    .sort((a, b) => ahead.indexOf(a.tileId) - ahead.indexOf(b.tileId) || a.observedTick - b.observedTick || byId(a, b));
  const known = localKnownTiles(world, escort, current, route);
  for (const report of recent) {
    // Knowledge, not a global hazard oracle: only this valid independently reported tile is forbidden.
    const alternate = findMapPath(world, current, destination, (tile) => known.has(tile.id) && tile.id !== report.tileId);
    if (!alternate.length || alternate.length > route.length + MAX_ADDITIONAL_STEPS ||
        alternate.some((point) => tileId(world, point) === report.tileId)) continue;
    contract.path = [...contract.path.slice(0, contract.pathIndex), ...alternate];
    contract.usedReportIds.push(report.id);
    contract.detours.push({ tick: world.tick, reportId: report.id, extraSteps: Math.max(0, alternate.length - route.length) });
    contract.rationsEscrow--;
    contract.rationsSpent++;
    return;
  }
}

function directive(overrides: Partial<EscortDirective> = {}): EscortDirective {
  return { managed: false, hold: false, baselineDelay: 0, crossedTileIds: [], arrived: false, riskMultiplier: 1, forceReturn: false, ...overrides };
}

/** Called from the market before sampling this shipment, once per authoritative tick. */
export function escortDirective(world: WorldState, shipment: MarketShipment): EscortDirective | undefined {
  const contract = forShipment(world, shipment.id);
  if (!contract || shipment.status !== 'in_transit') return undefined;
  if (contract.status === 'offered') {
    if (world.tick === contract.offeredTick) {
      contract.holdAppliedTick = world.tick;
      return directive({ hold: true, baselineDelay: 1 });
    }
    if (world.tick >= contract.expiresTick) expireOffer(world, contract, '一回合内未签约，报酬退回，商队按原路线离开。');
  }
  const baselineDelay = contract.holdAppliedTick === undefined ? 0 : 1;
  if (contract.status !== 'active') return directive({ baselineDelay });
  const escort = findActor(world, contract.escortId);
  if (!escort || !live(escort) || escort.locationId !== contract.originId || !getMarket(world, contract.originId) ||
      !getMarket(world, contract.destinationId)) {
    return directive({ managed: true, baselineDelay, forceReturn: true });
  }
  if (contract.lastAdvancedTick !== world.tick) {
    contract.lastAdvancedTick = world.tick;
    contract.lastCrossedTileIds = [];
    if (contract.arrivedTick === undefined) {
      detour(world, contract, escort);
      const next = Math.min(contract.path.length - 1, contract.pathIndex + contract.stride);
      contract.lastCrossedTileIds = [...new Set(contract.path.slice(contract.pathIndex, next + 1).flatMap((point) => {
        const id = tileId(world, point);
        return id ? [id] : [];
      }))];
      contract.pathIndex = next;
      if (next === contract.path.length - 1) contract.arrivedTick = world.tick;
    }
  }
  return directive({ managed: true, baselineDelay, crossedTileIds: [...contract.lastCrossedTileIds], arrived: contract.arrivedTick !== undefined,
    arrivedTick: contract.arrivedTick, riskMultiplier: ESCORT_RISK_MULTIPLIER });
}

function trimEscortState(world: WorldState): void {
  const shipmentsInTransit = new Set(world.markets.shipments.filter(({ status }) => status === 'in_transit').map(({ id }) => id));
  const terminal = new Set(world.escorts.contracts.filter((item) => item.status !== 'active' && item.status !== 'offered' &&
    !shipmentsInTransit.has(item.shipmentId)).slice(-96));
  world.escorts.contracts = world.escorts.contracts.filter((item) => item.status === 'active' || item.status === 'offered' ||
    shipmentsInTransit.has(item.shipmentId) || terminal.has(item));
  const retained = new Set(world.escorts.contracts.map(({ id }) => id));
  world.escorts.reports = world.escorts.reports.filter(({ contractId }) => retained.has(contractId));
}

export function settleEscortWithShipment(world: WorldState, shipment: MarketShipment): WorldEvent | null {
  const contract = forShipment(world, shipment.id);
  if (!contract || shipment.status === 'in_transit') return null;
  if (contract.status !== 'active' && contract.status !== 'offered') {
    trimEscortState(world);
    return null;
  }
  let result: WorldEvent | null = null;
  if (contract.status === 'offered') {
    expireOffer(world, contract, '货运先行结束，未签署的护镖委托退回。');
  } else {
    const escort = findActor(world, contract.escortId);
    const client = findActor(world, contract.clientId);
    const delivered = shipment.status === 'delivered' && escort && live(escort);
    if (delivered) {
      escort.spiritStones += contract.feeEscrow;
      contract.feePaid = contract.feeEscrow;
      contract.feeEscrow = 0;
      escort.locationId = shipment.destinationId;
      noteTerrainVisit(world, escort);
    } else if (client) {
      client.spiritStones += contract.feeEscrow;
      contract.feeRefunded = contract.feeEscrow;
      contract.feeEscrow = 0;
    }
    if (escort) {
      escort.herbs.earth_root += contract.rationsEscrow;
      contract.rationsReturned = contract.rationsEscrow;
      contract.rationsEscrow = 0;
    }
    contract.status = delivered ? 'delivered' : 'failed';
    contract.settledTick = world.tick;
    contract.reason = delivered ? '实际到货后支付护镖报酬，归还未用行粮。' : '货运未完成护镖条件，独立报酬退回，已用行粮不退。';
    result = event(world, contract, 'settled', delivered ? '护镖报酬交割' : '护镖委托未成', contract.reason,
      [contract.clientId, ...(escort ? [escort.id] : [])], delivered ? shipment.destinationId : shipment.originId);
  }
  trimEscortState(world);
  return result;
}
