import type { WorldEvent, WorldState } from '../types/world';
import { matchesWitnessedPersonalScene } from './witnessedPersonalStory';

export function validateWitnessedPersonalStory(
  world: WorldState, actors: ReadonlySet<string>, fail: (path: string) => never,
): void {
  const { scenes } = world.witnessedPersonalStory;
  if (!scenes.length) return;
  const sites = new Set(world.locations.filter(({ type }) => type !== 'secret_realm' && type !== 'abyss').map(({ id }) => id));
  const originals = new Map<string, WorldEvent | null>();
  for (const event of world.events) originals.set(event.id, originals.has(event.id) ? null : event);
  const captured = new Set<string>();
  let previousTick = -1;
  // A forward seek can leave expired references until the next full simulation tick.
  // Expiry is enforced by projection and pruning, not by the save codec.
  for (const row of scenes) {
    const { eventId, tick, siteId, kind, actorIds, witnessIds } = row;
    const subjectCount = kind === 'breakthrough' ? 1 : 2;
    if (captured.has(eventId) || tick < previousTick || tick > world.tick ||
        !sites.has(siteId) || actorIds.length !== subjectCount || new Set(actorIds).size !== actorIds.length ||
        actorIds.some((id) => !actors.has(id) || !witnessIds.includes(id)) ||
        witnessIds.some((id,index) => !actors.has(id) || index > 0 && witnessIds[index - 1] >= id))
      return fail('witnessedPersonalStory.scenes.source');
    captured.add(eventId);
    previousTick = tick;
    const source = originals.get(eventId);
    // Manual public interventions can evict a hot source before the next turn prunes the window.
    // Even then the missing source cannot be projected or reconstructed from this witness index.
    if (source === null || source && !matchesWitnessedPersonalScene(row,source))
      return fail('witnessedPersonalStory.scenes.native');
  }
}
