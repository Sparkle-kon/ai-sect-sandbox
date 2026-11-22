import {projectExpeditionDungeon} from '../engine/expeditionDungeonEngine';
import type {DungeonRoom} from '../types/expeditionDungeon';
import type {Cultivator,WorldState} from '../types/world';

export function expeditionDungeonMapMark(world:WorldState,viewer:Cultivator|undefined,isVisible:(id:string)=>boolean){
  const view=projectExpeditionDungeon(world,viewer);
  if(!view||view.closedTick!==undefined||!isVisible(view.siteId)||
    !view.members.some(row=>row.actorId===viewer?.id&&row.leftTick===undefined))return undefined;
  return {siteId:view.siteId,room:view.room};
}

export const DUNGEON_MAP_LABELS:Readonly<Record<DungeonRoom,string>>={garden:'外围药园',hall:'核心古殿',sanctum:'传承禁地'};
const hues:Readonly<Record<DungeonRoom,string>>={garden:'#a3edb9',hall:'#8ccff8',sanctum:'#f8b08c'};
export function drawDungeonMapMark(ctx:CanvasRenderingContext2D,x:number,y:number,room:DungeonRoom){
  const active=room==='garden'?0:room==='hall'?1:2;
  ctx.save();
  ctx.translate(x+16,y+20);
  ctx.strokeStyle=hues[room];ctx.lineWidth=1.5;
  for(let i=0;i<3;i++){
    const left=(i-1)*8;
    ctx.fillStyle=i===active?hues[room]:'#182632';
    ctx.fillRect(left-3,-3,6,6);
    ctx.strokeRect(left-3,-3,6,6);
  }
  ctx.restore();
}
