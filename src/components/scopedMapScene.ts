import type { WorldState } from '../types/world';
import { buildMapActorBadgeView } from './mapActorBadgeView';
import { buildMapCombatVfxPlan } from './mapCombatVfxView';
import { buildMapPresentation } from './mapPresentationView';
import { buildProtectiveArrayDomes } from './protectiveArrayDomeView';
import { projectSiegeFormationVfx } from './siegeFormationVfxPlan';
import type { createTerrainMapView, mapActorPositions } from './terrainMapView';

type TerrainView = ReturnType<typeof createTerrainMapView>;
type ActorPositions = ReturnType<typeof mapActorPositions>;

/** Compile one already-authorized map frame for the canvas, focus index and text summary. */
export function buildScopedMapScene(
  world: WorldState, mapView: TerrainView, actorPositions: ActorPositions, historical = false,
) {
  const motionSnapshot = buildMapPresentation(world, mapView, actorPositions);
  const combatVfx = buildMapCombatVfxPlan(world, mapView, motionSnapshot);
  const battlefieldBySite = new Map(combatVfx.battlefields?.map(row => [row.location.id, row]));
  const domes = buildProtectiveArrayDomes(world, mapView, combatVfx);
  const domesBySite = new Map(domes.map(dome => [dome.location.id, dome]));
  const actorBadgeFacts = buildMapActorBadgeView(world, mapView, combatVfx, !historical);
  const hasBadgeQuote = [...actorBadgeFacts.values()].some(fact => !!fact.quote);
  const presentation = { routes: motionSnapshot.routes, effects: combatVfx.effects };
  const formationFrames = projectSiegeFormationVfx(
    world, new Map(mapView.seenLocations.map(location => [location.id, location])), mapView.isCurrentLocation,
    actorPositions.filter(({ actor }) => !mapView.trailPositions.has(actor.id) && !presentation.routes.has(actor.id)),
  );
  return { motionSnapshot, combatVfx, battlefieldBySite, domes, domesBySite, actorBadgeFacts, hasBadgeQuote,
    presentation, formationFrames };
}
