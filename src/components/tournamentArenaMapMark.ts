import type {WorldState} from '../types/world';

export function tournamentArenaMapMarks(world:WorldState,isCurrentLocation:(id:string)=>boolean):ReadonlyMap<string,number>{
  const result=new Map<string,number>();
  for(const stage of world.occasions){
    if(stage.kind!=='tournament'||stage.omenId!==undefined||stage.status!=='running'||!stage.arena||
      stage.arena.openedTick>world.tick||stage.arena.terminal||!isCurrentLocation(stage.locationId))continue;
    result.set(stage.locationId,stage.arena.rounds.length);
  }
  return result;
}

export function drawTournamentArenaMark(ctx:CanvasRenderingContext2D,x:number,y:number,round:number):void{
  const cx=x+20,cy=y+17;
  ctx.save();
  ctx.translate(cx,cy);
  ctx.beginPath();
  ctx.moveTo(-8,0);ctx.lineTo(0,-8);ctx.lineTo(8,0);ctx.lineTo(0,8);ctx.closePath();
  ctx.fillStyle='#342239';ctx.fill();
  ctx.strokeStyle=round>0?'#fcd48f':'#b9daff';ctx.lineWidth=1.45;ctx.stroke();
  ctx.beginPath();ctx.moveTo(-3,-3);ctx.lineTo(3,3);ctx.moveTo(3,-3);ctx.lineTo(-3,3);ctx.stroke();
  ctx.restore();
}
