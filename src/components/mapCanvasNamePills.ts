import {mapCharacterSpriteSize} from './canvasCharacterSprite';
import type {LocationNode,MapPoint} from '../types/world';
import {mapToScreen,MAP_HEIGHT,MAP_WIDTH,type MapCamera} from './mapCamera';
import {CLUSTER_RADIUS_PX,type MapActorMarker,type MapActorPoint,type MarkerViewport} from './mapActorClusters';
import {planMapLabels,type MapLabelCandidate,type MapLabelObstacle,type MapLabelPlacement,type MapLabelRect} from './mapLabelLayout';
import type {MapTerritoryMarker} from './mapTerritorySemantics';
import {SPIRIT_ROOT_COLORS} from './SpiritRootBadge';

const fonts={site:'600 13px system-ui, sans-serif',actor:'600 11px system-ui, sans-serif',territory:'700 10px system-ui, sans-serif'};
type Text={title:string;tag?:string;tone?:string;dim?:boolean;selected?:boolean};
export interface MapPaintedNamePill extends MapLabelPlacement,Text {}
export interface MapNamePillPlan{
  readonly pills:readonly MapPaintedNamePill[];
  readonly siteRects:ReadonlyMap<string,MapLabelRect>;
  readonly badgeBlockers:readonly MapLabelRect[];
}

/** The same model scope admits painting, hit-testing, and the accessible actor index. */
export function admitPaintedSpritePositions(positions:readonly MapActorPoint[],sprites:ReadonlyMap<string,unknown>):MapActorPoint[]{
  return positions.filter(({actor})=>sprites.has(actor.id));
}

/** Preserve the original cluster/selected order and centers; hit-test the full painted solo sprite. */
export function fitActorSpriteHitFootprints(markers:readonly MapActorMarker[],zoom:number,
  sprites:ReadonlyMap<string,unknown>):MapActorMarker[]{
  return markers.map(marker=>{
    if(marker.kind!=='actor'||!sprites.has(marker.point.actor.id))return marker;
    // Radius of the containing circle covers the corners of the square painted footprint.
    const paintedRadius=Math.SQRT1_2*mapCharacterSpriteSize(zoom,marker.selected);
    return paintedRadius>marker.mouseRadius?{...marker,mouseRadius:paintedRadius}:marker;
  });
}

export function makeMapNamePills(size:MarkerViewport,camera:MapCamera,sites:readonly LocationNode[],
  sitePins:ReadonlyMap<string,MapPoint>,current:(id:string)=>boolean,territories:readonly MapTerritoryMarker[],
  markers:readonly MapActorMarker[],selectedId:string|null,avatarId:string|undefined,quiet:boolean,
  measure:(kind:MapLabelPlacement['kind'],text:string)=>number,sprites?:ReadonlyMap<string,unknown>):MapNamePillPlan{
  const candidates:MapLabelCandidate[]=[],obstacles:MapLabelObstacle[]=[],siteObstacles:MapLabelRect[]=[];
  const titles=new Map<string,Text>();
  const css=(point:MapPoint)=>{
    const view=mapToScreen(camera,point);
    return {x:view.x*size.width/MAP_WIDTH,y:view.y*size.height/MAP_HEIGHT};
  };
  const rect=(p:MapPoint,r:number)=>({x:p.x-r,y:p.y-r,width:r*2,height:r*2});
  const add=(kind:MapLabelPlacement['kind'],id:string,anchor:MapPoint,text:Text,gap:number,priority?:number)=>{
    const width=Math.ceil(measure(kind,text.title)+(text.tag?measure(kind,text.tag)+5:0))+14;
    const key=`${kind}:${id}`;
    candidates.push({id:key,kind,anchor,width,height:kind==='site'?21:18,gap,priority});
    titles.set(key,text);
  };
  for(const site of sites){
    const live=current(site.id),anchor=css(sitePins.get(site.id)??site);
    const radius=Math.max(5,(live?23:6)*camera.zoom*size.width/MAP_WIDTH);
    const box=rect(anchor,radius);
    obstacles.push({rect:box});siteObstacles.push(box);
    add('site',site.id,anchor,{title:site.name,...(live?{tag:site.spiritRoot,tone:SPIRIT_ROOT_COLORS[site.spiritRoot]}:{dim:true})},
      radius+4,(live?8:0)+(site.type==='sect_hq'?2:0));
  }
  for(const marker of markers){
    const selected=marker.kind==='actor'&&marker.point.actor.id===selectedId;
    if(marker.kind==='actor'&&sprites&&!sprites.has(marker.point.actor.id))continue;
    const radius=marker.kind==='cluster'?CLUSTER_RADIUS_PX+2:
      Math.max(mapCharacterSpriteSize(camera.zoom,selected)/2+1,(selected?22:13)*camera.zoom*size.width/MAP_WIDTH);
    obstacles.push({rect:rect(marker,radius)});
    if(marker.kind!=='actor')continue;
    const actor=marker.point.actor,possessed=actor.id===avatarId;
    if(quiet&&!selected&&!possessed)continue;
    add('actor',actor.id,marker,{title:actor.name,tag:possessed?`${actor.realm} · 临身`:actor.realm,
      ...(possessed?{tone:'#fde68a'}:{tone:'#b5dbc8'}),selected},
      radius+4,selected?10:possessed?5:0);
  }
  for(const territory of territories)add('territory',territory.id,css(territory.point),{title:territory.code,dim:true},4);
  const pills=planMapLabels(size,candidates,obstacles).flatMap(row=>{
    const data=titles.get(row.id);
    return data?[{...row,...data}]:[];
  });
  const siteRects=new Map(pills.filter(row=>row.kind==='site'&&!row.dim).map(row=>[row.id.slice('site:'.length),row.rect]));
  return {pills,siteRects,badgeBlockers:[...siteObstacles,...pills.map(row=>row.rect)]};
}

export function drawMapNamePills(ctx:CanvasRenderingContext2D,pills:readonly MapPaintedNamePill[]):void{
  ctx.save();ctx.textAlign='left';ctx.textBaseline='middle';
  for(const {kind,rect,title,tag,tone,dim,selected} of pills){
    const {x,y,width,height}=rect;
    ctx.beginPath();ctx.roundRect(x,y,width,height,Math.min(8,height/2));
    ctx.fillStyle=selected?'rgba(37,24,13,.97)':dim?'rgba(7,14,25,.88)':'rgba(5,12,24,.94)';
    ctx.fill();ctx.strokeStyle=selected?'#ae854c':dim?'#536276':'#384554';ctx.lineWidth=.8;ctx.stroke();
    ctx.font=fonts[kind];ctx.fillStyle=dim?'#c0cada':'#f4efe2';
    ctx.fillText(title,x+7,y+height/2+.4);
    if(tag){
      ctx.fillStyle=tone??'#f3d79d';
      ctx.fillText(tag,x+12+ctx.measureText(title).width,y+height/2+.4);
    }
  }
  ctx.restore();
}

export const measureMapNamePill=(ctx:CanvasRenderingContext2D,kind:MapLabelPlacement['kind'],text:string)=>{
  ctx.font=fonts[kind];return ctx.measureText(text).width;
};
