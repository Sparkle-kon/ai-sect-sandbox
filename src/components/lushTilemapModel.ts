import type {LocationNode,MapPoint,TerrainBiome,WorldState} from '../types/world';
import {isScopedExpeditionGate} from '../engine/expeditionOmenTerms';
import {isSectActive} from '../engine/sectActivity';
import {MAP_HEIGHT,MAP_WIDTH} from './mapCamera';
import type {createTerrainMapView} from './terrainMapView';

interface Bounds { readonly x:number;readonly y:number;readonly width:number;readonly height:number }
export interface LushTilemapTile extends Bounds {
  readonly tileId:string; readonly biome:TerrainBiome; readonly grain:number;
  readonly frost?:true; readonly moisture?:true;
}
export interface LushTilemapSeam extends Bounds {
  readonly axis:'x'|'y'; readonly from:TerrainBiome; readonly to:TerrainBiome;
}
export type LushArchitectureKind='gate'|'market'|'terrace'|'shrine'|'well'|'abyss'|'village';
export interface LushTilemapArchitecture extends Bounds {
  readonly siteId:string;readonly tileId:string;readonly anchorX:number;readonly anchorY:number;
  readonly kind:LushArchitectureKind;readonly village?:true;
}
export interface LushTilemapRoad {
  readonly roadId:string;readonly points:readonly Readonly<MapPoint>[];
}
export interface LushTilemapPlan {
  readonly tiles:readonly LushTilemapTile[];readonly seams:readonly LushTilemapSeam[];
  readonly architecture:readonly LushTilemapArchitecture[];readonly roads:readonly LushTilemapRoad[];
}

const empty:LushTilemapPlan={tiles:[],seams:[],architecture:[],roads:[]};
const unique=<T extends {id:string}>(rows:readonly T[])=>{
  const index=new Map<string,T|undefined>();
  for(const row of rows)index.set(row.id,index.has(row.id)?undefined:row);
  return index;
};
const grain=(seed:number,row:number,col:number)=>{
  const initial=seed^Math.imul(row+17,0x9e3779b9)^Math.imul(col+47,0x7f4a7c15);
  const mixed=Math.imul(initial^(initial>>>16),0x846ca68b);
  return (mixed^(mixed>>>16))>>>0;
};
const biomes=new Set<TerrainBiome>(['灵山','毒沼','剑冢','荒漠','魔渊','坊市']);
const finite=(p:Readonly<MapPoint>)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<=MAP_WIDTH&&p.y<=MAP_HEIGHT;
function kind(site:LocationNode,headquarters:boolean,village:boolean):LushArchitectureKind|undefined{
  if(site.id==='loc-vein-north'&&(site.type==='spirit_vein'||headquarters))return 'well';
  if(site.type==='market')return 'market';
  if(site.type==='abyss')return 'abyss';
  if(headquarters&&site.type==='sect_hq'){
    if(site.id==='loc-danxia'&&site.furnaceGrade>0)return 'terrace';
    if(site.id==='loc-tianji')return 'shrine';
    return 'gate';
  }
  if(village)return 'village';
}

/** A backdrop depicts only the current authorized tile footprint and canonical places, never explored-only geography. */
export function buildLushTilemap(world:WorldState,view:ReturnType<typeof createTerrainMapView>):LushTilemapPlan{
  const {columns,rows,seed}=world.terrain;
  if(!Number.isSafeInteger(columns)||!Number.isSafeInteger(rows)||columns<1||rows<1)return empty;
  const width=MAP_WIDTH/columns,height=MAP_HEIGHT/rows;
  const address=(row:number,col:number)=>`${row}:${col}`;
  const cellAt=(p:Readonly<MapPoint>)=>address(Math.min(rows-1,Math.floor(p.y/height)),Math.min(columns-1,Math.floor(p.x/width)));
  const byId=unique(world.terrain.tiles);
  const occupied=new Map<string,typeof world.terrain.tiles[number]|undefined>();
  for(const tile of world.terrain.tiles){
    const {col,row}=tile;
    if(!Number.isSafeInteger(col)||!Number.isSafeInteger(row)||col<0||row<0||col>=columns||row>=rows)continue;
    const key=address(row,col);
    occupied.set(key,occupied.has(key)?undefined:tile);
  }
  const mapped=new Map<string,LushTilemapTile>();
  const sites=unique(view.seenLocations),canonicalSites=unique(world.locations),sects=unique(world.sects);
  const currentSites=new Map<string,LocationNode>();
  for(const site of sites.values()){
    if(!site||canonicalSites.get(site.id)!==site||!finite(site)||site.type==='secret_realm'||isScopedExpeditionGate(site)||
        !view.isCurrentLocation(site.id))continue;
    const tile=view.locationTile.get(site.id);
    if(!tile||byId.get(tile.id)!==tile||occupied.get(cellAt(site))!==tile||view.tileState(tile)!=='visible')continue;
    currentSites.set(site.id,site);
  }
  const north=currentSites.get('loc-vein-north');
  const northTile=north?view.locationTile.get(north.id):undefined;
  for(const [key,tile] of occupied){
    if(!tile||byId.get(tile.id)!==tile||!biomes.has(tile.biome)||view.tileState(tile)!=='visible')continue;
    const {id:tileId,col,row,biome}=tile;
    mapped.set(key,{tileId,biome,grain:grain(seed,row,col),x:col*width,y:row*height,width,height,
      ...(tile===northTile?{frost:true as const}:{}),...(biome==='毒沼'?{moisture:true as const}:{})});
  }
  if(!mapped.size)return empty;
  const seams:LushTilemapSeam[]=[];
  for(const [key,tile] of mapped){
    const cell=occupied.get(key)!;
    const right=mapped.get(address(cell.row,cell.col+1)),below=mapped.get(address(cell.row+1,cell.col));
    if(right&&right.biome!==tile.biome)seams.push({axis:'x',x:right.x-width*.19,y:tile.y,width:width*.38,height,from:tile.biome,to:right.biome});
    if(below&&below.biome!==tile.biome)seams.push({axis:'y',x:tile.x,y:below.y-height*.19,width,height:height*.38,from:tile.biome,to:below.biome});
  }
  const villages=new Set([...unique(world.settlements.villages).values()].flatMap(village=>
    village&&Number.isSafeInteger(village.population)&&village.population>0?[village.locationId]:[]));
  const architecture:LushTilemapArchitecture[]=[];
  for(const site of currentSites.values()){
    const tile=mapped.get(cellAt(site)),owner=site.ownerSectId?sects.get(site.ownerSectId):undefined;
    const village=villages.has(site.id);
    const facade=kind(site,isSectActive(owner)&&owner.headquartersId===site.id,village);
    if(!tile||!facade)continue;
    architecture.push({siteId:site.id,tileId:tile.tileId,x:tile.x,y:tile.y,width,height,anchorX:site.x,anchorY:site.y,
      kind:facade,...(village?{village:true as const}:{})});
  }
  const roads:LushTilemapRoad[]=[];
  const relocating=new Set(world.relocations.plans.filter(row=>row.status==='in_transit').map(row=>row.sectId));
  const same=(a:Readonly<MapPoint>,b:Readonly<MapPoint>)=>a.x===b.x&&a.y===b.y;
  function segmentVisible(from:Readonly<MapPoint>,to:Readonly<MapPoint>){
    const crossings=[0,1];
    const add=(a:number,b:number,step:number)=>{
      for(let boundary=(Math.floor(Math.min(a,b)/step)+1)*step;boundary<Math.max(a,b);boundary+=step)
        crossings.push((boundary-a)/(b-a));
    };
    add(from.x,to.x,width);add(from.y,to.y,height);
    crossings.sort((a,b)=>a-b);
    for(let i=1;i<crossings.length;i++){
      if(crossings[i]===crossings[i-1])continue;
      const t=(crossings[i]+crossings[i-1])/2;
      if(!mapped.has(cellAt({x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t})))return false;
    }
    return true;
  }
  for(const road of unique(world.roads.links).values()){
    if(!road||road.closedTick!==undefined||road.openedTick>world.tick||road.path.length<2)continue;
    const end=road.path.at(-1)!;
    const from=currentSites.get(road.anchorSiteId),to=currentSites.get(road.otherSiteId),owner=sects.get(road.sectId);
    if(!from||!to||from===to||from.type==='market'||to.type!=='market'||to.ownerSectId&&to.ownerSectId!==road.sectId||
      !isSectActive(owner)||relocating.has(owner.id)||owner.headquartersId!==from.id||from.ownerSectId!==owner.id||
      !same(road.path[0],from)||!same(end,to)||!road.path.every((point,i)=>finite(point)&&mapped.has(cellAt(point))&&
        (!i||segmentVisible(road.path[i-1],point))))continue;
    roads.push({roadId:road.id,points:road.path.map(({x,y})=>({x,y}))});
  }
  return {tiles:[...mapped.values()],seams,architecture,roads};
}
