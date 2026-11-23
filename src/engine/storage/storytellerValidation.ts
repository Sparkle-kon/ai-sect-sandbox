import type { HighlightOfferKey } from '../director/highlight';
import { DIRECTOR_NUDGE_MAX_MONTHS, directorNudgeKey } from '../director/nudge';
import type { WorldState } from '../../types/world';
import {
  STORYTELLER_MOVES, STORYTELLER_STORYLET_MOVES, STORYTELLER_STORYLET_TONES, storytellerOfferId,
  type StorytellerDirectorState, type StorytellerPulseReason, type StorytellerTone,
} from '../../types/storytellerDirector';

const reasonTones: Partial<Record<StorytellerPulseReason, StorytellerTone>> = {
  health: 'quiet', breather: 'quiet', open_road: 'journey', companion: 'journey',
  world_pressure: 'crisis', local_peril: 'crisis',
};

function validatePulse(
  state: StorytellerDirectorState, previousOpened: number | undefined, fail: (field: string) => never,
): void {
  const { pulse, configuredTick, lastAdvancedTick, lastOfferTick, tension, offer, lastOutcome } = state;
  if (pulse === undefined) return;
  const recent = pulse.at(-1);
  if (!recent || recent.tick !== lastAdvancedTick || recent.tension !== tension)
    return fail('storyteller.pulse.latest');
  const missingKnownOffer = (at: number): boolean => at >= pulse[0].tick && at <= recent.tick &&
    !pulse.some(point => point.tick === at && point.offeredTone !== undefined);
  if (missingKnownOffer(lastOfferTick) || previousOpened !== undefined && missingKnownOffer(previousOpened))
    fail('storyteller.pulse.history');
  for (const [index, point] of pulse.entries()) {
    const offered = point.offeredTone !== undefined;
    const tone = point.reason === undefined ? undefined : reasonTones[point.reason];
    const highlight = state.highlights?.find(row => row.tick === point.tick);
    const highlightTone = highlight?.kind === 'heart_demon' || highlight?.kind === 'forbidden_art' ? 'crisis' : 'journey';
    if (point.tick <= configuredTick || index > 0 && point.tick <= pulse[index - 1].tick ||
      offered !== (point.reason !== undefined) || tone !== undefined && tone !== point.offeredTone ||
      offered && point.tick > lastOfferTick && !highlight || !offered && point.tick === lastOfferTick ||
      highlight !== undefined && (point.offeredTone !== highlightTone || point.reason !== 'cadence') ||
      !highlight && offer?.openedTick === point.tick && point.offeredTone !== STORYTELLER_STORYLET_TONES[offer.storyletId] ||
      !highlight && previousOpened === point.tick && lastOutcome !== undefined &&
        point.offeredTone !== STORYTELLER_STORYLET_TONES[lastOutcome.storyletId])
      fail('storyteller.pulse.history');
  }
}

function validateHighlightState(
  world: WorldState, state: StorytellerDirectorState, actors: ReadonlySet<string>, sites: ReadonlySet<string>,
  fail: (field: string) => never,
): void {
  const { configuredTick, lastHighlightTick, highlightOffer, pendingHighlightChoice, highlights, nudges } = state;
  if (lastHighlightTick !== undefined && (lastHighlightTick < configuredTick || lastHighlightTick > world.tick) ||
      highlights?.length && highlights.at(-1)?.tick !== lastHighlightTick ||
      !highlights?.length && lastHighlightTick !== undefined && lastHighlightTick !== configuredTick)
    fail('storyteller.highlight.clock');
  const resolutionIds = new Set<string>();
  for (const [index, row] of (highlights ?? []).entries()) {
    if (!actors.has(row.actorId) || row.tick <= configuredTick || row.tick > world.tick ||
        index > 0 && row.tick <= highlights![index - 1].tick ||
        row.resolutionTick !== undefined && (row.chosen === undefined || row.resolutionTick < row.tick || row.resolutionTick > world.tick) ||
        row.consequences !== undefined && (row.chosen === undefined ||
          new Set(row.consequences).size !== row.consequences.length))
      fail('storyteller.highlight.history');
    const proof = row.resolutionEventId;
    if (proof !== undefined) {
      const at = row.resolutionTick;
      if (at === undefined || resolutionIds.has(proof)) return fail('storyteller.highlight.resolution');
      const native = world.events.filter(event => event.id === proof);
      const mustRetain = world.events.length < 120 || world.events.some(event => event.tick < at);
      if (native.length > 1 || !native.length && mustRetain || native.some(event =>
        event.tick !== at || !event.actorIds.includes(row.actorId)))
        fail('storyteller.highlight.resolution');
      resolutionIds.add(proof);
    }
  }
  const latest = highlights?.at(-1);
  const isKnownSite = (id: string) => sites.has(id) &&
    world.locations.some(site => site.id === id && site.expeditionOmenId === undefined);
  const isHighlightSite = (key: HighlightOfferKey): boolean => {
    if (isKnownSite(key.siteId)) return true;
    if (key.kind !== 'dungeon' || !sites.has(key.siteId)) return false;
    const gate = world.locations.find(site => site.id === key.siteId);
    if (gate?.type !== 'secret_realm' || !gate.expeditionOmenId) return false;
    const rows = world.occasions.filter(row => row.kind === 'expedition' && row.locationId === key.siteId &&
      row.omenId === gate.expeditionOmenId &&
      (row.id === key.sourceId || `${row.id}-registration` === key.sourceId));
    return rows.length === 1;
  };
  if (highlightOffer && (!latest || highlightOffer.openedTick !== latest.tick ||
      highlightOffer.actorId !== latest.actorId || highlightOffer.kind !== latest.kind ||
      highlightOffer.sourceId !== latest.sourceId || latest.chosen !== undefined ||
      !isHighlightSite(highlightOffer)))
    fail('storyteller.highlight.offer');
  if (pendingHighlightChoice) {
    const { key, optionId } = pendingHighlightChoice;
    if (highlightOffer || !latest || latest.chosen !== optionId || latest.resolutionTick !== undefined ||
        key.openedTick !== world.tick || key.openedTick !== latest.tick || key.actorId !== latest.actorId ||
        key.kind !== latest.kind || key.sourceId !== latest.sourceId || !isHighlightSite(key))
      fail('storyteller.highlight.pendingChoice');
  }
  const keys = new Set<string>();
  for (const row of nudges ?? []) {
    const key = directorNudgeKey(row);
    if (row.expiresTick <= world.tick || row.expiresTick > world.tick + DIRECTOR_NUDGE_MAX_MONTHS ||
        keys.has(key) || 'actorId' in row && !actors.has(row.actorId) ||
        row.kind === 'npc_accept_bias' && (!actors.has(row.towardActorId) || row.towardActorId === row.actorId) ||
        'targetSiteId' in row && !isKnownSite(row.targetSiteId) || 'siteId' in row && !isKnownSite(row.siteId))
      fail('storyteller.nudges');
    keys.add(key);
  }
}

/** The director holds an invitation to try a real action, never a substitute outcome or a world event. */
export function validateStoryteller(
  world: WorldState, actors: ReadonlySet<string>, sites: ReadonlySet<string>, fail: (field: string) => never,
): void {
  const state = world.storyteller;
  if (!state) return;
  const { configuredTick, lastOfferTick, lastAdvancedTick, focusActorId, offer, lastOutcome } = state;
  if (configuredTick > world.tick || lastOfferTick < configuredTick || lastOfferTick > world.tick ||
    lastAdvancedTick === undefined && (lastOfferTick !== configuredTick || offer !== undefined || lastOutcome !== undefined) ||
    lastAdvancedTick !== undefined && (lastAdvancedTick < configuredTick || lastAdvancedTick > world.tick ||
      lastOfferTick > lastAdvancedTick) ||
    focusActorId !== undefined && !actors.has(focusActorId))
    fail('storyteller.clock');

  let previousOpened: number | undefined;
  if (lastOutcome) {
    const { offerId, actorId, storyletId, tick } = lastOutcome;
    const opening = /^storyteller-([1-9]\d*)-[a-f0-9]{8}$/u.exec(offerId);
    const opened = Number(opening?.[1]);
    if (!Number.isSafeInteger(opened) || opened < configuredTick || opened > lastOfferTick ||
      !actors.has(actorId) || offerId !== storytellerOfferId(opened, actorId, storyletId) ||
      !STORYTELLER_STORYLET_MOVES[storyletId].includes(lastOutcome.move) ||
      tick <= opened || tick > opened + 3 || tick > world.tick)
      fail('storyteller.outcome');
    previousOpened = opened;
  }
  if (!offer) {
    validatePulse(state, previousOpened, fail);
    return validateHighlightState(world, state, actors, sites, fail);
  }
  const { id, storyletId, actorId, siteId, openedTick, expiresTick, optionMoves, targetActorId, targetSiteId } = offer;
  const publicSite = (id: string) => sites.has(id) && world.locations.some(site =>
    site.id === id && site.type !== 'secret_realm' && site.type !== 'abyss' && site.expeditionOmenId === undefined);
  const authored = STORYTELLER_STORYLET_MOVES[storyletId];
  if (openedTick !== lastOfferTick || openedTick < configuredTick ||
    expiresTick < world.tick || expiresTick <= openedTick || expiresTick > openedTick + 3 ||
    previousOpened !== undefined && (previousOpened >= openedTick || (lastOutcome?.tick ?? Infinity) > openedTick) ||
    id !== storytellerOfferId(openedTick, actorId, storyletId) || !actors.has(actorId) || !publicSite(siteId) ||
    optionMoves[0] !== 'rest' || optionMoves[1] !== 'cultivate' ||
    optionMoves.some((move, index) => !authored.includes(move) ||
      index !== 0 && STORYTELLER_MOVES.indexOf(optionMoves[index - 1]) >= STORYTELLER_MOVES.indexOf(move)) ||
    storyletId === 'shared-tea' && !optionMoves.includes('talk') ||
    (storyletId === 'mountain-road' || storyletId === 'retreat-from-danger') && !optionMoves.includes('travel'))
    fail('storyteller.offer');
  if ((targetActorId !== undefined) !== optionMoves.includes('talk') ||
    targetActorId !== undefined && (targetActorId === actorId || !actors.has(targetActorId)) ||
    (targetSiteId !== undefined) !== optionMoves.includes('travel') ||
    targetSiteId !== undefined && (targetSiteId === siteId || !publicSite(targetSiteId)))
    fail('storyteller.targets');
  validatePulse(state, previousOpened, fail);
  validateHighlightState(world, state, actors, sites, fail);
}
