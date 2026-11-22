import type { NorthMiningCharter, VillageSupplyAgreement, VillageSupplyLeg, WorldState } from '../types/world';

export const NORTH_MINING_SITE='loc-vein-north';
export const NORTH_MINING_SETTLEMENT='village-loc-vein-north';
export const NORTH_MINING_MARKET='village-loc-market';
export const NORTH_MINING_DETOUR_COST=24;
export const NORTH_MINING_CHARTER_TICKS=6;
export const NORTH_MINING_WATER_MIDPOINTS=['tile-12-3','tile-12-4'] as const;
export const NORTH_MINING_ROLES=['household','miner','sect'] as const;
export function activeNorthMiningCharter(world:WorldState,tick=world.tick):NorthMiningCharter|undefined{
  const rows=world.northMiningCharters?.charters;
  if(!rows)return undefined;
  for(let i=rows.length-1;i>=0;i--){
    const row=rows[i];
    if(row.status==='ratified'&&row.ratifiedTick!==undefined&&row.ratifiedTick<=tick)return row;
  }
  return undefined;
}
export const northMiningIsSealed=(world:WorldState,tick=world.tick)=>activeNorthMiningCharter(world,tick)?.stance==='seal';
const equal=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((item,i)=>item===b[i]);

export function northRouteFor(row:NorthMiningCharter,from:string,to:string):string[]|undefined{
  const route=row.route;
  if(row.status!=='ratified'||row.stance!=='detour'||row.paidStones!==NORTH_MINING_DETOUR_COST||!route)return undefined;
  if(route.fromSettlementId===from&&route.toSettlementId===to)return [...route.detourTiles];
  if(route.fromSettlementId===to&&route.toSettlementId===from)return [...route.detourTiles].reverse();
  return undefined;
}
export function paidNorthMiningRoute(world:WorldState,from:string,to:string,tick=world.tick){
  const row=activeNorthMiningCharter(world,tick);
  if(!row)return undefined;
  const path=northRouteFor(row,from,to);
  return path?{path,charterId:row.id}:undefined;
}

/** Called only on a successful native cargo checkpoint movement, before any terminal result. */
export function retainNorthMiningPassage(world:WorldState,supply:VillageSupplyAgreement,leg:VillageSupplyLeg,tileId:string):void{
  if(!supply.northMiningCharterId||supply.status!=='active'||!supply.path||supply.acceptedTick===undefined||
    leg.phase!=='outbound'||leg.lastAdvancedTick!==world.tick||world.tick!==supply.acceptedTick+leg.checkpoint||leg.checkpoint<1)return;
  const row=world.northMiningCharters?.charters.find(item=>item.id===supply.northMiningCharterId);
  if(!row||row.firstPassage||row.ratifiedTick===undefined||row.ratifiedTick>supply.acceptedTick||!row.route||
    row.route.originalTiles.includes(tileId))return;
  const path=northRouteFor(row,supply.fromSettlementId,supply.toSettlementId);
  if(!path||!equal(path,supply.path)||path[leg.good==='earth_root'?leg.checkpoint:path.length-1-leg.checkpoint]!==tileId)return;
  row.firstPassage={agreementId:supply.id,tick:world.tick,good:leg.good,checkpoint:leg.checkpoint,tileId};
}
