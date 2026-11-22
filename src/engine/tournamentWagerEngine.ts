import type { TournamentWagerStake, TournamentWagerTicket } from '../types/tournamentWager';
import type { WorldOccasion, WorldState } from '../types/world';
import { activeAvatar } from './avatarEngine';
import { boundaryReliefCheckpoint } from './boundaryReliefCheckpoint';
import { cloneWorldWithColdHistory } from './coldHistoryEngine';
import { disasterShelterCheckpoint } from './disasterShelterCheckpoint';
import { activeEscortForActor } from './escortEngine';
import { isScopedExpeditionGate } from './expeditionOmenTerms';
import { expeditionRescueCheckpoint } from './expeditionRescueCheckpoint';
import { pilgrimageCheckpoint } from './pilgrimageEngine';
import { activeRelocationForActor } from './relocationEngine';
import { activeCourierForActor } from './sealedCourierEngine';
import { terrainTileAt } from './terrainEngine';
import {exactEvent,live,sameOrder,TOURNAMENT_WAGER_HISTORY,TOURNAMENT_WAGER_STAKES,tournamentWagerId,unique} from './tournamentWagerTerms';
export {TOURNAMENT_WAGER_HISTORY,TOURNAMENT_WAGER_STAKES,tournamentWagerId} from './tournamentWagerTerms';
export {settleTournamentWagers} from './tournamentWagerSettlement';

export interface TournamentWagerAvailability {
  arenaId: string;
  spectatorId: string;
  contenderIds: readonly string[];
  stakes: readonly TournamentWagerStake[];
}

export interface TournamentWagerRequest {
  arenaId: string;
  spectatorId: string;
  contenderId: string;
  stake: TournamentWagerStake;
}

function spectatorHere(world: WorldState, arena: WorldOccasion) {
  const actor = activeAvatar(world);
  if (!live(actor) || unique(world.cultivators, actor.id) !== actor || actor.positionPlane !== undefined ||
      actor.locationId !== arena.locationId || arena.participantIds.includes(actor.id) ||
      activeCourierForActor(world, actor) || activeEscortForActor(world, actor) || activeRelocationForActor(world, actor) ||
      boundaryReliefCheckpoint(world, actor) || disasterShelterCheckpoint(world, actor) || expeditionRescueCheckpoint(world, actor) ||
      pilgrimageCheckpoint(world, actor)) return undefined;
  return actor;
}

/** One player ticket per whole arena. Another occupied body cannot read the ticket or place a second one. */
export function availableTournamentWager(world: WorldState, arenaId: string): TournamentWagerAvailability | undefined {
  const occasion = unique(world.occasions, arenaId);
  const arena = occasion?.arena;
  if (!occasion || !arena || occasion.kind !== 'tournament' || occasion.omenId || occasion.status !== 'running' ||
      arena.openedTick !== world.tick || occasion.lastResolvedTick !== world.tick || occasion.expiresTick <= world.tick ||
      occasion.round !== 0 || occasion.bouts.length || arena.rounds.length || arena.terminal || arena.prize ||
      ![8, 16].includes(arena.seededIds.length) || new Set(arena.seededIds).size !== arena.seededIds.length ||
      !sameOrder(arena.seededIds, occasion.remainingIds) ||
      world.tournamentWagers?.tickets.some(ticket => ticket.arenaId === arenaId)) return undefined;
  const site = unique(world.locations, occasion.locationId);
  if (!site || (site.type !== 'market' && site.type !== 'sect_hq') || isScopedExpeditionGate(site) ||
      !terrainTileAt(world, site.x, site.y)) return undefined;
  const source = unique(world.events, `evt-${world.tick}-${arenaId}-commence`);
  if (!source || !exactEvent(world, occasion, source, 'commence') || !sameOrder(source.actorIds, occasion.participantIds)) return undefined;
  const spectator = spectatorHere(world, occasion);
  if (!spectator || !Number.isFinite(spectator.spiritStones)) return undefined;
  const contenders = arena.seededIds.filter(id => {
    const actor = unique(world.cultivators, id);
    return live(actor) && actor.positionPlane === undefined && actor.locationId === site.id && occasion.participantIds.includes(id);
  });
  const stakes = TOURNAMENT_WAGER_STAKES.filter(stake => spectator.spiritStones >= stake);
  return contenders.length === arena.seededIds.length && stakes.length
    ? { arenaId, spectatorId: spectator.id, contenderIds: contenders, stakes } : undefined;
}

/** Ticket prose and facts are a private possession view, never placed in the public arena DTO. */
export function projectTournamentWager(world: WorldState, arenaId: string): TournamentWagerTicket | undefined {
  const actor = activeAvatar(world);
  if (!live(actor) || unique(world.cultivators, actor.id) !== actor) return undefined;
  const ticket = unique(world.tournamentWagers?.tickets ?? [], tournamentWagerId(arenaId));
  return ticket?.arenaId === arenaId && ticket.spectatorId === actor.id ? structuredClone(ticket) : undefined;
}

const requestKeys = ['arenaId', 'spectatorId', 'contenderId', 'stake'] as const;
function preciseRequest(request: unknown): request is TournamentWagerRequest {
  if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).length !== requestKeys.length ||
      !requestKeys.every(key => Object.hasOwn(request, key))) return false;
  const row = request as Partial<TournamentWagerRequest>;
  return typeof row.arenaId === 'string' && typeof row.spectatorId === 'string' && typeof row.contenderId === 'string' &&
    row.stake !== undefined && TOURNAMENT_WAGER_STAKES.includes(row.stake);
}

/** A deliberate local fictional action, not an AI action or an advance. The staked stones leave the real game inventory. */
export function placeTournamentWager(world: WorldState, request: TournamentWagerRequest): WorldState {
  if (!preciseRequest(request)) return world;
  const { arenaId, contenderId, spectatorId, stake } = request;
  const offer = availableTournamentWager(world, arenaId);
  if (!offer || offer.spectatorId !== spectatorId || !offer.contenderIds.includes(contenderId) ||
      !offer.stakes.includes(stake)) return world;
  const occ = unique(world.occasions, arenaId);
  if (!occ) return world;
  const next = cloneWorldWithColdHistory(world);
  const bearer = unique(next.cultivators, spectatorId);
  if (!bearer) return world;
  const state = next.tournamentWagers ??= { tickets: [] };
  if (state.tickets.length >= TOURNAMENT_WAGER_HISTORY) {
    const spent = state.tickets.findIndex(ticket => ticket.status !== 'open');
    if (spent < 0 || state.tickets.length !== TOURNAMENT_WAGER_HISTORY) return world;
    state.tickets.splice(spent, 1);
  }
  bearer.spiritStones -= stake;
  state.tickets.push({
    id: tournamentWagerId(arenaId), arenaId, siteId: occ.locationId, spectatorId, contenderId, stake,
    placedTick: next.tick, status: 'open',
  });
  return next;
}
