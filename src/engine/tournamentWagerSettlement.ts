import type {WorldEvent,WorldOccasion,WorldState} from '../types/world';
import {isFreshTournamentArenaTerminal,tournamentArenaPrizeId} from './tournamentArenaEngine';
import {exactEvent,live,sameOrder,TOURNAMENT_WAGER_STAKES,tournamentWagerId,unique} from './tournamentWagerTerms';

type Outcome = { kind: 'void' } | { kind: 'champion'; winnerId: string };
function verifiedOutcome(world: WorldState, occasion: WorldOccasion, proof: WorldEvent): Outcome | undefined {
  const arena = occasion.arena, terminal = arena?.terminal;
  if (!arena || !terminal || occasion.kind !== 'tournament' || occasion.omenId ||
      unique(world.occasions, occasion.id) !== occasion || !isFreshTournamentArenaTerminal(occasion, proof) ||
      terminal.tick !== world.tick || terminal.status !== occasion.status || terminal.eventId !== proof.id ||
      occasion.lastResolvedTick !== world.tick || arena.openedTick >= world.tick) return undefined;
  if (terminal.status === 'cancelled') {
    return !occasion.championId && !arena.prize && exactEvent(world, occasion, proof, 'close') ? { kind: 'void' } : undefined;
  }
  const winnerId = occasion.championId;
  const last = arena.rounds.at(-1), final = last?.bouts[0];
  if (!winnerId || !arena.seededIds.includes(winnerId) || !exactEvent(world, occasion, proof, 'champion') ||
      !sameOrder(proof.actorIds, [winnerId]) || last?.tick !== world.tick || last.round !== occasion.round ||
      last.eventId !== proof.id || last.bouts.length !== 1 || final?.winnerId !== winnerId) return undefined;
  if (!final.secondId) return final.firstId === winnerId && !arena.prize ? { kind: 'void' } : undefined;
  if (final.firstId === final.secondId || !arena.seededIds.includes(final.firstId) || !arena.seededIds.includes(final.secondId) ||
      (winnerId !== final.firstId && winnerId !== final.secondId) || arena.prize?.tick !== world.tick ||
      arena.prize.actorId !== winnerId || arena.prize.artifactId !== tournamentArenaPrizeId(occasion.id)) return undefined;
  return { kind: 'champion', winnerId };
}

/** Native current-month finalization hook, atomic with the actual original championship/cancellation. */
export function settleTournamentWagers(world: WorldState, occasion: WorldOccasion, proof: WorldEvent): void {
  const state = world.tournamentWagers;
  if (!state?.tickets.length) return;
  const ticket = unique(state.tickets, tournamentWagerId(occasion.id));
  const arena = occasion.arena;
  if (!ticket || !arena || ticket.status !== 'open' || ticket.settlement ||
      ticket.arenaId !== occasion.id || ticket.siteId !== occasion.locationId || ticket.placedTick !== arena.openedTick ||
      !TOURNAMENT_WAGER_STAKES.includes(ticket.stake) || !arena.seededIds.includes(ticket.contenderId) ||
      occasion.participantIds.includes(ticket.spectatorId) ||
      state.tickets.filter(row => row.arenaId === occasion.id).length !== 1) return;
  const outcome = verifiedOutcome(world, occasion, proof);
  if (!outcome) return;
  const bearer = unique(world.cultivators, ticket.spectatorId);
  let payout = 0, award = 0;
  if (!live(bearer)) {
    ticket.status = 'forfeited';
  } else if (outcome.kind === 'void') {
    ticket.status = 'refunded';
    payout = ticket.stake;
  } else if (ticket.contenderId === outcome.winnerId) {
    ticket.status = 'won';
    award = ticket.stake; // Explicit virtual arena spectacle endowment, never somebody else’s money.
    payout = ticket.stake + award;
  } else {
    ticket.status = 'lost';
  }
  if (bearer && payout) bearer.spiritStones += payout;
  ticket.settlement = { tick: world.tick, eventId: proof.id, payout, award,
    ...(outcome.kind === 'champion' ? { winnerId: outcome.winnerId } : {}) };
}
