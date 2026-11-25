import {COMEDY_MAX_DELAY,type SectComedyPending,type SectComicMoment} from '../types/sectComedy';
import {starterSectIdentity} from '../types/sectManagement';
import {sectRecurringIdentity} from '../types/sectRecurring';
import type {WorldState} from '../types/world';

export type ComedyContext=Omit<SectComicMoment,'effects'>;
export function comedyPriority(seed:number,tick:number,id:string){
  let value=seed^Math.imul(tick,0x9e3779b1);
  for(const ch of id)value=Math.imul(value^ch.charCodeAt(0),0x01000193);
  return (value^(value>>>16))>>>0;
}
export function comedyRecurringIds(world:WorldState){
  const m=world.sectManagement;
  return m&&sectRecurringIdentity(m.sectId,starterSectIdentity(world.random.seed,m.starterId,m.draw).creditorId);
}
export function comedyIdentity(sectId:string,kind:'item'|'pet'|'recruit',suffix:string){
  return `${sectId}-comedy-${kind}-${suffix}`;
}
export function comedyDueTick(seed:number,ctx:ComedyContext,index:number,range:readonly [number,number]){
  const [lo,hi]=range;
  if(!Number.isSafeInteger(lo)||!Number.isSafeInteger(hi)||lo<1||hi<lo||hi>COMEDY_MAX_DELAY)return;
  const tick=ctx.tick+lo+comedyPriority(seed,ctx.tick,`${ctx.templateId}:${ctx.speakerId}:${index}`)%(hi-lo+1);
  return tick<=100_000_000?tick:undefined;
}
export function comedyRelationTarget(world:WorldState,ctx:ComedyContext,tag:'rival'|'bloodmoon'|'host_sect'){
  return tag==='rival'?comedyRecurringIds(world)?.rivalSectId:tag==='bloodmoon'?'sect-bloodmoon':
    world.locations.find(site=>site.id===ctx.siteId)?.ownerSectId;
}


export const comedyFollowUpKey=(row:SectComedyPending)=>`${row.originTick}-${row.effectIndex}`;
export const comedyFollowUpEventId=(sectId:string,row:SectComedyPending,choice:boolean)=>
  `evt-${row.originTick}-${sectId}-comedy-return-${row.effectIndex}${choice?'-answer':''}`;
