import type { VillageSupplyAgreement, WaterVeinOpening, WaterVeinRenewalStance, WorldState } from '../types/world';
import { NORTH_MINING_DETOUR_COST,NORTH_MINING_ROLES,NORTH_MINING_SETTLEMENT,NORTH_MINING_SITE,northRouteFor } from './northMiningCharterTerms';
import { supplyLegTile } from './villageSupplyAccounting';
import { WATER_VEIN_BORROW_UNITS,WATER_VEIN_ID,WATER_VEIN_OPEN_STONES,WATER_VEIN_RECOVERY_TICKS,WATER_VEIN_RENEWAL_FUNDING,waterVeinPhase } from './waterVeinTerms';

export const NORTH_GATE_RENEWAL_MONTHS=36_000;
export const NORTH_GATE_RENEWAL_HEARING_TICKS=6;
export type NorthGateRenewalStance=WaterVeinRenewalStance;
export type NorthGateRenewalMove=NorthGateRenewalStance|'endorse';
export const NORTH_GATE_RENEWAL_MOVES=['reuse','sect','endorse','accord'] as const satisfies readonly NorthGateRenewalMove[];
export interface NorthGateRenewalSource {
  siteId:typeof NORTH_MINING_SITE;
  settlementId:string;
  charterId:string;
  wellProjectId:string;
  openingId:string;
  freightId:string;
  freightClosedTick:number;
  passageTick:number;
  passageTileId:string;
}
export interface NorthGateRenewalEndorsement {
  actorId:string;
  householdId:string;
  volunteerId:string;
  recruitedTick:number;
  signedTick:number;
}
export type NorthGateRenewalOutcome =
  | {kind:'reopened';stance:NorthGateRenewalStance;actorId:string;sectId:string;openedTick:number;openingId:string;
     paidStones:40|48|64;borrowedUnits:0|3|9;granaryRoots:0|1}
  | {kind:'failed';closedTick:number};
export interface NorthGateRenewalHearing {
  id:string;
  source:NorthGateRenewalSource;
  openedTick:number;
  expiresTick:number;
  endorsement?:NorthGateRenewalEndorsement;
  outcome?:NorthGateRenewalOutcome;
}
export interface NorthGateRenewalState {version:1;hearing:NorthGateRenewalHearing}
const natural=(n:number|undefined):n is number=>n!==undefined&&Number.isSafeInteger(n)&&n>=1;
const equalPath=(a:readonly string[]|undefined,b:readonly string[]|undefined)=>!!a&&!!b&&a.length===b.length&&a.every((tile,i)=>tile===b[i]);
export const northGateRenewalId=(openedTick:number,freightId:string):string=>`north-gate-renewal-${openedTick}-${freightId}`;
export const northGateRenewalDue=(source:NorthGateRenewalSource):number=>source.freightClosedTick+NORTH_GATE_RENEWAL_MONTHS;

function genuineDeliveredFreight(freight:VillageSupplyAgreement,through:number):boolean {
  const {path,legs,closedTick,acceptedTick}=freight;
  if(freight.status!=='completed'||!path||path.length<2||!legs||legs.length!==2||!natural(acceptedTick)||
    !natural(closedTick)||closedTick>through||new Set(legs.map(leg=>leg.good)).size!==2)return false;
  return legs.every(leg=>leg.phase==='delivered'&&leg.checkpoint===path.length-1&&natural(leg.settledTick)&&
    leg.settledTick>=acceptedTick+path.length-1&&leg.settledTick<=closedTick&&leg.lastAdvancedTick===leg.settledTick)&&
    Math.max(...legs.map(leg=>leg.settledTick!))===closedTick;
}
/** Actual old water, signed paid detour and physically completed pair of freight legs. No story-text lookup. */
export function findNorthGateRenewalSource(world:WorldState,through=world.tick):NorthGateRenewalSource|undefined {
  if(!natural(through))return undefined;
  const water=world.coldWaterVein;
  if(!water||water.veinId!==WATER_VEIN_ID||water.siteId!==NORTH_MINING_SITE||water.settlementId!==NORTH_MINING_SETTLEMENT||
     !world.locations.some(site=>site.id===NORTH_MINING_SITE)||
     !world.settlements.villages.some(village=>village.id===water.settlementId&&village.locationId===NORTH_MINING_SITE))return undefined;
  const candidates:NorthGateRenewalSource[]=[];
  for(const charter of world.northMiningCharters?.charters??[]){
    const {route,firstPassage:pass,ratifiedTick}=charter;
    if(charter.siteId!==water.siteId||charter.settlementId!==water.settlementId||
      charter.status!=='ratified'||charter.stance!=='detour'||charter.paidStones!==NORTH_MINING_DETOUR_COST||
      !route||!pass||!natural(ratifiedTick)||ratifiedTick>=pass.tick||
      charter.signatures.length!==NORTH_MINING_ROLES.length||
      new Set(charter.signatures.map(row=>row.actorId)).size!==NORTH_MINING_ROLES.length||
      !charter.signatures.every((row,i)=>row.role===NORTH_MINING_ROLES[i]&&
        row.tick>(charter.signatures[i-1]?.tick??charter.proposedTick)&&row.tick<=ratifiedTick)||
      charter.signatures.at(-1)?.tick!==ratifiedTick||route.originalTiles.includes(pass.tileId)||
      !world.terrain.tiles.some(tile=>tile.id===pass.tileId))continue;
    const well=world.villageWorks.projects.find(row=>row.id===charter.wellProjectId&&row.kind==='well'&&row.status==='completed'&&
      row.settlementId===water.settlementId&&row.stonesSpent===32&&row.rootsSpent===2&&row.laborTotal===4);
    const opening=water.openings.find(row=>row.id===charter.openingId&&row.wellProjectId===charter.wellProjectId&&
      row.sectId===charter.sponsorSectId&&!row.renewal&&row.paidStones===WATER_VEIN_OPEN_STONES&&
      row.borrowedUnits===WATER_VEIN_BORROW_UNITS&&row.completedTick===row.openedTick+WATER_VEIN_RECOVERY_TICKS);
    if(!well||!opening||!natural(well.settledTick)||well.settledTick>=opening.openedTick||
      !natural(charter.fieldObservedTick)||charter.fieldObservedTick>=charter.proposedTick||charter.fieldDeficit<=0||
      waterVeinPhase(opening,charter.fieldObservedTick).fieldDeficit!==charter.fieldDeficit)continue;
    const mining=water.mining.find(row=>row.id===charter.miningReceiptId&&row.units===1&&
      row.tick>=charter.fieldObservedTick&&row.tick<=charter.proposedTick&&waterVeinPhase(opening,row.tick).mineYield===1);
    const miner=charter.signatures[1];
    if(!mining||miner?.role!=='miner'||miner.actorId!==mining.actorId||miner.miningReceiptId!==mining.id)continue;
    const freight=world.villageSupply.agreements.find(row=>row.id===pass.agreementId&&row.northMiningCharterId===charter.id);
    if(!freight||!genuineDeliveredFreight(freight,through)||!natural(freight.closedTick)||!natural(freight.acceptedTick)||
      !equalPath(freight.path,northRouteFor(charter,freight.fromSettlementId,freight.toSettlementId))||
      freight.acceptedTick<ratifiedTick||!natural(pass.checkpoint)||pass.tick!==freight.acceptedTick+pass.checkpoint||
      pass.tick>=freight.closedTick)continue;
    const leg=freight.legs?.find(row=>row.good===pass.good);
    if(!leg||supplyLegTile(freight,leg,pass.checkpoint)!==pass.tileId)continue;
    if(!Number.isSafeInteger(freight.closedTick+NORTH_GATE_RENEWAL_MONTHS+NORTH_GATE_RENEWAL_HEARING_TICKS))continue;
    candidates.push({siteId:NORTH_MINING_SITE,settlementId:water.settlementId,charterId:charter.id,wellProjectId:well.id,
      openingId:opening.id,freightId:freight.id,freightClosedTick:freight.closedTick,passageTick:pass.tick,passageTileId:pass.tileId});
  }
  return candidates.sort((a,b)=>a.freightClosedTick-b.freightClosedTick ||
    (a.freightId<b.freightId?-1:a.freightId>b.freightId?1:0) || (a.charterId<b.charterId?-1:a.charterId>b.charterId?1:0))[0];
}
export function northGateRenewalForSource(source:NorthGateRenewalSource):NorthGateRenewalHearing {
  const openedTick=northGateRenewalDue(source);
  return {id:northGateRenewalId(openedTick,source.freightId),source,openedTick,expiresTick:openedTick+NORTH_GATE_RENEWAL_HEARING_TICKS};
}
/** A previously lawful untagged opening from a legacy-built later frame is not a campaign vote. */
export function northGateRenewalHasLegacyOpeningAfterDue(world:WorldState,due:number):boolean {
  return natural(due)&&(world.coldWaterVein?.openings.some(row=>!row.renewal&&
    row.openedTick>=due&&row.openedTick<=world.tick)??false);
}
/** Both the old execution and its T+1 preview must honor the actual hearing and eventual result. */
export function northGateRenewalBlocksOrdinaryOpening(world:WorldState,through=world.tick):boolean {
  const retained=world.northGateRenewal?.hearing;
  if(retained&&through>=retained.openedTick)return true;
  if(through<=NORTH_GATE_RENEWAL_MONTHS)return false;
  const source=findNorthGateRenewalSource(world,Math.min(world.tick,through));
  return !!source&&through>=northGateRenewalDue(source);
}

/** Legacy aperture verification remains native; a funded variant also needs its actual settled hearing. */
export function northGateRenewalApertureAuthorized(world:WorldState,opening:WaterVeinOpening):boolean {
  const tag=opening.renewal;
  if(!tag)return true;
  const hearing=world.northGateRenewal?.hearing,outcome=hearing?.outcome;
  const funding=WATER_VEIN_RENEWAL_FUNDING[tag.stance];
  return !!funding&&outcome?.kind==='reopened'&&hearing?.id===tag.id&&outcome.stance===tag.stance&&
    outcome.actorId===opening.openerId&&outcome.sectId===opening.sectId&&outcome.openingId===opening.id&&
    outcome.openedTick===opening.openedTick&&hearing.source.wellProjectId===opening.wellProjectId&&
    outcome.borrowedUnits===opening.borrowedUnits&&outcome.borrowedUnits===funding.borrowedUnits&&
    outcome.paidStones===opening.paidStones+funding.extraStones&&outcome.granaryRoots===funding.roots;
}
