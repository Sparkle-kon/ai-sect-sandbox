import type { StorytellerDirectorState } from '../../types/storytellerDirector';
import { ROGUELIKE_ENCOUNTER_CHOICES } from '../../types/roguelikeEncounter';
import type { Cultivator, WorldState } from '../../types/world';
import { activeAvatar } from '../avatarEngine';
import { cloneWorldWithColdHistory } from '../coldHistoryEngine';
import { activeRoguelikeEncounter, resolveDirectorRoguelikeChoice } from '../roguelikeEncounterEngine';
import { ROGUELIKE_ENCOUNTER_CATALOG } from '../roguelikeEncounterCatalog';
import { applyCultivatorBrainDecision } from '../worldEngine';
import { recordAuxiliaryActionEvent } from '../recordAuxiliaryActionEvent';
import { worldRandom } from '../worldRandom';
import { DIRECTOR_HIGHLIGHT_LIMIT, HIGHLIGHT_KINDS, isHighlight, type ConsequenceTag, type HighlightCandidate, type HighlightKind,
  type HighlightOfferKey, type HighlightSource } from './highlight';
import { DIRECTOR_NUDGE_LIMIT, directorNudgeKey, pruneExpiredNudges, type DirectorNudge } from './nudge';
import { seedEncounterApproach } from './encounterSeed';
import { NATIVE_HIGHLIGHT_SOURCES } from './nativeHighlights';
import { SECONDARY_HIGHLIGHT_SOURCES } from './secondaryHighlights';

const encounterSource: HighlightSource = {
  kind: 'encounter',
  probe(world, actor) {
    const row = activeRoguelikeEncounter(world, actor);
    if (!row) return [];
    const words = ROGUELIKE_ENCOUNTER_CATALOG[row.kind];
    const primary: readonly ConsequenceTag[] = row.kind === 'wounded-traveler' ? ['bond'] :
      row.kind === 'sect-gate' ? ['reputation'] : ['injury'];
    const high: readonly ConsequenceTag[] = row.kind === 'wounded-traveler' ? ['bond', 'injury'] :
      row.kind === 'sect-gate' ? ['reputation'] : ['injury', 'lifespan'];
    return [{ kind: 'encounter', sourceId: row.id, actorId: actor.id, siteId: row.siteId,
      baseWeight: 70, title: words.title, teaser: words.scene, options: words.choices.map(option => ({
        id: option.choice, label: option.label,
        consequences: option.choice === 'leave' ? [] : option.choice === 'bold' ? high : primary,
      })) }];
  },
  seed: seedEncounterApproach,
  choose(world, actor, candidate, optionId) {
    const choice = ROGUELIKE_ENCOUNTER_CHOICES.find(value => value === optionId);
    if (choice === undefined) return false;
    const event = resolveDirectorRoguelikeChoice(world, actor, candidate.sourceId, choice);
    if (!event) return false;
    recordAuxiliaryActionEvent(world, event);
    return true;
  },
};

/** A separately testable registration point; the quest lane can register here when it exists. */
export function createHighlightRegistry(sources: readonly HighlightSource[]): readonly HighlightSource[] {
  const kinds = new Set<HighlightKind>();
  return Object.freeze(sources.map(source => {
    if (!HIGHLIGHT_KINDS.includes(source.kind) || kinds.has(source.kind) || !source.choose && !source.decision)
      throw new Error('Invalid or duplicate highlight source: ' + source.kind);
    kinds.add(source.kind);
    return Object.freeze(source);
  }));
}

export { isHighlight } from './highlight';

let registry: readonly HighlightSource[] | undefined;
export function highlightSources(): readonly HighlightSource[] {
  // Native resolvers share the turn dispatcher; defer composition until module evaluation has finished.
  return registry ??= createHighlightRegistry([encounterSource, ...NATIVE_HIGHLIGHT_SOURCES, ...SECONDARY_HIGHLIGHT_SOURCES]);
}
const offerProbe = (source: HighlightSource, world: WorldState, actor: Cultivator) =>
  source.probe(world, actor, source.nextMonth ? world.tick + 1 : world.tick);

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function jitter(seed: number, tick: number, key: string): number {
  let hash = seed ^ Math.imul(tick, 0x9e3779b1);
  for (const ch of key) hash = Math.imul(hash ^ (ch.codePointAt(0) ?? 0), 0x01000193);
  return (hash >>> 0) % 17;
}
function eligible(world: WorldState, actor: Cultivator | undefined): actor is Cultivator {
  return !!actor?.alive && actor.hp > 0 && actor.positionPlane === undefined && world.cultivators.includes(actor);
}
const sameOffer = (a: HighlightOfferKey, b: HighlightOfferKey) => a.kind === b.kind && a.actorId === b.actorId &&
  a.sourceId === b.sourceId && a.siteId === b.siteId && a.openedTick === b.openedTick;
const sameCandidate = (a: HighlightCandidate, b: HighlightOfferKey) => a.kind === b.kind && a.actorId === b.actorId &&
  a.sourceId === b.sourceId && a.siteId === b.siteId;
const hardFocus = (world: WorldState, state: StorytellerDirectorState) => activeAvatar(world) ??
  (state.focusActorId ? world.cultivators.find(row => row.id === state.focusActorId) : undefined);

export function projectDirectorHighlight(world: WorldState, viewer?: Cultivator): (HighlightCandidate & {openedTick: number; key: HighlightOfferKey}) | undefined {
  const state = world.storyteller, offer = state?.highlightOffer;
  if (!state || !offer || offer.openedTick !== world.tick) return undefined;
  const actor = world.cultivators.find(row => row.id === offer.actorId);
  const direct = hardFocus(world, state);
  if (!eligible(world, actor) || viewer !== undefined && viewer !== actor || direct !== undefined && direct !== actor) return undefined;
  const source = highlightSources().find(row => row.kind === offer.kind);
  const candidate = source && offerProbe(source, world, actor).find(row => sameCandidate(row, offer) && isHighlight(row));
  return candidate && { ...candidate, openedTick: offer.openedTick, key: { ...offer } };
}

function prefer(world: WorldState, state: StorytellerDirectorState, row: HighlightCandidate, preferred?: Cultivator): number {
  const last = (state.highlights ?? []).slice(-3);
  const seen = (state.highlights ?? []).filter(history => history.kind === row.kind).length;
  const storms = row.kind === 'heart_demon' || row.kind === 'forbidden_art' || row.kind === 'dungeon';
  const tone = state.style === 'great_calamity' && storms ? 11 : state.style === 'still_water' && !storms ? 11 : 0;
  const closingGate = row.kind === 'dungeon' && row.options.some(option => option.id === 'enter');
  return row.baseWeight + (closingGate ? 60 : 0) + tone + (preferred?.id === row.actorId ? 11 : 0) +
    (seen === 0 ? 35 : 0) - last.filter(history => history.kind === row.kind).length * 25 +
    jitter(world.random.seed, world.tick, row.sourceId + ':' + row.actorId);
}
function seedNext(world: WorldState, state: StorytellerDirectorState, actors: readonly Cultivator[]): void {
  const current = state.nudges ?? [];
  if (current.length >= DIRECTOR_NUDGE_LIMIT) return;
  const recent = (state.highlights ?? []).slice(-3);
  const already = new Set(current.map(directorNudgeKey));
  const sources = highlightSources().filter(source => source.seed).sort((a, b) =>
    Number(recent.some(row => row.kind === a.kind)) - Number(recent.some(row => row.kind === b.kind)) ||
    jitter(world.random.seed, world.tick, a.kind) - jitter(world.random.seed, world.tick, b.kind) || compare(a.kind, b.kind));
  let selected: DirectorNudge | undefined;
  for (const source of sources) {
    if (current.some(nudge => nudge.reason === source.kind)) continue;
    for (const actor of actors) {
      const candidate = source.seed?.(world, actor);
      if (candidate && !already.has(directorNudgeKey(candidate))) {
        selected = candidate;
        break;
      }
    }
    if (selected) break;
  }
  if (selected) state.nudges = [...current, selected];
}

/** Runs after native monthly settlement, never performs a choice or draws from the simulation RNG. */
export function advanceDirectorHighlights(world: WorldState, state: StorytellerDirectorState,
  preferred: Cultivator | undefined, cadence: number): HighlightKind | undefined {
  pruneExpiredNudges(state, world.tick);
  delete state.highlightOffer;
  if (state.pendingHighlightChoice && state.pendingHighlightChoice.key.openedTick < world.tick) delete state.pendingHighlightChoice;
  const fixed = hardFocus(world, state);
  const actors = fixed ? (eligible(world, fixed) ? [fixed] : []) :
    world.cultivators.filter(actor => eligible(world, actor))
      .sort((a, b) => Number(b === preferred) - Number(a === preferred) || compare(a.id, b.id));
  if (!actors.length) return undefined;
  const gap = world.tick - (state.lastHighlightTick ?? state.configuredTick);
  const shown = new Set((state.highlights ?? []).map(row => row.kind + ':' + row.sourceId + ':' + row.actorId));
  const picks: Array<{ candidate: HighlightCandidate; score: number }> = [];
  if (gap >= 1) {
    for (const source of highlightSources()) for (const actor of actors) {
      if (gap < cadence && source.kind !== 'heart_demon' && source.kind !== 'dungeon') continue;
      for (const candidate of offerProbe(source, world, actor)) {
        if (gap < cadence && source.kind === 'dungeon' && !candidate.options.some(option => option.id === 'enter')) continue;
        if (candidate.kind !== source.kind || candidate.actorId !== actor.id || !world.locations.some(site => site.id === candidate.siteId) ||
            shown.has(candidate.kind + ':' + candidate.sourceId + ':' + actor.id) || !isHighlight(candidate)) continue;
        picks.push({ candidate, score: prefer(world, state, candidate, preferred) });
      }
    }
  }
  const best = picks.sort((a, b) => b.score - a.score || compare(a.candidate.sourceId, b.candidate.sourceId) ||
    compare(a.candidate.actorId, b.candidate.actorId))[0]?.candidate;
  if (best) {
    const { kind, sourceId, actorId, siteId } = best;
    state.highlightOffer = { kind, sourceId, actorId, siteId, openedTick: world.tick };
    state.lastHighlightTick = world.tick;
    state.highlights = [...(state.highlights ?? []).slice(-(DIRECTOR_HIGHLIGHT_LIMIT - 1)), { tick: world.tick, kind, sourceId, actorId }];
    return kind;
  }
  if (gap >= cadence - 1) {
    // Rotate unpinned observers through the real cast rather than repeatedly nudging the same starting actor.
    const seedActors = fixed ? actors : [...actors].sort((a, b) => jitter(world.random.seed, world.tick, a.id) -
      jitter(world.random.seed, world.tick, b.id) || compare(a.id, b.id));
    seedNext(world, state, seedActors);
  }
  return undefined;
}

/** Apply only a re-probed, live choice on an isolated copy. Stale, forged and repeated keys are inert. */
export function resolveDirectorHighlight(world: WorldState, key: HighlightOfferKey, optionId: string): WorldState {
  const stored = world.storyteller?.highlightOffer;
  if (!stored || !sameOffer(stored, key)) return world;
  if (world.storyteller?.pendingHighlightChoice) return world;
  const candidate = projectDirectorHighlight(world);
  const option = candidate?.options.find(row => row.id === optionId);
  const source = highlightSources().find(row => row.kind === key.kind);
  if (!candidate || !option || !source) return world;
  const next = cloneWorldWithColdHistory(world);
  const actor = next.cultivators.find(row => row.id === key.actorId);
  const state = next.storyteller, row = state?.highlights?.at(-1);
  const former = world.cultivators.find(person => person.id === key.actorId);
  if (!actor || !former || !state || !row || row.chosen !== undefined || row.tick !== key.openedTick ||
      row.actorId !== key.actorId || row.kind !== key.kind || row.sourceId !== key.sourceId) return world;
  if (source.nextMonth && source.decision?.(next, actor, candidate, option.id, next.tick + 1)) {
    state.pendingHighlightChoice = { key: { ...key }, optionId: option.id };
    row.chosen = option.id;
    delete state.highlightOffer;
    return next;
  }
  if (source.choose) {
    if (!source.choose(next, actor, candidate, option.id)) return world;
  } else {
    const decision = source.decision?.(next, actor, candidate, option.id);
    if (!decision) return world;
    const emit = (event: Parameters<typeof recordAuxiliaryActionEvent>[1]) => recordAuxiliaryActionEvent(next, event);
    const event = applyCultivatorBrainDecision(next, actor, decision, worldRandom(next), undefined, emit, decision);
    if (!event) return world;
    emit(event);
  }
  const tags: ConsequenceTag[] = [];
  if (actor.hp < former.hp) tags.push('injury');
  if (actor.lifespan !== former.lifespan) tags.push('lifespan');
  if (!actor.alive && former.alive) tags.push('death_risk');
  if (actor.realm !== former.realm || actor.realmStage !== former.realmStage) tags.push('breakthrough');
  if (actor.sectId !== former.sectId || actor.sectRank !== former.sectRank) tags.push('sect');
  if (JSON.stringify(actor.artifacts) !== JSON.stringify(former.artifacts) ||
      JSON.stringify(actor.pills) !== JSON.stringify(former.pills)) tags.push('item');
  if (JSON.stringify(actor.technique) !== JSON.stringify(former.technique) ||
      JSON.stringify(actor.daoPath) !== JSON.stringify(former.daoPath)) tags.push('technique');
  if (tags.length) row.consequences = tags;
  row.chosen = option.id;
  const previousEventIds = new Set(world.events.map(event => event.id));
  const mainEvent = next.events.find(event => event.tick === world.tick && event.actorIds.includes(actor.id) &&
    !previousEventIds.has(event.id));
  if (mainEvent) row.resolutionEventId = mainEvent.id;
  if (mainEvent || key.kind !== 'heart_demon' && key.kind !== 'forbidden_art') row.resolutionTick = world.tick;
  delete state.highlightOffer;
  return next;
}

/** The exact queued decision is re-admitted during the chosen actor's ordinary future action window. */
export function takeDirectorHighlightDecision(world: WorldState, actor: Cultivator) {
  const state = world.storyteller, pending = state?.pendingHighlightChoice;
  if (!state || !pending || pending.key.actorId !== actor.id || pending.key.openedTick !== world.tick - 1) return;
  const source = highlightSources().find(row => row.kind === pending.key.kind);
  delete state.pendingHighlightChoice;
  const row = state.highlights?.at(-1);
  if (!row || !source?.nextMonth || !source.decision || row.chosen !== pending.optionId ||
      row.actorId !== actor.id || row.tick !== pending.key.openedTick || row.kind !== pending.key.kind ||
      row.sourceId !== pending.key.sourceId || !eligible(world, actor)) return;
  const candidate = source.probe(world, actor, world.tick).find(candidate =>
    sameCandidate(candidate, pending.key) && candidate.options.some(option => option.id === pending.optionId));
  const decision = candidate && source.decision(world, actor, candidate, pending.optionId, world.tick);
  return decision && { row, decision };
}
