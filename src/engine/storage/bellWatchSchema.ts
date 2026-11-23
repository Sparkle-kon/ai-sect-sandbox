import { trueOnly } from './schemaFields';
import { arr, id, num, one, optional, otick, structure, tick } from './primitives';

const loss = num(0, 100, true);
const listener = { actorId: id, siteId: id };

export const bellWatchShape = structure({
  id, sectId: id, openedTick: tick, watcherId: id,
  listeners: arr(8, structure(listener)),
  damage: optional(structure({
    hazard: structure({
      id, kind: one('meteor', 'beast_tide', 'cursed_miasma'), tileId: id,
      createdTick: tick, expiresTick: tick, intensity: num(1, 3),
    }),
    tick, integrityBefore: loss, integrityAfter: loss,
  })),
  choice: optional(structure({
    move: one('inspect', 'reroute'), tick, pathTileIds: arr(6400, id), pathIndex: num(0, 6399, true),
    destinationId: id, lastMovedTick: otick, endedTick: otick,
    outcome: optional(one('inspected', 'arrived', 'blocked', 'absent')), returning: optional(trueOnly),
  })),
  receipts: arr(8, structure({ ...listener, tick })),
  waits: optional(arr(8, structure({ ...listener, tick }))),
});
