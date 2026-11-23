import type { WorldEvent, WorldState } from '../types/world';
import { isPrivateMercyReunionEvent } from './mercyReunion';
import { archiveChronicleEvents } from './novelGenerator';
import { witnessEvent } from './rumorEngine';

/** Publish to the native turn when available; otherwise commit to the same hot feed and archive. */
export function recordAuxiliaryActionEvent(world: WorldState, event: WorldEvent, emit?: (value: WorldEvent) => void): void {
  if (emit) { emit(event); return; }
  if(!isPrivateMercyReunionEvent(event))witnessEvent(world,event);
  archiveChronicleEvents(world,[event]);
  world.events = [event, ...world.events].slice(0, 120);
}
