import type { GrandSiegeRound } from '../types/grandSiege';
import type { ChronicleAnchor, Cultivator, LLMDecisionPayload, SectSiege, WorldEvent, WorldState } from '../types/world';
import { doctrineFoundingPhysicallyAt } from './doctrineFoundingEngine';
import { isScopedExpeditionGate } from './expeditionOmenTerms';
import { roundEventId } from './grandSiegeProof';
import { projectPublicSiegeRound } from './grandSiegeWitnessView';
import { isSectActive } from './sectActivity';

export const BATTLEFIELD_REPAIR_QI = 8;
export const BATTLEFIELD_REPAIR_LIMIT = 24;
export const BATTLEFIELD_REUNION_AFFINITY = 4;

export type BattlefieldRevisitOption =
  | { action: 'BATTLEFIELD_REVISIT'; battlefieldRevisitMove: 'repair'; targetBattlefieldSiegeId: string; targetCultivatorId?: never }
  | { action: 'BATTLEFIELD_REVISIT'; battlefieldRevisitMove: 'seek'; targetBattlefieldSiegeId: string; targetCultivatorId: string };
export interface BattlefieldRevisitView {
  siegeId: string;
  siteId: string;
  returnTick: number;
  options: readonly BattlefieldRevisitOption[];
}

function only<T>(rows: readonly T[], select: (row: T) => boolean): T | undefined {
  let result: T | undefined;
  for (const row of rows) {
    if (!select(row)) continue;
    if (result) return undefined;
    result = row;
  }
  return result;
}
const safeTick = (tick: number, world: WorldState) => Number.isSafeInteger(tick) && tick >= 1 && tick <= world.tick;
const whole = (n: number) => Number.isSafeInteger(n) && n >= 0;
const pair = (a: string, b: string, x: string, y: string) => a === x && b === y || a === y && b === x;
const living = (actor: Cultivator) => actor.alive && actor.hp > 0 && actor.positionPlane === undefined;
const publicAt = (world: WorldState, fact: ChronicleAnchor, tick: number) =>
  (!('witnessScope' in fact) || fact.witnessScope === undefined) && fact.tick === tick && safeTick(tick, world) &&
  Number.isSafeInteger(fact.year) && Number.isSafeInteger(fact.month) && fact.month >= 1 && fact.month <= 12 &&
  world.year * 12 + world.month - (fact.year * 12 + fact.month) === world.tick - tick;
const returnTitle = '幸存者重到旧阵眼';
const returnText = '离阵之后，本人重新踏到了曾亲历阵破的山门。';
const revisitId = (siege: SectSiege, actorId: string, move: 'return' | 'repair' | 'seek', tick: number) =>
  `evt-battlefield-revisit-${siege.id}-${actorId}-${move}-${tick}`;

export function isBattlefieldRevisitEvent(event: WorldEvent): boolean {
  return event.id.startsWith('evt-battlefield-revisit-') && event.witnessScope === 'participants';
}

function originalOrArchived(world: WorldState, id: string, check: (fact: ChronicleAnchor) => boolean): boolean {
  const raw = world.events.filter(event => event.id === id);
  const hot = world.chronicleArchive.anchors.filter(event => event.id === id);
  const issues = [...world.chronicleArchive.chapters, ...world.coldHistory.chapters]
    .flatMap(chapter => chapter.anchors.filter(event => event.id === id &&
      event.tick >= chapter.startTick && event.tick <= chapter.endTick && chapter.endTick <= world.tick));
  return raw.length <= 1 && hot.length <= 1 && raw.length + hot.length + issues.length > 0 &&
    [...raw, ...hot, ...issues].every(check);
}

/** Exact preexisting theatre proof for both the dark map scar and the original witness's return. */
export function projectBattlefieldArrayBreak(world: WorldState, siege: SectSiege): GrandSiegeRound | undefined {
  const theatre = siege.theatre;
  const end = theatre?.terminal;
  const site = only(world.locations, row => row.id === siege.destinationId);
  if (!theatre || !end || !site || isScopedExpeditionGate(site) || site.type === 'secret_realm' ||
      only(world.sieges, row => row.id === siege.id) !== siege || siege.attackerSectId === siege.defenderSectId ||
      !only(world.sects, row => row.id === siege.attackerSectId) || !only(world.sects, row => row.id === siege.defenderSectId) ||
      siege.id !== `siege-${siege.startedTick}-${siege.attackerSectId}-${siege.defenderSectId}` ||
      !safeTick(siege.startedTick, world) || theatre.openedTick !== siege.startedTick ||
      theatre.arrivedTick === undefined || !safeTick(theatre.arrivedTick, world) || theatre.arrivedTick <= siege.startedTick ||
      end.battlefield !== true || end.status !== siege.status || !safeTick(end.tick, world) || end.tick !== siege.lastResolvedTick ||
      theatre.rounds.length < 1 || theatre.rounds.length > 7 || theatre.rounds.length !== siege.rounds) return undefined;
  if (end.status === 'withdrawn') {
    const deal = only(world.ceasefires.agreements, row => `evt-${end.tick}-${row.id}-signed` === end.sourceEventId);
    if (!deal || deal.signedTick !== end.tick || !deal.withdrawnSiegeIds.includes(siege.id) ||
        !pair(deal.proposerSectId, deal.targetSectId, siege.attackerSectId, siege.defenderSectId) ||
        !originalOrArchived(world, end.sourceEventId, row => publicAt(world, row, end.tick) && row.category === 'diplomacy' &&
          row.title === '两宗签署停战撤军议约' && row.actorIds.includes(deal.proposerId) && row.actorIds.includes(deal.targetLeaderId)))
      return undefined;
  } else if (end.sourceEventId !== roundEventId(end.tick, siege.id) ||
      !originalOrArchived(world, end.sourceEventId, row => publicAt(world, row, end.tick) && row.locationId === site.id &&
        row.category === 'diplomacy' && row.title === (end.status === 'victory' ? '攻山告捷' : '攻山退兵'))) return undefined;
  let prior = theatre.arrivedTick;
  for (const [index, row] of theatre.rounds.entries()) {
    if (!safeTick(row.tick, world) || row.tick <= prior || row.tick > end.tick || row.round !== index + 1 ||
        row.sourceEventId !== roundEventId(row.tick, siege.id)) return undefined;
    prior = row.tick;
  }
  for (const row of [...theatre.rounds].reverse()) {
    const roster = [...row.attackers, ...row.defenders];
    if (!(whole(row.wallBefore) && row.wallBefore > 0 && row.wallBefore <= 128 && row.wallAfter === 0 &&
          whole(row.wallMax) && row.wallMax >= row.wallBefore) ||
        !row.attackers.length || !row.defenders.length || new Set(roster.map(fighter => fighter.actorId)).size !== roster.length ||
        !roster.every(fighter => !!only(world.cultivators, person => person.id === fighter.actorId) &&
          !!only(world.sects, faction => faction.id === fighter.sectId)) ||
        row.attackers.some(fighter => !siege.participantIds.includes(fighter.actorId) || fighter.sectId === siege.defenderSectId) ||
        row.defenders.some(fighter => siege.participantIds.includes(fighter.actorId) || fighter.sectId === siege.attackerSectId)) continue;
    const terminal = row.tick === end.tick && end.sourceEventId === row.sourceEventId;
    const valid = originalOrArchived(world, row.sourceEventId, fact => publicAt(world, fact, row.tick) &&
      fact.locationId === site.id && fact.category === 'diplomacy' &&
      row.attackers.every(fighter => fact.actorIds.includes(fighter.actorId)) &&
      (terminal
        ? fact.title === (end.status === 'victory' ? '攻山告捷' : '攻山退兵') &&
          row.defenders.every(fighter => fact.actorIds.includes(fighter.actorId))
        : fact.title === '护山阵接战' && fact.description === `护山阵受损${row.wallBefore}，尚余0阵力。`));
    if (!valid || world.events.some(event => event.id === row.sourceEventId) && !projectPublicSiegeRound(world, siege, row))
      continue;
    return row;
  }
  return undefined;
}

function originalDefender(actor: Cultivator, siege: SectSiege, round: GrandSiegeRound): boolean {
  return round.defenders.some(row => row.actorId === actor.id && row.sectId === siege.defenderSectId);
}

function physicallyAt(world: WorldState, actor: Cultivator, siteId: string, tick: number) {
  return living(actor) && only(world.cultivators, person => person.id === actor.id) === actor &&
    doctrineFoundingPhysicallyAt(world, actor, siteId, tick);
}

function findBattlefield(world: WorldState, actor: Cultivator) {
  return world.sieges.filter(siege => siege.destinationId === actor.locationId && siege.defenderSectId === actor.sectId &&
      siege.theatre?.terminal && siege.theatre.terminal.tick < world.tick)
    .flatMap(siege => {
      const round = projectBattlefieldArrayBreak(world, siege);
      return round && originalDefender(actor, siege, round) ? [{ siege, round }] : [];
    }).sort((a, b) => b.round.tick - a.round.tick || (a.siege.id < b.siege.id ? -1 : 1))[0];
}

function titledEvent(world: WorldState, siege: SectSiege, actorIds: string[], move: 'return' | 'repair' | 'seek',
  title: string, description: string): WorldEvent {
  return { id: revisitId(siege, actorIds[0], move, world.tick), tick: world.tick, year: world.year, month: world.month,
    locationId: siege.destinationId, actorIds, title, description, category: 'diplomacy', witnessScope: 'participants' };
}

export function recordBattlefieldReturn(world: WorldState, actor: Cultivator, fromLocationId: string): WorldEvent | undefined {
  const prior = only(world.locations, site => site.id === fromLocationId);
  if (!prior || prior.id === actor.locationId || !physicallyAt(world, actor, actor.locationId, world.tick)) return undefined;
  const found = findBattlefield(world, actor);
  if (!found || world.events.some(event => event.id === revisitId(found.siege, actor.id, 'return', world.tick))) return undefined;
  const owner = only(world.sects, sect => sect.id === found.siege.defenderSectId);
  const site = only(world.locations, item => item.id === found.siege.destinationId);
  if (!site || !isSectActive(owner) || owner.headquartersId !== site.id || site.ownerSectId !== owner.id) return undefined;
  return titledEvent(world, found.siege, [actor.id], 'return', returnTitle, returnText);
}

function existingTie(world: WorldState, actorId: string, otherId: string, roundTick: number): boolean {
  if (world.mentorship.lineage.some(row => row.formedTick <= roundTick &&
      pair(row.mentorId, row.studentId, actorId, otherId) &&
      !world.mentorTransfers.releases.some(release => release.oldMentorId === row.mentorId &&
        release.studentId === row.studentId && release.formedTick === row.formedTick))) return true;
  return world.events.some(event => event.tick <= roundTick && publicAt(world, event, event.tick) &&
    event.category === 'diplomacy' && event.actorIds.length === 2 &&
    pair(event.actorIds[0], event.actorIds[1], actorId, otherId) && event.id === `evt-${event.tick}-${event.actorIds[0]}-social` &&
    event.title === `${only(world.cultivators, row => row.id === event.actorIds[0])?.name}与${only(world.cultivators,
      row => row.id === event.actorIds[1])?.name}坐而论道` && only(world.events, row => row.id === event.id) === event);
}

function evaluated(world: WorldState, actor: Cultivator, executionTick: number) {
  if (executionTick !== world.tick && executionTick !== world.tick + 1) return undefined;
  const returnTick = executionTick - 1;
  // Most actors have no such receipt. Reject them before any site/theatre or transit projection.
  const receipt = only(world.events, event => event.tick === returnTick && event.title === returnTitle &&
    event.actorIds.length === 1 && event.actorIds[0] === actor.id && isBattlefieldRevisitEvent(event));
  if (!receipt || !physicallyAt(world, actor, actor.locationId, executionTick)) return undefined;
  const found = findBattlefield(world, actor);
  if (!found) return undefined;
  const { siege, round } = found;
  if (only(world.events, event => event.id === revisitId(siege, actor.id, 'return', returnTick)) !== receipt)
    return undefined;
  const owner = only(world.sects, sect => sect.id === siege.defenderSectId);
  const site = only(world.locations, item => item.id === siege.destinationId);
  if (receipt.category !== 'diplomacy' || receipt.locationId !== siege.destinationId ||
      receipt.witnessScope !== 'participants' || receipt.actorIds.length !== 1 || receipt.actorIds[0] !== actor.id ||
      receipt.title !== returnTitle || receipt.description !== returnText ||
      world.year * 12 + world.month - (receipt.year * 12 + receipt.month) !== world.tick - returnTick ||
      !site || !isSectActive(owner) || owner.headquartersId !== site.id || site.ownerSectId !== owner.id ||
      world.events.some(event =>
        event.id === revisitId(siege, actor.id, 'repair', executionTick) || event.id === revisitId(siege, actor.id, 'seek', executionTick)))
    return undefined;
  const options: BattlefieldRevisitOption[] = [];
  if (actor.qiProgress >= BATTLEFIELD_REPAIR_QI && owner.facilities.defense_array > 0 &&
      whole(owner.arrayHp) && whole(owner.arrayMaxHp) && owner.arrayHp < owner.arrayMaxHp)
    options.push({ action: 'BATTLEFIELD_REVISIT', battlefieldRevisitMove: 'repair', targetBattlefieldSiegeId: siege.id });
  for (const old of round.defenders) {
    if (old.actorId === actor.id) continue;
    const other = only(world.cultivators, person => person.id === old.actorId);
    if (other && physicallyAt(world, other, site.id, executionTick) && existingTie(world, actor.id, other.id, round.tick) &&
        world.relationships.filter(row => pair(row.fromId, row.toId, actor.id, other.id)).length <= 1)
      options.push({ action: 'BATTLEFIELD_REVISIT', battlefieldRevisitMove: 'seek', targetBattlefieldSiegeId: siege.id, targetCultivatorId: other.id });
  }
  return { owner, siege, site, returnTick, options };
}

export function availableBattlefieldRevisits(world: WorldState, actor: Cultivator, executionTick = world.tick + 1): BattlefieldRevisitOption[] {
  return evaluated(world, actor, executionTick)?.options ?? [];
}

export function projectBattlefieldRevisit(world: WorldState, actor: Cultivator | undefined, viewerId = actor?.id): BattlefieldRevisitView | undefined {
  if (!actor || viewerId !== actor.id) return undefined;
  const found = evaluated(world, actor, world.tick + 1);
  return found && found.options.length ? { siegeId: found.siege.id, siteId: found.site.id, returnTick: found.returnTick, options: found.options } : undefined;
}

const used = new WeakMap<WorldState, Set<string>>();
const allowedKeys = new Set(['chosenAction', 'innerMonologue', 'battlefieldRevisitMove', 'targetBattlefieldSiegeId', 'targetCultivatorId']);
export function resolveBattlefieldRevisit(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'BATTLEFIELD_REVISIT' || Object.keys(decision).some(key => !allowedKeys.has(key))) return null;
  const found = evaluated(world, actor, world.tick);
  const option = found?.options.find(row => row.targetBattlefieldSiegeId === decision.targetBattlefieldSiegeId &&
    row.battlefieldRevisitMove === decision.battlefieldRevisitMove && row.targetCultivatorId === decision.targetCultivatorId);
  if (!found || !option) return null;
  const key = `${world.tick}:${actor.id}`;
  const seen = used.get(world) ?? new Set<string>();
  if (seen.has(key)) return null;
  seen.add(key);
  used.set(world, seen);
  if (option.battlefieldRevisitMove === 'repair') {
    const amount = Math.min(BATTLEFIELD_REPAIR_LIMIT, found.owner.arrayMaxHp - found.owner.arrayHp);
    actor.qiProgress -= BATTLEFIELD_REPAIR_QI;
    found.owner.arrayHp += amount;
    return titledEvent(world, found.siege, [actor.id], 'repair', '幸存者续起旧阵眼',
      `本人实付${BATTLEFIELD_REPAIR_QI}点灵气，补回${amount}阵力；旧阵受创的实录仍在。`);
  }
  const otherId = option.targetCultivatorId;
  const relations = world.relationships.filter(row => pair(row.fromId, row.toId, actor.id, otherId));
  if (relations.length > 1) return null;
  const edge = relations[0];
  if (edge) edge.affinity = Math.min(100, edge.affinity + BATTLEFIELD_REUNION_AFFINITY);
  else world.relationships.push({ fromId: actor.id, toId: otherId, affinity: BATTLEFIELD_REUNION_AFFINITY,
    type: '同门', note: '旧阵眼前，两位原先见过的人实际重逢。' });
  return titledEvent(world, found.siege, [actor.id, otherId], 'seek', '昔日师友在旧阵眼相见',
    '原身已归此处，也亲眼见到旧日同来的那个人；没有替失散者断定生死。');
}
