import {useEffect,useId,useMemo,useRef} from 'react';

export interface FrontierChartCell {
  chartId:string;tileId:string;row:number;col:number;
  name?:string;heading?:string;
}
export interface FrontierChartData {
  chartId:string;name:string;rows:number;cols:number;
  currentTileId:string;tiles:readonly FrontierChartCell[];
}
type Blueprint={tiles:FrontierChartCell[];cols:number;rows:number;active:FrontierChartCell};
export const frontierCoordinate=({row,col}:Pick<FrontierChartCell,'row'|'col'>)=>`第 ${row+1} 行，第 ${col+1} 列`;

/** This is one actual named chart, never a second realm or a conversion to the old terrain canvas. */
export function frontierChartGeometry(data:FrontierChartData):Blueprint|undefined{
  const {chartId,rows,cols,currentTileId}=data;
  if(!chartId||!Number.isInteger(rows)||rows<1||rows>12||!Number.isInteger(cols)||cols<1||cols>12)return undefined;
  const valid=data.tiles.filter(tile=>tile.chartId===chartId&&tile.tileId&&Number.isInteger(tile.row)&&
    Number.isInteger(tile.col)&&tile.row>=0&&tile.row<rows&&tile.col>=0&&tile.col<cols);
  const ids=new Map<string,number>(),coordinates=new Map<string,number>();
  const coordinateKey=(tile:FrontierChartCell)=>`${tile.row}:${tile.col}`;
  for(const tile of valid){
    ids.set(tile.tileId,(ids.get(tile.tileId)??0)+1);
    const at=coordinateKey(tile);
    coordinates.set(at,(coordinates.get(at)??0)+1);
  }
  const tiles=valid.filter(tile=>ids.get(tile.tileId)===1&&coordinates.get(coordinateKey(tile))===1)
    .sort((left,right)=>left.row-right.row||left.col-right.col);
  const active=tiles.find(tile=>tile.tileId===currentTileId);
  if(!active)return undefined;
  return {tiles,rows,cols,active};
}

const WIDTH=480,HEIGHT=270;
function paintFrontierChart(ctx:CanvasRenderingContext2D,blueprint:Blueprint){
  const {tiles,cols,rows,active}=blueprint;
  const size=Math.min((WIDTH-30)/cols,(HEIGHT-24)/rows);
  const left=(WIDTH-cols*size)/2,top=(HEIGHT-rows*size)/2;
  ctx.clearRect(0,0,WIDTH,HEIGHT);
  ctx.fillStyle='#091523';ctx.fillRect(0,0,WIDTH,HEIGHT);
  ctx.font='500 14px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  for(const tile of tiles){
    const x=left+tile.col*size,y=top+tile.row*size,current=tile.tileId===active.tileId;
    ctx.fillStyle=current?'#235153':'#132e36';
    ctx.fillRect(x+1,y+1,size-2,size-2);
    ctx.strokeStyle=current?'#fde68a':'#3e7078';ctx.lineWidth=current?3:1;
    ctx.strokeRect(x+2,y+2,size-4,size-4);
    ctx.fillStyle=current?'#fef3c7':'#d2f2f4';
    ctx.fillText(`${tile.row+1}·${tile.col+1}`,x+size/2,y+size*(tile.name?.trim()&&size>=42?.37:.50),size-7);
    if(tile.name?.trim()&&size>=42)ctx.fillText(tile.name,x+size/2,y+size*.67,size-7);
  }
}

export function FrontierChart({chart}:{chart:FrontierChartData}){
  const geometry=useMemo(()=>frontierChartGeometry(chart),[chart]);
  const canvas=useRef<HTMLCanvasElement>(null);
  const caption=useId();
  useEffect(()=>{
    const ctx=geometry&&canvas.current?.getContext('2d');
    if(ctx&&geometry)paintFrontierChart(ctx,geometry);
  },[geometry]);
  if(!geometry)return null;
  const {active,tiles}=geometry;
  return <figure className="min-w-0 space-y-1" aria-labelledby={caption}>
    <figcaption id={caption} className="text-sm text-emerald-100">此处脚下：{active.name&&`${active.name} · `}{frontierCoordinate(active)}。</figcaption>
    <canvas ref={canvas} width={WIDTH} height={HEIGHT} aria-hidden="true"
      className="mx-auto block h-auto w-full max-w-sm rounded border border-emerald-800/70"/>
    <details className="min-w-0 rounded border border-slate-800 px-2">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm text-slate-200 focus-visible:outline focus-visible:outline-amber-300">已知地块与坐标</summary>
      <ol className="space-y-1 pb-2 text-xs text-slate-300" aria-label="本图已知地块">
        {tiles.map(tile=><li key={tile.tileId} aria-current={tile.tileId===active.tileId?'location':undefined}>
          {tile.name&&`${tile.name} · `}{frontierCoordinate(tile)}{tile.heading&&` · ${tile.heading}`}
          {tile.tileId===active.tileId&&' · 此人所在'}
        </li>)}
      </ol>
    </details>
  </figure>;
}
