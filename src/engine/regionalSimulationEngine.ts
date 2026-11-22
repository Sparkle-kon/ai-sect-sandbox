import {onLowerPlane} from './upperPassageIsolation';
import { regionForPoint, SIMULATION_REGIONS } from './simulationRegionGeometry';
import { activeRegionalPromotionRegions } from './regionalPromotionEngine';
import { activeAvatar } from './avatarEngine';
import { boundaryReliefCheckpoint } from './boundaryReliefCheckpoint';
import { danxiaMedicineCheckpoint,danxiaMedicineActedThisTick } from './danxiaMedicineTerms';
import { expeditionRescueCheckpoint } from './expeditionRescueCheckpoint';
import { pilgrimageCheckpoint,pilgrimageActedThisTick } from './pilgrimageEngine';
import { courierCheckpoint,courierActedThisTick } from './sealedCourierEngine';
import { terrainTileAt } from './terrainEngine';
import { routeWarningHazardValid } from './routeWarningProof';
import { isScopedExpeditionGate } from './expeditionOmenTerms';
import { isTribulationActive } from './tribulationEngine';
import type { Cultivator, LLMDecisionPayload, LocationNode, MapPoint, RegionalRegistration, RegionalRoute,
  RegionalSimulationState, SimulationRegionId, WorldState } from '../types/world';

export const REGIONAL_SIMULATION_VERSION=1;
export const REGIONAL_SIMULATION_AUDIT_YEARS=12;
export { regionForColumn, regionForPoint, SIMULATION_REGIONS } from './simulationRegionGeometry';
export const SIMULATION_REGION_NAMES={west:'西境',center:'中州',east:'东境'} as const;
const alive=(actor:Cultivator)=>actor.alive&&actor.hp>0;
const site=(world:WorldState,id:string)=>world.locations.find(row=>row.id===id);
const open=(status:string)=>status==='active'||status==='offered'||status==='waiting'||status==='scheduled';
const risky=(place:LocationNode)=>place.type==='secret_realm'||place.type==='abyss'||isScopedExpeditionGate(place);

export function currentActorRegion(world:WorldState,actor:Cultivator):SimulationRegionId|undefined {
  if (!onLowerPlane(actor)) return undefined;
  const relocation=world.relocations.plans.find(row=>row.status==='in_transit'&&row.garrisonIds.includes(actor.id));
  const escort=world.escorts.contracts.find(row=>row.status==='active'&&row.escortId===actor.id);
  const proven=danxiaMedicineCheckpoint(world,actor)??courierCheckpoint(world,actor)??pilgrimageCheckpoint(world,actor)??
    boundaryReliefCheckpoint(world,actor)??expeditionRescueCheckpoint(world,actor)??
    (relocation?relocation.path[relocation.pathIndex]:undefined)??(escort?escort.path[escort.pathIndex]:undefined);
  return proven?regionForPoint(world,proven):regionForSite(world,actor.locationId);
}
function regionForSite(world:WorldState,id:string):SimulationRegionId|undefined {
  const place=site(world,id);
  return place&&regionForPoint(world,place);
}
const regKey=(kind:RegionalRegistration['kind'],id:string)=>`${kind}:${id}`;
const routeKey=(kind:RegionalRoute['kind'],id:string)=>`${kind}:${id}`;
function routeRegions(world:WorldState,path:readonly MapPoint[]) {
  const start=path[0],end=path.at(-1);
  if(!start||!end||path.length<2)return undefined;
  const ids=path.map(point=>regionForPoint(world,point));
  if(ids.some(item=>item===undefined))return undefined;
  const unique=new Set(ids);
  return SIMULATION_REGIONS.filter(id=>unique.has(id));
}

/** Enables only an explicit real watched canonical site, never map hover/random label. */
export function configureRegionalSimulation(world:WorldState,focusSiteId:string):boolean {
  const place=site(world,focusSiteId);
  if(!place||risky(place)||!regionForPoint(world,place))return false;
  if(world.regionalSimulation){
    if(world.regionalSimulation.version!==REGIONAL_SIMULATION_VERSION)return false;
    world.regionalSimulation.focusSiteId=focusSiteId;
  } else {
    world.regionalSimulation={version:REGIONAL_SIMULATION_VERSION,focusSiteId,registrations:[],routes:[],actors:[],annual:[]};
  }
  stampRegionalRegistry(world,world.regionalSimulation);
  return true;
}

function stampRegionalRegistry(world:WorldState,state:RegionalSimulationState):void {
  const existing=new Set(state.registrations.map(row=>regKey(row.kind,row.id)));
  const add=(kind:RegionalRegistration['kind'],id:string,originRegionId:SimulationRegionId|undefined)=>{
    const key=regKey(kind,id);
    if(!originRegionId||existing.has(key))return;
    existing.add(key);state.registrations.push({kind,id,originRegionId,registeredTick:world.tick});
  };
  world.locations.forEach(place=>{if(!risky(place))add('site',place.id,regionForPoint(world,place));});
  world.settlements.villages.forEach(row=>add('settlement',row.id,regionForSite(world,row.locationId)));
  world.cultivators.forEach(actor=>{if(!existing.has(regKey('actor',actor.id)))add('actor',actor.id,currentActorRegion(world,actor));});
  const routes=new Set(state.routes.map(row=>routeKey(row.kind,row.id)));
  const insert=(kind:RegionalRoute['kind'],id:string,points:readonly MapPoint[])=>{
    const key=routeKey(kind,id);
    if(routes.has(key))return;
    const regions=routeRegions(world,points);
    if(!regions?.length)return;
    routes.add(key);state.routes.push({kind,id,firstKnownTick:world.tick,regions});
  };
  for(const row of world.roads.links)insert('road',row.id,row.path);
  for(const row of world.boundaryReliefs.cases)if(row.acceptedTick!==undefined)insert('boundary_relief',row.id,row.path);
  for(const row of world.expeditionRescues.requests)if(row.acceptedTick!==undefined)insert('expedition_rescue',row.id,row.path);
  for(const row of world.couriers.dispatches)if(row.acceptedTick!==undefined)insert('courier',row.id,row.path);
  for(const row of world.escorts.contracts)if(row.acceptedTick!==undefined)insert('escort',row.id,row.path);
  for(const row of world.relocations.plans)if(row.departedTick!==undefined)insert('relocation',row.id,row.path);
  for(const row of world.pilgrimages.journeys)if(row.startedTick!==undefined)insert('pilgrimage',`${row.id}:${row.legIndex}`,row.path);
  for(const row of world.danxiaMedicine.commitments)if(row.acceptedTick!==undefined&&row.path)insert('danxia_medicine',row.id,row.path);
  const acceptedSupplies=world.villageSupply.agreements.filter(row=>row.acceptedTick!==undefined&&row.path?.length&&
    !routes.has(routeKey('village_supply',row.id)));
  const byId=acceptedSupplies.length?new Map(world.terrain.tiles.map(tile=>[tile.id,tile])):undefined;
  for(const row of acceptedSupplies){
    if(!row.path||!byId)continue;
    const points=row.path.map(id=>byId.get(id)).map(tile=>tile?
      {x:(tile.col+.5)*1000/world.terrain.columns,y:(tile.row+.5)*600/world.terrain.rows}:undefined);
    if(points.every((point):point is MapPoint=>!!point))insert('village_supply',row.id,points);
  }
}

/** Native lifecycle records are sampled only after authoritative turn completion. */
export function recordRegionalTurnRegistry(world:WorldState):void{
  const state=world.regionalSimulation;
  if(state?.version===REGIONAL_SIMULATION_VERSION)stampRegionalRegistry(world,state);
}

function activeParties(world:WorldState):Set<string> {
  const ids=new Set<string>();
  const add=(...keys:Array<string|undefined>)=>keys.forEach(key=>{if(key)ids.add(key);});
  for(const row of world.sects)add(row.leaderId);
  for(const row of world.couriers.dispatches)if(row.status==='offered'||row.status==='in_transit'||row.status==='returning')
    add(row.senderId,row.recipientId,row.courierId,row.handoff?.candidateId);
  for(const row of world.escorts.contracts)if(open(row.status))add(row.clientId,row.escortId);
  for(const row of world.relocations.plans)if(row.status==='voting'||row.status==='in_transit')add(row.proposerId,...row.garrisonIds,...row.voterIds);
  for(const row of world.pilgrimages.journeys)if(row.status==='proposed'||row.status==='active')add(row.organizerId,row.companionId);
  for(const row of world.sieges)if(row.status==='marching'||row.status==='sieging')add(...row.participantIds);
  for(const row of world.occasions)if(row.status==='registration'||row.status==='running')add(...row.participantIds);
  for(const row of world.expeditionRescues.requests)if(row.status==='extracting'||row.status==='signaled')add(row.explorerId,row.rescuerId);
  for(const row of world.boundaryReliefs.cases)if(row.status==='travelling'||row.status==='returning'||row.status==='offered')
    add(row.leaderId,row.incumbentId,row.incomingId);
  for(const row of world.danxiaMedicine.commitments)
    if(row.status==='offered'||row.status==='in_transit'||row.status==='arrived'||row.status==='returning'||row.status==='retained'||row.escrow>0)
      add(row.discipleId,row.patientId,row.escortId);
  for(const row of world.danxiaReviews.reviews)if(row.status==='open'||row.status==='proposed')
    add(row.patientId,row.discipleId,row.proposal?.representativeId);
  // The charts and cargo keep their own monthly systems. Protect just the actual contracting people
  // while they may need to act, including an unpaid claim after a voyage's terminal date.
  for(const row of world.frontier?.trade?.agreements??[])
    if(row.status==='offered'||row.status==='accepted'||row.status==='returning')add(row.northActorId,row.southActorId);
  for(const row of world.frontier?.drylands?.trade?.agreements??[])
    if(row.status==='offered'||row.status==='accepted'||row.status==='returning')add(row.westActorId,row.ridgeActorId);
  for(const row of world.frontier?.port?.trade?.agreements??[]){
    if(row.status==='offered'||row.status==='signed'){add(row.sellerId,row.buyerId);continue;}
    if(row.status==='shipping'){
      add(row.sellerId); // The hull, original salt, or paid roots are still in the seller's custody chain.
      if(row.voyage?.status==='outbound'||row.voyage?.status==='awaiting_buyer')add(row.buyerId);
    }
    if(row.roots==='refundable_inland')add(row.buyerId);
    if(row.roots==='landed_at_port')add(row.sellerId);
  }
  for(const row of world.upperArrayField?.trade?.agreements??[])
    if(row.status==='offered'||row.status==='accepted'||row.status==='carrying')add(row.sellerId,row.buyerId);
  for(const row of world.oaths.contracts)if(open(row.status)||row.escrow.payment>0||row.escrow.collateral>0)add(row.requesterId,row.providerId);
  for(const row of world.markets.orders)if(row.status==='open')add(row.actorId);
  for(const row of world.markets.shipments)if(row.status==='in_transit')add(row.sellerId,row.buyerId);
  for(const row of world.workshops.orders)if(open(row.status)||row.escrowStones>0||row.escrowHerbs>0){
    const continuation=row.estateContinuation;
    const adjudicated=continuation&&world.estates.entries.find(estate=>estate.id===continuation.estateId&&
      estate.deceasedId===row.patronId&&estate.status==='settled')?.beneficiaryId;
    add(row.patronId,row.makerId,adjudicated);
  }
  for(const row of world.disasterShelter?.cases??[])
    if(row.status==='offered'||row.status==='reserved'||row.status==='outbound'||row.status==='occupied'||
      row.status==='returning'||row.status==='stranded'&&row.pathIndex>0&&row.pathIndex<row.path.length-1)add(row.host.actorId,row.guest.actorId);
  for(const row of world.craftTraining?.projects??[])
    if(row.status==='offered'||row.status==='funded'||row.status==='blank')add(row.keeperId,...row.traineeIds);
  for(const row of world.scribeCommissions?.commissions??[])
    if(row.status==='offered'||row.status==='accepted'||row.status==='verified')add(row.patronId,row.scribeId);
  for(const row of world.toolLoans.loans)if(open(row.status)||!!row.custody)add(row.lenderId,row.borrowerId);
  for(const row of world.credit.loans)if(open(row.status))add(row.lenderSignerId,row.borrowerSignerId);
  for(const row of world.infirmaries.cases)if(row.status==='waiting')add(row.patientId);
  for(const row of world.infirmaries.shifts)if(row.expiresTick>world.tick)add(row.guardId);
  for(const row of world.careFollowups.appointments)if(row.status==='scheduled')add(row.patientId);
  for(const row of world.shortShifts.shifts)if(open(row.status)||row.escrowStones>0)add(row.hostId,row.workerId);
  for(const row of world.apprenticeCohorts.cohorts)if(row.status==='offered')add(row.mentorId,...row.seats.map(seat=>seat.studentId));
  for(const row of world.mentorship.offers)if(row.status==='pending')add(row.mentorId,row.studentId);
  for(const row of world.mentorTransfers.transfers)if(row.status==='offered'||row.status==='accepted')add(row.studentId,row.newMentorId);
  for(const row of world.pavilionLoans.shifts)if(row.endsTick>world.tick)add(row.actorId);
  for(const row of world.pavilionLoans.loans)if(!row.returned)add(row.borrowerId);
  for(const row of world.sectStipends.stipends)if(open(row.status))add(row.sponsorId,row.recipientId);
  for(const row of world.doctrines.proposals)if(row.status==='pending')add(row.stewardId,row.leaderId);
  for(const row of world.doctrineFoundings.foundings){
    if(row.status==='proposed')add(row.founderId,row.authorization?.actorId,...row.consents.map(consent=>consent.actorId));
    for(const offer of row.maturity?.offers??[])if(offer.status==='offered')add(offer.outgoingLeaderId,offer.receivingLeaderId,...offer.memberIds);
  }
  for(const row of world.research.projects)if(row.status==='open')add(row.proposerId,...row.contributors.filter(actor=>actor.withdrawnTick===undefined).map(actor=>actor.actorId));
  for(const row of world.households.guardianships)if(open(row.status))add(row.guardianId,row.wardId);
  for(const row of world.seasonalHousing.claims)if(row.status==='offered'||row.status==='reserved'||row.status==='occupied')add(row.hostId,row.guestId);
  for(const [id,bucket] of Object.entries(world.fieldObservatories.byActor))if(bucket.runs.some(row=>row.status==='pending'))add(id);
  for(const row of world.alignedWeather.comparisons)if(row.status==='offered')add(row.observerAId,row.observerBId);
  for(const row of world.bounties)if(row.status==='open')add(row.targetCultivatorId);
  return ids;
}

export interface RegionalTurn {
  readonly version:1;readonly tick:number;readonly focus:SimulationRegionId;readonly exactRegions:Set<SimulationRegionId>;
  protectedActors:Set<string>;obligationsDirty:boolean;readonly concludedActors:Set<string>;
  readonly deferredRows:Map<string,RegionalSimulationState['actors'][number]>;
  readonly candidateActors:ReadonlyMap<string,{siteId:string;regionId:SimulationRegionId}>;
}
function focusFor(world:WorldState,state:RegionalSimulationState):SimulationRegionId|undefined {
  const avatar=activeAvatar(world);
  return (avatar && currentActorRegion(world,avatar)) ?? regionForSite(world,state.focusSiteId);
}
function regionalCandidates(world:WorldState,focus:SimulationRegionId,protectedActors:ReadonlySet<string>) {
  const candidates=new Map<string,{siteId:string;regionId:SimulationRegionId}>();
  const sites=new Map(world.locations.map(place=>[place.id,place]));
  const settlements=new Set(world.settlements.villages.map(row=>row.locationId));
  const hazardous=new Set(world.mapHazards.filter(row=>routeWarningHazardValid(world,row,world.tick)).map(row=>row.tileId));
  for(const actor of world.cultivators){
    if(!onLowerPlane(actor)||!alive(actor)||protectedActors.has(actor.id)||isTribulationActive(actor)||
      actor.guardAssignment&&actor.guardAssignment.expiresTick>world.tick||
      (actor.age+2>=actor.lifespan)||actor.qiProgress>=80||actor.pillToxicity>0||
      actor.hp/Math.max(1,actor.maxHp)<.82)continue;
    const place=sites.get(actor.locationId);
    const regionId=place&&regionForPoint(world,place);
    const tile=place&&terrainTileAt(world,place.x,place.y);
    if(!place||!tile||!regionId||regionId===focus||risky(place)||place.type==='market'||
      settlements.has(place.id)||hazardous.has(tile.id))continue;
    candidates.set(actor.id,{siteId:place.id,regionId});
  }
  return candidates;
}

/** A pure starting-frame model budget hint only. A newly urgent/present actor still runs monthly Utility. */
export function regionalModelPassiveActorIds(world:WorldState,required?:(actor:Cultivator)=>boolean):ReadonlySet<string> {
  const state=world.regionalSimulation;
  const focus=state&&state.version===REGIONAL_SIMULATION_VERSION&&focusFor(world,state);
  if(!focus)return new Set();
  const protectedActors=activeParties(world),avatar=activeAvatar(world);
  if(avatar)protectedActors.add(avatar.id);
  const pending=world.playerAvatar.pendingOrder;
  if(pending)protectedActors.add(pending.actorId);
  const candidates=regionalCandidates(world,focus,protectedActors);
  const exact=activeRegionalPromotionRegions(world,world.tick+1);
  return new Set(world.cultivators.filter(actor=>{
    const candidate=candidates.get(actor.id);
    return candidate&&!exact.has(candidate.regionId)&&!required?.(actor);
  }).map(actor=>actor.id));
}

export function beginRegionalSimulationTurn(world:WorldState):RegionalTurn|undefined {
  const state=world.regionalSimulation;
  if(!state||state.version!==REGIONAL_SIMULATION_VERSION)return undefined;
  const focus=focusFor(world,state);
  if(!focus)return undefined;
  const avatar=activeAvatar(world);
  const protectedActors=activeParties(world);
  if(avatar)protectedActors.add(avatar.id);
  const candidates=regionalCandidates(world,focus,protectedActors);
  return {version:1,tick:world.tick,focus,exactRegions:new Set([focus,...activeRegionalPromotionRegions(world)]),protectedActors,obligationsDirty:false,concludedActors:new Set(),candidateActors:candidates,
    deferredRows:new Map(state.actors.map(row=>[deferredKey(row.actorId,row.regionId),row]))};
}

const deferredKey=(id:string,region:SimulationRegionId)=>`${id}:${region}`;
export function renewRegionalProtectionAfterEvent(turn:RegionalTurn|undefined):void {
  if(turn)turn.obligationsDirty=true;
}
function refreshObligations(world:WorldState,turn:RegionalTurn) {
  if(turn.obligationsDirty){
    // Never remove a start-of-turn protection during a contested native turn.
    for(const id of activeParties(world))turn.protectedActors.add(id);
    const current=world.regionalSimulation&&focusFor(world,world.regionalSimulation);
    if(current)turn.exactRegions.add(current);
    turn.obligationsDirty=false;
  }
}

/** Defer only a genuinely optional far action; don't synthesize a native action or receipt. */
export function deferRegionalActorTurn(world:WorldState,turn:RegionalTurn|undefined,actor:Cultivator,
  provided?:LLMDecisionPayload,required?:()=>boolean):boolean {
  const state=world.regionalSimulation;
  if(!turn||!state||turn.version!==state.version||turn.tick!==world.tick)return false;
  if(turn.concludedActors.has(actor.id))return true;
  const candidate=turn.candidateActors.get(actor.id);
  if(provided||!candidate||!onLowerPlane(actor)||!alive(actor)||actor.locationId!==candidate.siteId||
    isTribulationActive(actor)||actor.qiProgress>=80||actor.pillToxicity>0||
    actor.hp/Math.max(1,actor.maxHp)<.82||!!actor.guardAssignment&&actor.guardAssignment.expiresTick>world.tick||
    courierActedThisTick(world,actor)||pilgrimageActedThisTick(world,actor)||danxiaMedicineActedThisTick(world,actor))return false;
  refreshObligations(world,turn);
  if(turn.exactRegions.has(candidate.regionId)||turn.protectedActors.has(actor.id)||required?.())return false;
  turn.concludedActors.add(actor.id);
  const key=deferredKey(actor.id,candidate.regionId);
  let row=turn.deferredRows.get(key);
  if(!row){
    row={actorId:actor.id,regionId:candidate.regionId,year:world.year,deferredMonths:0,lastDeferredTick:0};
    state.actors.push(row);turn.deferredRows.set(key,row);
  }
  if(row.lastDeferredTick>=world.tick)return true;
  if(row.year!==world.year){row.year=world.year;row.deferredMonths=0;}
  row.lastDeferredTick=world.tick;
  row.deferredMonths++;
  return true;
}

/** One December passive pass. Previously deferred months that conflict with real duties, physical
 * location changes or a genuine ordinary December turn are audited as waived, never backfilled. */
export function finishRegionalSimulationTurn(world:WorldState,turn:RegionalTurn|undefined):void {
  const state=world.regionalSimulation;
  if(!turn||!state||turn.tick!==world.tick||world.month!==12)return;
  refreshObligations(world,turn);
  state.annual=state.annual.filter(value=>world.year-value.year<REGIONAL_SIMULATION_AUDIT_YEARS);
  const identities=new Map(world.cultivators.map(actor=>[actor.id,actor]));
  for(const row of state.actors) {
    if(row.year!==world.year||row.deferredMonths<1)continue;
    const months=row.deferredMonths;
    row.deferredMonths=0;
    let report=state.annual.find(value=>value.year===world.year&&value.regionId===row.regionId);
    if(!report){
      report={year:world.year,tick:world.tick,regionId:row.regionId,actorMonths:0,waivedActorMonths:0,actors:0,qiAdded:0,hpAdded:0};
      state.annual.push(report);
    }
    const actor=identities.get(row.actorId),candidate=turn.candidateActors.get(row.actorId);
    if(!actor||!onLowerPlane(actor)||!alive(actor)||!candidate||candidate.regionId!==row.regionId||actor.locationId!==candidate.siteId||
      !turn.concludedActors.has(actor.id)||turn.protectedActors.has(actor.id)||turn.exactRegions.has(row.regionId)||
      isTribulationActive(actor)||actor.qiProgress>=80||actor.pillToxicity>0||actor.hp/Math.max(1,actor.maxHp)<.82||
      !!actor.guardAssignment&&actor.guardAssignment.expiresTick>world.tick){
      report.waivedActorMonths+=months;continue;
    }
    const qiAdded=Math.max(0,Math.min(85-actor.qiProgress,months));
    const hpAdded=Math.max(0,Math.min(actor.maxHp-actor.hp,Math.round(actor.maxHp*months*.01)));
    actor.qiProgress+=qiAdded;actor.hp+=hpAdded;
    report.actorMonths+=months;report.actors++;report.qiAdded+=qiAdded;report.hpAdded+=hpAdded;
  }
}

export interface RegionalSimulationView {
  version:1;focus:SimulationRegionId;focusLabel:string;registeredRegions:number;
  annual:RegionalSimulationState['annual'];globalsRemainMonthly:true;
}
export function projectRegionalSimulation(world:WorldState):RegionalSimulationView|undefined {
  const state=world.regionalSimulation;
  const focus=state&&focusFor(world,state);
  if(!state||!focus)return undefined;
  return {version:state.version,focus,focusLabel:SIMULATION_REGION_NAMES[focus],
    registeredRegions:new Set(state.registrations.map(row=>row.originRegionId)).size,
    annual:state.annual.map(row=>({...row})),globalsRemainMonthly:true};
}
