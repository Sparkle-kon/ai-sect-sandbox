import type {Cultivator,RelocationPlan,SparringAgreement,WorldState} from '../types/world';

export const participant = (row: SparringAgreement, id: string) => row.proposerId === id || row.partnerId === id;

export const activeAt = (row: SparringAgreement, tick: number) => row.status === 'active' &&
  (row.acceptedTick ?? Infinity) < tick && tick < (row.deadlineTick ?? 0);

export function usedAfterAccept(row: SparringAgreement, id: string, tick: number) {
  return participant(row,id) && row.acceptedTick !== undefined && row.acceptedTick < tick && row.closedTick === tick;
}

export function sparringLocksActor(world: WorldState, actor: Cultivator): boolean {
  return world.sparring.agreements.some(row => participant(row,actor.id) &&
    (activeAt(row,world.tick) || usedAfterAccept(row,actor.id,world.tick)));
}


export function activeRelocationForActor(world: WorldState, actor: Cultivator): RelocationPlan | undefined {
  return world.relocations.plans.find((plan) => plan.status === 'in_transit' && plan.garrisonIds.includes(actor.id));
}


export const GUARD_DURATION = 6;
