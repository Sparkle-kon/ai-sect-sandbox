import type { VillageSupplyAgreement, VillageSupplyLeg, WorldState } from '../types/world';

export const VILLAGE_SUPPLY_QUANTITY = { earth_root:2, stone:8 } as const;
export const VILLAGE_SUPPLY_FEE = 4;
export const VILLAGE_SUPPLY_OFFER_TICKS = 4;
export const VILLAGE_SUPPLY_MAX_ROUTE_TILES = 32;
export const VILLAGE_SUPPLY_MAX_OPEN_PER_VILLAGE = 1;

export const supplyLegOpen = (leg: VillageSupplyLeg): boolean => leg.phase==='outbound' || leg.phase==='returning';

/** Each leg is oriented along its own source; root and stone move in opposite directions. */
export function supplyLegEndpoints(agreement: VillageSupplyAgreement, good: VillageSupplyLeg['good']) {
  return good==='earth_root'
    ? {source:agreement.fromSettlementId,destination:agreement.toSettlementId}
    : {source:agreement.toSettlementId,destination:agreement.fromSettlementId};
}

export function supplyLegTile(agreement: VillageSupplyAgreement, leg: VillageSupplyLeg, checkpoint = leg.checkpoint): string | undefined {
  const path=agreement.path;
  return path?.[leg.good==='earth_root' ? checkpoint : path.length-1-checkpoint];
}

export interface VillageSupplyNet {
  roots:number;
  stones:number;
  reserveRoots:number;
  reserveStones:number;
}
export type VillageSupplyByVillage = Map<string,VillageSupplyNet>;
const empty=():VillageSupplyNet=>({roots:0,stones:0,reserveRoots:0,reserveStones:0});

/** Derived escrow accounting, not a second material inventory. */
export function villageSupplyByVillage(world:WorldState):VillageSupplyByVillage {
  const result:VillageSupplyByVillage=new Map();
  const balance=(id:string) => {
    let entry=result.get(id);
    if(!entry) {entry=empty();result.set(id,entry);}
    return entry;
  };
  for(const agreement of world.villageSupply.agreements) {
    if(agreement.acceptedTick===undefined || agreement.acceptedTick>world.tick || !agreement.legs) continue;
    for(const leg of agreement.legs) {
      const {source,destination}=supplyLegEndpoints(agreement,leg.good);
      const sending=balance(source),receiving=balance(destination);
      const quantity=VILLAGE_SUPPLY_QUANTITY[leg.good];
      const field=leg.good==='earth_root'?'roots':'stones';
      const reserve=leg.good==='earth_root'?'reserveRoots':'reserveStones';
      sending[field]-=quantity;
      if(supplyLegOpen(leg)) {
        // Both potential final holdings reserve room; only one receives the actual escrow.
        sending[reserve]+=quantity;
        receiving[reserve]+=quantity;
      } else if(leg.phase==='delivered') receiving[field]+=quantity;
      else if(leg.phase==='returned') sending[field]+=quantity;
    }
  }
  return result;
}
export const villageSupplyNet = (world:WorldState,villageId:string):VillageSupplyNet =>
  villageSupplyByVillage(world).get(villageId) ?? empty();

export interface VillageSupplyNativeDelta { tick:number; roots:number; stones:number }
/** Retained exact physical transactions, grouped by actual turn without assuming actor order. */
export function villageSupplyNativeDeltas(world:WorldState,villageId:string):VillageSupplyNativeDelta[] {
  const result=new Map<number,VillageSupplyNativeDelta>();
  const add=(tick:number,good:VillageSupplyLeg['good'],qty:number) => {
    const month=result.get(tick) ?? {tick,roots:0,stones:0};
    if(good==='earth_root') month.roots+=qty;
    else month.stones+=qty;
    result.set(tick,month);
  };
  for(const agreement of world.villageSupply.agreements) {
    if(agreement.acceptedTick===undefined || agreement.acceptedTick>world.tick || !agreement.legs) continue;
    for(const leg of agreement.legs) {
      const {source,destination}=supplyLegEndpoints(agreement,leg.good);
      const quantity=VILLAGE_SUPPLY_QUANTITY[leg.good];
      if(villageId===source) add(agreement.acceptedTick,leg.good,-quantity);
      if(leg.settledTick===undefined || leg.settledTick>world.tick) continue;
      if(leg.phase==='delivered' && destination===villageId || leg.phase==='returned' && source===villageId) {
        add(leg.settledTick,leg.good,quantity);
      }
    }
  }
  return [...result.values()].sort((a,b)=>a.tick-b.tick);
}
