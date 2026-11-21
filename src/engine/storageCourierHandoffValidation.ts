import type { LocationNode, SealedDispatch, WorldState } from '../types/world';
import { COURIER_TILE_STRIDE, courierPublicPath } from './sealedCourierEngine';
import { terrainTileAt } from './terrainEngine';

export function validateCourierHandoffHistory(
  world: WorldState, row: SealedDispatch, sites: ReadonlyMap<string, LocationNode>,
  actors: ReadonlySet<string>, fail: (path: string) => never,
): void {
  const record = row.handoff;
  if (!record) {
    if (row.originalCourierId !== undefined) fail('couriers.handoff.untrackedCourier');
    return;
  }
  const { postId, tileId, path, pathIndex, arrivedTick, fromPathIndex, fromCourierId, candidateId,
    offeredTick, settledTick, status, reason, lastHeldTick, furthestPathIndex, terminal, turnback } = record;
  const original = row.originalCourierId, start = sites.get(row.originId), end = sites.get(row.destinationId);
  const currentPost = sites.get(postId);
  const knownPosition = path[pathIndex];
  const traveling = row.status === 'in_transit' || row.status === 'returning';
  const awaiting = status === 'arrived' || status === 'offered';
  const transferred = status === 'transferred';
  const expectedFrom = (arrivedTick - (row.acceptedTick ?? arrivedTick) - 1) * COURIER_TILE_STRIDE;
  if (row.acceptedTick === undefined || row.deadlineTick === undefined || !original || original !== fromCourierId ||
      !actors.has(original) || original === row.senderId || original === row.recipientId ||
      row.courierId !== (transferred ? candidateId : original) ||
      (candidateId !== undefined && (!actors.has(candidateId) || [original,row.senderId,row.recipientId].includes(candidateId))) ||
      arrivedTick <= row.acceptedTick || arrivedTick > world.tick || path.length < 3 ||
      !knownPosition || pathIndex >= path.length - 1 || pathIndex <= fromPathIndex ||
      fromPathIndex !== expectedFrom || pathIndex - fromPathIndex > COURIER_TILE_STRIDE ||
      arrivedTick + 2 + Math.ceil((path.length - 1 - pathIndex) / COURIER_TILE_STRIDE) >= row.deadlineTick ||
      postId === row.originId || postId === row.destinationId || terrainTileAt(world,knownPosition.x,knownPosition.y)?.id !== tileId ||
      !currentPost || terrainTileAt(world,currentPost.x,currentPost.y)?.id !== tileId ||
      (awaiting && currentPost.type !== 'market' &&
        !world.sects.some((sect) => sect.headquartersId === postId && currentPost.ownerSectId === sect.id)))
    return fail('couriers.handoff.source');
  const expected = start && end ? courierPublicPath(world,start,end) : undefined;
  if (expected && (expected.length !== path.length || expected.some((p,i) => p.x !== path[i].x || p.y !== path[i].y)) ||
      start && (path[0].x !== start.x || path[0].y !== start.y) ||
      end && (path.at(-1)?.x !== end.x || path.at(-1)?.y !== end.y) ||
      traveling && (row.path.length !== path.length || row.path.some((p,i) => p.x !== path[i].x || p.y !== path[i].y)))
    return fail('couriers.handoff.path');
  if ((candidateId === undefined) !== (offeredTick === undefined) ||
      (offeredTick !== undefined && (offeredTick !== arrivedTick + 1 || offeredTick > world.tick)) ||
      (lastHeldTick !== undefined && (lastHeldTick < arrivedTick + 1 || lastHeldTick > arrivedTick + 2 || lastHeldTick > world.tick)) ||
      (offeredTick !== undefined && (lastHeldTick ?? 0) < offeredTick) ||
      (awaiting !== (settledTick === undefined)) ||
      (settledTick !== undefined && (settledTick < arrivedTick || settledTick > arrivedTick + 3 || settledTick > world.tick ||
        (offeredTick !== undefined && (settledTick < offeredTick || status !== 'interrupted' && settledTick === offeredTick)))) ||
      (status === 'arrived' && (offeredTick !== undefined || world.tick > arrivedTick + 1)) ||
      (status === 'offered' && (offeredTick === undefined || world.tick > arrivedTick + 2)) ||
      (awaiting && (row.status !== 'in_transit' || row.pathIndex !== pathIndex || row.lastAdvancedTick !== arrivedTick)) ||
      ((status === 'transferred' || status === 'declined') &&
        (offeredTick === undefined || settledTick !== arrivedTick + 2 || lastHeldTick !== settledTick)) ||
      ((status === 'missed' || status === 'interrupted') !== (reason !== undefined)) ||
      (status === 'missed' && (reason !== (offeredTick === undefined ? 'unoffered' : 'unconfirmed'))) ||
      (status === 'interrupted' && (reason === 'unoffered' || reason === 'unconfirmed')))
    return fail('couriers.handoff.lifecycle');
  if (furthestPathIndex < pathIndex || furthestPathIndex >= path.length ||
      traveling && row.pathIndex > furthestPathIndex ||
      row.status === 'in_transit' && (row.pathIndex !== furthestPathIndex || turnback !== undefined) ||
      row.status === 'returning' && turnback === undefined ||
      turnback && (turnback.tick < arrivedTick || turnback.tick > (row.settledTick ?? world.tick) ||
        turnback.pathIndex !== furthestPathIndex || (transferred && turnback.tick <= settledTick!) ||
        ((turnback.reason === 'recipient_absent' || turnback.reason === 'recipient_unavailable') &&
          turnback.pathIndex !== path.length - 1)) ||
      (traveling === (terminal !== undefined)) ||
      terminal && (terminal.tick !== row.settledTick || terminal.tick < (settledTick ?? arrivedTick) ||
        terminal.status !== row.status || terminal.courierId !== row.courierId ||
        terminal.pathIndex > furthestPathIndex ||
        (terminal.status === 'delivered' && (terminal.pathIndex !== path.length - 1 || turnback !== undefined)) ||
        (terminal.status === 'returned' && (terminal.pathIndex !== 0 || turnback === undefined))))
    return fail('couriers.handoff.travel');
}
