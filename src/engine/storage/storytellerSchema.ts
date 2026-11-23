import { CONSEQUENCE_TAGS, DIRECTOR_HIGHLIGHT_LIMIT, HIGHLIGHT_KINDS } from '../director/highlight';
import { DIRECTOR_NUDGE_LIMIT } from '../director/nudge';
import {
  STORYTELLER_MOVES, STORYTELLER_PULSE_LIMIT, STORYTELLER_PULSE_REASONS, STORYTELLER_STORYLETS, STORYTELLER_STYLES,
  STORYTELLER_WORLD_BEATS,
} from '../../types/storytellerDirector';
import { arr, fail, id, num, oid, one, optional, otick, structure, tick, type Validator } from './primitives';

const scene = one(...STORYTELLER_STORYLETS);
const move = one(...STORYTELLER_MOVES);

const kind = one(...HIGHLIGHT_KINDS);
const highlightKey = structure({ kind, sourceId: id, actorId: id, siteId: id, openedTick: tick });
const consequences = arr(CONSEQUENCE_TAGS.length, one(...CONSEQUENCE_TAGS));
const nudgeRules = {
  travel_bias: structure({ kind: one('travel_bias'), actorId: id, targetSiteId: id, reason: kind, expiresTick: tick,
    weight: num(0, 100) }),
  encounter_ticket: structure({ kind: one('encounter_ticket'), actorId: id, targetSiteId: id, reason: one('encounter'), expiresTick: tick }),
  omen_bias: structure({ kind: one('omen_bias'), siteId: id, reason: one('dungeon', 'tournament'), expiresTick: tick }),
  npc_accept_bias: structure({ kind: one('npc_accept_bias'), actorId: id, towardActorId: id, reason: kind, expiresTick: tick,
    delta: num(-100, 100) }),
} as const;
const nudge: Validator = (value, path) => {
  if (!value || typeof value !== 'object' || !('kind' in value)) return fail(path);
  switch (value.kind) {
    case 'travel_bias': return nudgeRules.travel_bias(value, path);
    case 'encounter_ticket': return nudgeRules.encounter_ticket(value, path);
    case 'omen_bias': return nudgeRules.omen_bias(value, path);
    case 'npc_accept_bias': return nudgeRules.npc_accept_bias(value, path);
    default: return fail(`${path}.kind`);
  }
};

export const storytellerShape = structure({
  style: one(...STORYTELLER_STYLES.map(row => row.id)),
  focusActorId: oid,
  configuredTick: tick,
  lastOfferTick: tick,
  lastAdvancedTick: otick,
  tension: num(0, 100, true),
  offer: optional(structure({
    id, storyletId: scene, actorId: id, siteId: id, openedTick: tick, expiresTick: tick,
    optionMoves: arr(STORYTELLER_MOVES.length, move), targetActorId: oid, targetSiteId: oid,
  })),
  lastOutcome: optional(structure({ offerId: id, actorId: id, storyletId: scene, move, tick })),
  lastHighlightTick: otick,
  highlightOffer: optional(highlightKey),
  pendingHighlightChoice: optional(structure({ key: highlightKey, optionId: id })),
  highlights: optional(arr(DIRECTOR_HIGHLIGHT_LIMIT, structure({
    tick, kind, sourceId: id, actorId: id, chosen: oid, resolutionTick: otick, resolutionEventId: oid, consequences: optional(consequences),
  }))),
  nudges: optional(arr(DIRECTOR_NUDGE_LIMIT, nudge)),
  pulse: optional(arr(STORYTELLER_PULSE_LIMIT, structure({
    tick, tension: num(0, 100, true), worldBeat: one(...STORYTELLER_WORLD_BEATS),
    offeredTone: optional(one('quiet', 'journey', 'crisis')), reason: optional(one(...STORYTELLER_PULSE_REASONS)),
  }))),
});
