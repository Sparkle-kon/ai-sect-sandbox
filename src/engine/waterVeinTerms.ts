import type { ColdWaterVeinState, WaterVeinOpening, WaterVeinSymptom, WorldState } from '../types/world';

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

export const WATER_VEIN_SIGNAL_OFFSETS={well:1,field:2,mine:3,recovered:6} as const;
export function waterVeinSymptomEventId(opening:WaterVeinOpening,symptom:WaterVeinSymptom):string{
  return `evt-${opening.id}-${symptom}-${opening.openedTick+WATER_VEIN_SIGNAL_OFFSETS[symptom]}`;
}
export function waterVeinPhase(opening:WaterVeinOpening|undefined,tick:number){
  const age=opening ? tick-opening.openedTick : -1;
  const depthLoss=age>=1&&age<=5 ? Math.min(3,6-age) : 0;
  return {wellDepth:WATER_VEIN_BASELINE-depthLoss,fieldDeficit:age>=2&&depthLoss>0?depthLoss:undefined,
    mineYield:age>=3&&depthLoss>0?1:2,
    // The same charge is held through the actual affected phase, with exact return by +6.
    remainingUnits:age>=0&&age<=3?WATER_VEIN_BORROW_UNITS:depthLoss*3,
    symptom:age===6?'recovered' as const:age>=3&&age<=5?'mine' as const:
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
