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
    if (point.tick <= configuredTick || index > 0 && point.tick <= pulse[index - 1].tick ||
      offered !== (point.reason !== undefined) || tone !== undefined && tone !== point.offeredTone ||
      offered && point.tick > lastOfferTick || !offered && point.tick === lastOfferTick ||
      offer?.openedTick === point.tick && point.offeredTone !== STORYTELLER_STORYLET_TONES[offer.storyletId] ||
      previousOpened === point.tick && lastOutcome !== undefined &&
        point.offeredTone !== STORYTELLER_STORYLET_TONES[lastOutcome.storyletId])
      fail('storyteller.pulse.history');
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
  if (!offer) return validatePulse(state, previousOpened, fail);
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
}
