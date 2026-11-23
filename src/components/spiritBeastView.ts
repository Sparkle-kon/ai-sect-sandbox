import { currentVisibleTileIds,terrainTileAt } from '../engine/terrainEngine';
import type { Cultivator, SpiritBeast, WorldState } from '../types/world';
import type { createTerrainMapView } from './terrainMapView';

export const BEAST_COLORS: Record<SpiritBeast['kind'], string> = {
  妖兽: '#86efac', 凶兽: '#fda4af', 瑞兽: '#fde68a',
};

export function isLivingBeast(beast: SpiritBeast): boolean {
  return beast.alive && beast.hp > 0;
}

function currentMigrantIds(world:WorldState) {
  return new Set((world.wildMigrations?.records??[]).filter(row=>row.tick<=world.tick&&world.tick-row.tick<=2).map(row=>row.beastId));
}
export function visibleBeastsByLocation(world: WorldState, view: ReturnType<typeof createTerrainMapView>,viewer?:Cultivator) {
  const groups = new Map<string, SpiritBeast[]>();
  const knownSites = new Set(view.seenLocations.map(({ id }) => id));
  const migrantIds=currentMigrantIds(world);
  const seenNow=viewer&&viewer.alive&&viewer.hp>0&&viewer.positionPlane===undefined&&world.cultivators.filter(row=>row.id===viewer.id).length===1&&
    world.cultivators.includes(viewer)&&migrantIds.size?currentVisibleTileIds(world,viewer):undefined;
  const places=migrantIds.size?new Map(view.seenLocations.map(site=>[site.id,site])):undefined;
  for (const beast of world.spiritBeasts ?? []) {
    if (!isLivingBeast(beast) || !knownSites.has(beast.locationId) || !view.isCurrentLocation(beast.locationId)) continue;
    if(migrantIds.has(beast.id)){
      const site=places?.get(beast.locationId);
      const tile=site&&terrainTileAt(world,site.x,site.y);
      if(!tile||!seenNow?.has(tile.id))continue;
    }
    const group = groups.get(beast.locationId) ?? [];
    group.push(beast);
    groups.set(beast.locationId, group);
  }
  return groups;
}


// Not a trajectory: draw only current bodies already admitted by the same visible map projection.
export function currentVisibleWildMigrants(world:WorldState,groups:ReadonlyMap<string,SpiritBeast[]>){
  const migrants=currentMigrantIds(world);
  return new Map([...groups].flatMap(([site,beasts])=>{
    const local=beasts.filter(beast=>migrants.has(beast.id));
    return local.length?[[site,local] as const]:[];
  }));
}
const SIZE:Record<SpiritBeast['kind'],number>={妖兽:4,凶兽:6,瑞兽:3};
export function drawWildMigrantGlyph(ctx:CanvasRenderingContext2D,x:number,y:number,kind:SpiritBeast['kind'],scale:number){
  if(!Number.isFinite(scale)||scale<=0)return;
  const size=SIZE[kind];
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(scale,scale);
  ctx.beginPath();
  ctx.moveTo(-size,size*.42);
  ctx.quadraticCurveTo(-size*.72,-size*.88,-size*.16,-size*.38);
  ctx.quadraticCurveTo(size*.36,-size*.9,size,size*.33);
  ctx.quadraticCurveTo(0,size*.96,-size,size*.42);
  ctx.fillStyle='#111827';
  ctx.strokeStyle=BEAST_COLORS[kind];
  ctx.lineWidth=1.05;
  ctx.fill();ctx.stroke();
  ctx.restore();
}
