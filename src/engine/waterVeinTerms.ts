import type { ColdWaterVeinState, WaterVeinOpening, WaterVeinRenewalStance, WaterVeinSymptom, WorldState } from '../types/world';

export const WATER_VEIN_SITE='loc-vein-north';
export const WATER_VEIN_ID='north-cold-water';
export const WATER_VEIN_TILES=['tile-12-2','tile-12-3','tile-12-4'] as const;
export const WATER_VEIN_BASELINE=24;
export const WATER_VEIN_OPEN_STONES=40;
export const WATER_VEIN_SURVEY_STONES=2;
export const WATER_VEIN_BORROW_UNITS=9;
export const WATER_VEIN_ORE_CAPACITY=18;
export const WATER_VEIN_RECOVERY_TICKS=6;
export const WATER_VEIN_COOLDOWN_TICKS=9;
export const WATER_VEIN_FIELD_PENALTY_PER_CUN=.15;
export const WATER_VEIN_RENEWAL_FUNDING = {
  reuse:{extraStones:0,roots:0,borrowedUnits:9},
  sect:{extraStones:24,roots:0,borrowedUnits:0},
  accord:{extraStones:8,roots:1,borrowedUnits:3},
} as const satisfies Record<WaterVeinRenewalStance,{extraStones:number;roots:number;borrowedUnits:number}>;
const openingBorrow = (opening:WaterVeinOpening):number|undefined => {
  if(!opening.renewal)return WATER_VEIN_BORROW_UNITS;
  const {stance}=opening.renewal;
  return Object.hasOwn(WATER_VEIN_RENEWAL_FUNDING,stance) ? WATER_VEIN_RENEWAL_FUNDING[stance].borrowedUnits : undefined;
};
const fundedBorrow=(opening:WaterVeinOpening)=>opening.paidStones===WATER_VEIN_OPEN_STONES&&opening.borrowedUnits===openingBorrow(opening);
export function waterVeinApertureActive(opening:WaterVeinOpening|undefined,tick:number):boolean {
  if(!opening||!fundedBorrow(opening))return false;
  const age=tick-opening.openedTick;
  return Number.isSafeInteger(age)&&age>=1&&age<WATER_VEIN_RECOVERY_TICKS;
}
/** Accord expense is independent of native disaster draws; only the actual linked opening is a debit. */
export function northRenewalGranaryRootDeltas(world:WorldState,settlementId:string) {
  return world.coldWaterVein?.settlementId===settlementId ? world.coldWaterVein.openings.flatMap(row=>
    row.renewal?.stance==='accord'&&fundedBorrow(row)? [{tick:row.openedTick,roots:-WATER_VEIN_RENEWAL_FUNDING.accord.roots,stones:0}] : []) : [];
}
export function northRenewalGranaryRootSpent(world:WorldState,settlementId:string):number {
  return northRenewalGranaryRootDeltas(world,settlementId).reduce((spent,row)=>spent-row.roots,0);
}

export const WATER_VEIN_SIGNAL_OFFSETS={well:1,field:2,mine:3,recovered:6} as const;
export function waterVeinSymptomEventId(opening:WaterVeinOpening,symptom:WaterVeinSymptom):string{
  return `evt-${opening.id}-${symptom}-${opening.openedTick+WATER_VEIN_SIGNAL_OFFSETS[symptom]}`;
}
export function waterVeinPhase(opening:WaterVeinOpening|undefined,tick:number){
  const age=opening ? tick-opening.openedTick : -1;
  const borrowed=opening&&fundedBorrow(opening)?opening.borrowedUnits:0;
  // One third of the current loan is the peak well-depth loss. Minute loans
  // cannot produce a smaller fractional deficit than the physical ruler reads.
  const depthLoss=age>=1&&age<=5 ? Math.ceil(Math.min(3,6-age)*borrowed/WATER_VEIN_BORROW_UNITS) : 0;
  const remainingUnits=age>=0&&age<=3?borrowed:
    age>=4&&age<=5?Math.min(3,6-age)*borrowed/3:0;
  return {wellDepth:WATER_VEIN_BASELINE-depthLoss,fieldDeficit:age>=2&&depthLoss>0?depthLoss:undefined,
    mineYield:age>=3&&depthLoss>0?1:2,remainingUnits,
    symptom:borrowed===0?undefined:age===6?'recovered' as const:age>=3&&age<=5?'mine' as const:
      age===2?'field' as const:age===1?'well' as const:undefined};
}
export function latestWaterRow<T>(rows:readonly T[]|undefined,matches:(row:T)=>boolean):T|undefined{
  if(!rows)return undefined;
  for(let i=rows.length-1;i>=0;i--)if(matches(rows[i]))return rows[i];
  return undefined;
}
export function waterVeinOpeningAt(state:ColdWaterVeinState|undefined,tick:number):WaterVeinOpening|undefined{
  return latestWaterRow(state?.openings,row=>row.openedTick<=tick);
}
export function waterVeinFieldDeficit(world:WorldState,siteId:string):number|undefined{
  if(siteId!==WATER_VEIN_SITE||world.coldWaterVein?.siteId!==siteId)return undefined;
  return waterVeinPhase(waterVeinOpeningAt(world.coldWaterVein,world.tick),world.tick).fieldDeficit;
}
