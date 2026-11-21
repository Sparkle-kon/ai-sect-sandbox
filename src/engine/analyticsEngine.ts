import { REALM_ORDER } from '../data/initialWorld';
import type { CultivationRealm, Cultivator, WorldEvent, WorldState } from '../types/world';
import type { TimelineSnapshot } from './timelineEngine';

export type MortalityCause = 'tribulation' | 'combat' | 'lifespan' | 'hazard' | 'expedition' | 'beast' | 'politics' | 'unknown';
const CAUSES: MortalityCause[] = ['tribulation', 'combat', 'lifespan', 'hazard', 'expedition', 'beast', 'politics', 'unknown'];

export interface AnalyticsDeathRecord {
  actorId: string; name: string; fromTick: number; throughTick: number; cause: MortalityCause; eventId?: string;
}
export interface AnalyticsHallRow {
  actorId: string; name: string; realm: CultivationRealm; realmStage: number; sectId: string; combatPower: number; contribution: number; rank: number;
}
export interface RealmPopulation { realm: CultivationRealm; living: number; fallen: number }
export interface WorldAnalytics {
  coverage: { firstTick: number; lastTick: number; snapshotCount: number; missingTicks: number; leftCensoredDeaths: number; completeFromStart: boolean };
  population: { living: number; fallen: number; byRealm: RealmPopulation[]; points: Array<{ tick: number; byRealm: RealmPopulation[] }> };
  treasury: { sects: Array<{ id: string; name: string; color: string }>; points: Array<{ tick: number; balances: Record<string, number> }> };
  mortality: { total: number; byCause: Array<{ cause: MortalityCause; count: number }>; records: AnalyticsDeathRecord[] };
  hallOfFame: { living: AnalyticsHallRow[]; fallen: AnalyticsHallRow[] };
}

function classify(event: WorldEvent): MortalityCause | undefined {
  const { id } = event;
  if (id.endsWith('-oldage')) return 'lifespan';
  if (id.endsWith('-tribulation-failure')) return 'tribulation';
  if (event.duelWinnerId || id.endsWith('-kill')) return 'combat';
  if (id.startsWith('evt-brush-') || id.includes('-hazard-') || id.includes('-natural-beast-tide-')) return 'hazard';
  if (id.includes('-occasion-') && id.includes('-expedition-')) return 'expedition';
  if (id.includes('-beast-attack-')) return 'beast';
  if (id.includes('-leadership-')) return 'politics';
  return undefined;
}

function evidenceFor(actorId: string, transitionedIds: Set<string>, events: WorldEvent[]): { cause: MortalityCause; eventId?: string } {
  const candidates = events.flatMap((event) => {
    const cause = classify(event);
    if (!cause || !event.actorIds.includes(actorId)) return [];
    if (event.duelWinnerId) {
      if (event.duelWinnerId === actorId || event.actorIds.filter((id) => id !== event.duelWinnerId).length !== 1) return [];
      return [{ cause, event, weight: 4 }];
    }
    // Sole actor is normally the subject, not merely an onlooker.
    if (event.actorIds.length === 1) return [{ cause, event, weight: 3 }];
    // A multi-person hazard may kill more than one actor, but needs an actual decrement for this actor.
    if (cause === 'hazard' && event.damage?.some(({ cultivatorId, amount }) => cultivatorId === actorId && amount > 0)) {
      return [{ cause, event, weight: 2 }];
    }
    // Politics and legacy lethal combat can record additional participants. Abstain if another actor also died.
    if (event.actorIds.filter((id) => transitionedIds.has(id)).length === 1) return [{ cause, event, weight: 1 }];
    return [];
  }).sort((a, b) => b.weight - a.weight || a.event.tick - b.event.tick || a.event.id.localeCompare(b.event.id));
  if (!candidates.length) return { cause: 'unknown' };
  const first = candidates[0];
  if (candidates.some((c) => c.weight === first.weight && c.cause !== first.cause)) return { cause: 'unknown' };
  return { cause: first.cause, eventId: first.event.id };
}

function leaderRows(people: Cultivator[]): AnalyticsHallRow[] {
  return people.sort((a, b) => b.combatPower - a.combatPower || REALM_ORDER.indexOf(b.realm) - REALM_ORDER.indexOf(a.realm) ||
    b.realmStage - a.realmStage || b.contribution - a.contribution || a.id.localeCompare(b.id)).slice(0, 10)
    .map(({ id, name, realm, realmStage, sectId, combatPower, contribution }, index) =>
      ({ actorId: id, name, realm, realmStage, sectId, combatPower, contribution, rank: index + 1 }));
}

/** Uses only the branch history supplied by the caller, never another branch or events after the viewing point. */
export function buildWorldAnalytics(world: WorldState, history: readonly TimelineSnapshot[] = []): WorldAnalytics {
  const frames = new Map<number, WorldState>();
  for (const snapshot of history) {
    if (snapshot.tick === snapshot.world.tick && snapshot.tick <= world.tick && snapshot.world.random.seed === world.random.seed) {
      frames.set(snapshot.tick, snapshot.world);
    }
  }
  frames.set(world.tick, world);
  const sorted = [...frames.values()].sort((a, b) => a.tick - b.tick);
  const first = sorted[0];
  const missingTicks = Math.max(0, world.tick - first.tick + 1 - sorted.length);
  const coverage = { firstTick: first.tick, lastTick: world.tick, snapshotCount: sorted.length, missingTicks,
    leftCensoredDeaths: first.cultivators.filter(({ alive }) => !alive).length,
    completeFromStart: first.tick === 1 && missingTicks === 0 };
  const deathEvents = new Map<string, WorldEvent>();
  const treasurySects = new Map<string, { id: string; name: string; color: string }>();
  for (const frame of sorted) {
    for (const event of frame.events) {
      if (event.category === 'death' && event.witnessScope !== 'participants' && event.tick <= frame.tick && event.tick >= first.tick) {
        deathEvents.set(event.id, event);
      }
    }
    for (const { id, name, color } of frame.sects) treasurySects.set(id, { id, name, color });
  }
  const deaths: AnalyticsDeathRecord[] = [];
  const seenVictims = new Set(first.cultivators.filter(({ alive }) => !alive).map(({ id }) => id));
  for (let i = 1; i < sorted.length; i++) {
    const prior = sorted[i - 1];
    const frame = sorted[i];
    const aliveBefore = new Set(prior.cultivators.filter(({ alive }) => alive).map(({ id }) => id));
    const newlyDead = frame.cultivators.filter(({ alive, id }) => !alive && aliveBefore.has(id) && !seenVictims.has(id))
      .sort((a, b) => a.id.localeCompare(b.id));
    const ids = new Set(newlyDead.map(({ id }) => id));
    const period = [...deathEvents.values()].filter(({ tick }) => tick > prior.tick && tick <= frame.tick);
    for (const actor of newlyDead) {
      seenVictims.add(actor.id);
      deaths.push({ actorId: actor.id, name: actor.name, fromTick: prior.tick, throughTick: frame.tick, ...evidenceFor(actor.id, ids, period) });
    }
  }
  const living = world.cultivators.filter(({ alive }) => alive);
  const fallen = world.cultivators.filter(({ alive }) => !alive);
  const byRealm = (frame: WorldState): RealmPopulation[] => REALM_ORDER.map((realm) => ({
    realm, living: frame.cultivators.filter((actor) => actor.realm === realm && actor.alive).length,
    fallen: frame.cultivators.filter((actor) => actor.realm === realm && !actor.alive).length,
  }));
  return {
    coverage,
    population: { living: living.length, fallen: fallen.length, byRealm: byRealm(world),
      points: sorted.map((frame) => ({ tick: frame.tick, byRealm: byRealm(frame) })) },
    treasury: { sects: [...treasurySects.values()], points: sorted.map((frame) => ({
      tick: frame.tick, balances: Object.fromEntries(frame.sects.map(({ id, spiritStones }) => [id, spiritStones])),
    })) },
    mortality: { total: deaths.length, records: deaths, byCause: CAUSES.map((cause) => ({ cause, count: deaths.filter((death) => death.cause === cause).length })) },
    hallOfFame: { living: leaderRows(living), fallen: leaderRows(fallen) },
  };
}
