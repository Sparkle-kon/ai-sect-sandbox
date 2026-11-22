import type { SeedWeather } from '../types/world';
import { WATER_VEIN_FIELD_PENALTY_PER_CUN } from './waterVeinTerms';

export const SEED_SOURCE_HERBS=2;
export const SEED_LOT_UNITS=6;
export const SEED_SAMPLE_UNITS=2;
export const SEED_PLOT_UNITS=2;
export const SEED_GROW_TICKS=3;
export const SEED_READY_TICKS=2;

function stableHash(seed:number,key:string):number {
  let value=seed|0;
  for(let i=0;i<key.length;i++)value=Math.imul(value^key.charCodeAt(i),0x9e3779b1);
  value=Math.imul(value^(value>>>16),0x7feb352d);
  value=Math.imul(value^(value>>>15),0x846ca68b);
  return ((value^(value>>>16))>>>0)/0x100000000;
}
function condition(weather:SeedWeather):number {
  const {intensity,kind}=weather;
  return (Math.max(0,Math.min(100,weather.soilQi))/100-.5)*.28+
    (kind==='灵潮'?.18*intensity:kind==='罡风'?-.20*intensity:kind==='霜息'?-.36*intensity:0) -
    WATER_VEIN_FIELD_PENALTY_PER_CUN*(weather.waterDeficit??0);
}
function roots(seed:number,lotId:string,key:string,weatherScore:number):0|1|2 {
  const vigor=.38+.40*stableHash(seed,`${lotId}:base-vigor`);
  const chance=Math.max(.05,Math.min(.95,vigor+weatherScore));
  return (Number(stableHash(seed,`${lotId}:${key}:0`)<chance)+Number(stableHash(seed,`${lotId}:${key}:1`)<chance)) as 0|1|2;
}
export function measureSeedTrial(seed:number,lotId:string,weather:SeedWeather):0|1|2 {
  return roots(seed,lotId,`trial:${weather.tick}`,condition(weather));
}
export function measureSeedPlot(seed:number,lotId:string,plotId:string,weather:readonly SeedWeather[]):0|1|2 {
  return roots(seed,lotId,`plot:${plotId}`,weather.reduce((sum,reading)=>sum+condition(reading),0)/Math.max(1,weather.length));
}
