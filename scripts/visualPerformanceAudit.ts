import { createInitialWorld } from '../src/data/initialWorld';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { projectStoryHomepage } from '../src/engine/storyHomepage';
import { drawCanvasCharacterSprite, mapCharacterSpriteSize } from '../src/components/canvasCharacterSprite';
import { drawFormationMapLinks, visibleFormationMapLinks } from '../src/components/formationMapView';
import { buildLocalCourtyard } from '../src/components/localCourtyardModel';
import { drawLocalCourtyard } from '../src/components/localCourtyardRenderer';
import { buildLushTilemap } from '../src/components/lushTilemapModel';
import { drawLushTilemap } from '../src/components/lushTilemapRenderer';
import { planActorMarkers } from '../src/components/mapActorClusters';
import { drawMapArchitecturalSprite } from '../src/components/mapArchitecturalSprites';
import { buildMapActorSpriteModels } from '../src/components/mapActorSpriteModel';
import { DEFAULT_CAMERA, MAP_HEIGHT, MAP_WIDTH } from '../src/components/mapCamera';
import { admitPaintedSpritePositions, drawMapNamePills, makeMapNamePills, measureMapNamePill } from '../src/components/mapCanvasNamePills';
import { mapScenicAnimationAllowed, mapScenicFrameDelay } from '../src/components/mapScenicScheduler';
import { projectMapSitePins } from '../src/components/mapSitePinLayout';
import { buildQiFlowPlan, drawQiFlow } from '../src/components/qiFlowCanvas';
import { projectSceneStage } from '../src/components/sceneStageModel';
import { drawSceneStage } from '../src/components/sceneStageRenderer';
import { projectAtmosphere } from '../src/components/seasonalAtmosphereModel';
import { drawSeasonalAtmosphere } from '../src/components/seasonalAtmosphereRenderer';
import { createTerrainMapView, mapActorPositions } from '../src/components/terrainMapView';

const profiles = [
  { requestedWidth: 360, requestedDpr: 3 },
  { requestedWidth: 390, requestedDpr: 3 },
  { requestedWidth: 1112, requestedDpr: 2 },
  { requestedWidth: 1440, requestedDpr: 1 },
] as const;
const warmups = 24, samples = 120, maxFrameCommands = 100_000;
const phases = [0, 250, 800, 1600] as const;
const methods = [
  'arc', 'beginPath', 'bezierCurveTo', 'clearRect', 'clip', 'closePath', 'createLinearGradient', 'createRadialGradient',
  'ellipse', 'fill', 'fillRect', 'fillText', 'lineTo', 'measureText', 'moveTo', 'quadraticCurveTo',
  'rect', 'restore', 'rotate', 'roundRect', 'save', 'scale', 'setLineDash', 'setTransform',
  'stroke', 'translate',
] as const satisfies readonly (keyof CanvasRenderingContext2D)[];
const properties = ['fillStyle', 'font', 'globalAlpha', 'imageSmoothingEnabled', 'lineCap', 'lineJoin',
  'lineWidth', 'strokeStyle', 'textAlign', 'textBaseline'] as const satisfies readonly (keyof CanvasRenderingContext2D)[];

function check(value: unknown, message: string): asserts value {
  if (!value) throw Error(message);
}

type PaintState = Pick<CanvasRenderingContext2D, typeof properties[number]>;
function commandSink() {
  const defaults: PaintState = { fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1, font: '10px sans-serif',
    imageSmoothingEnabled: true, lineCap: 'butt', lineJoin: 'miter', lineWidth: 1, textAlign: 'start', textBaseline: 'alphabetic' };
  let paint = { ...defaults };
  const saved: PaintState[] = [];
  let depth = 0, commands = 0, geometry = 0, gradients = 0, peakSaveDepth = 0, digest = 2166136261, capture = false;
  const mix = (value: string) => {
    for (let i = 0; i < value.length; i++) digest = Math.imul(digest ^ value.charCodeAt(i), 16777619);
    digest = Math.imul(digest ^ 255, 16777619);
  };
  const signature = (value: unknown): string => {
    if (typeof value === 'number') {
      check(Number.isFinite(value), 'Non-finite coordinate or paint property');
      return String(Math.round(value * 100_000));
    }
    if (Array.isArray(value)) return '[' + value.map(signature).join(',') + ']';
    if (typeof value === 'object') return 'object'; // Gradient stop commands carry their own values.
    return String(value);
  };
  const command = (name: string, args: readonly unknown[]) => {
    if (++commands > maxFrameCommands) throw Error(`Exceeded ${maxFrameCommands} Canvas commands in one frame`);
    if (capture) {
      mix(name);
      for (const arg of args) mix(signature(arg));
    }
    switch (name) {
      case 'save':
        depth++;
        saved.push({ ...paint });
        peakSaveDepth = Math.max(depth, peakSaveDepth);
        break;
      case 'restore':
        check(depth-- > 0, 'Unbalanced restore');
        paint = saved.pop()!;
        break;
      case 'fill': case 'stroke': case 'fillRect': case 'fillText': case 'clip':
        geometry++;
        break;
      case 'createLinearGradient': case 'createRadialGradient':
        gradients++;
        break;
    }
  };
  const gradient: CanvasGradient = { addColorStop: (offset, color) => command('colorStop', [offset, color]) };
  const lookup = new Map(methods.map(name => [name, (...args: unknown[]) => {
    command(name, args);
    if (name === 'createLinearGradient' || name === 'createRadialGradient') return gradient;
    if (name === 'measureText') {
      const label = String(args[0]);
      return { width: Array.from(label).reduce((width, ch) => width + (ch.codePointAt(0)! > 127 ? 11 : 6), 0) };
    }
    return undefined;
  }]));
  const writable: ReadonlySet<PropertyKey> = new Set(properties);
  // The renderer accepts a native Canvas type. This adapter recognizes only its bounded, audited
  // drawing subset; unfamiliar operations fail instead of accidentally timing a silent stub.
  const ctx = new Proxy(Object.create(null) as CanvasRenderingContext2D, {
    get(_object, name) {
      if (writable.has(name)) return paint[name as keyof PaintState];
      const fn = lookup.get(name as typeof methods[number]);
      if (!fn) throw Error(`Unsupported Canvas read: ${String(name)}`);
      return fn;
    },
    set(_object, name, value: unknown) {
      if (!writable.has(name)) throw Error(`Unsupported Canvas write: ${String(name)}`);
      command(String(name), [value]);
      return Reflect.set(paint, name, value);
    },
  });
  return {
    ctx,
    begin(hash: boolean) {
      capture = hash;
      saved.length = 0;
      paint = { ...defaults };
      commands = geometry = gradients = depth = peakSaveDepth = 0;
      digest = 2166136261;
    },
    end() {
      check(depth === 0, 'Frame left a Canvas save scope open');
      check(geometry > 0, 'Frame did not draw geometry');
      return { commands, geometry, gradients, peakSaveDepth, checksum: (digest >>> 0).toString(16).padStart(8, '0') };
    },
  };
}
type Surface = {
  name: 'map-landscape-rebuild' | 'map-visible-helper-frame' | 'story-stage' | 'local-courtyard';
  logicalWidth: number; logicalHeight: number; backingWidth: number; backingHeight: number;
  evidence: Readonly<Record<string, string | number>>;
  draw(ctx: CanvasRenderingContext2D, timeMs: number): void;
};

function fixture() {
  let world = createInitialWorld();
  for (let i = 0; i < 4; i++) world = advanceWorldTick(world);
  const opening = projectStoryHomepage(world);
  const story = projectSceneStage(world, { eventId: opening.scene?.eventId, leadId: opening.lead?.id });
  check(story?.portrait && story.cast.length && story.sourceId === opening.scene?.eventId && !story.historical,
    'Expected a genuine current voiced stage from the native turn sequence');
  const admitted = world.cultivators.find(actor => actor.id === opening.lead?.id);
  check(admitted?.alive && admitted.locationId === 'loc-danxia', 'Expected the actual current Danxia lead');
  const localView = createTerrainMapView(world, admitted, true);
  const courtyard = buildLocalCourtyard(world, localView, admitted.locationId, { viewer: admitted });
  check(courtyard?.atmosphere && courtyard.actors.some(actor => actor.id === admitted.id) &&
    courtyard.facilities.some(facility => facility.kind === 'furnace'), 'Expected an authorized active courtyard and current furnace');
  const view = createTerrainMapView(world, undefined, false);
  const terrain = buildLushTilemap(world, view);
  const mapAtmosphere = projectAtmosphere(world, { surface: 'map', view });
  const formation = visibleFormationMapLinks(world, view, admitted);
  const qiFlow = buildQiFlowPlan(world, view, formation);
  const positioned = mapActorPositions(view.seenLocations, view.liveActors, view.trailPositions);
  const sprites = buildMapActorSpriteModels(world, view, positioned);
  const positions = admitPaintedSpritePositions(positioned, sprites);
  check(terrain.tiles.length > 100 && positions.length > 3, 'Expected native painted tile and full-body marker scope');
  return { world, admitted, story, courtyard, view, terrain, mapAtmosphere, formation, qiFlow, sprites, positions };
}

function surfaceRows(world: ReturnType<typeof fixture>, profile: typeof profiles[number]): Surface[] {
  const { requestedDpr, requestedWidth } = profile;
  const mapSize = { width: requestedWidth, height: Math.round(requestedWidth * MAP_HEIGHT / MAP_WIDTH) };
  const markers = planActorMarkers(world.positions, DEFAULT_CAMERA, mapSize, world.admitted.id);
  const individuals = markers.flatMap(marker => marker.kind === 'actor' && world.sprites.get(marker.point.actor.id) ?
    [{ marker, model: world.sprites.get(marker.point.actor.id)! }] : []);
  check(individuals.some(({ marker }) => marker.selected), 'Expected separately drawn native selected actor');
  const pins = projectMapSitePins(world.view.seenLocations, world.view.isCurrentLocation, DEFAULT_CAMERA, mapSize);
  const places = new Map(world.view.seenLocations.map(site => [site.id, site]));
  const colors = new Map(world.world.sects.map(sect => [sect.id, sect.color]));
  const buildings = world.terrain.architecture.flatMap(facade => {
    const site = places.get(facade.siteId);
    if (!site || !world.view.isCurrentLocation(site.id)) return [];
    const pin = pins.get(site.id);
    if (pin && !world.qiFlow.clip.some(({ x, y, width, height }) =>
      pin.x >= x && pin.y >= y && pin.x < x + width && pin.y < y + height)) return [];
    return [{ site: pin ? { ...site, ...pin } : site, ownerColor: site.ownerSectId ? colors.get(site.ownerSectId) : undefined, facade }];
  });
  check(buildings.length > 0, 'Expected current admitted architectural sprites');
  const preparation = commandSink();
  preparation.begin(false);
  const pills = makeMapNamePills(mapSize, DEFAULT_CAMERA, world.view.seenLocations, pins, world.view.isCurrentLocation, [],
    markers, world.admitted.id, undefined, mapSize.width < 640,
    (kind, text) => measureMapNamePill(preparation.ctx, kind, text), world.sprites).pills;
  const mapBacking = { logicalWidth: MAP_WIDTH, logicalHeight: MAP_HEIGHT, backingWidth: MAP_WIDTH, backingHeight: MAP_HEIGHT };
  const dimensions = (ratio: number, ceilingHeight: number) => {
    const logicalWidth = Math.min(960, requestedWidth);
    const logicalHeight = Math.min(ceilingHeight, Math.round(requestedWidth * ratio));
    const dpr = Math.min(requestedDpr, 2);
    return { logicalWidth, logicalHeight, backingWidth: Math.round(logicalWidth * dpr), backingHeight: Math.round(logicalHeight * dpr) };
  };
  const story = dimensions(9 / 16, 540);
  const local = dimensions(5 / 8, 600);
  return [
    { name: 'map-landscape-rebuild', ...mapBacking,
      evidence: { tiles: world.terrain.tiles.length, roads: world.terrain.roads.length, seams: world.terrain.seams.length },
      draw: ctx => drawLushTilemap(ctx, world.terrain) },
    { name: 'map-visible-helper-frame', ...mapBacking,
      evidence: { fullBodySprites: individuals.length, clustersOmittedFromDrawing: markers.length - individuals.length, namePills: pills.length,
        namePillTextMetrics: 'deterministic synthetic glyph widths', qiFlowSites: world.qiFlow.sites.length, architecture: buildings.length },
      draw: (ctx, time) => {
        drawSeasonalAtmosphere(ctx, world.mapAtmosphere, { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT }, time);
        drawQiFlow(ctx, world.qiFlow, time / 1350, time !== 0, MAP_WIDTH / mapSize.width);
        drawFormationMapLinks(ctx, world.formation, DEFAULT_CAMERA.zoom);
        ctx.save();
        ctx.beginPath();
        for (const { x, y, width, height } of world.qiFlow.clip) ctx.rect(x, y, width, height);
        ctx.clip();
        for (const { site, ownerColor, facade } of buildings) {
          drawMapArchitecturalSprite(ctx, site, ownerColor, { kind: facade.kind, village: facade.village });
        }
        ctx.restore();
        ctx.save();
        ctx.setTransform(MAP_WIDTH / mapSize.width, 0, 0, MAP_HEIGHT / mapSize.height, 0, 0);
        for (const { marker, model } of individuals) {
          drawCanvasCharacterSprite(ctx, marker.x, marker.y, model, mapCharacterSpriteSize(DEFAULT_CAMERA.zoom, marker.selected), time / 1000);
        }
        drawMapNamePills(ctx, pills);
        ctx.restore();
      } },
    { name: 'story-stage', ...story,
      evidence: { sourceId: world.story.sourceId!, canonicalCast: world.story.cast.length, siteId: world.story.siteId ?? 'opening' },
      draw: (ctx, time) => {
        const { logicalWidth: width, logicalHeight: height } = story;
        ctx.setTransform(story.backingWidth / width, 0, 0, story.backingHeight / height, 0, 0);
        drawSceneStage(ctx, world.story, width, height, time);
        if (world.story.atmosphere) drawSeasonalAtmosphere(ctx, world.story.atmosphere, { x: 0, y: 0, width, height }, time);
      } },
    { name: 'local-courtyard', ...local,
      evidence: { siteId: world.courtyard.siteId, actors: world.courtyard.actors.length, facilities: world.courtyard.facilities.length },
      draw: (ctx, time) => {
        const { width, height, atmosphere } = world.courtyard;
        ctx.setTransform(local.backingWidth / width, 0, 0, local.backingHeight / height, 0, 0);
        drawLocalCourtyard(ctx, world.courtyard, width, height, time);
        if (atmosphere) drawSeasonalAtmosphere(ctx, atmosphere, { x: 0, y: 0, width, height }, time);
      } },
  ];
}

function measurement(surface: Surface, profile: typeof profiles[number], tick: number) {
  const sink = commandSink();
  const frame = (phase: number, hash: boolean) => {
    sink.begin(hash);
    surface.draw(sink.ctx, phase);
    return sink.end();
  };
  const commands = phases.map(phase => ({ phaseMs: phase, ...frame(phase, true) }));
  for (const row of commands) {
    check(JSON.stringify(row) === JSON.stringify({ phaseMs: row.phaseMs, ...frame(row.phaseMs, true) }),
      `Unstable command stream in ${surface.name}`);
  }
  for (let i = 0; i < warmups; i++) frame(phases[i % phases.length], false);
  const timings: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    const row = frame(phases[i % phases.length], false);
    timings.push(performance.now() - start);
    check(row.commands === commands[i % phases.length].commands, `Timing changed command count in ${surface.name}`);
  }
  timings.sort((a, b) => a - b);
  const quantile = (p: number) => Number(timings[Math.ceil(timings.length * p) - 1].toFixed(3));
  const { name, logicalWidth, logicalHeight, backingWidth, backingHeight, evidence } = surface;
  return {
    benchmark: 'native-canvas-helper-command-cpu', tick, surface: name, ...profile,
    logicalWidth, logicalHeight, backingWidth, backingHeight, estimatedOneRgbaBackingBytes: backingWidth * backingHeight * 4,
    samples, warmups, p50Ms: quantile(.5), p95Ms: quantile(.95), maxMs: quantile(1), commands, evidence,
    scope: 'JS helpers with bounded command sink; no raster, DOM, compositor, GPU, or device FPS',
  };
}

const native = fixture();
const frozenWorld = JSON.stringify(native.world);
for (const profile of profiles) {
  const width = profile.requestedWidth;
  const height = width * MAP_HEIGHT / MAP_WIDTH;
  const delays = {
    nativeMoving: mapScenicFrameDelay({ moving: true, heat: false, ambient: true, width }),
    heat: mapScenicFrameDelay({ moving: false, heat: true, ambient: true, width }),
    ambient: mapScenicFrameDelay({ moving: false, heat: false, ambient: true, width }),
  };
  check(delays.nativeMoving === 33 && delays.heat === 80 && delays.ambient === (width < 640 ? 125 : 84), 'Unexpected map cadence');
  check(!mapScenicAnimationAllowed({ width, height, pageVisible: true, surfaceActive: true, reducedMotion: true }),
    'Reduced motion must not schedule map ambience');
  console.log(JSON.stringify({ benchmark: 'map-scheduler-policy', ...profile, delaysMs: delays, reducedMotionStopsDecorativeLoop: true }));
  for (const surface of surfaceRows(native, profile)) console.log(JSON.stringify(measurement(surface, profile, native.world.tick)));
}
check(JSON.stringify(native.world) === frozenWorld, 'Drawing mutated authoritative world');
