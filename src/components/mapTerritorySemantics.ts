import { isScopedExpeditionGate } from '../engine/expeditionOmenTerms';
import { terrainTileAt } from '../engine/terrainEngine';
import type { MapPoint,MapTile,WorldState } from '../types/world';

export type TerritoryTileVisibility = (tile:MapTile)=>'visible'|'explored'|'hidden';
export type TerritoryPattern = 'solid'|'dotted'|'dash'|'dash_dot'|'long_dash';
const patterns: ReadonlyArray<{id:TerritoryPattern;label:string;dash:readonly number[]}> = [
  {id:'solid',label:'实线',dash:[]},
  {id:'dotted',label:'点线',dash:[1,3]},
  {id:'dash',label:'短划线',dash:[4,3]},
  {id:'dash_dot',label:'点划线',dash:[5,2,1,2]},
  {id:'long_dash',label:'长划线',dash:[8,4]},
];
export interface MapTerritoryStyle {
  ownerId:string;
  ordinal:number;
  code:string;
  pattern:TerritoryPattern;
  patternLabel:string;
  dash:readonly number[];
}
export interface MapTerritoryMarker extends MapTerritoryStyle {
  id:string;
  kind:'territory';
  title:string;
  summary:string;
  point:MapPoint;
  tileId:string;
}
export interface MapTerritorySemantics {
  byFaction:ReadonlyMap<string,MapTerritoryStyle>;
  markers:MapTerritoryMarker[];
}

const WIDTH=1000,HEIGHT=600;
const PLACE_CLEARANCE=54;
const INSET=.32;
const orthogonal: readonly (readonly [number,number])[]=[[-1,0],[0,1],[1,0],[0,-1]];
const before=(a:MapTile,b:MapTile)=>a.row<b.row || a.row===b.row && a.col<b.col;
interface BoundaryAnchor {tile:MapTile;point:MapPoint;corner:boolean;confirmed:number;distanceSquared:number;ordinal:number}

function better(candidate:BoundaryAnchor,previous:BoundaryAnchor|undefined):boolean{
  if(!previous)return true;
  const safe=(anchor:BoundaryAnchor)=>Number(anchor.distanceSquared>=PLACE_CLEARANCE**2);
  if(safe(candidate)!==safe(previous))return safe(candidate)>safe(previous);
  // Prefer an actual boundary/elbow on drawn terrain, then an elbow of the currently drawn fog edge.
  if(Boolean(candidate.confirmed)!==Boolean(previous.confirmed))return candidate.confirmed>0;
  if(candidate.corner!==previous.corner)return candidate.corner;
  if(candidate.confirmed!==previous.confirmed)return candidate.confirmed>previous.confirmed;
  if(candidate.distanceSquared!==previous.distanceSquared)return candidate.distanceSquared>previous.distanceSquared;
  return before(candidate.tile,previous.tile)||candidate.tile===previous.tile&&candidate.ordinal<previous.ordinal;
}

/**
 * One real currently visible boundary marker per recognized faction. Sites/pins are display
 * obstacles only; a nearby out-of-sight site, ownership, or hidden annotation is never consulted.
 */
export function projectMapTerritories(world:WorldState,classify:TerritoryTileVisibility,
  avoid:readonly MapPoint[]=[]):MapTerritorySemantics {
  const {columns,rows,tiles}=world.terrain;
  const styles=new Map(world.sects.map((sect,index)=>{
    const mark=patterns[index%patterns.length];
    return [sect.id,{ownerId:sect.id,ordinal:index+1,code:`宗${index+1}`,pattern:mark.id,
      patternLabel:mark.label,dash:mark.dash}] as const;
  }));
  const visible=new Map<number,MapTile>();
  for(const tile of tiles) if(classify(tile)==='visible') visible.set(tile.row*columns+tile.col,tile);
  const landmarks=world.locations.filter(site=>{
    if(isScopedExpeditionGate(site))return false; // only an explicitly cleared caller obstacle may include a scoped gate
    const tile=terrainTileAt(world,site.x,site.y);
    return tile&&visible.get(tile.row*columns+tile.col)===tile;
  });
  const obstacles:readonly MapPoint[]=[...landmarks,...avoid.filter(point=>{
    const tile=terrainTileAt(world,point.x,point.y);
    return tile&&classify(tile)!=='hidden';
  })];
  const anchors=new Map<string,BoundaryAnchor>();
  const choose=(owner:string,tile:MapTile,ordinal:number,dy:number,dx:number,corner:boolean,confirmed:number)=>{
    const point={x:(tile.col+.5+dx*INSET)*WIDTH/columns,y:(tile.row+.5+dy*INSET)*HEIGHT/rows};
    const distanceSquared=obstacles.reduce((nearest,obstacle)=>Math.min(nearest,(point.x-obstacle.x)**2+(point.y-obstacle.y)**2),Infinity);
    const candidate={tile,point,corner,confirmed,distanceSquared,ordinal};
    if(better(candidate,anchors.get(owner)))anchors.set(owner,candidate);
  };
  for(const tile of visible.values()){
    const owner=tile.ownerSectId;
    if(!owner||!styles.has(owner))continue;
    const edges=orthogonal.map(([dy,dx])=>{
      const row=tile.row+dy,col=tile.col+dx;
      if(row<0||row>=rows||col<0||col>=columns)return 2;
      const observed=visible.get(row*columns+col);
      // The absence of a current tile says nothing about the hidden neighbour's owner.
      return !observed?1:observed.ownerSectId!==owner?2:0;
    });
    for(let side=0;side<edges.length;side++){
      const edge=edges[side];
      if(!edge)continue;
      const [dy,dx]=orthogonal[side],next=(side+1)%edges.length;
      choose(owner,tile,side+orthogonal.length,dy,dx,false,Number(edge===2));
      if(edges[next]){
        const [otherY,otherX]=orthogonal[next];
        choose(owner,tile,side,dy+otherY,dx+otherX,true,Number(edge===2)+Number(edges[next]===2));
      }
    }
  }
  const byFaction=new Map<string,MapTerritoryStyle>();
  const markers:MapTerritoryMarker[]=[];
  for(const sect of world.sects){
    const style=styles.get(sect.id),anchor=anchors.get(sect.id);
    if(!anchor||!style||byFaction.has(sect.id))continue;
    byFaction.set(sect.id,style);
    markers.push({...style,id:`territory:${sect.id}`,kind:'territory',title:`${style.code} · ${sect.name}`,
      summary:`${style.patternLabel} · 当前可见领地边缘（不推断迷雾外归属）`,
      point:anchor.point,tileId:anchor.tile.id});
  }
  return {byFaction,markers};
}
