import { projectChronicleLead, publicChronicleSceneEvents } from '../engine/chronicleLead';
import { visibleCausalChronicle } from '../engine/chronicleCausalityEngine';
import { createPublicDialogueResolver } from '../engine/publicDialogueProvenance';
import { projectEarnedChronicleLead, projectProtagonistSuccession } from '../engine/protagonistSuccession';
import { projectWitnessedPersonalStory } from '../engine/witnessedPersonalStory';
import type { Cultivator, WorldState } from '../types/world';
import { readSelectedRosterScene } from './rosterStoryRead';

/** Only this exact visible snapshot supplies public prose, speaker resolution and the active story line. */
export function projectScopedPublicChronicle(world: WorldState) {
  const events=publicChronicleSceneEvents(world);
  const earned=world.protagonistSuccession.lastEvaluatedTick!==undefined;
  return {
    events,
    dialogue:createPublicDialogueResolver(world),
    succession:earned?projectProtagonistSuccession(world):undefined,
    lead:earned?projectEarnedChronicleLead(world,events,world.tick):projectChronicleLead(world),
  };
}

/** A detached body copied from another branch cannot grant its personal scene authority by its ID alone. */
export function projectScopedPersonalChronicle(world: WorldState, viewer: Cultivator | undefined, eventId?: string) {
  if(!viewer?.alive||viewer.hp<=0||!world.cultivators.includes(viewer)||
    world.cultivators.filter(actor=>actor.id===viewer.id).length!==1)return;
  return eventId?readSelectedRosterScene(world,viewer.id,eventId):projectWitnessedPersonalStory(world,viewer.id);
}

export const projectScopedCausalChronicle=(world:WorldState,viewerId:string|null)=>
  new Map(visibleCausalChronicle(world,viewerId,120).map(row=>[row.entry.eventId,row]));
