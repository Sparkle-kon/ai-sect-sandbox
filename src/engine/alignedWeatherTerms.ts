import type {WorldState} from '../types/world';

export const ALIGNED_WEATHER_OFFER_TICKS=3;
export const ALIGNED_WEATHER_SOURCE_MAX_AGE=5;

export function alignedWeatherPinnedRuns(world:WorldState):Map<string,Set<number>>{
  const result=new Map<string,Set<number>>();
  function keep(id:string,tick:number){
    const known=result.get(id);
    if(known)known.add(tick);
    else result.set(id,new Set([tick]));
  }
  for(const row of world.alignedWeather.comparisons){
    keep(row.observerAId,row.first.openedTick);
    if(row.status==='compared'&&row.second)keep(row.observerBId,row.second.openedTick);
  }
  return result;
}
