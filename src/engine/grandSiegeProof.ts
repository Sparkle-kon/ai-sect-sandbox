import type { SectSiege, WorldEvent, WorldState } from '../types/world';

export const theatreOf=(world:WorldState,siege:SectSiege)=>world.sieges.includes(siege)?siege.theatre:undefined;
export const roundEventId=(tick:number,id:string)=>`evt-${tick}-dip-${id}`;
export function currentPublic(world:WorldState,event:WorldEvent){
  return event.tick===world.tick&&event.year===world.year&&event.month===world.month&&event.category==='diplomacy'&&
    event.witnessScope===undefined;
}

/** Only an actual terminal native siege or its signed ceasefire can leave a battlefield. */
export function finishGrandSiegeTheatre(world:WorldState,siege:SectSiege,event:WorldEvent):void{
  const theatre=theatreOf(world,siege);
  const status=siege.status;
  if(!theatre||theatre.terminal||status==='marching'||status==='sieging'||siege.lastResolvedTick!==world.tick||
    !currentPublic(world,event))return;
  if(status==='withdrawn'){
    if(event.title!=='两宗签署停战撤军议约'||!world.ceasefires.agreements.some(deal=>deal.status==='active'&&
      deal.signedTick===world.tick&&deal.withdrawnSiegeIds.includes(siege.id)&&event.id===`evt-${world.tick}-${deal.id}-signed`))return;
  }else if(event.id!==roundEventId(world.tick,siege.id)||event.locationId!==siege.destinationId||
    event.title!==(status==='victory'?'攻山告捷':'攻山退兵'))return;
  delete theatre.queued;
  theatre.terminal={tick:world.tick,status,sourceEventId:event.id,battlefield:theatre.rounds.length>0};
}
