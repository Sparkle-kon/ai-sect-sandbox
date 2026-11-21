import type { Cultivator, LLMDecisionPayload, MapHazard, MapTile, TerrainBiome, TerrainSuccessionCell,
  TerrainSuccessionState, WorldEvent, WorldState } from '../types/world';
import { flowActor, recordResourceFlow } from './resourceFlowEngine';
import { currentVisibleTileIds, terrainTileAt } from './terrainEngine';

export const TERRAIN_STRESS_TICKS = 3;
export const TERRAIN_QUIET_TICKS = 4;
export const TERRAIN_RECOVERY_STONES = 12;
export const TERRAIN_RECOVERY_ROOTS = 2;
export const TERRAIN_RECOVERY_LIMIT = 4;
export const TERRAIN_QUIET_CAP = 200;
const SCAR_THRESHOLD = 8;
const STRESS_DAMAGE = 8;
const NATURAL_RESTORE = 2;
const WORK_RESTORE = 4;
const MIN_QI = 5;

type TerrainStress = Pick<MapHazard, 'kind' | 'intensity'>;
type TerrainBaseline = Pick<MapTile, 'biome' | 'spiritQi'>;
export interface TerrainRecoveryOption {
  action: 'TERRAIN_RECOVERY';
  targetTerrainTileId: string;
}
export interface TerrainSuccessionView extends Omit<TerrainSuccessionCell, 'lastWorkedBy'> {
  currentBiome: TerrainBiome;
  currentQi: number;
  recoveryCap: number;
}

export const createTerrainSuccessionState = (): TerrainSuccessionState => ({ cells: [] });
export const terrainRecoveryCap = (cell: TerrainSuccessionCell): number => cell.baselineQi - cell.permanentLoss;
const active = (world: WorldState, hazard: MapHazard): boolean =>
  hazard.createdTick <= world.tick && world.tick < hazard.expiresTick;

function openCell(world: WorldState, tileId: string, before: TerrainBaseline): TerrainSuccessionCell {
  const cell: TerrainSuccessionCell = { tileId, firstTick: world.tick, lastStressTick: world.tick,
    consecutiveStress: 0, quietTicks: 0, baselineBiome: before.biome, baselineQi: before.spiritQi,
    recoverableLoss: 0, permanentLoss: 0, phase: 'stressed', workCount: 0 };
  world.terrainSuccession.cells.push(cell);
  return cell;
}

function addLoss(cell: TerrainSuccessionCell, amount: number, permanent: number): void {
  // Only record this mechanism's actual debit, never additionally charge the physical tile.
  const remaining = Math.max(0, cell.baselineQi - cell.recoverableLoss - cell.permanentLoss);
  const real = Math.min(amount, remaining);
  const scar = Math.min(real, permanent);
  cell.permanentLoss += scar;
  cell.recoverableLoss += real - scar;
}

/** Register an already-applied meteor edit, not a second damage application. */
export function recordTerrainMeteor(world: WorldState, tileId: string, before: TerrainBaseline): void {
  const tile = world.terrain.tiles.find((candidate) => candidate.id === tileId);
  if (!tile || tile.biome !== '荒漠' || tile.spiritQi > before.spiritQi ||
      (tile.spiritQi === before.spiritQi && tile.biome === before.biome)) return;
  const amount = before.spiritQi - tile.spiritQi;
  const cell = world.terrainSuccession.cells.find((candidate) => candidate.tileId === tileId) ?? openCell(world, tileId, before);
  if (amount > 0 && cell.recoverableLoss === 0 && (cell.phase === 'recovered' || cell.phase === 'scarred')) cell.workCount = 0;
  addLoss(cell, amount, Math.ceil(amount / 2));
  cell.lastStressTick = world.tick;
  cell.consecutiveStress = 0;
  cell.quietTicks = 0;
  cell.scarredBiome = '荒漠';
  cell.affectedBiome = '荒漠';
  cell.phase = 'stressed';
}

/** Divine paint is an explicit new baseline: do not reinterpret it as ordinary repair. */
export function rebaselineTerrainPaint(world: WorldState, tileId: string): void {
  world.terrainSuccession.cells = world.terrainSuccession.cells.filter((cell) => cell.tileId !== tileId);
}

function stressTile(cell: TerrainSuccessionCell, tile: MapTile, stress: TerrainStress): void {
  const actual = Math.max(0, Math.min(STRESS_DAMAGE, tile.spiritQi - MIN_QI));
  // Open a fresh work allowance only for real new damage after an exhausted recovery balance.
  // An unfinished balance or a sustained episode's later pulses cannot unlock more paid work.
  if (actual > 0 && cell.recoverableLoss === 0 && cell.consecutiveStress === TERRAIN_STRESS_TICKS) cell.workCount = 0;
  tile.spiritQi -= actual;
  addLoss(cell, actual, stress.intensity >= 3 ? 2 : 0);
  if (cell.permanentLoss >= SCAR_THRESHOLD) cell.scarredBiome = '荒漠';
  const biome = cell.scarredBiome ?? (stress.kind === 'cursed_miasma' ? '毒沼' : '荒漠');
  // A later unrelated edit is not this succession process's surface to overwrite.
  if (tile.biome === cell.baselineBiome || tile.biome === cell.affectedBiome) {
    tile.biome = biome;
    cell.affectedBiome = biome;
  }
}

function restorable(cell: TerrainSuccessionCell, tile: MapTile): number {
  return Math.max(0, Math.min(cell.recoverableLoss, terrainRecoveryCap(cell) - tile.spiritQi));
}

function restoreQi(cell: TerrainSuccessionCell, tile: MapTile, budget: number): number {
  const gain = Math.min(restorable(cell, tile), budget);
  tile.spiritQi += gain;
  cell.recoverableLoss -= gain;
  return gain;
}

function settleQuiet(cell: TerrainSuccessionCell, tile: MapTile): void {
  if (cell.recoverableLoss > 0 || cell.quietTicks < TERRAIN_QUIET_TICKS) {
    cell.phase = 'recovering';
    return;
  }
  if (!cell.scarredBiome && cell.affectedBiome && tile.biome === cell.affectedBiome) tile.biome = cell.baselineBiome;
  if (!cell.scarredBiome) delete cell.affectedBiome;
  cell.phase = cell.permanentLoss > 0 || cell.scarredBiome ? 'scarred' : 'recovered';
}

/** Observe only completed adjacent ticks; coexisting hazards are not additive for succession. */
export function advanceTerrainSuccession(world: WorldState): WorldEvent[] {
  const state = world.terrainSuccession;
  const previous = state.lastAdvancedTick;
  if (previous !== undefined && previous >= world.tick) return [];
  state.lastAdvancedTick = world.tick;
  if (!state.cells.length && !world.mapHazards.length) return [];
  const tiles = new Map(world.terrain.tiles.map((tile) => [tile.id, tile]));
  const cells = new Map(state.cells.map((cell) => [cell.tileId, cell]));
  const hazards = new Map<string, TerrainStress>();
  for (const hazard of world.mapHazards) {
    if (!active(world, hazard) || !tiles.has(hazard.tileId)) continue;
    const old = hazards.get(hazard.tileId);
    // Tie-breaking is stable irrespective of insertion order and a meteor does not become a chronic pulse.
    if (hazard.kind === 'meteor') continue;
    if (!old || hazard.intensity > old.intensity || (hazard.intensity === old.intensity && hazard.kind < old.kind)) {
      hazards.set(hazard.tileId, hazard);
    }
  }
  const occupied = new Set(world.mapHazards.filter((h) => active(world, h)).map((h) => h.tileId));
  const adjacent = previous === world.tick - 1;
  for (const [tileId, stress] of [...hazards].sort(([a], [b]) => a.localeCompare(b))) {
    if (stress.intensity < 2) continue;
    const tile = tiles.get(tileId)!;
    const cell = cells.get(tileId) ?? openCell(world, tileId, tile);
    cells.set(tileId, cell);
    const streak = adjacent && cell.lastStressTick === world.tick - 1 ? cell.consecutiveStress : 0;
    cell.consecutiveStress = streak + 1;
    cell.lastStressTick = world.tick;
    cell.quietTicks = 0;
    cell.phase = 'stressed';
    if (cell.consecutiveStress % TERRAIN_STRESS_TICKS === 0) stressTile(cell, tile, stress);
  }
  for (const cell of state.cells) {
    const tile = tiles.get(cell.tileId);
    if (!tile || (hazards.get(cell.tileId)?.intensity ?? 0) >= 2) continue;
    // Even a mild/short hazard prevents work and natural recovery without manufacturing severe damage.
    cell.consecutiveStress = 0;
    if (occupied.has(cell.tileId)) {
      cell.quietTicks = 0;
      cell.phase = 'stressed';
      continue;
    }
    const oldQuiet = adjacent ? cell.quietTicks : 0;
    cell.quietTicks = Math.min(TERRAIN_QUIET_CAP, oldQuiet + 1);
    if (cell.quietTicks !== oldQuiet && cell.quietTicks % TERRAIN_QUIET_TICKS === 0) restoreQi(cell, tile, NATURAL_RESTORE);
    settleQuiet(cell, tile);
  }
  // Unobserved ground truth stays in the spatial ledger, not a global narration revealing tile names.
  return [];
}

function drivingCampaign(world: WorldState, actor: Cultivator): boolean {
  return world.escorts.contracts.some((deal) => deal.escortId === actor.id && deal.status === 'active') ||
    world.relocations.plans.some((trip) => trip.status === 'in_transit' && trip.garrisonIds.includes(actor.id)) ||
    world.sieges.some((siege) => (siege.status === 'marching' || siege.status === 'sieging') && siege.participantIds.includes(actor.id));
}

function workSite(world: WorldState, actor: Cultivator): { cell: TerrainSuccessionCell; tile: MapTile; siteId: string } | undefined {
  if (!world.terrainSuccession.cells.length || !actor.alive || actor.hp <= 0 || !world.cultivators.includes(actor) ||
      actor.spiritStones < TERRAIN_RECOVERY_STONES || actor.herbs.earth_root < TERRAIN_RECOVERY_ROOTS ||
      actor.tribulation?.stage === 'lightning' || actor.tribulation?.stage === 'heart_demon' || drivingCampaign(world, actor) ||
      world.pilgrimages.journeys.some((journey) => journey.status === 'active' &&
        (journey.organizerId === actor.id || journey.companionId === actor.id) && (journey.path.length > 0 || journey.lastMovedTick === world.tick)) ||
      world.couriers.dispatches.some((row) => row.courierId === actor.id &&
        (row.status === 'in_transit' || row.status === 'returning' || row.lastAdvancedTick === world.tick))) return;
  const site = world.locations.find(({ id }) => id === actor.locationId);
  const tile = site && terrainTileAt(world, site.x, site.y);
  if (!site || !tile || world.mapHazards.some((hazard) => hazard.tileId === tile.id && active(world, hazard))) return;
  const cell = world.terrainSuccession.cells.find(({ tileId }) => tileId === tile.id);
  if (!cell || cell.firstTick > world.tick || cell.lastStressTick >= world.tick || cell.workCount >= TERRAIN_RECOVERY_LIMIT ||
      cell.lastWorkedTick === world.tick || restorable(cell, tile) <= 0) return;
  return { cell, tile, siteId: site.id };
}

export function availableTerrainRecoveryActions(actor: Cultivator, world: WorldState): TerrainRecoveryOption[] {
  const target = workSite(world, actor);
  return target ? [{ action: 'TERRAIN_RECOVERY', targetTerrainTileId: target.tile.id }] : [];
}

export function resolveTerrainRecovery(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'TERRAIN_RECOVERY') return null;
  const target = workSite(world, actor);
  if (!target || target.tile.id !== decision.targetTerrainTileId) return null;
  const { cell, tile, siteId } = target;
  const restored = restoreQi(cell, tile, WORK_RESTORE);
  actor.spiritStones -= TERRAIN_RECOVERY_STONES;
  actor.herbs.earth_root -= TERRAIN_RECOVERY_ROOTS;
  cell.workCount += 1;
  cell.lastWorkedTick = world.tick;
  cell.lastWorkedBy = actor.id;
  settleQuiet(cell, tile);
  const refId = `terrain-${tile.id}-${world.tick}`;
  const base = { kind: 'consumption', mechanism: 'terrain', refId, reason: 'terrain_recovery',
    from: flowActor(actor.id), visibility: { kind: 'participants', actorIds: [actor.id] } } as const;
  recordResourceFlow(world, { ...base, good: 'stone', amount: TERRAIN_RECOVERY_STONES });
  recordResourceFlow(world, { ...base, good: 'earth_root', amount: TERRAIN_RECOVERY_ROOTS });
  return { id: `evt-${refId}`, tick: world.tick, year: world.year, month: world.month, category: 'diplomacy',
    title: '地脉修复', description: `实际恢复${restored}点地脉灵气，不消除永久伤痕。`, locationId: siteId,
    actorIds: [actor.id], witnessScope: 'participants' };
}

export function visibleTerrainSuccession(world: WorldState, viewer?: Cultivator): TerrainSuccessionView[] {
  if (!viewer || !world.terrainSuccession.cells.length) return [];
  const actor = world.cultivators.find(({ id }) => id === viewer.id);
  if (!actor || drivingCampaign(world, actor)) return [];
  const visible = currentVisibleTileIds(world, actor);
  const tiles = new Map(world.terrain.tiles.filter(({ id }) => visible.has(id)).map((tile) => [tile.id, tile]));
  return world.terrainSuccession.cells.flatMap(({ lastWorkedBy: _private, ...cell }) => {
    const tile = tiles.get(cell.tileId);
    return tile && cell.firstTick <= world.tick ? [{ ...cell, currentBiome: tile.biome, currentQi: tile.spiritQi,
      recoveryCap: terrainRecoveryCap(cell) }] : [];
  });
}
