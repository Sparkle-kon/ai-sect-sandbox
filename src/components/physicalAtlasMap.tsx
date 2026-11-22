import {PHYSICAL_ATLAS_REGION_NAMES} from '../engine/physicalAtlasTerms';
import type {PhysicalAtlasPoint,PhysicalAtlasView} from '../engine/physicalAtlasTerms';
import type {MapPoint} from '../types/world';
import {MAP_HEIGHT,MAP_WIDTH} from './mapCamera';
import type {PaintedMapMark} from './mapPaintedSemantics';

type Route=PhysicalAtlasView['routes'][number];
type Border=PhysicalAtlasView['borders'][number];
type Stroke={mark:PaintedMapMark;start:MapPoint;end:MapPoint;style:'border'|Route['status']};
type Drawing={borders:Stroke[];routes:Stroke[]};

const names=PHYSICAL_ATLAS_REGION_NAMES;
const routeNames:Record<Route['kind'],string>={road:'驿路',village_supply:'乡运'};
const statuses:Record<Route['status'],string>={established:'已立路，未见实走凭据',traversed:'有原生实走凭据',closed:'已停用，不作通行凭据'};
const style:Record<Stroke['style'],{ink:string;width:number;dash:readonly number[]}>={
  border:{ink:'#c4b5fd',width:1.25,dash:[2,3]},
  established:{ink:'#7dd3fc',width:2,dash:[4,2]},
  traversed:{ink:'#6ee7b7',width:3,dash:[]},
  closed:{ink:'#fda4af',width:2,dash:[1,3]},
};
const pair=(from:PhysicalAtlasPoint,to:PhysicalAtlasPoint)=>JSON.stringify(
  [from.address.tileId,to.address.tileId].sort());
const validPoint=(p:PhysicalAtlasPoint,cols:number,rows:number)=>
  p.address.chartId==='lower-base'&&p.address.tileId===`tile-${p.col}-${p.row}`&&
  Number.isInteger(p.col)&&Number.isInteger(p.row)&&p.col>=0&&p.col<cols&&p.row>=0&&p.row<rows&&Object.hasOwn(names,p.regionId);

/** Only layered, currently authorized DTO geometry becomes paint or an accessibility destination. */
export function planPhysicalAtlasDrawing(view:PhysicalAtlasView|undefined,{cols,rows}:{cols:number;rows:number}):Drawing {
  const result:Drawing={borders:[],routes:[]};
  if(!view||!Number.isInteger(cols)||!Number.isInteger(rows)||cols<1||rows<1)return result;
  const tileW=MAP_WIDTH/cols,tileH=MAP_HEIGHT/rows;
  const center=(p:PhysicalAtlasPoint):MapPoint=>({x:(p.col+.5)*tileW,y:(p.row+.5)*tileH});
  const middle=(from:MapPoint,to:MapPoint):MapPoint=>({x:(from.x+to.x)/2,y:(from.y+to.y)/2});
  const valid=({from,to}:Border)=>
    validPoint(from,cols,rows)&&validPoint(to,cols,rows)&&view.regions.includes(from.regionId)&&view.regions.includes(to.regionId)&&
    from.regionId!==to.regionId&&Math.abs(from.col-to.col)+Math.abs(from.row-to.row)===1;
  const seen=new Map<string,Border>();
  for(const border of view.borders){
    if(!valid(border))continue;
    const {from,to}=border,key=pair(from,to);
    if(seen.has(key))continue;
    seen.set(key,border);
    const p=middle(center(from),center(to));
    const vertical=from.row===to.row;
    const sides=vertical?{dx:0,dy:tileH/2}:{dx:tileW/2,dy:0};
    result.borders.push({style:'border',
      start:{x:p.x-sides.dx,y:p.y-sides.dy},end:{x:p.x+sides.dx,y:p.y+sides.dy},
      mark:{id:`atlas-border:${key}`,kind:'route',title:`${names[from.regionId]}与${names[to.regionId]}界线`,
        summary:'仅两格均在眼下视野内的点线；不等于宗门地权，也不是通行路。',point:p}});
  }
  const strokeKeys=new Set<string>();
  for(const route of view.routes){
    const same=(a:PhysicalAtlasPoint,b:PhysicalAtlasPoint)=>a.address.tileId===b.address.tileId&&a.regionId===b.regionId;
    const ordered=(a:Border,b:Border)=>same(a.from,b.from)&&same(a.to,b.to);
    const onAuthorizedPair=(crossing:Border)=>{
      if(!valid(crossing))return false;
      const actual=seen.get(pair(crossing.from,crossing.to));
      return !!actual&&(ordered(actual,crossing)||ordered({from:actual.to,to:actual.from},crossing));
    };
    const declared=route.borders.filter(onAuthorizedPair);
    const traversed=route.traversedBorders.filter(row=>onAuthorizedPair(row)&&
      declared.some(candidate=>pair(candidate.from,candidate.to)===pair(row.from,row.to)));
    const append=(crossing:Border,walked:boolean)=>{
      const {from,to}=crossing;
      const id=`atlas-route:${JSON.stringify([route.kind,route.id,from.address.tileId,to.address.tileId])}`;
      if(strokeKeys.has(id))return;
      strokeKeys.add(id);
      const start=center(from),end=center(to);
      const shown=route.status==='closed'?'closed':walked?'traversed':'established';
      const summary=route.status==='closed'&&walked?'已停用；这段另有往日实走凭据':
        route.kind==='village_supply'&&shown==='established'?'乡运已立约，本段未见实走凭据':statuses[shown];
      result.routes.push({style:shown,start,end,
        mark:{id,kind:'route',title:`${names[from.regionId]}至${names[to.regionId]}：${routeNames[route.kind]}`,
          summary:`${summary}；仅此段可见，不表示全路可走。`,point:middle(start,end)}});
    };
    for(const crossing of declared)append(crossing,traversed.some(row=>ordered(row,crossing)));
    for(const crossing of traversed)append(crossing,true);
  }
  return result;
}

export function physicalAtlasMapMarks({borders,routes}:Drawing):PaintedMapMark[]{
  return [...borders,...routes].map(row=>row.mark);
}

export function drawPhysicalAtlas(ctx:CanvasRenderingContext2D,{borders,routes}:Drawing,logicalPerCssPixel:number){
  if(!borders.length&&!routes.length)return;
  if(!Number.isFinite(logicalPerCssPixel)||logicalPerCssPixel<=0)return;
  ctx.save();
  ctx.lineCap='round';
  for(const stroke of [...borders,...routes.filter(row=>row.style!=='traversed'),...routes.filter(row=>row.style==='traversed')]){
    const ink=style[stroke.style];
    ctx.strokeStyle=ink.ink;
    ctx.lineWidth=ink.width*logicalPerCssPixel;
    ctx.setLineDash(ink.dash.map(size=>size*logicalPerCssPixel));
    ctx.beginPath();
    ctx.moveTo(stroke.start.x,stroke.start.y);
    ctx.lineTo(stroke.end.x,stroke.end.y);
    ctx.stroke();
  }
  ctx.restore();
}

interface Summary {
  view?:PhysicalAtlasView;
  drawing?:Drawing;
  locationName?:string;
  locationOwner?:string;
  tileOwner?:string;
}

export function PhysicalAtlasSummary({view,drawing,locationName,locationOwner,tileOwner}:Summary){
  if(!view?.home&&!drawing?.borders.length&&!drawing?.routes.length)return null;
  const pairs=new Set(drawing?.borders.map(({mark})=>mark.title.replace(/界线$/u,'')));
  const home=view?.home;
  const example=drawing?.routes.find(row=>row.style==='traversed')??drawing?.routes[0];
  return <section aria-label="实地域册" className="w-full min-w-0 space-y-1 border-t border-slate-800/80 pt-2 text-sm text-violet-100 [overflow-wrap:anywhere]">
    {home&&<p>现地：{names[home.point.regionId]}{home.locationId&&locationName?` · ${locationName}`:''}</p>}
    {home&&((home.locationOwnerSectId&&locationOwner)||(home.tileOwnerSectId&&tileOwner))&&
      <p className="flex flex-wrap gap-x-3 text-xs text-slate-300">
        {home.locationOwnerSectId&&locationOwner&&<span>站点所属：{locationOwner}</span>}
        {home.tileOwnerSectId&&tileOwner&&<span>此格所属：{tileOwner}</span>}
      </p>}
    {pairs.size>0&&<p className="text-xs text-violet-200">眼下可见界线：{[...pairs.values()].join('、')}。点线是域界，不是地权或道路。</p>}
    {example&&<p className="text-xs text-slate-300">
      {example.mark.title}，{example.mark.summary} 可在「山河索引」的「路径与行程」定位。
    </p>}
  </section>;
}
