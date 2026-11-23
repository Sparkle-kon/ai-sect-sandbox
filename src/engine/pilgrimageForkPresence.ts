import type {Cultivator,WorldState} from '../types/world';

export function pilgrimageForkTravelLocked(world:WorldState,actor:Cultivator):boolean{
  return !!world.pilgrimageForks?.forks.some(fork=>fork.choices.some(choice=>choice.actorId===actor.id&&
    (choice.status==='waiting'||choice.status==='traveling'||choice.status==='closed'&&actor.alive&&actor.hp>0&&
      actor.positionPlane===undefined&&actor.locationId===fork.siteId&&!!choice.steps?.length)));
}
export function pilgrimageForkActedThisTick(world:WorldState,actor:Cultivator):boolean{
  return !!world.pilgrimageForks?.forks.some(fork=>fork.choices.some(choice=>choice.actorId===actor.id&&
    (choice.tick===world.tick||choice.steps?.at(-1)?.tick===world.tick)));
}
export function pilgrimageForkCheckpoint(world:WorldState,actor:Cultivator){
  if(!actor.alive||actor.hp<=0||actor.positionPlane!==undefined)return undefined;
  for(const fork of world.pilgrimageForks?.forks??[]){
    if(actor.locationId!==fork.siteId)continue;
    const choice=fork.choices.find(choice=>choice.actorId===actor.id&&
      (choice.status==='traveling'||choice.status==='closed'));
    const point=choice?.steps?.at(-1);
    if(point)return {x:point.x,y:point.y};
  }
}
