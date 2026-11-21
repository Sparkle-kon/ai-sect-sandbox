import type { Cultivator, MortalSettlement, SettlementRecord, VillageEvolutionChange, VillageEvolutionHouseholdMove,
  VillageEvolutionMigration, VillageEvolutionRecord, VillageEvolutionSample, VillageEvolutionState,
  VillageSupplyAgreement, WorldEvent, WorldState } from '../types/world';
import { knownMapLocations, terrainTileAt } from './terrainEngine';
import { routeWarningHazardValid } from './routeWarningProof';
import { supplyLegEndpoints } from './villageSupplyAccounting';
import { presentAtVillageGranary } from './villageGranaryEngine';
import { activeDanxiaMedicineEscort, danxiaMedicineActedThisTick } from './danxiaMedicineTerms';
import { VILLAGE_EVOLUTION_LOW_STRESS, VILLAGE_EVOLUTION_MAX_ADULTS_PER_MOVE, VILLAGE_EVOLUTION_MIN_STRESS_GAP,
  VILLAGE_EVOLUTION_MIN_TOWN_POPULATION, VILLAGE_EVOLUTION_MOVE_STRESS, VILLAGE_EVOLUTION_SAMPLE_COUNT,
  VILLAGE_EVOLUTION_SAMPLE_TICKS, VILLAGE_EVOLUTION_TOWN_STOCK_RATIO } from './villageEvolutionTerms';

export const createVillageEvolutionState=():VillageEvolutionState=>({villages:[],migrations:[]});

const locallySettled=(world:WorldState,actor:Cultivator)=>
  !activeDanxiaMedicineEscort(world,actor)&&!danxiaMedicineActedThisTick(world,actor)?presentAtVillageGranary(world,actor):undefined;
export function villageEvolutionLocalObserverIds(world:WorldState,settlementIds:ReadonlySet<string>):string[] {
  return world.cultivators.flatMap(actor=>{
    const present=locallySettled(world,actor);
    return present&&settlementIds.has(present.id)?[actor.id]:[];
  });
}
const byId=(a:{id:string},b:{id:string})=>a.id<b.id?-1:a.id>b.id?1:0;
const minors=(village:MortalSettlement)=>village.juvenileCohorts.reduce((sum,row)=>sum+row.count,0);
const remaining=(village:MortalSettlement)=>village.volunteers.filter(row=>!row.enlistedCultivatorId).length;
const siteAt=(world:WorldState,id:string)=>world.locations.find(row=>row.id===id&&
  row.type!=='secret_realm'&&row.type!=='abyss');
const tileAt=(world:WorldState,village:MortalSettlement)=> {
  const site=siteAt(world,village.locationId);
  return site?terrainTileAt(world,site.x,site.y):undefined;
};
const blocked = (world:WorldState,tileId:string)=>world.mapHazards.some(row=>
  row.tileId===tileId&&row.intensity>=2&&routeWarningHazardValid(world,row,world.tick));

function completedWell(world:WorldState,village:MortalSettlement) {
  return world.villageWorks.projects.find(project=>project.settlementId===village.id&&project.kind==='well'&&
    project.status==='completed'&&project.settledTick!==undefined&&project.settledTick<=world.tick);
}

export function villageEvolutionPath(world:WorldState,agreement:VillageSupplyAgreement,
  from:MortalSettlement,to:MortalSettlement,checkCurrentRisk=true):string[]|undefined {
  if(from.id===to.id||!agreement.path||!agreement.legs||agreement.acceptedTick===undefined)return undefined;
  const leg=agreement.legs.find(candidate=>{
    const endpoints=supplyLegEndpoints(agreement,candidate.good);
    return endpoints.source===from.id&&endpoints.destination===to.id&&candidate.phase==='delivered'&&
      candidate.settledTick!==undefined&&candidate.settledTick<world.tick&&candidate.settledTick>agreement.acceptedTick!&&
      candidate.checkpoint===agreement.path!.length-1;
  });
  if(!leg)return undefined;
  const path=leg.good==='earth_root'?[...agreement.path]:[...agreement.path].reverse();
  const a=tileAt(world,from),b=tileAt(world,to);
  if(!a||!b||path.length<2||path[0]!==a.id||path.at(-1)!==b.id||new Set(path).size!==path.length)return undefined;
  const tiles=new Map(world.terrain.tiles.map(tile=>[tile.id,tile]));
  for(let i=0;i<path.length;i++){
    const tile=tiles.get(path[i]);
    const prior=i>0?tiles.get(path[i-1]):undefined;
    if(!tile||tile.biome==='魔渊'||i>0&&(!prior||Math.abs(tile.row-prior.row)+Math.abs(tile.col-prior.col)!==1)||
      checkCurrentRisk&&blocked(world,tile.id))return undefined;
  }
  return path;
}

type Corridor={origin:MortalSettlement;destination:MortalSettlement;agreement:VillageSupplyAgreement;path:string[]};
const routeKey=(from:string,to:string)=>JSON.stringify([from,to]);
function corridors(world:WorldState,villages:readonly MortalSettlement[]):{routes:Corridor[];blockedPairs:ReadonlySet<string>} {
  const result:Corridor[]=[];
  const blockedPairs=new Set<string>();
  const knownSafePairs=new Set<string>();
  const registered=new Map(villages.map(village=>[village.id,village]));
  for(const agreement of world.villageSupply.agreements){
    const a=registered.get(agreement.fromSettlementId),b=registered.get(agreement.toSettlementId);
    if(!a||!b)continue;
    for(const [origin,destination] of [[a,b],[b,a]] as const){
      const path=villageEvolutionPath(world,agreement,origin,destination,false);
      if(!path)continue;
      const key=routeKey(origin.id,destination.id);
      if(path.some(tileId=>blocked(world,tileId)))blockedPairs.add(key);
      else {
        knownSafePairs.add(key);
        result.push({origin,destination,agreement,path});
      }
    }
  }
  for(const key of knownSafePairs)blockedPairs.delete(key);
  return {routes:result.sort((a,b)=>byId(a.origin,b.origin)||byId(a.destination,b.destination)||byId(a.agreement,b.agreement)),blockedPairs};
}

export interface VillageEvolutionTurn {
  tick:number;
  corridors:Corridor[];
  blockedPairs:ReadonlySet<string>;
}

export function villageEvolutionBlocksMigration(turn:VillageEvolutionTurn|undefined,from:string,to:string):boolean {
  return turn?.blockedPairs.has(routeKey(from,to))??false;
}
export function observeVillageEvolution(world:WorldState,villages:readonly MortalSettlement[]):VillageEvolutionTurn|undefined {
  if(world.tick<=0||world.tick%VILLAGE_EVOLUTION_SAMPLE_TICKS!==0||world.settlements.lastAdvancedTick!==world.tick)return undefined;
  const {routes,blockedPairs}=corridors(world,villages);
  for(const village of villages) {
    const here=tileAt(world,village);
    if(!here)continue;
    let row=world.villageEvolution.villages.find(value=>value.settlementId===village.id);
    if(!row){
      row={settlementId:village.id,siteId:village.locationId,registeredName:village.name,status:'village',samples:[],changes:[]};
      world.villageEvolution.villages.push(row);
    }
    if(row.siteId!==village.locationId||row.samples.at(-1)?.tick===world.tick)continue;
    const well=completedWell(world,village);
    const localRoutes=routes.filter(route=>route.origin.id===village.id||route.destination.id===village.id);
    const count=new Set(localRoutes.map(route=>route.origin.id===village.id?route.destination.id:route.origin.id)).size;
    const sample:VillageEvolutionSample={tick:world.tick,population:village.population,juveniles:minors(village),
      namedRemaining:remaining(village),stress:village.stress,capacity:village.capacity,
      ...(well?{wellId:well.id}:{}),usableWell:!!well&&!blocked(world,here.id),passableCorridors:count,
      ...(localRoutes[0]?{corridorAgreementId:localRoutes[0].agreement.id}:{})};
    row.samples=[...row.samples,sample].slice(-VILLAGE_EVOLUTION_SAMPLE_COUNT);
  }
  return {tick:world.tick,corridors:routes,blockedPairs};
}

function sustained(world:WorldState,villageId:string,qualifies:(sample:VillageEvolutionSample)=>boolean) {
  const row=world.villageEvolution.villages.find(value=>value.settlementId===villageId);
  const samples=row?.samples;
  return !!samples&&samples.length===VILLAGE_EVOLUTION_SAMPLE_COUNT&&samples.every((sample,index)=>
    sample.tick===world.tick-(samples.length-1-index)*VILLAGE_EVOLUTION_SAMPLE_TICKS&&qualifies(sample));
}

function orderedLocalHouseholds(world:WorldState,villageId:string){
  return world.households.groups.flatMap(group=>{
    const presence=group.presences.find(item=>item.settlementId===villageId);
    return presence?[{group,presence}]:[];
  }).sort((a,b)=>b.presence.adults-a.presence.adults||a.group.id.localeCompare(b.group.id));
}

/** Planner never moves people; the native settlement and household ledgers own that mutation. */
export function planVillageEvolutionMigration(world:WorldState,turn:VillageEvolutionTurn,origin:MortalSettlement,
  involved:ReadonlySet<string>):{destination:MortalSettlement;migration:VillageEvolutionMigration}|undefined {
  if(turn.tick!==world.tick||involved.has(origin.id)||origin.population<1||
    !sustained(world,origin.id,sample=>sample.stress>=VILLAGE_EVOLUTION_MOVE_STRESS&&!sample.usableWell))return undefined;
  const juvenile=minors(origin),named=remaining(origin);
  const available=origin.population-juvenile-named;
  const held=orderedLocalHouseholds(world,origin.id);
  if(available<=0||held.reduce((sum,row)=>sum+row.presence.adults,0)!==available)return undefined;
  const choices=turn.corridors.filter(route=>route.origin===origin&&!involved.has(route.destination.id)&&
    route.destination.population<route.destination.capacity&&route.destination.stress+VILLAGE_EVOLUTION_MIN_STRESS_GAP<=origin.stress&&
    sustained(world,route.destination.id,sample=>sample.usableWell&&sample.stress<=VILLAGE_EVOLUTION_LOW_STRESS));
  choices.sort((a,b)=>a.destination.stress-b.destination.stress||byId(a.destination,b.destination)||byId(a.agreement,b.agreement));
  const chosen=choices[0];
  if(!chosen)return undefined;
  const {destination}=chosen;
  const people=Math.min(VILLAGE_EVOLUTION_MAX_ADULTS_PER_MOVE,available,destination.capacity-destination.population);
  if(people<=0)return undefined;
  const households:VillageEvolutionHouseholdMove[]=[];
  let leftover=people;
  for(const {group,presence} of held){
    const adults=Math.min(leftover,presence.adults);
    if(adults<1)break;
    households.push({householdId:group.id,adults});
    leftover-=adults;
  }
  if(leftover!==0)return undefined;
  return {destination,migration:{id:`settlement-${world.tick}-migration-${origin.id}-${destination.id}`,tick:world.tick,
    fromSettlementId:origin.id,toSettlementId:destination.id,agreementId:chosen.agreement.id,path:[...chosen.path],people,
    fromBefore:origin.population,fromAfter:origin.population-people,toBefore:destination.population,toAfter:destination.population+people,
    leftJuveniles:juvenile,leftNamed:named,households}};
}

export function recordVillageEvolutionMigration(world:WorldState,decision:VillageEvolutionMigration,source:SettlementRecord,
  householdMoves:readonly VillageEvolutionHouseholdMove[]):void {
  if(source.tick!==world.tick||source.kind!=='migration'||source.id!==decision.id||
    source.settlementId!==decision.fromSettlementId||source.targetSettlementId!==decision.toSettlementId||
    source.people!==decision.people||!world.settlements.records.includes(source)||
    world.villageEvolution.migrations.some(row=>row.id===decision.id))return;
  const origin=world.settlements.villages.find(row=>row.id===decision.fromSettlementId);
  const destination=world.settlements.villages.find(row=>row.id===decision.toSettlementId);
  if(origin?.population!==decision.fromAfter||destination?.population!==decision.toAfter||
    minors(origin)!==decision.leftJuveniles||remaining(origin)!==decision.leftNamed||
    householdMoves.length!==decision.households.length||householdMoves.reduce((sum,row)=>sum+row.adults,0)!==decision.people||
    householdMoves.some((actual,index)=>actual.householdId!==decision.households[index].householdId||
      actual.adults!==decision.households[index].adults))return;
  world.villageEvolution.migrations.push(structuredClone(decision));
}

/** Historical stock stays in its original store; only active obligations bar a ruin marker. */
export function villageEvolutionHasActiveDuties(world:WorldState,village:MortalSettlement):boolean {
  const id=village.id;
  return world.villageWorks.projects.some(row=>row.settlementId===id&&row.status==='building')||
    world.seasonalHousing.claims.some(row=>row.settlementId===id&&
      (row.status==='offered'||row.status==='reserved'||row.status==='occupied'))||
    world.villageFairs.fairs.some(row=>row.settlementId===id&&
      (row.status==='announced'||row.status==='open'||row.stalls.some(stall=>stall.status==='refund_due')))||
    world.villageSupply.agreements.some(row=>(row.fromSettlementId===id||row.toSettlementId===id)&&
      (row.status==='offered'||row.status==='active'))||
    world.danxiaMedicine.commitments.some(row=>row.settlementId===id&&
      (row.status==='offered'||row.status==='in_transit'||row.status==='arrived'||row.status==='returning'));
}

function settlementChangingRecord(world:WorldState,village:MortalSettlement) {
  return world.settlements.records.find(row=>row.tick===world.tick&&row.people>0&&
    row.kind==='migration'&&row.targetSettlementId===village.id);
}

/** Called only for an actual native ledger record on any month, including nonquarter enrollment. */
export function noteVillageEvolutionSettlement(world:WorldState,source:SettlementRecord):void {
  if(source.tick!==world.tick||source.people<=0||
    (source.kind!=='migration'&&source.kind!=='disaster'&&source.kind!=='recruitment')||
    !world.settlements.records.includes(source))return;
  const origin=world.settlements.villages.find(village=>village.id===source.settlementId);
  if(origin&&origin.population===0&&minors(origin)===0&&remaining(origin)===0&&siteAt(world,origin.locationId)){
    let row=world.villageEvolution.villages.find(item=>item.settlementId===origin.id);
    if(!row){
      row={settlementId:origin.id,siteId:origin.locationId,registeredName:origin.name,status:'village',samples:[],changes:[]};
      world.villageEvolution.villages.push(row);
    }
    if(row.status!=='ruin'&&row.siteId===origin.locationId)row.pendingDepopulationRecordId=source.id;
  }
  if(source.kind==='migration'&&source.targetSettlementId){
    const target=world.villageEvolution.villages.find(item=>item.settlementId===source.targetSettlementId);
    if(target)delete target.pendingDepopulationRecordId;
  }
}

const townReady=(sample:VillageEvolutionSample)=>sample.population>=VILLAGE_EVOLUTION_MIN_TOWN_POPULATION&&
  sample.population>=Math.ceil(sample.capacity*VILLAGE_EVOLUTION_TOWN_STOCK_RATIO)&&
  sample.usableWell&&sample.passableCorridors>=1&&sample.stress<=VILLAGE_EVOLUTION_LOW_STRESS;

export function finishVillageEvolution(world:WorldState,turn:VillageEvolutionTurn):WorldEvent[] {
  if(turn.tick!==world.tick)return [];
  const results:WorldEvent[]=[];
  for(const row of world.villageEvolution.villages){
    const village=world.settlements.villages.find(value=>value.id===row.settlementId&&value.locationId===row.siteId);
    if(!village||row.samples.at(-1)?.tick!==world.tick||row.changes.at(-1)?.tick===world.tick)continue;
    const afterMovement=settlementChangingRecord(world,village);
    if(village.population>0)delete row.pendingDepopulationRecordId;
    const depopulation=row.pendingDepopulationRecordId&&world.settlements.records.find(source=>
      source.id===row.pendingDepopulationRecordId&&source.tick<=world.tick&&source.settlementId===village.id&&source.people>0);
    let change:VillageEvolutionChange|undefined;
    if(row.status==='ruin'&&village.population>0&&afterMovement){
      change={tick:world.tick,from:'ruin',to:'village',reason:'actual_return',population:village.population,sourceRecordId:afterMovement.id};
    } else if(row.status!=='ruin'&&village.population===0&&minors(village)===0&&remaining(village)===0&&
      depopulation&&!villageEvolutionHasActiveDuties(world,village)){
      change={tick:world.tick,from:row.status,to:'ruin',reason:'depopulated',population:0,sourceRecordId:depopulation.id};
    } else if(row.status==='village'&&sustained(world,village.id,townReady)&&
      townReady({...row.samples.at(-1)!,population:village.population,capacity:village.capacity})){
      change={tick:world.tick,from:'village',to:'town',reason:'sustained_growth',population:village.population,
        growthSamples:row.samples.map(sample=>({...sample}))};
    }
    if(!change)continue;
    if(change.to==='ruin')delete row.pendingDepopulationRecordId;
    row.status=change.to;
    row.changes.push(change);
    const label=change.to==='town'?'乡村成为城镇':change.to==='ruin'?'原址成为遗址':'旧址有实际迁入并恢复人烟';
    results.push({id:`evt-village-evolution-${row.settlementId}-${world.tick}`,tick:world.tick,year:world.year,month:world.month,
      category:'diplomacy',title:label,description:`${row.registeredName}：${label}。原名、账目与旧址仍可核查。`,
      actorIds:siteAt(world,row.siteId)?.type==='market'?[]:villageEvolutionLocalObserverIds(world,new Set([row.settlementId])),
      locationId:row.siteId,...(siteAt(world,row.siteId)?.type==='market'?{}:{witnessScope:'participants' as const})});
  }
  return results;
}

/** Protect only the increasingly few selected native proofs from ordinary 96-entry trimming. */
export function villageEvolutionPinnedSettlementIds(world:WorldState):Set<string> {
  return new Set([...world.villageEvolution.migrations.map(row=>row.id),...world.villageEvolution.villages.flatMap(row=>
    [...row.changes.flatMap(change=>change.sourceRecordId?[change.sourceRecordId]:[]),
      ...(row.pendingDepopulationRecordId?[row.pendingDepopulationRecordId]:[])])]);
}

export interface VillageEvolutionView {
  settlementId:string;siteId:string;registeredName:string;status:VillageEvolutionRecord['status'];currentLocal:boolean;asOfTick:number;population:number;
  juveniles:number;namedRemaining:number;lastSurvey?:Pick<VillageEvolutionSample,'tick'|'usableWell'|'passableCorridors'>;hasActiveDuties?:boolean;recentChanges:Array<Pick<VillageEvolutionChange,'tick'|'from'|'to'|'reason'|'population'>>;
  knownMoves:Array<{tick:number;people:number;counterpartName:string;direction:'arrivals'|'departures';leftJuveniles:number;leftNamed:number}>;
}

/** Geography-gated old identity and anonymous movement only. Never reveals household or cargo IDs. */
export function projectVillageEvolution(world:WorldState,viewer?:Cultivator,query?:string):VillageEvolutionView[] {
  if(!viewer||!world.cultivators.includes(viewer))return [];
  const known=new Set(knownMapLocations(world,viewer).map(site=>site.id));
  const visible=world.villageEvolution.villages.filter(row=>known.has(row.siteId));
  const visibleById=new Map(visible.map(row=>[row.settlementId,row]));
  const text=query?.trim().toLowerCase();
  const current=locallySettled(world,viewer);
  return visible.flatMap((row):VillageEvolutionView[]=>{
    const village=world.settlements.villages.find(item=>item.id===row.settlementId);
    if(!village||text&&!row.registeredName.toLowerCase().includes(text)&&!village.name.toLowerCase().includes(text))return [];
    const sample=row.samples.at(-1);
    const currentLocal=current?.id===row.settlementId;
    if(!currentLocal&&!sample)return [];
    return [{settlementId:row.settlementId,siteId:row.siteId,registeredName:row.registeredName,status:row.status,
      currentLocal,asOfTick:currentLocal?world.tick:sample!.tick,
      population:currentLocal?village.population:sample!.population,
      juveniles:currentLocal?minors(village):sample!.juveniles,namedRemaining:currentLocal?remaining(village):sample!.namedRemaining,
      ...(sample?{lastSurvey:{tick:sample.tick,usableWell:sample.usableWell,passableCorridors:sample.passableCorridors}}:{}),
      ...(current?.id===row.settlementId?{hasActiveDuties:villageEvolutionHasActiveDuties(world,village)}:{}),
      recentChanges:row.changes.slice(-4).map(({tick,from,to,reason,population})=>({tick,from,to,reason,population})),
      knownMoves:world.villageEvolution.migrations.flatMap(move=>{
        const outgoing=move.fromSettlementId===row.settlementId,incoming=move.toSettlementId===row.settlementId;
        const counterpart=outgoing?visibleById.get(move.toSettlementId):incoming?visibleById.get(move.fromSettlementId):undefined;
        return counterpart?[{tick:move.tick,people:move.people,counterpartName:counterpart.registeredName,
          direction:outgoing?'departures' as const:'arrivals' as const,leftJuveniles:move.leftJuveniles,leftNamed:move.leftNamed}]:[];
      }).slice(-4)}];
  });
}
