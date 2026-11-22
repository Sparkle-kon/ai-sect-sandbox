import type {Cultivator,SectSiege,WorldState} from '../types/world';

export const isActiveSiege=(siege:SectSiege)=>siege.status==='marching'||siege.status==='sieging';

export function activeSiegeForActor(world:WorldState,actor:Cultivator):SectSiege|undefined{
  return world.sieges.find(siege=>isActiveSiege(siege)&&siege.participantIds.includes(actor.id));
}
