import {heavenlyAlchemyLightning} from '../engine/heavenlyAlchemyEngine';
import type {WorldState} from '../types/world';

export interface HeavenlyAlchemyMapMark{
  readonly siteId:string;
  readonly x:number;
  readonly y:number;
  readonly quality:'immortal'|'peerless';
}

export function buildHeavenlyAlchemyMapVfx(world:WorldState,authorized:(siteId:string)=>boolean,historical:boolean):HeavenlyAlchemyMapMark[]{
  if(historical)return [];
  const marks=new Map<string,HeavenlyAlchemyMapMark>();
  for(const event of world.events){
    if(event.tick!==world.tick||event.category!=='heavenly'||!event.locationId||!authorized(event.locationId))continue;
    const exact=heavenlyAlchemyLightning(world,event);
    if(!exact)continue;
    const locations=world.locations.filter(site=>site.id===exact.siteId);
    if(locations.length!==1)continue;
    const site=locations[0];
    if(marks.get(site.id)?.quality==='peerless')continue;
    marks.set(site.id,{siteId:site.id,x:site.x,y:site.y,quality:exact.quality});
  }
  return [...marks.values()];
}

/** Decorative lightning and alchemical fragrance, never a combat/damage marker. */
export function drawHeavenlyAlchemyMapVfx(ctx:CanvasRenderingContext2D,marks:readonly HeavenlyAlchemyMapMark[],
  elapsed:number,animate:boolean,pixel:number):void{
  for(const {x,y,quality} of marks){
    const strength=quality==='peerless'?1:.74;
    const progress=animate?Math.max(0,Math.min(1,elapsed/1100)):1;
    ctx.save();
    ctx.translate(x,y);
    ctx.strokeStyle=quality==='peerless'?'#ffdc88':'#a5f3fc';
    ctx.lineWidth=Math.max(1,1.5*pixel);
    ctx.globalAlpha=.44*strength;
    ctx.beginPath();ctx.ellipse(0,6,20+9*progress,9+4*progress,0,0,Math.PI*2);ctx.stroke();
    if(animate&&progress<1){
      ctx.globalAlpha=(1-progress)*.85*strength;
      ctx.lineWidth=Math.max(1.4,2.75*pixel);
      ctx.beginPath();ctx.moveTo(7,-40);ctx.lineTo(-2,-28);ctx.lineTo(3,-25);ctx.lineTo(-6,-10);ctx.lineTo(-1,-9);ctx.lineTo(0,0);ctx.stroke();
    }else{
      ctx.globalAlpha=.85*strength;
      ctx.beginPath();ctx.moveTo(0,-15);ctx.lineTo(4,-9);ctx.lineTo(0,-3);ctx.lineTo(-4,-9);ctx.closePath();ctx.stroke();
    }
    ctx.restore();
  }
}
