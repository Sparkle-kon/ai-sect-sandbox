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
const before=(a:MapTile,b:MapTile)=>a.row<b.row || a.row===b.row && a.col<b.col;
const orthogonal: readonly (readonly [number,number])[]=[[-1,0],[1,0],[0,-1],[0,1]];

/** One real in-sight ownership marker per recognized faction. Registration ordinals do not shift with visibility. */
export function projectMapTerritories(world:WorldState,classify:TerritoryTileVisibility):MapTerritorySemantics {
  const {columns,rows,tiles}=world.terrain;
  const styles=new Map(world.sects.map((sect,index)=>{
    const mark=patterns[index%patterns.length];
    return [sect.id,{ownerId:sect.id,ordinal:index+1,code:`宗${index+1}`,pattern:mark.id,
      patternLabel:mark.label,dash:mark.dash}] as const;
  }));
  const visible=new Map<number,MapTile>();
  for(const tile of tiles) if(classify(tile)==='visible') visible.set(tile.row*columns+tile.col,tile);
  const firstOwned=new Map<string,MapTile>();
  const firstBoundary=new Map<string,MapTile>();
  const place=(map:Map<string,MapTile>,owner:string,tile:MapTile)=>{
    const prior=map.get(owner);
    if(!prior || before(tile,prior)) map.set(owner,tile);
  };
  for(const tile of visible.values()) {
    const owner=tile.ownerSectId;
    if(!owner || !styles.has(owner)) continue;
    place(firstOwned,owner,tile);
    if(orthogonal.some(([dy,dx])=>{
      const row=tile.row+dy,col=tile.col+dx;
      // A fog edge is only the edge of what is drawn, never a lookup of the hidden neighbour's owner.
      return row<0 || row>=rows || col<0 || col>=columns || visible.get(row*columns+col)?.ownerSectId!==owner;
    })) place(firstBoundary,owner,tile);
  }
  const locations=new Map(world.locations.map(site=>[site.id,site]));
  const byFaction=new Map<string,MapTerritoryStyle>();
  const markers:MapTerritoryMarker[]=[];
  for(const sect of world.sects) {
    const style=styles.get(sect.id);
    const owned=firstOwned.get(sect.id);
    if(!owned || !style || byFaction.has(sect.id)) continue;
    byFaction.set(sect.id,style);
    const headquarters=locations.get(sect.headquartersId);
    const hqTile=headquarters?.type==='sect_hq' && headquarters.ownerSectId===sect.id
      ?terrainTileAt(world,headquarters.x,headquarters.y):undefined;
    const hqCurrent=hqTile && hqTile.ownerSectId===sect.id && visible.has(hqTile.row*columns+hqTile.col)?hqTile:undefined;
    const tile=hqCurrent??firstBoundary.get(sect.id)??owned;
    markers.push({...style,id:`territory:${sect.id}`,kind:'territory',title:`${style.code} · ${sect.name}`,
      summary:`${style.patternLabel} · ${hqCurrent?'当前可见宗门驻地格':'当前可见领地边缘（不推断迷雾外归属）'}`,
      point:{x:(tile.col+.5)*WIDTH/columns,y:(tile.row+.5)*HEIGHT/rows},tileId:tile.id});
  }
  return {byFaction,markers};
}
