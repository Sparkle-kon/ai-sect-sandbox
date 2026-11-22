import type { WorldState } from '../types/world';
import { projectProtagonistSuccession } from '../engine/protagonistSuccession';
import { projectWitnessedPersonalStory, type WitnessedPersonalStoryView } from '../engine/witnessedPersonalStory';

export interface ActorRosterScene {
  readonly actorId: string;
  readonly eventId: string;
  readonly title: string;
}

export interface RosterStoryReadStamp {
  readonly snapshot: WorldState;
  readonly scopeKey: string;
  readonly scene: ActorRosterScene;
}

export function projectRosterFocalId(world: WorldState): string | undefined {
  const lead = projectProtagonistSuccession(world, world.tick).active;
  if (!lead) return undefined;
  const roots = world.cultivators.filter(({ id }) => lead.actorId === id);
  return roots.length === 1 && roots[0].alive && roots[0].hp > 0 ? lead.actorId : undefined;
}

function uniqueNativeView(world: WorldState, actorId: string): WitnessedPersonalStoryView | undefined {
  const view = projectWitnessedPersonalStory(world, actorId);
  if (!view) return undefined;
  const counts = new Map<string, number>();
  for (const row of world.witnessedPersonalStory.scenes) counts.set(row.eventId, (counts.get(row.eventId) ?? 0) + 1);
  return { ...view, scenes: view.scenes.filter(({ eventId }) => counts.get(eventId) === 1) };
}

/** A roster shortcut is a read receipt for one actual recent scene, not permission to move or possess the actor. */
export function projectRosterStoryRead(world: WorldState, scopeKey: string, actorId: string | undefined | null): RosterStoryReadStamp | undefined {
  if (!actorId || !scopeKey) return undefined;
  const next = uniqueNativeView(world, actorId)?.scenes[0];
  return next && { snapshot: world, scopeKey, scene: { actorId, eventId: next.eventId, title: next.title } };
}

export function sameRosterScene(left: ActorRosterScene, right: ActorRosterScene): boolean {
  return left.actorId === right.actorId && left.eventId === right.eventId && left.title === right.title;
}

export function resolveRosterStoryRead(world: WorldState, scopeKey: string, stamp: RosterStoryReadStamp): WitnessedPersonalStoryView | undefined {
  if (stamp.snapshot !== world || stamp.scopeKey !== scopeKey) return undefined;
  const latest = projectRosterStoryRead(world, scopeKey, stamp.scene.actorId);
  if (!latest || !sameRosterScene(latest.scene, stamp.scene)) return undefined;
  return readSelectedRosterScene(world, stamp.scene.actorId, stamp.scene.eventId);
}

/** After a read is opened, loss of the specific scene never substitutes a different or merely similar event. */
export function readSelectedRosterScene(world: WorldState, actorId: string, eventId: string): WitnessedPersonalStoryView | undefined {
  const view = uniqueNativeView(world, actorId);
  if (!view) return undefined;
  return { ...view, scenes: view.scenes.filter((entry) => entry.eventId === eventId) };
}
