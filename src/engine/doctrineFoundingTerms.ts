import type {WorldState} from '../types/world';

export const DOCTRINE_FOUNDING_TERM_TICKS=6;
export const DOCTRINE_FOUNDING_MIN_MEMBERS=3;
export const DOCTRINE_FOUNDING_MIN_WALLET=25;
export const DOCTRINE_FOUNDING_MIN_SUPPORT_QI=45;
export const doctrineFoundingId=(schoolId:string,proposedTick:number)=>`doctrine-founding-${schoolId}-${proposedTick}`;
export const independentDoctrineSectId=(schoolId:string)=>`sect-independent-${schoolId}`;

export const doctrineFoundingPinnedAutonomyIds=(world:WorldState):Set<string>=>new Set(world.doctrineFoundings.foundings.map(row=>row.autonomyProposalId));
export const doctrineFoundingPinnedRelocationIds=(world:WorldState):Set<string>=>new Set(world.doctrineFoundings.foundings.map(row=>row.relocationPlanId));
