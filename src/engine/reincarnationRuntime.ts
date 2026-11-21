import type { WorldEvent, WorldState } from '../types/world';
import { recordReincarnationDeath } from './reincarnationEngine';

/** Only actual living-to-dead transitions can use a canonical death event as proof. */
export function recordNewDeathsForReincarnation(before: WorldState, after: WorldState, events: readonly WorldEvent[]): void {
  const recorded = events.filter((event) => event.category === 'death' && event.tick === after.tick);
  if (!recorded.length) return;
  const previousLiving = new Set(before.cultivators.filter((actor) => actor.alive && actor.hp > 0).map(({ id }) => id));
  const newlyEnlisted = new Set(after.settlements.records
    .filter((row) => row.kind === 'recruitment' && row.tick === after.tick).map(({ cultivatorId }) => cultivatorId));
  const newlyDead = new Map(after.cultivators.filter((actor) =>
    !actor.alive && actor.hp === 0 && (previousLiving.has(actor.id) || newlyEnlisted.has(actor.id))).map((actor) => [actor.id, actor]));
  // Process latest first: a survivor named in an earlier accident may die later the same turn.
  for (const event of recorded.reverse()) for (const id of event.actorIds) {
    if (id === event.duelWinnerId) continue;
    const actor = newlyDead.get(id);
    if (!actor) continue;
    recordReincarnationDeath(after, actor, event);
    newlyDead.delete(id);
  }
}
