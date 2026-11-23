import { STORYTELLER_MOVES, STORYTELLER_STORYLETS, STORYTELLER_STYLES } from '../../types/storytellerDirector';
import { arr, id, num, oid, one, optional, otick, structure, tick } from './primitives';

const scene = one(...STORYTELLER_STORYLETS);
const move = one(...STORYTELLER_MOVES);

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
});
