import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { drawTerrain, INK_TERRAIN_FILL } from '../src/components/terrainMapDraw';
import { createTerrainMapView, mapActorPositions } from '../src/components/terrainMapView';
import { createInitialWorld } from '../src/data/initialWorld';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { MapTile } from '../src/types/world';

function setup() {
  const world = createInitialWorld();
  const [viewer, partner, traveler, unseen] = world.cultivators;
  const [here, remembered, remote] = [world.locations[0], world.locations[1], world.locations[4]];
  viewer.locationId = here.id;
  partner.locationId = here.id;
  traveler.locationId = remembered.id;
  unseen.locationId = remote.id;
  const hereTile = terrainTileAt(world, here.x, here.y)!;
  const rememberedTile = terrainTileAt(world, remembered.x, remembered.y)!;
  const remoteTile = terrainTileAt(world, remote.x, remote.y)!;
  viewer.exploredTileIds = [rememberedTile.id];
  return { world, viewer, partner, traveler, unseen, here, remembered, remote, hereTile, rememberedTile, remoteTile };
}

function recordTerrain(world: ReturnType<typeof setup>['world'], classified: (tile: MapTile) => 'visible' | 'explored' | 'hidden', heat: boolean, phase: number, showGrid=false) {
  const fills: string[] = [];
  const strokes: string[] = [];
  const context = {
    canvas: { width: 1000, height: 600 },
    fillStyle: '', strokeStyle: '', lineWidth: 0, globalAlpha: 1,
    fillRect() { fills.push(this.fillStyle); },
    stroke() { strokes.push(this.strokeStyle); },
    strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, save() {}, restore() {},
  };
  drawTerrain(context as unknown as CanvasRenderingContext2D, world, classified, heat, phase, undefined, 1, {showGrid});
  return { fills, strokes };
}

describe('terrain map presentation', () => {
  it('shares fog-scoped locations and actor positions with rendering and hit testing', () => {
    const { world, viewer, partner, traveler, unseen, here, remembered, remote, hereTile, rememberedTile, remoteTile } = setup();
    const fog = createTerrainMapView(world, viewer, true);
    expect(fog.tileState(hereTile)).toBe('visible');
    expect(fog.tileState(rememberedTile)).toBe('explored');
    expect(fog.tileState(remoteTile)).toBe('hidden');
    expect(fog.seenLocations.map(({ id }) => id)).toEqual(expect.arrayContaining([here.id, remembered.id]));
    expect(fog.seenLocations.map(({ id }) => id)).not.toContain(remote.id);
    const coordinates = mapActorPositions(fog.seenLocations, fog.liveActors);
    expect(coordinates.map(({ actor }) => actor.id)).toEqual(expect.arrayContaining([viewer.id, partner.id]));
    expect(coordinates.map(({ actor }) => actor.id)).not.toContain(traveler.id);
    expect(coordinates.map(({ actor }) => actor.id)).not.toContain(unseen.id);
    const partnerPoint = coordinates.find(({ actor }) => actor.id === partner.id)!;
    const viewerPoint = coordinates.find(({ actor }) => actor.id === viewer.id)!;
    expect([partnerPoint.x, partnerPoint.y]).not.toEqual([viewerPoint.x, viewerPoint.y]);

    const omniscient = createTerrainMapView(world, viewer, false);
    expect(omniscient.seenLocations).toHaveLength(world.locations.length);
    expect(omniscient.liveActors).toContain(unseen);
    viewer.alive = false;
    const archive = createTerrainMapView(world, viewer, true);
    expect(archive.seenLocations).toEqual([remembered]);
    expect(archive.liveActors).toEqual([]);
    expect(createTerrainMapView(world, undefined, true).seenLocations).toEqual([]);
  });

  it('never draws live heat or clan borders for remembered or hidden tiles', () => {
    const { world, viewer, hereTile, remoteTile, rememberedTile } = setup();
    hereTile.ownerSectId = world.sects[0].id;
    rememberedTile.ownerSectId = world.sects[1].id;
    remoteTile.ownerSectId = world.sects[2].id;
    const view = createTerrainMapView(world, viewer, true);
    world.terrain.tiles = [hereTile, rememberedTile, remoteTile];
    const quiet = recordTerrain(world, view.tileState, false, 0);
    const warm = recordTerrain(world, view.tileState, true, 0.2);
    const pulse = recordTerrain(world, view.tileState, true, 1.8);
    expect(quiet.fills.filter((shade) => shade.startsWith('hsla'))).toHaveLength(0);
    expect(warm.fills.filter((shade) => shade.startsWith('hsla'))).toHaveLength(1);
    expect(warm.fills.at(-1)).toBe('#070c19');
    expect(warm.fills).not.toEqual(pulse.fills);
    expect(warm.strokes).toContain(world.sects[0].color);
    expect(warm.strokes).not.toContain(world.sects[1].color);
    expect(warm.strokes).not.toContain(world.sects[2].color);
  });

  it('clips the replacement landscape to current sight and leaves heat and ownership on top',()=>{
    const {world,hereTile,rememberedTile,remoteTile}=setup();
    const owner=world.sects[0];
    hereTile.ownerSectId=owner.id;
    world.terrain.tiles=[hereTile,rememberedTile,remoteTile];
    const calls:string[]=[];
    const rectangles:number[][]=[];
    const ctx={
      canvas:{width:1000,height:600},fillStyle:'',strokeStyle:'',
      save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},
      rect(...args:[number,number,number,number]){rectangles.push(args);},
      clip(){calls.push('visible-mask');},
      fillRect(){calls.push(this.fillStyle);},
      stroke(){calls.push(this.strokeStyle);},
    };
    drawTerrain(ctx as unknown as CanvasRenderingContext2D,world,tile=>
      tile===hereTile?'visible':tile===rememberedTile?'explored':'hidden',true,0,undefined,1,
      {drawVisibleLandscape:()=>{calls.push('landscape');}});
    const unitWidth=1000/world.terrain.columns,unitHeight=600/world.terrain.rows;
    expect(rectangles).toEqual([[hereTile.col*unitWidth,hereTile.row*unitHeight,unitWidth,unitHeight]]);
    expect(calls.slice(0,5)).toEqual([INK_TERRAIN_FILL[hereTile.biome],'#192238','#070c19','visible-mask','landscape']);
    expect(calls[5]).toMatch(/^hsla/);
    expect(calls.slice(6)).toContain(owner.color);
  });

  it('uses quiet terrain by default and an explicit coordinate grid for map tools',()=>{
    const {world}=setup();
    const quiet=recordTerrain(world,()=> 'visible',false,0);
    const tools=recordTerrain(world,()=> 'visible',false,0,true);
    expect(quiet.fills).toEqual(world.terrain.tiles.map(tile=>INK_TERRAIN_FILL[tile.biome]));
    expect(quiet.strokes).not.toContain('rgba(203,213,225,.27)');
    expect(tools.fills).toEqual(quiet.fills);
    expect(tools.strokes.filter(color=>color==='rgba(203,213,225,.27)')).toHaveLength(1);
  });

  it('exposes default perspective controls and keyboard-readable terrain information', () => {
    const { world, viewer, here } = setup();
    const html = renderToStaticMarkup(<WorldMapCanvas world={world} selectedCultivatorId={viewer.id} onSelectCultivator={() => undefined} />);
    expect(html).toContain('修士视野（迷雾）');
    expect(html).toContain('灵气热力');
    expect(html).toContain('天道全图 · 宗门色线为领地边界');
    expect(html).toMatch(/<canvas width="1000" height="600"/);
    expect(html).toContain('aria-label="地形图例"');
    expect(html).toContain('逐格查看地形与灵气');
    expect(html).toContain(`${here.name} · 灵脉`);
  });
});
