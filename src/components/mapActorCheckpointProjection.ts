import { activeDanxiaMedicineEscort, danxiaMedicineCheckpoint, danxiaMedicineParties } from '../engine/danxiaMedicineTerms';
import { courierCheckpoint } from '../engine/sealedCourierEngine';
import { pilgrimageCheckpoint } from '../engine/pilgrimageEngine';
import { expeditionRescueCheckpoint } from '../engine/expeditionRescueCheckpoint';
import { boundaryReliefCheckpoint } from '../engine/boundaryReliefCheckpoint';
import { disasterShelterCheckpoint } from '../engine/disasterShelterCheckpoint';
import { canSeeMarketFreightCheckpoint, marketFreightCheckpoint } from '../engine/marketFreightCheckpoint';
import { currentVisibleTileIds, terrainTileAt } from '../engine/terrainEngine';
import { onLowerPlane } from '../engine/upperPassageIsolation';
import type { Cultivator, MapPoint, WorldState } from '../types/world';

const MEDICINE = 1, RESCUE = 2, RELIEF = 4, SHELTER = 8, FREIGHT = 16, COURIER = 32, PILGRIMAGE = 64;
const shelterTravel = (status: string) => status === 'outbound' || status === 'returning' || status === 'stranded';

/**
 * One fresh coarse pass, only a “may have a moving role” hint. Never store a winning row,
 * coordinates, or viewers here: the native helpers still own dates, first-match semantics and access.
 */
function checkpointCandidates(world: WorldState) {
  const roles = new Map<string, number>();
  const include = (id: string | undefined, role: number) => {
    if (id !== undefined) roles.set(id, (roles.get(id) ?? 0) | role);
  };
  let guarded = false;

  for (const row of world.danxiaMedicine.commitments) {
    if (row.status === 'in_transit' || row.status === 'arrived' || row.status === 'returning' || row.status === 'lost')
      include(row.escortId, MEDICINE);
  }
  for (const row of world.expeditionRescues.requests) {
    if (row.status !== 'extracting' && !(row.status === 'interrupted' && row.pathIndex > 0)) continue;
    guarded = true;
    include(row.explorerId, RESCUE);
    include(row.rescuerId, RESCUE);
  }
  for (const row of world.boundaryReliefs.cases) {
    if (row.status !== 'travelling' && row.status !== 'returning') continue;
    guarded = true;
    include(row.incomingId, RELIEF);
  }
  for (const row of world.disasterShelter?.cases ?? []) {
    if (!shelterTravel(row.status)) continue;
    guarded = true;
    include(row.guest.actorId, SHELTER);
  }
  for (const row of world.escorts.contracts) {
    if (row.status !== 'active' || !row.freight?.dispatch) continue;
    guarded = true;
    include(row.escortId, FREIGHT);
  }
  for (const row of world.couriers.dispatches) {
    if (row.status === 'in_transit' || row.status === 'returning') include(row.courierId, COURIER);
  }
  for (const row of world.pilgrimages.journeys) {
    if (row.status !== 'active') continue;
    include(row.organizerId, PILGRIMAGE);
    include(row.companionId, PILGRIMAGE);
  }
  for(const fork of world.pilgrimageForks?.forks??[])for(const choice of fork.choices){
    if(choice.status==='traveling'||choice.status==='closed'&&choice.steps?.length)include(choice.actorId,PILGRIMAGE);
  }
  return { roles, guarded };
}

interface CheckpointMapScope {
  viewer: Cultivator | undefined;
  above: boolean;
  current: ReadonlySet<string> | undefined;
  hiddenGates: ReadonlySet<string>;
  isCurrentLocation: (id: string) => boolean;
}

/** Kept separately from actor marker geometry: this is still only the current authorized world view. */
export function projectMapActorsAtCheckpoints(world: WorldState, scope: CheckpointMapScope) {
  const trailPositions = new Map<string, MapPoint>();
  const extractionPositions = new Map<string, MapPoint>();
  const boundaryPositions = new Map<string, MapPoint>();
  const { above, current: viewCurrent, isCurrentLocation, hiddenGates, viewer } = scope;
  const liveActors: Cultivator[] = [];
  if (above) return { liveActors, trailPositions, extractionPositions, boundaryPositions };
  const { roles, guarded } = checkpointCandidates(world);
  const exactViewer = viewer && world.cultivators.includes(viewer) ? viewer : undefined;
  const guardedTravelTiles = guarded ? (viewCurrent ?? (viewer?.alive ? currentVisibleTileIds(world, viewer) : new Set<string>())) : undefined;
  for (const actor of world.cultivators) {
    if (!actor.alive || !onLowerPlane(actor) || hiddenGates.has(actor.locationId)) continue;
    const role = roles.get(actor.id) ?? 0;
    const medicinal = role & MEDICINE ? activeDanxiaMedicineEscort(world, actor) : undefined;
    if (medicinal) {
      if (!exactViewer || !danxiaMedicineParties(medicinal).includes(exactViewer.id)) continue;
      const point = danxiaMedicineCheckpoint(world, actor);
      if (!point || (viewCurrent && !viewCurrent.has(terrainTileAt(world, point.x, point.y)?.id ?? ''))) continue;
      trailPositions.set(actor.id, point);
      liveActors.push(actor);
      continue;
    }
    const rescue = (role & RESCUE) && guardedTravelTiles ? expeditionRescueCheckpoint(world, actor) : undefined;
    const relief = (role & RELIEF) && guardedTravelTiles ? boundaryReliefCheckpoint(world, actor) : undefined;
    const shelter = role & SHELTER ? disasterShelterCheckpoint(world, actor) : undefined;
    if (shelter && (!exactViewer || !world.disasterShelter?.cases.some(({ guest, host, status }) =>
      guest.actorId === actor.id && shelterTravel(status) &&
      (guest.actorId === exactViewer.id || host.actorId === exactViewer.id)))) continue;
    const freight = role & FREIGHT ? marketFreightCheckpoint(world, actor) : undefined;
    if (freight && !canSeeMarketFreightCheckpoint(world, actor, viewer)) continue;
    const checkpoint = rescue ?? relief ?? shelter ?? freight ??
      (role & COURIER ? courierCheckpoint(world, actor) : undefined) ??
      (role & PILGRIMAGE ? pilgrimageCheckpoint(world, actor) : undefined);
    if (!checkpoint) {
      if (isCurrentLocation(actor.locationId)) liveActors.push(actor);
      continue;
    }
    const tiles = rescue || relief || shelter || freight ? guardedTravelTiles : viewCurrent;
    if (tiles && !tiles.has(terrainTileAt(world, checkpoint.x, checkpoint.y)?.id ?? '')) continue;
    trailPositions.set(actor.id, checkpoint);
    if (rescue) extractionPositions.set(actor.id, rescue);
    if (relief) boundaryPositions.set(actor.id, relief);
    liveActors.push(actor);
  }
  return { liveActors, trailPositions, extractionPositions, boundaryPositions };
}
