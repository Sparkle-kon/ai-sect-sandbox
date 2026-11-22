import {clanCeremonyEventMatches,clanEventId} from '../engine/cultivationClanTerms';
import type {WorldState} from '../types/world';

/** A visible real ceremony, not the private invitation, agreement or identity of a child. */
export function cultivationClanMapSites(world:WorldState,visible:(id:string)=>boolean,historical:boolean):ReadonlySet<string>{
  const sites=new Set<string>();
  if(historical)return sites;
  for(const union of world.cultivationClans?.unions??[]){
    if(union.status!=='bonded'||union.ceremony?.tick!==world.tick||union.ceremony.qiPaidEach!==8||
      !visible(union.siteId)||world.locations.filter(row=>row.id===union.siteId).length!==1)continue;
    const rows=world.events.filter(row=>row.id===clanEventId(world.tick,union.id,'ceremony'));
    if(rows.length!==1)continue;
    const [event]=rows;
    if(event.year!==world.year||event.month!==world.month||!clanCeremonyEventMatches(union,event))continue;
    sites.add(union.siteId);
  }
  return sites;
}

export function drawCultivationClanMapSeal(ctx:CanvasRenderingContext2D,x:number,y:number):void {
  ctx.save();
  ctx.translate(x-22,y+17);
  ctx.strokeStyle='#ffd6a0';ctx.lineWidth=1.7;
  ctx.beginPath();
  ctx.moveTo(0,0);ctx.quadraticCurveTo(-11,-14,-12,-2);ctx.quadraticCurveTo(-11,8,0,0);
  ctx.quadraticCurveTo(11,-14,12,-2);ctx.quadraticCurveTo(11,8,0,0);
  ctx.moveTo(-2,4);ctx.lineTo(-4,10);
  ctx.moveTo(2,4);ctx.lineTo(4,10);
  ctx.stroke();
  ctx.restore();
}
