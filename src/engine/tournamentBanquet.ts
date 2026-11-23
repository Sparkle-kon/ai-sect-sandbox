import {banquetSeatSummarySource} from './banquetSeatProof';
import type { Cultivator, WorldEvent, WorldOccasion, WorldState } from '../types/world';
import { isScopedExpeditionGate } from './expeditionOmenTerms';
import { tournamentArenaPrizeId, TOURNAMENT_ARENA_TITLE } from './tournamentArenaTerms';

const AFTER_WINDOW = 6;
const hallTitle = '论剑夜宴·前厅';
const hallSpeech = '胜负已写在榜上。今夜歇一歇剑，请你同饮这一盏。席上不另论输赢。';
const thoughtTitle = '论剑夜宴·席间一念';
const thoughtText = {
  winner: '剑已归鞘。众人敬的是榜上之名，方才那场交手，只有我还记得分外清楚。',
  other: '输赢已在榜上。听见那声邀约，手还下意识按着剑。今晚去不去，尚未开口。',
};
const legacyOtherThought = '输赢已在榜上。入席时还觉手中有剑；待坐下来，才发觉它早已入鞘。';
const afterTitle = '论剑夜宴·会后对谈';
const afterText = '「末一合，我到现在还记得。」\n「我也是。既已散席，今日不再争输赢。」';

const laterTitle = '论剑之后·另日相逢';
const laterText = '「那一合，我还记得。」\n「先前没能在一桌说话。今天既碰见了，慢慢说罢。」';

function afterVersion(world:WorldState,occasion:WorldOccasion,tick:number){
  const rows=world.banquetSeats?.tables.filter(row=>row.occasionId===occasion.id)??[];
  if(rows.length===0)return {title:afterTitle,text:afterText,phase:undefined};
  const table=rows.length===1?rows[0]:undefined;
  const seated=table?.summary&&table.summary.tick<tick&&table.summary.presentIds.length===2&&
    sameIds(table.summary.presentIds,table.finalistIds)&&!!banquetSeatSummarySource(world,table);
  return seated?{title:afterTitle,text:afterText,phase:'shared_table' as const}:
    {title:laterTitle,text:laterText,phase:'later_meeting' as const};
}

export interface TournamentBanquetView {
  hall: { id: string; tick: number; siteName: string; speech: string };
  thought?: {text:string;phase?:'invited'};
  after?: {tick:number;text:string;otherName:string;phase?:'shared_table'|'later_meeting'};
}

const hallId = (occasion: WorldOccasion, tick: number) => `evt-banquet-${occasion.id}-hall-${tick}`;
const thoughtId = (occasion: WorldOccasion, id: string, tick: number) => `evt-banquet-${occasion.id}-thought-${id}-${tick}`;
const afterId = (occasion: WorldOccasion, tick: number) => `evt-banquet-${occasion.id}-after-${tick}`;
const sameIds = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((id, idx) => id === right[idx]);

export function isPrivateTournamentBanquetEvent(event: WorldEvent): boolean {
  return event.witnessScope === 'participants' && event.id.startsWith('evt-banquet-');
}

function only<T>(rows: readonly T[], matches: (row: T) => boolean): T | undefined {
  let found: T | undefined;
  for (const row of rows) {
    if (!matches(row)) continue;
    if (found) return undefined;
    found = row;
  }
  return found;
}
const knownActor = (world: WorldState, id: string) => only(world.cultivators, actor => actor.id === id);
const knownEvent = (world: WorldState, id: string) => only(world.events, event => event.id === id);
const siteAt = (world: WorldState, occasion: WorldOccasion) => {
  const site = only(world.locations, row => row.id === occasion.locationId);
  return site && (site.type === 'market' || site.type === 'sect_hq') && !isScopedExpeditionGate(site) ? site : undefined;
};
const isHere = (actor: Cultivator | undefined, siteId: string): actor is Cultivator =>
  Boolean(actor?.alive && actor.hp > 0 && actor.positionPlane === undefined && actor.locationId === siteId);
const dateMatches = (world: WorldState, event: WorldEvent, tick: number) =>
  Number.isSafeInteger(event.tick) && tick >= 1 && tick <= world.tick && event.tick === tick &&
  Number.isSafeInteger(event.year) && Number.isSafeInteger(event.month) && event.month >= 1 && event.month <= 12 &&
  (world.year * 12 + world.month) - (event.year * 12 + event.month) === world.tick - tick;

function originalFinal(world: WorldState, occasion: WorldOccasion, crown: WorldEvent) {
  const arena = occasion.arena;
  const round = arena?.rounds.at(-1);
  const final = round?.bouts[0];
  if (!arena || !round || !final?.secondId || final.firstId === final.secondId ||
      occasion.kind !== 'tournament' || occasion.omenId || only(world.occasions, item => item.id === occasion.id) !== occasion ||
      ![8, 16].includes(arena.seededIds.length) || new Set(arena.seededIds).size !== arena.seededIds.length ||
      !arena.seededIds.every(id => occasion.participantIds.includes(id)) ||
      !Number.isSafeInteger(arena.openedTick) || arena.openedTick < occasion.startedTick || arena.openedTick >= round.tick ||
      round.round !== Math.log2(arena.seededIds.length) || round.round !== occasion.round || round.round !== arena.rounds.length ||
      round.absentIds.length !== 0 || round.bouts.length !== 1 ||
      round.eventId !== crown.id || crown.id !== `evt-${round.tick}-${occasion.id}-champion` || !dateMatches(world, crown, round.tick) ||
      crown.category !== 'heavenly' || crown.witnessScope !== undefined || crown.title !== '大比魁首揭晓' ||
      crown.locationId !== occasion.locationId || final.winnerId !== occasion.championId ||
      (final.winnerId !== final.firstId && final.winnerId !== final.secondId) || !sameIds(crown.actorIds, [final.winnerId]) ||
      !Number.isSafeInteger(final.firstDamage) || final.secondDamage === undefined ||
      !Number.isSafeInteger(final.secondDamage) || final.firstDamage < 0 || final.secondDamage < 0 || final.firstDamage + final.secondDamage === 0) return undefined;
  const native = only(occasion.bouts, row => row.round === round.round);
  if (!native || native.firstId !== final.firstId || native.secondId !== final.secondId || native.winnerId !== final.winnerId)
    return undefined;
  const ids = [final.firstId, final.secondId] as const;
  const previous = arena.rounds.at(-2)?.bouts.map(bout => bout.winnerId);
  if (!previous || !sameIds(previous, ids) || !siteAt(world, occasion) || !ids.every(id => knownActor(world, id))) return undefined;
  return { ids, winnerId: final.winnerId, tick: round.tick };
}

const openingProofs = new WeakMap<WorldOccasion, WorldEvent>();
export function openTournamentBanquet(
  world: WorldState, occasion: WorldOccasion, crowned: WorldEvent, actualFinalRoster: readonly Cultivator[],
): WorldEvent[] {
  if (occasion.status !== 'running' || occasion.arena?.terminal || occasion.lastResolvedTick !== world.tick ||
      crowned.tick !== world.tick || openingProofs.has(occasion) ||
      world.cultivators.some(actor => actor.artifacts.some(item => item.id === tournamentArenaPrizeId(occasion.id)))) return [];
  const final = originalFinal(world, occasion, crowned);
  if (!final || !sameIds(actualFinalRoster.map(actor => actor.id), final.ids) ||
      !actualFinalRoster.every(actor => knownActor(world, actor.id) === actor && isHere(actor, occasion.locationId))) return [];
  const base = { tick: world.tick, year: world.year, month: world.month, locationId: occasion.locationId };
  openingProofs.set(occasion, crowned);
  return [{ ...base, id: hallId(occasion, world.tick), category: 'diplomacy', title: hallTitle, description: hallSpeech,
    actorIds: [...final.ids] }, ...final.ids.map((id): WorldEvent => ({
    ...base, id: thoughtId(occasion, id, world.tick), category: 'intrigue', title: thoughtTitle,
    description: id === final.winnerId ? thoughtText.winner : thoughtText.other, actorIds: [id], witnessScope: 'participants',
  }))];
}

/** The version already committed to this world's original hot event stream. */
export function committedTournamentBanquet(world: WorldState, occasion: WorldOccasion) {
  const arena = occasion.arena, terminal = arena?.terminal, prize = arena?.prize;
  if (occasion.status !== 'completed' || terminal?.status !== 'completed' || !prize ||
      prize.tick !== terminal.tick || prize.title !== TOURNAMENT_ARENA_TITLE ||
      prize.artifactId !== tournamentArenaPrizeId(occasion.id)) return undefined;
  const crown = knownEvent(world, terminal.eventId);
  const source = knownEvent(world, hallId(occasion, terminal.tick));
  const final = crown && originalFinal(world, occasion, crown);
  const site = siteAt(world, occasion);
  if (!final || !site || !source || prize.actorId !== final.winnerId || terminal.tick !== final.tick ||
      !dateMatches(world, source, final.tick) || source.locationId !== site.id ||
      source.title !== hallTitle || source.description !== hallSpeech || source.category !== 'diplomacy' ||
      source.witnessScope !== undefined || !sameIds(source.actorIds, final.ids)) return undefined;
  return { occasion, final, site, source };
}

function nativeSocial(world: WorldState, social: WorldEvent, ids: readonly string[], siteId: string) {
  const [speakerId, targetId] = social.actorIds;
  const speaker = knownActor(world, speakerId), target = knownActor(world, targetId);
  return !!speaker && !!target && social.title === `${speaker.name}与${target.name}坐而论道` && social.actorIds.length === 2 && social.actorIds[0] !== social.actorIds[1] &&
    ids.every(id => social.actorIds.includes(id)) && social.id === `evt-${social.tick}-${social.actorIds[0]}-social` &&
    dateMatches(world, social, social.tick) && social.category === 'diplomacy' && social.locationId === siteId &&
    social.witnessScope === undefined;
}

const followedThisFrame = new WeakMap<WorldState, Set<string>>();
export function recordTournamentBanquetAfterTalk(world: WorldState, social: WorldEvent): WorldEvent | undefined {
  if (social.tick !== world.tick || social.category !== 'diplomacy' || social.actorIds.length !== 2 ||
      social.witnessScope !== undefined || !social.id.endsWith('-social')) return undefined;
  const from = world.tick - AFTER_WINDOW;
  const prior = world.occasions.filter(occasion => occasion.status === 'completed' && occasion.arena?.prize &&
    occasion.locationId === social.locationId && occasion.arena.prize.tick >= from && occasion.arena.prize.tick < world.tick)
    .map(occasion => committedTournamentBanquet(world, occasion)).filter(row => row !== undefined)
    .find(({ final, site }) => nativeSocial(world, social, final.ids, site.id));
  if (!prior || !prior.final.ids.every(id => isHere(knownActor(world, id), prior.site.id))) return undefined;
  const { occasion, site } = prior;
  const seen = followedThisFrame.get(world) ?? new Set<string>();
  if (seen.has(occasion.id) || world.events.some(row => row.id.startsWith(`evt-banquet-${occasion.id}-after-`)))
    return undefined;
  seen.add(occasion.id);
  followedThisFrame.set(world, seen);
  const version=afterVersion(world,occasion,world.tick);
  return { id: afterId(occasion, world.tick), tick: world.tick, year: world.year, month: world.month, locationId: site.id,
    category: 'diplomacy', title: version.title, description: version.text, actorIds: [...social.actorIds], witnessScope: 'participants' };
}

const safeName = (name: string) => name.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, '').trim().slice(0, 64);

/** Reads a single already witnessed feast. A canonical, present possession lease grants only its own private pages. */
export function projectTournamentBanquet(world: WorldState, viewer?: Cultivator): TournamentBanquetView | undefined {
  const record = world.occasions.filter(occasion => occasion.status === 'completed' && occasion.arena?.prize)
    .map(occasion => committedTournamentBanquet(world, occasion)).filter(row => row !== undefined)
    .sort((a, b) => b.final.tick - a.final.tick || (a.occasion.id < b.occasion.id ? -1 : 1))[0];
  if (!record) return undefined;
  const { occasion, final, site, source } = record;
  const hall = { id: source.id, tick: source.tick, siteName: safeName(site.name), speech: hallSpeech };
  if (!viewer?.alive || viewer.hp <= 0 || viewer.positionPlane !== undefined || knownActor(world, viewer.id) !== viewer ||
      world.playerAvatar.possessedId !== viewer.id || (world.playerAvatar.possessionUntilTick ?? -1) <= world.tick ||
      !final.ids.some(id => id === viewer.id)) return { hall };
  const own = knownEvent(world, thoughtId(occasion, viewer.id, final.tick));
  const words = viewer.id === final.winnerId ? thoughtText.winner : thoughtText.other;
  const thought = own && dateMatches(world, own, final.tick) && own.locationId === site.id && own.category === 'intrigue' &&
    own.witnessScope === 'participants' && own.title === thoughtTitle &&
    (own.description===words||viewer.id!==final.winnerId&&own.description===legacyOtherThought) &&
    sameIds(own.actorIds, [viewer.id]) ?
    world.banquetSeats?.tables.some(row=>row.occasionId===occasion.id)?{text:words,phase:'invited' as const}:{text:own.description} : undefined;
  const possibleAfter = world.events.filter(event => event.id.startsWith(`evt-banquet-${occasion.id}-after-`));
  const later = possibleAfter.length === 1 ? possibleAfter[0] : undefined;
  const sourceSpeaker = later?.actorIds[0];
  const social = sourceSpeaker && later ? knownEvent(world, `evt-${later.tick}-${sourceSpeaker}-social`) : undefined;
  const otherId = final.ids.find(id => id !== viewer.id);
  const otherName = otherId ? safeName(knownActor(world, otherId)?.name ?? '') : '';
  const echo=later&&afterVersion(world,occasion,later.tick);
  const after = later && echo && social && otherName && later.id === afterId(occasion, later.tick) &&
    later.tick > final.tick && later.tick <= final.tick + AFTER_WINDOW && dateMatches(world, later, later.tick) &&
    later.locationId === site.id && later.witnessScope === 'participants' && later.title === echo.title &&
    later.category === 'diplomacy' && later.description === echo.text && sameIds(later.actorIds, social.actorIds) &&
    nativeSocial(world, social, final.ids, site.id) ?
    {tick:later.tick,text:echo.text,otherName,...(echo.phase?{phase:echo.phase}:{})}:undefined;
  return { hall, ...(thought ? { thought } : {}), ...(after ? { after } : {}) };
}
