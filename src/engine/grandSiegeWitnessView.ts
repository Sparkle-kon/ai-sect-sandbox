import type { GrandSiegeRound } from '../types/grandSiege';
import type { Cultivator, SectSiege, WorldState } from '../types/world';
import { isScopedExpeditionGate } from './expeditionOmenTerms';
import { roundEventId } from './grandSiegeProof';

export interface SiegeWitnessRound {
  sourceId: string;
  round: number;
  tick: number;
  year: number;
  month: number;
  side: 'attacker' | 'defender';
  wallBefore: number;
  wallAfter: number;
  wallMax: number;
  selfDamage?: number;
  selfGuard?: { move: 'elder-rescue' | 'leader-last-stand'; paidQi: number; paidHp: number; wallSaved: number };
}

export interface SiegeWitnessView {
  actorId: string;
  siegeId: string;
  rounds: readonly SiegeWitnessRound[];
}

function uniqueById<T extends { id: string }>(rows: readonly T[]) {
  const index = new Map<string, T | undefined>();
  for (const row of rows) index.set(row.id, index.has(row.id) ? undefined : row);
  return index;
}

const whole = (value: number, min: number, max: number) =>
  Number.isSafeInteger(value) && value >= min && value <= max;
const eventAt = (world: WorldState, siege: SectSiege, event: WorldState['events'][number], tick: number) =>
  event.tick === tick && event.locationId === siege.destinationId && event.witnessScope === undefined &&
  whole(event.year, 0, world.year) && whole(event.month, 1, 12) &&
  world.year * 12 + world.month - (event.year * 12 + event.month) === world.tick - tick;
const exactIds = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((id, idx) => id === right[idx]);

function roundMatchesSource(world: WorldState, siege: SectSiege, round: GrandSiegeRound, event: WorldState['events'][number]) {
  if (event.category !== 'diplomacy' || !round.attackers.length ||
      !round.attackers.every(row => event.actorIds.includes(row.actorId))) return false;
  if (event.title === '护山阵接战') return !siege.theatre?.terminal || siege.theatre.terminal.tick > round.tick
    ? event.description === `护山阵受损${round.wallBefore - round.wallAfter}，尚余${round.wallAfter}阵力。` : false;
  const terminal = siege.theatre?.terminal;
  return terminal?.battlefield === true && terminal.tick === round.tick && terminal.sourceEventId === event.id &&
    terminal.status === siege.status && (terminal.status === 'victory' || terminal.status === 'repelled') &&
    event.title === (terminal.status === 'victory' ? '攻山告捷' : '攻山退兵') &&
    round.defenders.every(row => event.actorIds.includes(row.actorId)) &&
    (terminal.status !== 'victory' || round.wallAfter === 0) &&
    round.tick <= world.tick;
}

function personalEffects(
  round: GrandSiegeRound, event: WorldState['events'][number] | undefined, siege: SectSiege, actorId: string,
): Pick<SiegeWitnessRound, 'selfDamage' | 'selfGuard'> {
  const clash = round.clash;
  const hero = round.hero;
  if (!event || (!clash && !hero)) return {};
  if (clash && (round.round !== 1 || !round.attackers.some(row => row.actorId === clash.attackerId) ||
      !round.defenders.some(row => row.actorId === clash.defenderId) ||
      ![clash.attackerId, clash.defenderId].includes(clash.winnerId) ||
      !whole(clash.attackerDamage, 1, 12) || !whole(clash.defenderDamage, 1, 12) ||
      !/^鼓声忽断。[^。！？]+与[^。！？]+越出阵前，各受一击，[^。！？]+占得上风。/u.test(event.description))) return {};
  const ids = [...new Set([...(clash ? [clash.attackerId, clash.defenderId] : []), ...(hero ? [hero.actorId] : [])])];
  if (event.category !== (clash ? 'combat' : 'diplomacy') ||
      event.title !== (hero ? '重阵将倾，有人死守' : '叩关之际，两锋出阵') || !exactIds(event.actorIds, ids)) return {};
  const selfDamage = actorId === clash?.attackerId ? clash.attackerDamage :
    actorId === clash?.defenderId ? clash.defenderDamage : undefined;
  const damage = selfDamage === undefined ? {} : { selfDamage };
  if (hero?.actorId !== actorId) return damage;
  const elder = hero.move === 'elder-rescue';
  if (!elder && hero.move !== 'leader-last-stand') return damage;
  const rank = elder ? '太上长老' : '掌门';
  const saves = elder ? 28 : 22;
  if (hero.rank !== rank || !round.defenders.some(row => row.actorId === actorId && row.sectId === siege.defenderSectId && row.rank === rank) ||
      hero.paidQi !== (elder ? 24 : 18) || hero.paidHp !== (elder ? 0 : 12) || !whole(hero.wallSaved, 1, saves) ||
      !whole(round.wallBefore, 1, 150) ||
      round.wallBefore - round.wallAfter + hero.wallSaved > Math.min(round.wallBefore, 128) ||
      (hero.wallSaved < saves && round.wallAfter !== round.wallBefore) ||
      !event.description.includes(`以${hero.paidQi}灵气与${hero.paidHp}气血${elder ? '托起阵眼' : '守住阵门'}，阵光又明了一息，挡下${hero.wallSaved}阵力。`))
    return damage;
  return { ...damage, selfGuard: { move: hero.move, paidQi: hero.paidQi, paidHp: hero.paidHp, wallSaved: hero.wallSaved } };
}

/** Exact branch-local, historical round receipts. The caller separately controls public venue and viewer selection. */
export function projectSiegeWitness(
  world: WorldState, siege: SectSiege, actor: Cultivator, throughTick = world.tick,
): SiegeWitnessView | undefined {
  const theatre = siege.theatre;
  if (!theatre || !whole(throughTick, 0, world.tick) ||
      theatre.arrivedTick === undefined || !whole(theatre.arrivedTick, siege.startedTick + 2, throughTick) ||
      theatre.openedTick !== siege.startedTick ||
      siege.id !== `siege-${siege.startedTick}-${siege.attackerSectId}-${siege.defenderSectId}` ||
      theatre.sourceLaunchId !== `evt-${siege.startedTick}-dip-${siege.attackerSectId}-${siege.defenderSectId}-launch_siege` ||
      !whole(theatre.rounds.length, 1, 7) || siege.rounds !== theatre.rounds.length ||
      uniqueById(world.sieges).get(siege.id) !== siege || siege.attackerSectId === siege.defenderSectId) return undefined;
  const site = uniqueById(world.locations).get(siege.destinationId);
  if (!site || isScopedExpeditionGate(site)) return undefined;
  const people = uniqueById(world.cultivators);
  const factions = uniqueById(world.sects);
  if (people.get(actor.id) !== actor || !factions.get(siege.attackerSectId) || !factions.get(siege.defenderSectId)) return undefined;
  const publicEvents = uniqueById(world.events);
  const originalParticipants = new Set(siege.participantIds);
  const arrival = publicEvents.get(roundEventId(theatre.arrivedTick, siege.id));
  if (!arrival || !eventAt(world, siege, arrival, theatre.arrivedTick) ||
      arrival.category !== 'diplomacy' || arrival.title !== '联军抵达山门' ||
      !/^[^。！？]+联军抵达[^。！？]+山门，准备破阵。$/u.test(arrival.description) ||
      !arrival.actorIds.length || new Set(arrival.actorIds).size !== arrival.actorIds.length ||
      arrival.actorIds.some(id => !originalParticipants.has(id))) return undefined;
  const rounds: SiegeWitnessRound[] = [];
  const roundDates = new Set<number>();
  for (const row of theatre.rounds) {
    if (roundDates.has(row.tick)) return undefined;
    roundDates.add(row.tick);
  }
  let last = theatre.arrivedTick;
  for (const [index, round] of theatre.rounds.entries()) {
    const tick = round.tick;
    if (tick > throughTick) continue;
    if (round.round !== index + 1 || !whole(tick, last + 1, siege.lastResolvedTick ?? -1) ||
        round.sourceEventId !== roundEventId(tick, siege.id)) continue;
    last = tick;
    const event = publicEvents.get(round.sourceEventId);
    if (!event || !eventAt(world, siege, event, tick) ||
        !whole(round.wallMax, 0, Number.MAX_SAFE_INTEGER) || !whole(round.wallBefore, 0, round.wallMax) ||
        !whole(round.wallAfter, Math.max(0, round.wallBefore - 128), round.wallBefore) ||
        !roundMatchesSource(world, siege, round, event)) continue;
    const all = [...round.attackers, ...round.defenders];
    if (new Set(all.map(row => row.actorId)).size !== all.length || all.some(row =>
      !people.get(row.actorId) || !factions.get(row.sectId)) ||
      round.attackers.some(row => !originalParticipants.has(row.actorId) || row.sectId === siege.defenderSectId) ||
      round.defenders.some(row => originalParticipants.has(row.actorId) || row.sectId === siege.attackerSectId)) continue;
    const side = round.attackers.some(row => row.actorId === actor.id) ? 'attacker' :
      round.defenders.some(row => row.actorId === actor.id) ? 'defender' : undefined;
    if (!side) continue;
    const front = publicEvents.get(`evt-${tick}-${siege.id}-front-theatre`);
    rounds.push({ sourceId: event.id, round: round.round, tick, year: event.year, month: event.month, side,
      wallBefore: round.wallBefore, wallAfter: round.wallAfter, wallMax: round.wallMax,
      ...personalEffects(round, front && eventAt(world, siege, front, tick) ? front : undefined, siege, actor.id) });
  }
  return rounds.length ? { actorId: actor.id, siegeId: siege.id, rounds } : undefined;
}

/** Do not let the shared overview re-expose a private or disputed front-scene source. */
export function projectPublicSiegeRound(world: WorldState, siege: SectSiege, round: GrandSiegeRound): GrandSiegeRound | undefined {
  if (round.tick > world.tick || round.sourceEventId !== roundEventId(round.tick, siege.id)) return undefined;
  const frontId = `evt-${round.tick}-${siege.id}-front-theatre`;
  const sources = uniqueById(world.events.filter(event => event.id === round.sourceEventId || event.id === frontId));
  const source = sources.get(round.sourceEventId);
  if (!source || !eventAt(world, siege, source, round.tick) || !roundMatchesSource(world, siege, round, source)) return undefined;
  const front = sources.get(frontId);
  const publicFront = front && eventAt(world, siege, front, round.tick) ? front : undefined;
  const { clash, hero, ...wall } = round;
  return structuredClone({
    ...wall,
    clash: clash && personalEffects(round, publicFront, siege, clash.attackerId).selfDamage !== undefined ? clash : undefined,
    hero: hero && personalEffects(round, publicFront, siege, hero.actorId).selfGuard ? hero : undefined,
  });
}
