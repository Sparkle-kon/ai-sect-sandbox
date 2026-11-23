import type { Cultivator, WorldState } from '../../types/world';
import { canSeedRoguelikeEncounter, roguelikeEncounterRoute } from '../roguelikeEncounterEngine';
import { directorKnownReachableSites } from './nudgeIntegrations';
import type { DirectorNudge } from './nudge';

/** Plan only; probes and seeds do not move actors or reserve a settled outcome. */
export function seedEncounterApproach(world: WorldState, actor: Cultivator): DirectorNudge | undefined {
  if (!canSeedRoguelikeEncounter(world, actor)) return undefined;
  const site = directorKnownReachableSites(world, actor).find(candidate => roguelikeEncounterRoute(world, actor.locationId, candidate.id));
  return site ? {kind:'encounter_ticket',actorId:actor.id,targetSiteId:site.id,reason:'encounter',expiresTick:world.tick+3} : undefined;
}
