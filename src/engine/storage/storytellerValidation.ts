import type { WorldState } from '../../types/world';
import { STORYTELLER_MOVES, STORYTELLER_STORYLET_MOVES, storytellerOfferId } from '../../types/storytellerDirector';

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
  if (!offer) return;
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
}
