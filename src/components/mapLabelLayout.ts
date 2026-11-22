export interface MapLabelPoint {readonly x:number;readonly y:number}
export interface MapLabelSize {readonly width:number;readonly height:number}
export interface MapLabelRect extends MapLabelPoint,MapLabelSize {}
export type MapLabelKind='site'|'actor'|'territory';
export type MapLabelSide='N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW';
export interface MapLabelCandidate extends MapLabelSize {
  readonly id:string;
  readonly kind:MapLabelKind;
  readonly anchor:MapLabelPoint;
  /** Larger values go first within the same kind (e.g. the selected actor). */
  readonly priority?:number;
  /** Edge-to-anchor gap in CSS pixels. Tokens remain authoritative obstacles. */
  readonly gap?:number;
}
export interface MapLabelObstacle {readonly rect:MapLabelRect;readonly ownerId?:string}
export interface MapLabelPlacement {
  readonly id:string;
  readonly kind:MapLabelKind;
  readonly anchor:MapLabelPoint;
  readonly rect:MapLabelRect;
  readonly side:MapLabelSide;
}

const kindOrder:Readonly<Record<MapLabelKind,number>>={site:0,actor:1,territory:2};
const alternatives:Readonly<Record<MapLabelKind,readonly MapLabelSide[]>>={
  site:['N','NE','SE','NW','SW','S','E','W'],
  actor:['S','SE','SW','N','NE','NW','E','W'],
  territory:['N','S','NE','NW','SE','SW','E','W'],
};
const CELL=48;
const EDGE=2;
const SPACING=2;
const DEFAULT_GAP=16;
const validSize=({width,height}:MapLabelSize)=>Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0;
const validPoint=({x,y}:MapLabelPoint)=>Number.isFinite(x)&&Number.isFinite(y);

export function mapLabelRectsOverlap(a:MapLabelRect,b:MapLabelRect):boolean{
  return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
}

function position(candidate:MapLabelCandidate,side:MapLabelSide):MapLabelRect{
  const {anchor:{x,y},width,height}=candidate;
  const gap=Math.max(0,Number.isFinite(candidate.gap)?candidate.gap??DEFAULT_GAP:DEFAULT_GAP);
  // Offset diagonals less on x, so a long label may still fit beside neighboring pins or edges.
  const dx=side==='E'||side==='W'?gap:Math.max(5,gap*.64);
  return {width,height,
    x:side.includes('E')?x+dx:side.includes('W')?x-dx-width:x-width/2,
    y:side.includes('N')?y-gap-height:side.includes('S')?y+gap:y-height/2};
}

function clipped(rect:MapLabelRect,viewport:MapLabelSize):MapLabelRect|undefined{
  if(!validPoint(rect)||!validSize(rect))return undefined;
  const x=Math.max(0,rect.x),y=Math.max(0,rect.y);
  const width=Math.min(viewport.width,rect.x+rect.width)-x,height=Math.min(viewport.height,rect.y+rect.height)-y;
  return width>0&&height>0?{x,y,width,height}:undefined;
}

const MAX_BUCKETS_PER_RECT=64;
class Occupancy {
  private readonly buckets=new Map<string,MapLabelRect[]>();
  private readonly large:MapLabelRect[]=[];
  private readonly all:MapLabelRect[]=[];

  private span(rect:MapLabelRect){
    return {
      left:Math.floor(rect.x/CELL),right:Math.floor((rect.x+rect.width)/CELL),
      top:Math.floor(rect.y/CELL),bottom:Math.floor((rect.y+rect.height)/CELL),
    };
  }

  add(rect:MapLabelRect){
    this.all.push(rect);
    const {left,right,top,bottom}=this.span(rect);
    if((right-left+1)*(bottom-top+1)>MAX_BUCKETS_PER_RECT){this.large.push(rect);return;}
    for(let x=left;x<=right;x++)for(let y=top;y<=bottom;y++){
      const key=`${x}:${y}`,bucket=this.buckets.get(key);
      if(bucket)bucket.push(rect);else this.buckets.set(key,[rect]);
    }
  }

  overlaps(rect:MapLabelRect):boolean{
    const {left,right,top,bottom}=this.span(rect);
    const hits=(other:MapLabelRect)=>mapLabelRectsOverlap(rect,other);
    if((right-left+1)*(bottom-top+1)>MAX_BUCKETS_PER_RECT)return this.all.some(hits);
    if(this.large.some(hits))return true;
    for(let x=left;x<=right;x++)for(let y=top;y<=bottom;y++){
      if(this.buckets.get(`${x}:${y}`)?.some(hits))return true;
    }
    return false;
  }
}

/** Accept only authorized candidates; placement adds no site, visibility, target, or hitbox. */
export function planMapLabels(viewport:MapLabelSize,candidates:readonly MapLabelCandidate[],
  occupied:readonly MapLabelObstacle[]=[]):MapLabelPlacement[]{
  if(!validSize(viewport)||viewport.width>1_000_000||viewport.height>1_000_000)return [];
  const space=new Occupancy();
  for(const {rect} of occupied){
    const visible=clipped(rect,viewport);
    if(visible)space.add(visible);
  }
  const counts=new Map<string,number>();
  const keyOf=(c:MapLabelCandidate)=>`${c.kind}:${c.id}`;
  for(const candidate of candidates){
    const key=keyOf(candidate);
    counts.set(key,(counts.get(key)??0)+1);
  }
  const priority=(candidate:MapLabelCandidate)=>Number.isFinite(candidate.priority)?candidate.priority??0:0;
  const pipeline=candidates.filter(candidate=>Object.hasOwn(kindOrder,candidate.kind)&&candidate.id.length>0&&
    counts.get(keyOf(candidate))===1&&validSize(candidate)&&validPoint(candidate.anchor)&&
    candidate.width<=viewport.width-EDGE*2&&candidate.height<=viewport.height-EDGE*2&&
    candidate.anchor.x>=0&&candidate.anchor.y>=0&&candidate.anchor.x<=viewport.width&&candidate.anchor.y<=viewport.height)
    .sort((a,b)=>kindOrder[a.kind]-kindOrder[b.kind]||priority(b)-priority(a)||(a.id<b.id?-1:a.id>b.id?1:0));
  const placed:MapLabelPlacement[]=[];
  for(const candidate of pipeline){
    const accept=(side:MapLabelSide,rect:MapLabelRect)=>{
      if(rect.x<EDGE||rect.y<EDGE||rect.x+rect.width>viewport.width-EDGE||rect.y+rect.height>viewport.height-EDGE)return false;
      if(space.overlaps({x:rect.x-SPACING,y:rect.y-SPACING,width:rect.width+2*SPACING,height:rect.height+2*SPACING}))return false;
      space.add(rect);
      placed.push({id:candidate.id,kind:candidate.kind,anchor:candidate.anchor,rect,side});
      return true;
    };
    const order=alternatives[candidate.kind];
    if(order.some(side=>accept(side,position(candidate,side)))||candidate.kind!=='site')continue;
    // Long names at the frame edge can slide along their edge or use one neighboring band.
    // Rerun exact obstacle checks after sliding; actors and territory seals never fan out this far.
    for(const extra of [0,12,25,40]){
      const adjusted={...candidate,gap:(candidate.gap??DEFAULT_GAP)+extra};
      const found=order.some(side=>[0,-12,12,-27,27,-48,48].some(offset=>{
        const rect=position(adjusted,side),horizontal=side==='E'||side==='W';
        return accept(side,{...rect,
          x:horizontal?rect.x:Math.max(EDGE,Math.min(viewport.width-EDGE-rect.width,rect.x+offset)),
          y:horizontal?Math.max(EDGE,Math.min(viewport.height-EDGE-rect.height,rect.y+offset)):rect.y,
        });
      }));
      if(found)break;
    }
  }
  return placed;
}
