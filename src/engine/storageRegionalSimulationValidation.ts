import type {LocationNode,RegionalRoute,WorldState} from '../types/world';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {REGIONAL_SIMULATION_AUDIT_YEARS,regionForPoint,SIMULATION_REGIONS} from './regionalSimulationEngine';

const stableSite=(item:LocationNode|undefined):item is LocationNode=>!!item&&item.type!=='secret_realm'&&
  item.type!=='abyss'&&!isScopedExpeditionGate(item);
function nativeRouteTicks(world:WorldState):Map<string,number|undefined>{
  const ticks=new Map<string,number|undefined>();
  for(const row of world.roads.links)ticks.set(`road:${row.id}`,row.openedTick);
  for(const row of world.boundaryReliefs.cases)ticks.set(`boundary_relief:${row.id}`,row.acceptedTick);
  for(const row of world.expeditionRescues.requests)ticks.set(`expedition_rescue:${row.id}`,row.acceptedTick);
  for(const row of world.couriers.dispatches)ticks.set(`courier:${row.id}`,row.acceptedTick);
  for(const row of world.escorts.contracts)ticks.set(`escort:${row.id}`,row.acceptedTick);
  for(const row of world.relocations.plans)ticks.set(`relocation:${row.id}`,row.departedTick);
  for(const row of world.villageSupply.agreements)ticks.set(`village_supply:${row.id}`,row.acceptedTick);
  for(const row of world.danxiaMedicine.commitments)ticks.set(`danxia_medicine:${row.id}`,row.acceptedTick);
  for(const row of world.pilgrimages.journeys)ticks.set(`pilgrimage:${row.id}`,row.startedTick);
  return ticks;
}
const routePatterns={
  road:/^road-([1-9][0-9]*)$/u,
  boundary_relief:/^boundary-relief-([1-9][0-9]*)$/u,
  expedition_rescue:/^expedition-rescue-([1-9][0-9]*)$/u,
  courier:/^sealed-dispatch-([1-9][0-9]*)$/u,
  escort:/^escort-([1-9][0-9]*)$/u,
  relocation:/^relocation-([1-9][0-9]*)$/u,
  pilgrimage:/^(pilgrimage-([1-9][0-9]*)):(0|1)$/u,
  village_supply:/^village-supply-([1-9][0-9]*)$/u,
  danxia_medicine:/^danxia-medicine-danxia-shortage-care-followup-([1-9][0-9]*)$/u,
} as const;
function routeIdentity(world:WorldState,route:RegionalRoute):string|undefined{
  const match=routePatterns[route.kind].exec(route.id);
  const serial=Number(match?.[route.kind==='pilgrimage'?2:1]);
  const caps={road:world.roads.nextId,boundary_relief:world.boundaryReliefs.nextId,expedition_rescue:world.expeditionRescues.nextId,
    courier:world.couriers.nextId,escort:world.markets.nextId,relocation:world.relocations.nextId,
    pilgrimage:world.pilgrimages.nextId,village_supply:world.villageSupply.nextId,danxia_medicine:world.careFollowups.nextId};
  return match&&Number.isSafeInteger(serial)&&serial<caps[route.kind]?
    `${route.kind}:${route.kind==='pilgrimage'?match[1]:route.id}`:undefined;
}
const yearOf=(world:WorldState,tick:number)=>world.year+Math.floor((world.month-1+tick-world.tick)/12);

/** Version 1 validates ontological records and clocks, not equality with the all-monthly RNG path. */
export function validateRegionalSimulation(world:WorldState,fail:(path:string)=>never):void{
  const state=world.regionalSimulation;
  if(!state)return; // Older native saves never silently become coarse simulations.
  const places=new Map(world.locations.map(row=>[row.id,row]));
  const actors=new Set(world.cultivators.map(row=>row.id));
  const villages=new Map(world.settlements.villages.map(row=>[row.id,row]));
  const focus=places.get(state.focusSiteId);
  if(!stableSite(focus)||!regionForPoint(world,focus))fail('regionalSimulation.focus');
  const registrations=new Map<string,number>();
  const regions=new Map(SIMULATION_REGIONS.map((id,index)=>[id,index]));
  for(const row of state.registrations){
    const key=`${row.kind}:${row.id}`;
    if(registrations.has(key)||row.registeredTick<1||row.registeredTick>world.tick)
      fail('regionalSimulation.registrations.time');
    if(row.kind==='actor'){
      if(!actors.has(row.id))fail('regionalSimulation.registrations.actor');
    }else{
      const canonical=row.kind==='site'?places.get(row.id):places.get(villages.get(row.id)?.locationId??'');
      if(!stableSite(canonical)||regionForPoint(world,canonical)!==row.originRegionId)
        fail('regionalSimulation.registrations.location');
    }
    registrations.set(key,row.registeredTick);
  }
  if(!registrations.has(`site:${state.focusSiteId}`))fail('regionalSimulation.registrations.focus');
  const routes=new Set<string>(),nativeTicks=state.routes.length?nativeRouteTicks(world):undefined;
  for(const row of state.routes){
    const key=`${row.kind}:${row.id}`;
    const reference=routeIdentity(world,row),knownTick=reference?nativeTicks?.get(reference):undefined;
    if(!reference||routes.has(key)||row.firstKnownTick<1||row.firstKnownTick>world.tick||!row.regions.length||
      row.regions.some((region,i)=>i>0&&regions.get(region)!<=regions.get(row.regions[i-1])!)||
      nativeTicks?.has(reference)&&(knownTick===undefined||knownTick>row.firstKnownTick))fail('regionalSimulation.routes');
    routes.add(key);
  }
  const deferred=new Set<string>(), activeActorMonths=new Map<string,number>();
  for(const row of state.actors){
    const registered=registrations.get(`actor:${row.actorId}`);
    const width=((world.month-1+row.lastDeferredTick-world.tick)%12+12)%12+1;
    const key=`${row.actorId}:${row.regionId}`;
    const yearKey=`${row.actorId}:${row.year}`;
    const total=(activeActorMonths.get(yearKey)??0)+row.deferredMonths;
    if(deferred.has(key)||registered===undefined||row.lastDeferredTick<registered||row.lastDeferredTick>world.tick||
      row.year!==yearOf(world,row.lastDeferredTick)||row.deferredMonths>width||
      row.deferredMonths>row.lastDeferredTick-registered+1||row.deferredMonths>0&&(row.year!==world.year||world.month===12)||
      total>12)fail('regionalSimulation.deferred');
    deferred.add(key);activeActorMonths.set(yearKey,total);
  }
  const annual=new Set<string>(), annualMonths=new Map<number,number>();
  for(const row of state.annual){
    const key=`${row.year}:${row.regionId}`;
    const expectedTick=world.tick-(12*(world.year-row.year)+world.month-12);
    const total=(annualMonths.get(row.year)??0)+row.actorMonths+row.waivedActorMonths;
    if(annual.has(key)||row.tick!==expectedTick||row.tick<1||row.tick>world.tick||row.year>world.year||
      row.actors>actors.size||row.actorMonths<row.actors||row.actorMonths>row.actors*12||row.qiAdded>row.actorMonths||
      row.actorMonths+row.waivedActorMonths<1||total>actors.size*12||
      row.hpAdded>row.actorMonths*10_000_000+row.actors)fail('regionalSimulation.annual');
    annual.add(key);annualMonths.set(row.year,total);
  }
  // Annual reports may be pruned on the next actual settlement, not by requesting unrelated views.
  if(annual.size>REGIONAL_SIMULATION_AUDIT_YEARS*SIMULATION_REGIONS.length)fail('regionalSimulation.annual.limit');
}
