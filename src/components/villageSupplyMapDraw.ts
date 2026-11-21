import type { VillageSupplyCheckpoint } from '../engine/villageSupplyEngine';

/** Distinct diamond and label are legible without hue; never draw an unprojected path. */
export function drawVillageSupplyCheckpoints(ctx:CanvasRenderingContext2D, rows:readonly VillageSupplyCheckpoint[], zoom:number):void {
  if(rows.length===0) return;
  const scale=1/Math.max(1,zoom), radius=9*scale;
  ctx.save();
  for(const row of rows) {
    ctx.strokeStyle='#f5d399';
    ctx.lineWidth=2*scale;
    if(row.route.length>1) {
      ctx.setLineDash((row.returning?[2,4]:[5,3,2,3]).map((value)=>value*scale));
      ctx.beginPath();
      row.route.forEach(({x,y},index)=>index===0?ctx.moveTo(x,y):ctx.lineTo(x,y));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    const {x,y}=row.marker;
    ctx.beginPath();
    ctx.moveTo(x,y-radius);
    ctx.lineTo(x+radius,y);
    ctx.lineTo(x,y+radius);
    ctx.lineTo(x-radius,y);
    ctx.closePath();
    ctx.fillStyle='#452b13';ctx.fill();ctx.stroke();
    ctx.font=`bold ${11*scale}px sans-serif`;ctx.fillStyle='#fef3c7';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(row.returning?'返':'运',x,y+.7*scale);
  }
  ctx.restore();
}
