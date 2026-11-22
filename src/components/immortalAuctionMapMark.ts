import {IMMORTAL_AUCTION_SITE} from '../engine/immortalAuctionTerms';
import type {WorldState} from '../types/world';

export function immortalAuctionMapMark(world:WorldState,maySee:(id:string)=>boolean,historical:boolean):
  {siteId:string;count:number}|undefined{
  if(historical||!maySee(IMMORTAL_AUCTION_SITE)||world.locations.filter(row=>row.id===IMMORTAL_AUCTION_SITE&&row.type==='market').length!==1)
    return undefined;
  const count=world.immortalAuction?.lots.filter(lot=>!lot.terminal&&lot.listedTick<=world.tick&&world.tick<=lot.closesTick).length??0;
  return count?{siteId:IMMORTAL_AUCTION_SITE,count}:undefined;
}

export function drawImmortalAuctionMapMark(ctx:CanvasRenderingContext2D,x:number,y:number,count:number):void{
  ctx.save();
  ctx.translate(x+19,y+18);
  ctx.fillStyle='#3b2234';ctx.strokeStyle='#f5cb8c';ctx.lineWidth=1.35;
  ctx.beginPath();
  ctx.moveTo(-8,1);ctx.lineTo(-4,-7);ctx.lineTo(5,-7);ctx.lineTo(9,1);ctx.lineTo(0,9);ctx.closePath();
  ctx.fill();ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-4,-7);ctx.lineTo(0,9);ctx.lineTo(5,-7);
  if(count>1){ctx.moveTo(-9,-10);ctx.lineTo(-6,-12);ctx.moveTo(6,-12);ctx.lineTo(9,-10);}
  ctx.stroke();
  ctx.restore();
}
