import type { RouteWarningHazardProof, RouteWarningObservation, WorldState } from '../types/world';

export const ROUTE_WARNING_EVIDENCE_TICKS=4;
const LIFESPAN={meteor:3,beast_tide:4,cursed_miasma:6} as const;
export function routeWarningExpiry(observation:Pick<RouteWarningObservation,'hazard'|'observedTick'>):number {
  return Math.min(observation.hazard.expiresTick,observation.observedTick+ROUTE_WARNING_EVIDENCE_TICKS);
}
export function routeWarningEdgeKey(observation:Pick<RouteWarningObservation,'hazard'|'fromTileId'|'toTileId'>):string {
  const {hazard,fromTileId,toTileId}=observation;
  return JSON.stringify([hazard.id,...(fromTileId<toTileId?[fromTileId,toTileId]:[toTileId,fromTileId])]);
}

/** Authenticated source shape also survives an expired or replaced hazard; never infer a current hazard from it. */
export function routeWarningHazardValid(world:WorldState,proof:RouteWarningHazardProof,observedTick:number):boolean {
  if(!Number.isSafeInteger(observedTick) || observedTick<0 || !Number.isSafeInteger(proof.createdTick) ||
      proof.createdTick<0 || observedTick<proof.createdTick || observedTick>=proof.expiresTick ||
      !Number.isSafeInteger(proof.intensity) || proof.intensity<1 || proof.intensity>3 ||
      !Object.hasOwn(LIFESPAN,proof.kind) || proof.expiresTick!==proof.createdTick+LIFESPAN[proof.kind]) return false;
  const naturalPrefix=`natural-beast-tide-${proof.createdTick}-`;
  const serial=Number(/^hazard-([1-9]\d*)-/.exec(proof.id)?.[1]);
  const attributed=proof.kind==='beast_tide' && proof.intensity===1 && proof.id.startsWith(naturalPrefix) &&
    world.spiritBeasts.some((beast)=>beast.kind==='凶兽' && beast.id===proof.id.slice(naturalPrefix.length));
  const brushed=Number.isSafeInteger(serial) && serial<=world.interventionSequence &&
    proof.id===`hazard-${serial}-${proof.tileId}`;
  if(!attributed && !brushed) return false;
  const retained=world.mapHazards.find((row)=>row.id===proof.id);
  return !retained || (['id','kind','tileId','createdTick','expiresTick','intensity'] as const).every((key)=>proof[key]===retained[key]);
}
