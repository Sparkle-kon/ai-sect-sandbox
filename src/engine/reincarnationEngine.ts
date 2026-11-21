import type { Cultivator, LLMDecisionPayload, MemoryEntry, MortalSettlement, RecollectionEcho, RecollectionMove, ReincarnationCase,
  ReincarnationState, ReflectionTheme, WorldEvent, WorldState } from '../types/world';
import { recordMemory } from './memoryEngine';

export const REINCARNATION_CHANCE = .08;
export const MORTAL_MATURITY_TICKS = 18 * 12;
const WAIT_FOR_BIRTH = 24;
const RETAIN_TERMINAL_CASES = 96;
const RETAIN_DEAD_ECHOES = 96;
const THEMES: ReflectionTheme[] = ['cultivation', 'conflict', 'community', 'heavenly'];
const ECHO_TEXT: Record<ReflectionTheme, { category: MemoryEntry['category']; observation: string }> = {
  cultivation: { category: 'cultivation', observation: '打坐的呼吸节拍似曾相识，也许只是日常练习所致。' },
  conflict: { category: 'combat', observation: '一声风响竟让我生出熟悉之感，却只是一瞬而已。' },
  community: { category: 'social', observation: '寻常相见时冒出一丝旧识般的亲近，也可能只是我多心。' },
  heavenly: { category: 'heavenly', observation: '夜色曾给我似曾见过的错觉，细想却无从验明。' },
};

const terminal = (entry: ReincarnationCase) => entry.status === 'recruited' || entry.status === 'expired';
const live = (person: Cultivator) => person.alive && person.hp > 0;
export interface RecollectionOption { action: 'RECOLLECT'; recollectionMove: RecollectionMove }
export const createReincarnationState = (): ReincarnationState => ({ cases: [], echoes: [] });

function hash(seed: number, token: string): number {
  let n = seed >>> 0;
  for (let i = 0; i < token.length; i++) n = Math.imul(n ^ token.charCodeAt(i), 0x9e3779b1);
  n = Math.imul(n ^ (n >>> 16), 0x846ca68b);
  return (n ^ (n >>> 16)) >>> 0;
}

/** Call only when the world has independently observed a just-executed alive→dead transition. */
export function recordReincarnationDeath(world: WorldState, deceased: Cultivator, event: WorldEvent): void {
  if (!world.cultivators.includes(deceased) || deceased.alive || deceased.hp > 0 || event.category !== 'death' ||
      event.tick !== world.tick || event.duelWinnerId === deceased.id || !event.actorIds.includes(deceased.id) ||
      world.reincarnation.cases.some((item) => item.deceasedId === deceased.id)) return;
  // One independent, reproducible draw. Non-passing trials require no saved entry.
  const roll = hash(world.random.seed, `rebirth/${deceased.id}/${world.tick}`) / 0x100000000;
  if (roll >= REINCARNATION_CHANCE) return;
  world.reincarnation.cases.push({ id: `rebirth-${deceased.id}-${world.tick}`, deceasedId: deceased.id, deathEventId: event.id,
    deathTick: world.tick, expiresTick: world.tick + WAIT_FOR_BIRTH, status: 'awaiting_birth' });
}

/** Called by the birth ledger only after a real juvenile cohort has been credited. */
export function reserveReincarnationBirth(world: WorldState, village: MortalSettlement, bornTick: number): void {
  if (bornTick !== world.tick || !village.juvenileCohorts.some((item) => item.bornTick === bornTick && item.count > 0) ||
      world.reincarnation.cases.some((item) => item.settlementId === village.id && item.birthTick === bornTick)) return;
  const waiting = world.reincarnation.cases.filter((item) => item.status === 'awaiting_birth' &&
    item.deathTick < bornTick && bornTick <= item.expiresTick)
    .sort((a, b) => a.deathTick - b.deathTick || a.id.localeCompare(b.id))[0];
  if (!waiting) return;
  waiting.status = 'reserved';
  waiting.settlementId = village.id;
  waiting.birthTick = bornTick;
  waiting.birthSlot = 0; // At most one real birth in this annual cohort can carry an echo.
  waiting.maturesTick = bornTick + MORTAL_MATURITY_TICKS;
}

/** Query before the actual juvenile ledger removes maturing cohorts from its stock. */
export function maturingReincarnationCases(world: WorldState, village: MortalSettlement): ReincarnationCase[] {
  return world.reincarnation.cases.filter((item) => item.status === 'reserved' && item.settlementId === village.id &&
    item.maturesTick === world.tick && village.juvenileCohorts.some((row) =>
      row.bornTick === item.birthTick && item.birthSlot !== undefined && item.birthSlot >= 0 && item.birthSlot < row.count))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function expire(world: WorldState, item: ReincarnationCase): void {
  item.status = 'expired';
  item.resolvedTick = world.tick;
}

export function registerMaturedReincarnation(world: WorldState, item: ReincarnationCase, village: MortalSettlement, volunteerId?: string): void {
  if (!world.reincarnation.cases.includes(item) || item.status !== 'reserved' || item.maturesTick !== world.tick || item.settlementId !== village.id) return;
  const volunteer = village.volunteers.find(({ id }) => id === volunteerId);
  if (!volunteer || volunteer.enlistedCultivatorId || volunteer.age !== 18) {
    expire(world, item); // The genuine adult continues ordinary village life if not enrolled as a volunteer.
    return;
  }
  item.volunteerId = volunteerId;
  item.status = 'volunteer';
}

export function attachRecollectionAfterRecruitment(world: WorldState, village: MortalSettlement, volunteerId: string, actor: Cultivator): void {
  const item = world.reincarnation.cases.find((entry) => entry.status === 'volunteer' &&
    entry.settlementId === village.id && entry.volunteerId === volunteerId);
  if (!item || !live(actor) || !world.cultivators.includes(actor) || actor.id !== `recruit-${volunteerId}` ||
      village.volunteers.find(({ id }) => id === volunteerId)?.enlistedCultivatorId !== actor.id ||
      world.reincarnation.echoes.some((echo) => echo.actorId === actor.id)) return;
  item.status = 'recruited';
  item.newActorId = actor.id;
  item.resolvedTick = world.tick;
  // Cue independent of the former biography, and intentionally no claim of corroboration.
  const n = hash(world.random.seed, `echo/${actor.id}`);
  world.reincarnation.echoes.push({ actorId: actor.id, theme: THEMES[n % THEMES.length],
    confidence: Math.floor(n / 7) % 3 === 0 ? 'uncertain' : 'faint', receivedTick: world.tick, status: 'unconsidered' });
}

export function pruneExpiredVolunteerEchoes(world: WorldState, village: MortalSettlement): void {
  for (const item of world.reincarnation.cases) {
    if (item.status !== 'volunteer' || item.settlementId !== village.id) continue;
    const volunteer = village.volunteers.find(({ id }) => id === item.volunteerId);
    if (!volunteer || volunteer.enlistedCultivatorId) expire(world, item);
  }
}

export function advanceReincarnation(world: WorldState): void {
  const villages = new Map(world.settlements.villages.map((village) => [village.id, village]));
  for (const item of world.reincarnation.cases) {
    if (item.status === 'awaiting_birth' && world.tick > item.expiresTick) expire(world, item);
    else if (item.status === 'reserved' && (world.tick > (item.maturesTick ?? -1) || !villages.has(item.settlementId ?? ''))) expire(world, item);
    else if (item.status === 'volunteer') {
      const volunteer = villages.get(item.settlementId ?? '')?.volunteers.find(({ id }) => id === item.volunteerId);
      if (!volunteer || volunteer.enlistedCultivatorId) expire(world, item);
    }
  }
  const archive = new Set(world.reincarnation.cases.filter(terminal)
    .sort((a, b) => (a.resolvedTick ?? 0) - (b.resolvedTick ?? 0) || a.id.localeCompare(b.id)).slice(-RETAIN_TERMINAL_CASES));
  world.reincarnation.cases = world.reincarnation.cases.filter((item) => !terminal(item) || archive.has(item));
  const current = new Set(world.cultivators.filter(live).map(({ id }) => id));
  const deadHistory = new Set(world.reincarnation.echoes.filter(({ actorId }) => !current.has(actorId)).slice(-RETAIN_DEAD_ECHOES));
  world.reincarnation.echoes = world.reincarnation.echoes.filter((echo) => current.has(echo.actorId) || deadHistory.has(echo));
}

/** Only this deliberately limited record is appropriate for the selected actor, UI or a brain. */
export function visibleRecollection(world: WorldState, actorId: string): RecollectionEcho | undefined {
  const echo = world.reincarnation.echoes.find((item) => item.actorId === actorId);
  if (!echo) return undefined;
  return { actorId: echo.actorId, theme: echo.theme, confidence: echo.confidence, receivedTick: echo.receivedTick, status: echo.status,
    ...(echo.resolvedTick !== undefined ? { resolvedTick: echo.resolvedTick } : {}) };
}

export function availableRecollectionActions(actor: Cultivator, world: WorldState): RecollectionOption[] {
  if (!live(actor) || !world.cultivators.includes(actor) ||
      visibleRecollection(world, actor.id)?.status !== 'unconsidered') return [];
  return [{ action: 'RECOLLECT', recollectionMove: 'consider' }, { action: 'RECOLLECT', recollectionMove: 'dismiss' }];
}

export function resolveRecollectionAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'RECOLLECT' ||
      !availableRecollectionActions(actor, world).some((option) => option.recollectionMove === decision.recollectionMove)) return null;
  const echo = world.reincarnation.echoes.find(({ actorId }) => actorId === actor.id)!;
  const considered = decision.recollectionMove === 'consider';
  echo.status = considered ? 'considered' : 'dismissed';
  echo.resolvedTick = world.tick;
  const text = ECHO_TEXT[echo.theme];
  if (considered) recordMemory(actor, world.tick, text.observation, 3, text.category, 1);
  return { id: `evt-${world.tick}-recollection-${actor.id}`, tick: world.tick, year: world.year, month: world.month, category: 'heavenly',
    title: considered ? '留意不确的似曾相识' : '不追索模糊感觉', actorIds: [actor.id], locationId: actor.locationId,
    description: considered ? text.observation : '不把一时错觉当作可验证的经历。', witnessScope: 'participants' };
}
