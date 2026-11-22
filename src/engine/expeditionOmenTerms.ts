import type { Cultivator, ExpeditionOmen, LocationNode, WorldOccasion, WorldState } from '../types/world';

/** Registered, linked gate interiors are not lawful ordinary exploration destinations. */
export function isScopedExpeditionGate(location: LocationNode): boolean {
  return location.type === 'secret_realm' && location.expeditionOmenId !== undefined;
}

export const expeditionOmenNativeRun = (world: WorldState, row: ExpeditionOmen) => {
  const byActor = world.fieldObservatories.byActor;
  const run = Object.hasOwn(byActor, row.operatorId) ? byActor[row.operatorId].runs.find(r => r.openedTick === row.openedTick) : undefined;
  return run?.status === 'measured' && !run.station && run.locationId === row.siteId && run.targetTick === row.measuredTick &&
    run.reading.kind === row.reading.kind && run.reading.intensity === row.reading.intensity ? run : undefined;
};
export const expeditionOmenLearnedAt = (row: ExpeditionOmen, actorId: string, tick: number): number | undefined =>
  row.operatorId === actorId && row.measuredTick <= tick ? row.measuredTick :
  row.relay?.recipientId === actorId && row.relay.tick <= tick ? row.relay.tick : undefined;
export const expeditionOmenAt = (world: WorldState, occasion: WorldOccasion) => world.expeditionOmens.rows.find(row =>
  row.id === occasion.omenId && row.siteId === occasion.anchorSiteId && row.opening?.occasionId === occasion.id &&
  row.opening.tick === occasion.startedTick);

/** A known, actually registered entrant at an already-running gate. Prospective registration has additional rules. */
export function hasKnownExpeditionRosterMember(world:WorldState,actor:Cultivator,occasion:WorldOccasion):boolean {
  const row=expeditionOmenAt(world,occasion);
  return !!row&&world.cultivators.includes(actor)&&occasion.participantIds.includes(actor.id)&&
    !!expeditionOmenNativeRun(world,row)&&expeditionOmenLearnedAt(row,actor.id,world.tick)!==undefined;
}
