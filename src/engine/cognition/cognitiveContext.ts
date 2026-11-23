import type { Cultivator, WorldState } from '../../types/world';

export interface CognitiveSnapshot {
  cultivator: Cultivator;
  world: WorldState;
  requestTick: number;
}

export interface CognitiveRequestOptions {
  signal?: AbortSignal;
  onStart?: () => void;
}
