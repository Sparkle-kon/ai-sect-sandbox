import {CLUSTER_RADIUS_PX,type MapActorMarker,type MarkerViewport} from './mapActorClusters';
import type {MapActorBadgeFact,MapActorBadgeKind} from './mapActorBadgeView';

type Point={x:number;y:number};
export interface MapActorStatusBadge extends Point {kind:MapActorBadgeKind}
export interface MapActorSpeechBubble extends Point {width:number;height:number;lines:readonly string[];anchor:Point}
export interface MapActorBadgeLayout {
  badges:readonly MapActorStatusBadge[];
  bubbles:readonly MapActorSpeechBubble[];
}
type Box=Point&{width:number;height:number};
type Solo=Extract<MapActorMarker,{kind:'actor'}>;
const statuses=['heart-demon','critical','ready'] as const;
const badgeRadius=7;
const gap=3;
const edge=4;
const cell=32;
const padX=8;
const lineHeight=14;
const measureLimit=96;
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const finitePositive=(n:number)=>Number.isFinite(n)&&n>0;
const overlap=(a:Box,b:Box)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
const centered=(x:number,y:number,half:number):Box=>({x:x-half,y:y-half,width:half*2,height:half*2});
const radius=(marker:MapActorMarker)=>marker.kind==='cluster'?CLUSTER_RADIUS_PX+1:
  Math.max(12,marker.mouseRadius*(marker.selected?1.8:1)+2);

function occupancy(){
  const bins=new Map<string,Box[]>();
  const all:Box[]=[],large:Box[]=[];
  const cells=(box:Box)=>({
    left:Math.floor(box.x/cell),right:Math.floor((box.x+box.width)/cell),
    top:Math.floor(box.y/cell),bottom:Math.floor((box.y+box.height)/cell),
  });
  const wide=(box:Box)=>box.width>cell*12||box.height>cell*12;
  const visit=(box:Box,check:(key:string)=>boolean)=>{
    const {left,right,top,bottom}=cells(box);
    for(let x=left;x<=right;x++)for(let y=top;y<=bottom;y++)if(check(`${x}:${y}`))return true;
    return false;
  };
  return {
    occupied:(box:Box)=>wide(box)?all.some(other=>overlap(box,other)):
      large.some(other=>overlap(box,other))||visit(box,key=>bins.get(key)?.some(other=>overlap(box,other))??false),
    add:(box:Box)=>{
      all.push(box);
      if(wide(box)){large.push(box);return;}
      visit(box,key=>{
        const found=bins.get(key);
        if(found)found.push(box);else bins.set(key,[box]);
        return false;
      });
    },
  };
}

const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'grapheme'}):undefined;
function bubbleLines(quote:string,maxWidth:number,measure:(text:string)=>number):string[]{
  const words=quote.trim().replace(/\s+/gu,' ');
  if(!words||maxWidth<=0)return [];
  const units:string[]=[];
  let shortened=false;
  for(const unit of segmenter?segmenter.segment(words):words){
    if(units.length>=measureLimit){shortened=true;break;}
    units.push(typeof unit==='string'?unit:unit.segment);
  }
  const lines:string[]=[];
  let offset=0;
  const fits=(text:string)=>{
    const width=measure(text);
    return Number.isFinite(width)&&width>0&&width<=maxWidth;
  };
  for(let row=0;row<2&&offset<units.length;row++){
    while(units[offset]===' ')offset++;
    if(offset>=units.length)break;
    let line='';
    let last=offset;
    for(;last<units.length;last++){
      const next=line+units[last];
      if(!fits(next))break;
      line=next;
    }
    if(!line)return [];
    if(row===1&&(last<units.length||shortened)){
      let end=last;
      while(end>=offset&&!fits(units.slice(offset,end).join('').trimEnd()+'…'))end--;
      if(end<offset)return [];
      line=units.slice(offset,end).join('').trimEnd()+'…';
    }else if(last===units.length&&shortened){
      // Extremely small glyphs may fit the work limit on one line. Keep the explicit clipping marker.
      if(!fits(line.trimEnd()+'…'))return [];
      line=line.trimEnd()+'…';
    }
    lines.push(line.trimEnd());
    offset=last;
  }
  return lines;
}

/** CSS-only overlay for exactly those solo actors whose markers were already painted. */
export function planMapActorBadgeLayout(markers:readonly MapActorMarker[],facts:ReadonlyMap<string,MapActorBadgeFact>,
  viewport:MarkerViewport,selectedId:string|null,measure:(text:string)=>number):MapActorBadgeLayout{
  const {width,height}=viewport;
  if(!finitePositive(width)||!finitePositive(height)||!Number.isSafeInteger(Math.ceil(width))||
    !Number.isSafeInteger(Math.ceil(height))||!facts.size)return {badges:[],bubbles:[]};
  const taken=occupancy();
  const count=new Map<string,number>();
  const clustered=new Set<string>();
  const present=(marker:MapActorMarker)=>Number.isFinite(marker.x)&&Number.isFinite(marker.y)&&
    marker.x>=0&&marker.x<=width&&marker.y>=0&&marker.y<=height&&
    (marker.kind==='cluster'||finitePositive(marker.mouseRadius));
  for(const marker of markers) {
    if(marker.kind==='cluster')for(const id of marker.ids)clustered.add(id);
    else count.set(marker.key,(count.get(marker.key)??0)+1);
    if(!present(marker))continue;
    const pad=radius(marker)+gap;
    // Clip the reservation to the actual canvas surface before inserting it into the local grid.
    const left=Math.max(0,marker.x-pad),top=Math.max(0,marker.y-pad);
    taken.add({x:left,y:top,width:Math.min(width,marker.x+pad)-left,height:Math.min(height,marker.y+pad)-top});
  }
  const eligible=markers.flatMap(marker=>{
    if(marker.kind!=='actor'||!present(marker)||!marker.point.actor.alive||marker.point.actor.hp<=0||marker.key!==marker.point.actor.id||
      count.get(marker.key)!==1||clustered.has(marker.key))return [];
    const fact=facts.get(marker.key);
    return fact?.actorId===marker.key?[{marker,fact}]:[];
  }).sort((a,b)=>Number(b.marker.key===selectedId)-Number(a.marker.key===selectedId)||
    Number(b.fact.statuses.includes('heart-demon'))-Number(a.fact.statuses.includes('heart-demon'))||
    compare(a.marker.key,b.marker.key));
  const bounds=(box:Box)=>box.x>=edge&&box.y>=edge&&box.x+box.width<=width-edge&&box.y+box.height<=height-edge;
  const reserve=(box:Box)=>{
    if(!bounds(box)||taken.occupied(box))return false;
    taken.add({x:box.x-gap,y:box.y-gap,width:box.width+gap*2,height:box.height+gap*2});
    return true;
  };
  const positions=(marker:Solo)=>{
    const side=radius(marker),reach=side+badgeRadius+gap+1;
    return [[reach,-side*.65],[-reach,-side*.65],[0,-reach],[reach,side*.7],[-reach,side*.7],[0,reach]] as const;
  };
  const badges:MapActorStatusBadge[]=[];
  const bubbles:MapActorSpeechBubble[]=[];
  for(const {marker,fact} of eligible)for(const kind of statuses) {
    if(!fact.statuses.includes(kind))continue;
    for(const [dx,dy] of positions(marker)){
      const x=marker.x+dx,y=marker.y+dy;
      if(!reserve(centered(x,y,badgeRadius)))continue;
      badges.push({x,y,kind});
      break;
    }
  }
  for(const {marker,fact} of eligible){
    if(bubbles.length>=(width<640?1:2))break;
    if(!fact.quote)continue;
    const lines=bubbleLines(fact.quote,Math.min(148,width-2*(edge+padX)),measure);
    if(!lines.length)continue;
    const textWidth=Math.max(...lines.map(measure));
    if(!finitePositive(textWidth))continue;
    const boxWidth=Math.ceil(textWidth)+2*padX,boxHeight=lines.length*lineHeight+12;
    const anchor={x:marker.x,y:marker.y};
    const x=clamp(anchor.x-boxWidth/2,edge,width-edge-boxWidth);
    const offset=radius(marker)+gap+4;
    for(const y of [anchor.y-offset-boxHeight,anchor.y-offset-boxHeight-18,anchor.y+offset,anchor.y+offset+18]){
      const box={x,y,width:boxWidth,height:boxHeight};
      // The small speech notch may extend four CSS pixels toward its anchor.
      if(!reserve({...box,y:y-4,height:boxHeight+8}))continue;
      bubbles.push({...box,lines,anchor});
      break;
    }
  }
  return {badges,bubbles};
}
