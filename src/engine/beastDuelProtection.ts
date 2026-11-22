import type { BeastDuelChoice, BeastDuelChoiceOption, BeastDuelContact, BeastDuelGuard, BeastDuelView } from '../types/beastDuelProtection';
import type { NativeDuelRolls } from '../types/forbiddenArt';
import type { Cultivator, LLMDecisionPayload, LocationNode, WorldEvent, WorldState } from '../types/world';
import { ascensionDutyActive } from './ascensionPresence';
import { cloneWorldWithColdHistory } from './coldHistoryEngine';
import { previewDaoDuelIntents } from './daoPathEngine';
import { doctrineFoundingPhysicallyAt } from './doctrineFoundingEngine';
import { isScopedExpeditionGate } from './expeditionOmenTerms';
import { habitatCanReceiveWildBeast, isRewildingAcclimating } from './habitatEngine';
import { findMapPath } from './mapMotionEngine';
import { measureNativeDuel } from './nativeDuelRules';
import { previewSectArrayDamage } from './sectEconomyEngine';
import { knownMapLocations, terrainTileAt } from './terrainEngine';

const SAFE_TILE_LIMIT = 12;
const CONTACT_TTL = 5;
const choices: readonly BeastDuelChoice[] = ['guard', 'withdraw', 'decline'];
const whole = (n: number) => Number.isSafeInteger(n) && n >= 1;
const contacts = (world: WorldState) => world.beastDuelContacts ?? [];
function only<T>(rows: readonly T[], select: (row: T) => boolean): T | undefined {
  let found: T | undefined;
  for (const row of rows) {
    if (!select(row)) continue;
    if (found) return undefined;
    found = row;
  }
  return found;
}
const person = (world: WorldState, id: string) => only(world.cultivators, actor => actor.id === id);
const bound = (world: WorldState, ownerId: string) => only(world.spiritBeasts, beast => beast.tamedBy === ownerId);
const touch = (row: Pick<BeastDuelContact, 'attackerId' | 'defenderId'>, actorId: string) => row.attackerId === actorId || row.defenderId === actorId;
const guided = (world: WorldState, actor: Cultivator) =>
  world.playerAvatar.possessedId === actor.id && (world.playerAvatar.possessionUntilTick ?? 0) > world.tick;
const exactGuide = (world: WorldState, row: BeastDuelContact, actor: Cultivator) =>
  row.guided && guided(world, actor) && world.playerAvatar.possessionUntilTick === row.guideUntilTick &&
  world.playerAvatar.switchAvailableTick === row.guideSwitchTick;
const endangered = (actor: Cultivator) =>
  actor.alive && Number.isFinite(actor.hp) && Number.isFinite(actor.maxHp) && actor.maxHp > 0 &&
  actor.hp > 0 && actor.hp / actor.maxHp < .25;
const validRolls = (rolls: NativeDuelRolls) =>
  rolls.length === 4 && rolls.every(value => Number.isFinite(value) && value >= 0 && value < 1);
const neutralSite = (site: LocationNode) => site.type !== 'secret_realm' && !isScopedExpeditionGate(site);
export const beastDuelContactId = (tick: number, attackerId: string, defenderId: string) =>
  `beast-duel-${tick}-${attackerId}-${defenderId}`;
export const beastDuelEventId = (row: BeastDuelContact, phase: 'open' | 'guard' | 'withdraw', tick: number) =>
  `evt-${row.id}-${phase}-${tick}`;

function exactBody(world: WorldState, actor: Cultivator | undefined, siteId: string): actor is Cultivator {
  return !!actor?.alive && actor.hp > 0 && actor.positionPlane === undefined && !ascensionDutyActive(world, actor) &&
    person(world, actor.id) === actor && doctrineFoundingPhysicallyAt(world, actor, siteId, world.tick);
}
function exactPair(world: WorldState, row: BeastDuelContact) {
  const attacker = person(world, row.attackerId), defender = person(world, row.defenderId);
  const owner = row.ownerId === row.attackerId ? attacker : row.ownerId === row.defenderId ? defender : undefined;
  const beast = owner && bound(world, owner.id);
  const site = only(world.locations, location => location.id === row.siteId);
  if (!site || !neutralSite(site) || row.attackerId === row.defenderId || !exactBody(world, attacker, site.id) ||
      !exactBody(world, defender, site.id) || !owner || !beast?.alive || !Number.isFinite(beast.hp) || beast.hp <= 0 ||
      beast.locationId !== site.id || beast.id !== row.beastId || isRewildingAcclimating(world, beast.id) ||
      only(world.spiritBeasts, candidate => candidate.id === beast.id) !== beast) return undefined;
  return { attacker, defender, owner, beast, site };
}

function threat(world: WorldState, pair: NonNullable<ReturnType<typeof exactPair>>, rolls: NativeDuelRolls) {
  const { attacker, defender, owner } = pair;
  if (!endangered(owner) || !validRolls(rolls)) return undefined;
  const hit = measureNativeDuel(world, attacker, defender, rolls, undefined, previewDaoDuelIntents(world, attacker, defender));
  if (hit.loser !== owner) return undefined;
  const incoming = previewSectArrayDamage(world, owner, hit.winner, hit.hitLoser);
  return Number.isFinite(incoming) && incoming >= owner.hp ? incoming : undefined;
}

export function openBeastDuelContact(
  world: WorldState, attacker: Cultivator, defender: Cultivator, owner: Cultivator, rolls: NativeDuelRolls,
): BeastDuelContact | undefined {
  if ((owner !== attacker && owner !== defender) || person(world, attacker.id) !== attacker ||
      person(world, defender.id) !== defender || !whole(world.tick) || !validRolls(rolls) ||
      contacts(world).some(row => touch(row, attacker.id) || touch(row, defender.id)) ||
      world.forbiddenDuels?.some(row => touch(row, attacker.id) || touch(row, defender.id))) return undefined;
  const beast = bound(world, owner.id);
  if (!beast) return undefined;
  const row: BeastDuelContact = { id: beastDuelContactId(world.tick, attacker.id, defender.id), attackerId: attacker.id,
    defenderId: defender.id, ownerId: owner.id, beastId: beast.id, siteId: owner.locationId, openedTick: world.tick,
    rolls: [...rolls], guided: guided(world, owner) };
  if (row.guided) {
    row.guideUntilTick = world.playerAvatar.possessionUntilTick;
    row.guideSwitchTick = world.playerAvatar.switchAvailableTick;
  }
  const parties = exactPair(world, row);
  if (!parties || threat(world, parties, rolls) === undefined) return undefined;
  (world.beastDuelContacts ??= []).push(row);
  return row;
}

function escapeDestination(world: WorldState, info: NonNullable<ReturnType<typeof exactPair>>) {
  const { owner, site, beast, attacker, defender } = info;
  const opponentId = (attacker === owner ? defender : attacker).sectId;
  const hostile = (place: LocationNode) => !!place.ownerSectId && place.ownerSectId !== owner.sectId &&
    (place.ownerSectId === opponentId || world.diplomacy.some(row => row.pact === 'war' &&
      (row.sectAId === owner.sectId && row.sectBId === place.ownerSectId ||
        row.sectBId === owner.sectId && row.sectAId === place.ownerSectId)));
  const blocked = new Set(world.mapHazards.filter(row => row.intensity >= 2 &&
    row.createdTick <= world.tick && row.expiresTick > world.tick).map(row => row.tileId));
  const initialTile = terrainTileAt(world, site.x, site.y);
  if (!initialTile) return undefined;
  const possible = knownMapLocations(world, owner).filter(place => place.id !== site.id &&
    (place.type === 'spirit_vein' || place.type === 'abyss') && habitatCanReceiveWildBeast(world, place.id, beast.id) &&
    neutralSite(place) && !hostile(place) && only(world.locations, row => row.id === place.id) === place);
  return possible.flatMap(place => {
    const lastTile = terrainTileAt(world, place.x, place.y);
    if (!lastTile || lastTile.id === initialTile.id ||
        Math.abs(lastTile.col - initialTile.col) + Math.abs(lastTile.row - initialTile.row) > SAFE_TILE_LIMIT) return [];
    const path = findMapPath(world, site, place, tile => !blocked.has(tile.id));
    if (path.length < 2 || new Set(path.map(point => terrainTileAt(world, point.x, point.y)?.id)).size > SAFE_TILE_LIMIT + 1)
      return [];
    return [{ place, length: path.length }];
  }).sort((a, b) => a.length - b.length || (a.place.id < b.place.id ? -1 : 1))[0]?.place;
}

export function beastDuelContactForParticipant(world: WorldState, actor: Cultivator): BeastDuelContact | undefined {
  if (person(world, actor.id) !== actor) return undefined;
  const row = only(contacts(world), item => touch(item, actor.id));
  return row && exactPair(world, row) ? row : undefined;
}

export function consumeBeastDuelContact(world: WorldState, row: BeastDuelContact): void {
  if (!contacts(world).includes(row)) return;
  const next = contacts(world).filter(item => item !== row);
  if (next.length) world.beastDuelContacts = next;
  else delete world.beastDuelContacts;
}
export function pruneInvalidBeastDuelContacts(world: WorldState): void {
  for (const row of contacts(world)) if (!exactPair(world, row)) consumeBeastDuelContact(world, row);
}

function availableFor(world: WorldState, row: BeastDuelContact): BeastDuelChoiceOption[] {
  const info = exactPair(world, row);
  if (!info || threat(world, info, row.rolls) === undefined) return [{ choice: 'decline' }];
  const escape = escapeDestination(world, info);
  return [{ choice: 'guard' }, ...(escape
    ? [{ choice: 'withdraw' as const, destinationId: escape.id, destinationName: escape.name }] : []), { choice: 'decline' }];
}
export function availableBeastDuelChoices(world: WorldState, actor: Cultivator): BeastDuelChoiceOption[] {
  const row = beastDuelContactForParticipant(world, actor);
  return row?.ownerId === actor.id ? availableFor(world, row) : [];
}

const label = (value: string) => value.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, '').trim().slice(0, 64);
export function projectGuidedBeastDuel(world: WorldState, actor?: Cultivator): BeastDuelView | undefined {
  if (!actor || !guided(world, actor)) return undefined;
  const row = beastDuelContactForParticipant(world, actor);
  const info = row && exactPair(world, row);
  if (!row || !info || row.ownerId !== actor.id || !exactGuide(world, row, actor) ||
      (row.guideUntilTick ?? 0) <= world.tick + 1) return undefined;
  return { contactId: row.id, ownerId: actor.id, beastName: label(info.beast.name), ownerHp: actor.hp, beastHp: info.beast.hp,
    options: availableFor(world, row).map(option => option.destinationName ? { ...option, destinationName: label(option.destinationName) } : option),
    ...(row.queued ? { queued: { ...row.queued } } : {}) };
}

export function queueGuidedBeastDuelChoice(world: WorldState, actorId: string, contactId: string, choice: BeastDuelChoice,
  destinationId?: string): WorldState {
  const actor = person(world, actorId);
  const view = projectGuidedBeastDuel(world, actor);
  if (!view || view.contactId !== contactId || view.queued ||
      !view.options.some(option => option.choice === choice && option.destinationId === destinationId)) return world;
  const next = cloneWorldWithColdHistory(world);
  const row = only(contacts(next), candidate => candidate.id === contactId);
  if (!row) return world;
  row.queued = { choice, tick: world.tick, ...(destinationId ? { destinationId } : {}) };
  return next;
}

type Ready = { choice: BeastDuelChoice; destinationId?: string };
function acceptedOption(options: readonly BeastDuelChoiceOption[], choice: BeastDuelChoice, destinationId?: string): Ready | undefined {
  const match = options.find(row => row.choice === choice && row.destinationId === destinationId);
  return match && { choice, ...(destinationId ? { destinationId } : {}) };
}

function resolveChoice(
  world: WorldState, row: BeastDuelContact, decision?: LLMDecisionPayload, modelInput = false,
): Ready | undefined {
  if (!contacts(world).includes(row) || world.tick <= row.openedTick) return undefined;
  const info = exactPair(world, row);
  if (!info) return { choice: 'decline' };
  const options = availableFor(world, row);
  if (row.guided) {
    if (!exactGuide(world, row, info.owner)) return { choice: 'decline' };
    if (row.queued && row.queued.tick < world.tick && row.queued.tick >= row.openedTick)
      return acceptedOption(options, row.queued.choice, row.queued.destinationId) ?? { choice: 'decline' };
    return world.tick - row.openedTick <= CONTACT_TTL && options.some(option => option.choice !== 'decline')
      ? undefined : { choice: 'decline' };
  }
  if (decision?.chosenAction === 'BEAST_DUEL_RESPONSE' && decision.targetBeastDuelId === row.id && decision.beastDuelChoice &&
      Object.keys(decision).every(key => ['chosenAction', 'innerMonologue', 'targetBeastDuelId', 'beastDuelChoice', 'targetLocationId'].includes(key))) {
    const selected = acceptedOption(options, decision.beastDuelChoice, decision.targetLocationId);
    if (selected) return selected;
  }
  // A failed provider nomination cannot become a paid intervention by accident.
  if (modelInput) return { choice: 'decline' };
  const incoming = threat(world, info, row.rolls);
  const shortfall = incoming === undefined ? Infinity : incoming - info.owner.hp + 1;
  const retreat = options.find(option => option.choice === 'withdraw');
  if (info.beast.hp > shortfall && options.some(option => option.choice === 'guard')) return { choice: 'guard' };
  if (retreat && (info.owner.personality === '痴情' || info.owner.personality === '刚正'))
    return { choice: 'withdraw', destinationId: retreat.destinationId };
  return { choice: 'decline' };
}

const prepared = new WeakMap<BeastDuelContact, { world: WorldState; tick: number; answer: Ready }>();
export function prepareBeastDuelResolution(
  world: WorldState, row: BeastDuelContact, decision?: LLMDecisionPayload, modelInput = false,
): Ready | undefined {
  const answer = resolveChoice(world, row, decision, modelInput);
  if (answer) prepared.set(row, { world, tick: world.tick, answer });
  else prepared.delete(row);
  return answer;
}
function isPrepared(world: WorldState, row: BeastDuelContact, choice: BeastDuelChoice, destinationId?: string) {
  const record = prepared.get(row);
  return record?.world === world && record.tick === world.tick && record.answer.choice === choice &&
    record.answer.destinationId === destinationId;
}

const applied = new WeakSet<BeastDuelContact>();
export function settleBeastGuard(
  world: WorldState, row: BeastDuelContact, loser: Cultivator, incoming: number,
): BeastDuelGuard | undefined {
  const info = contacts(world).includes(row) && !applied.has(row) && exactPair(world, row);
  if (!info || !isPrepared(world, row, 'guard') || world.tick <= row.openedTick || loser !== info.owner || !endangered(loser) ||
      !Number.isFinite(incoming) || incoming < loser.hp) return undefined;
  const beastHpBefore = info.beast.hp;
  const absorbed = Math.min(beastHpBefore, Math.max(0, incoming - loser.hp + 1));
  if (!(absorbed > 0)) return undefined;
  applied.add(row);
  info.beast.hp = beastHpBefore - absorbed;
  const severed = info.beast.hp === 0;
  if (severed) {
    info.beast.alive = false;
    delete info.beast.tamedBy;
  }
  return { absorbed, beastHpBefore, beastHpAfter: info.beast.hp, severed };
}

function event(world: WorldState, row: BeastDuelContact, phase: 'open' | 'guard' | 'withdraw', title: string,
  description: string, destination?: string): WorldEvent {
  return { id: beastDuelEventId(row, phase, world.tick), tick: world.tick, year: world.year, month: world.month,
    category: 'combat', title, description, actorIds: [row.ownerId], locationId: destination ?? row.siteId, witnessScope: 'participants' };
}
export function isPrivateBeastDuelEvent(row: WorldEvent): boolean {
  return row.id.startsWith('evt-beast-duel-') && row.witnessScope === 'participants';
}
export function openBeastDuelEvent(world: WorldState, row: BeastDuelContact): WorldEvent {
  return event(world, row, 'open', '灵兽伏在一旁', '生死一击尚未落下；同地原契犹在，护不护、散不散，未有结果。');
}
export function beastDuelGuardEvent(world: WorldState, row: BeastDuelContact, guard: BeastDuelGuard, owner: Cultivator): WorldEvent {
  return event(world, row, 'guard', guard.severed ? '灵兽护主，灵契既终' : '灵兽以身挡下一击',
    `灵兽实际承受${guard.absorbed}点伤，气血${guard.beastHpBefore}→${guard.beastHpAfter}。` +
    (owner.hp > 0 ? '原主仍然生还。' : '原主未能生还。') +
    (guard.severed ? '灵兽已亡，原契解除。' : '灵兽仍活着。'));
}
export function settleBeastWithdraw(world: WorldState, row: BeastDuelContact, destinationId: string): WorldEvent | undefined {
  const info = contacts(world).includes(row) && !applied.has(row) && exactPair(world, row);
  if (!info || !isPrepared(world, row, 'withdraw', destinationId) || world.tick <= row.openedTick ||
      threat(world, info, row.rolls) === undefined) return undefined;
  const destination = escapeDestination(world, info);
  if (destination?.id !== destinationId) return undefined;
  applied.add(row);
  info.beast.locationId = destination.id;
  delete info.beast.tamedBy;
  info.beast.nextActionTick = Math.max(world.tick + 1, info.beast.nextActionTick);
  return event(world, row, 'withdraw', '放灵兽离阵，旧契已解', '灵兽沿确可通行的路撤到别处，契约已解；此举没有带原主离开交锋。');
}

/** Historical rows have no authority over current parties. Strict load accepts only a real unresolved current contact. */
export function validateBeastDuelContacts(world: WorldState, fail: (path: string) => never): void {
  const rows = world.beastDuelContacts;
  if (!rows) return;
  if (!rows.length) fail('beastDuelContacts.empty');
  const ids = new Set<string>(), people = new Set<string>();
  for (const row of rows) {
    const info = exactPair(world, row);
    if (!whole(row.openedTick) || row.openedTick > world.tick || row.id !== beastDuelContactId(row.openedTick, row.attackerId, row.defenderId) ||
        !validRolls(row.rolls) || !info || ids.has(row.id) || people.has(row.attackerId) || people.has(row.defenderId) ||
        world.forbiddenDuels?.some(prior => touch(prior, row.attackerId) || touch(prior, row.defenderId)))
      fail('beastDuelContacts.identity');
    if (row.guided ? row.guideUntilTick === undefined || !whole(row.guideUntilTick) ||
        row.guideUntilTick <= row.openedTick || row.guideUntilTick > row.openedTick + CONTACT_TTL ||
        row.guideSwitchTick === undefined || !Number.isSafeInteger(row.guideSwitchTick) || row.guideSwitchTick < 0 :
        row.guideUntilTick !== undefined || row.guideSwitchTick !== undefined) fail('beastDuelContacts.guide');
    ids.add(row.id);
    people.add(row.attackerId);
    people.add(row.defenderId);
    const originals = world.events.filter(event => event.id === beastDuelEventId(row, 'open', row.openedTick));
    if (originals.length > 1 || !originals.length && row.openedTick === world.tick || originals.some(original =>
      original.tick !== row.openedTick || original.locationId !== row.siteId || original.category !== 'combat' ||
      original.title !== '灵兽伏在一旁' || !isPrivateBeastDuelEvent(original) || original.actorIds.length !== 1 ||
      original.actorIds[0] !== row.ownerId)) fail('beastDuelContacts.source');
    const queued = row.queued;
    if (queued && (!row.guided || !choices.includes(queued.choice) || !whole(queued.tick) ||
        queued.tick < row.openedTick || queued.tick > world.tick || queued.tick >= (row.guideUntilTick ?? 0) ||
        (queued.choice === 'withdraw') !== (queued.destinationId !== undefined) || queued.destinationId &&
        !only(world.locations, site => site.id === queued.destinationId && site.id !== row.siteId && neutralSite(site))))
      fail('beastDuelContacts.queue');
  }
}
