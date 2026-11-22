import { describe, expect, it } from 'vitest';
import { activeAvatar, possessAvatar } from '../src/engine/avatarEngine';
import {
  availableTournamentWager, placeTournamentWager, projectTournamentWager, settleTournamentWagers,
  tournamentWagerId, type TournamentWagerRequest,
} from '../src/engine/tournamentWagerEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';
import {
  actualTournament, actualTournamentOpen, actualTournamentSignup, tournamentActor, tournamentFrame, tournamentId,
} from './tournamentArenaNativeFixture';

const spectator = 'elder-danxia-1', other = 'elder-taixu-1', siteId = 'loc-market';
const toMarket: LLMDecisionPayload = { chosenAction: 'EXPLORE', targetLocationId: siteId, innerMonologue: '去坊市观礼。' };
function actualSpectatorOpening(attach = true) {
  const enrolled = actualTournamentSignup(actualTournamentOpen());
  const eve = tournamentFrame(enrolled, { [spectator]: toMarket, [other]: toMarket });
  const world = tournamentFrame(eve);
  expect([spectator, other].every(id => tournamentActor(world, id).locationId === siteId)).toBe(true);
  expect(actualTournament(world)).toMatchObject({ locationId: siteId, status: 'running', round: 0,
    arena: { openedTick: world.tick, rounds: [] } });
  expect(world.events).toContainEqual(expect.objectContaining({ id: `evt-${world.tick}-${tournamentId}-commence` }));
  if (attach) expect(possessAvatar(world, spectator)).toBe(true);
  return world;
}
function finish(world: WorldState) {
  let frame = world;
  while (frame.tick < world.tick + 12 && actualTournament(frame).status === 'running') frame = tournamentFrame(frame);
  return frame;
}
const request = (contenderId: string, stake: TournamentWagerRequest['stake'] = 20): TournamentWagerRequest =>
  ({ arenaId: tournamentId, spectatorId: spectator, contenderId, stake });
const ticket = (world: WorldState) => world.tournamentWagers?.tickets.find(({ arenaId }) => arenaId === tournamentId);

describe('fictional arena fan predictions follow the exact original whole native result', () => {
  it('places one immutable same-month local ticket, charged to the exact bearer, then pays only actual won or lost', () => {
    const start = actualSpectatorOpening();
    const baseline = finish(start);
    const champion = actualTournament(baseline).championId!;
    expect(actualTournament(baseline).arena?.prize?.actorId).toBe(champion);
    expect(availableTournamentWager(start, tournamentId)).toEqual({
      arenaId: tournamentId, spectatorId: spectator, contenderIds: actualTournament(start).arena!.seededIds, stakes: [5, 10, 20],
    });
    for (const pick of [champion, actualTournament(start).arena!.seededIds.find(id => id !== champion)!]) {
      const openingBalance = tournamentActor(start, spectator).spiritStones;
      const paid = placeTournamentWager(start, request(pick));
      expect(paid).not.toBe(start);
      expect(paid.tick).toBe(start.tick);
      expect(paid.random).toEqual(start.random);
      expect(paid.events).toEqual(start.events);
      expect(tournamentActor(paid, spectator).spiritStones).toBe(openingBalance - 20);
      expect(tournamentActor(start, spectator).spiritStones).toBe(openingBalance);
      expect(ticket(start)).toBeUndefined();
      expect(projectTournamentWager(paid, tournamentId)).toMatchObject({ id: tournamentWagerId(tournamentId), stake: 20,
        arenaId: tournamentId, spectatorId: spectator, contenderId: pick, placedTick: start.tick, status: 'open' });
      expect(availableTournamentWager(paid, tournamentId)).toBeUndefined();
      expect(placeTournamentWager(paid, request(pick))).toBe(paid);

      const first = tournamentFrame(paid);
      expect(ticket(first)?.status).toBe('open');
      const ended = finish(first);
      const won = pick === champion;
      expect(ticket(ended)).toMatchObject({ status: won ? 'won' : 'lost', settlement: {
        tick: ended.tick, eventId: `evt-${ended.tick}-${tournamentId}-champion`, winnerId: champion,
        payout: won ? 40 : 0, award: won ? 20 : 0,
      } });
      expect(actualTournament(ended).arena).toEqual(actualTournament(baseline).arena);
      expect(tournamentActor(ended, spectator).spiritStones - tournamentActor(baseline, spectator).spiritStones).toBe(won ? 20 : -20);
      const after = tournamentFrame(ended);
      expect(ticket(after)).toEqual(ticket(ended));
      expect(tournamentActor(after, spectator).spiritStones).toBe(tournamentActor(ended, spectator).spiritStones);
    }
  });

  it('fails closed for a wrong frame, spoofed body/request, uncertain presence and the second possessed body', () => {
    const noAvatar = actualSpectatorOpening(false);
    const contender = actualTournament(noAvatar).arena!.seededIds[0];
    expect(placeTournamentWager(noAvatar, request(contender))).toBe(noAvatar);
    expect(possessAvatar(noAvatar, spectator)).toBe(true);
    expect(placeTournamentWager(noAvatar, { ...request(contender), spectatorId: other })).toBe(noAvatar);
    expect(placeTournamentWager(noAvatar, request(spectator))).toBe(noAvatar);
    expect(placeTournamentWager(noAvatar, { ...request(contender), odds: 3 } as TournamentWagerRequest)).toBe(noAvatar);
    expect(placeTournamentWager(noAvatar, { ...request(contender), stake: 5.5 } as unknown as TournamentWagerRequest)).toBe(noAvatar);
    const first = tournamentFrame(noAvatar);
    expect(placeTournamentWager(first, request(contender))).toBe(first);
    for (const mutation of [
      (world: WorldState) => { tournamentActor(world, spectator).locationId = 'loc-danxia'; },
      (world: WorldState) => { tournamentActor(world, spectator).spiritStones = 4; },
      (world: WorldState) => { world.events.push({ ...world.events.find(row => row.id.endsWith('-commence'))! }); },
    ]) {
      const each = structuredClone(noAvatar);
      mutation(each);
      expect(availableTournamentWager(each, tournamentId)).toBeUndefined();
      expect(placeTournamentWager(each, request(contender))).toBe(each);
    }
    const paid = placeTournamentWager(noAvatar, request(contender));
    // An immediate possession change cannot occur natively; even a copied body context cannot create a second arena ticket.
    const switched = structuredClone(paid);
    switched.playerAvatar.switchAvailableTick = switched.tick;
    expect(possessAvatar(switched, other)).toBe(true);
    expect(activeAvatar(switched)?.id).toBe(other);
    expect(projectTournamentWager(switched, tournamentId)).toBeUndefined();
    expect(placeTournamentWager(switched, { ...request(contender), spectatorId: other })).toBe(switched);
  });

  it('refunds genuine native cancellation and an exact legacy walkover without a wagering winner', () => {
    const start = actualSpectatorOpening();
    const paid = placeTournamentWager(start, request(actualTournament(start).arena!.seededIds[0], 10));
    const lostVenue = structuredClone(paid);
    lostVenue.locations = lostVenue.locations.filter(({ id }) => id !== siteId);
    const cancelled = tournamentFrame(lostVenue);
    expect(actualTournament(cancelled).arena?.terminal?.status).toBe('cancelled');
    expect(ticket(cancelled)).toMatchObject({ status: 'refunded', settlement: {
      tick: cancelled.tick, eventId: `evt-${cancelled.tick}-${tournamentId}-close`, payout: 10, award: 0,
    } });
    expect(ticket(cancelled)?.settlement?.winnerId).toBeUndefined();
    expect(tournamentActor(cancelled, spectator).spiritStones).toBe(tournamentActor(start, spectator).spiritStones);

    const semifinal = tournamentFrame(tournamentFrame(paid));
    const absent = actualTournament(semifinal).remainingIds[1];
    expect(absent).toBeDefined();
    tournamentActor(semifinal, absent).locationId = 'loc-tianji'; // The actual final now has only one physically present original.
    const walkover = tournamentFrame(semifinal), arena = actualTournament(walkover).arena!;
    expect(arena.prize).toBeUndefined();
    expect(arena.rounds.at(-1)?.bouts).toHaveLength(1);
    expect(arena.rounds.at(-1)?.bouts[0].secondId).toBeUndefined();
    expect(ticket(walkover)).toMatchObject({ status: 'refunded', settlement: {
      eventId: arena.terminal?.eventId, payout: 10, award: 0,
    } });
    expect(ticket(walkover)?.settlement?.winnerId).toBeUndefined();
  });

  it('never accepts a fabricated finale or redirects the original dead bearer’s ticket', () => {
    const start = actualSpectatorOpening();
    const paid = placeTournamentWager(start, request(actualTournament(start).arena!.seededIds[0], 5));
    const forged = structuredClone(paid), occ = actualTournament(forged);
    const fakeProof = { ...forged.events.find(row => row.id.endsWith('-commence'))!,
      id: `evt-${forged.tick}-${tournamentId}-champion` };
    settleTournamentWagers(forged, occ, fakeProof);
    expect(ticket(forged)?.status).toBe('open');
    expect(tournamentActor(forged, spectator).spiritStones).toBe(tournamentActor(paid, spectator).spiritStones);

    const doomed = structuredClone(paid);
    const bearer = tournamentActor(doomed, spectator);
    bearer.hp = 1; bearer.combatPower = 1;
    const witnessed = tournamentFrame(doomed, { [other]: { chosenAction: 'DUEL', targetCultivatorId: spectator, innerMonologue: '当面对决。' } });
    expect(tournamentActor(witnessed, spectator)).toMatchObject({ alive: false, hp: 0 });
    expect(witnessed.events.some(row => row.category === 'death' && row.actorIds.includes(spectator))).toBe(true);
    const closed = finish(witnessed);
    expect(actualTournament(closed).arena?.prize).toBeDefined();
    expect(ticket(closed)).toMatchObject({ status: 'forfeited', settlement: { tick: closed.tick, payout: 0, award: 0 } });
    expect(tournamentActor(closed, spectator).spiritStones).toBe(tournamentActor(witnessed, spectator).spiritStones);
    expect(tournamentActor(closed, other).spiritStones).toBe(tournamentActor(witnessed, other).spiritStones);
    expect(projectTournamentWager(closed, tournamentId)).toBeUndefined();
  });
});
