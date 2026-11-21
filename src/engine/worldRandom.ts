import type { WorldRandomState, WorldState } from '../types/world';

export const DEFAULT_WORLD_SEED = 2031;
export const MAX_WORLD_SEED = 4_294_967_295;
export const isWorldSeed = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_WORLD_SEED;

export function createWorldRandom(seed: number): WorldRandomState {
  if (!isWorldSeed(seed)) throw new RangeError('世界种子必须是 0 至 4294967295 的整数。');
  return { algorithm: 'mulberry32-v1', seed, state: seed };
}

/** Only an accepted world snapshot retains the advanced cursor. */
export function randomFromState(cursor: WorldRandomState): () => number {
  return () => {
    cursor.state = (cursor.state + 0x6d2b79f5) >>> 0;
    let bits = cursor.state;
    bits = Math.imul(bits ^ (bits >>> 15), bits | 1);
    bits ^= bits + Math.imul(bits ^ (bits >>> 7), bits | 61);
    return ((bits ^ (bits >>> 14)) >>> 0) / 0x100000000;
  };
}

export function worldRandom(world: WorldState): () => number {
  return randomFromState(world.random);
}

/** Concurrent fallback actors cannot race on a shared simulation RNG cursor. */
export function actorFallbackRandom(world: WorldState, actorId: string, tick: number): () => number {
  let hash = 2166136261;
  for (let index = 0; index < actorId.length; index++) hash = Math.imul(hash ^ actorId.charCodeAt(index), 16777619);
  const seed = (hash ^ world.random.state ^ Math.imul(tick, 0x9e3779b9)) >>> 0;
  return randomFromState(createWorldRandom(seed));
}
