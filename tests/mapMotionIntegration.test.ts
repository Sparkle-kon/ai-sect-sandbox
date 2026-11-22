import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { advanceWorldTick, executeGodIntervention } from '../src/engine/worldEngine';
import { planActorMarkers } from '../src/components/mapActorClusters';
import { DEFAULT_CAMERA, mapToScreen } from '../src/components/mapCamera';
import { resolveMapEntityHit } from '../src/components/mapEntityHit';
import { drawFlights } from '../src/components/mapPresentationDraw';
import { buildMapPresentation, sampleFlight } from '../src/components/mapPresentationView';
import { createTerrainMapView, mapActorPositions } from '../src/components/terrainMapView';
import type { LLMConfig } from '../src/types/world';

afterEach(() => vi.unstubAllGlobals());
const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://example.invalid', apiKey: 'fixture', model: 'fixture' };

describe('map events from real mechanics', () => {
  it('uses the same routed scene trail after Utility or validated JSON flight', async () => {
    const world = createInitialWorld();
    const actor = world.cultivators[0];
    world.cultivators = [actor];
    actor.qiProgress = 10;
    actor.rumors.push({
      id: 'map-route', locationId: 'loc-market', lead: true, subject: '万仙坊市有机缘',
      confidence: 100, hops: 0, learnedTick: world.tick, originTick: world.tick, provenance: 'witness',
    });
    const utility = computeHeuristicDecision(actor, world, () => 0.1);
    expect(utility).toMatchObject({ chosenAction: 'EXPLORE', targetLocationId: 'loc-market' });
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        chosenAction: 'EXPLORE', targetLocationId: 'loc-market', innerMonologue: '御剑赴市',
      }) } }],
    })));
    const cognitive = await queryCultivatorLLMDecision(actor, world, config);
    const advance = (choice: typeof utility) => advanceWorldTick(world, { [actor.id]: choice }, () => 0.7);
    const utilityWorld = advance(utility);
    const cognitiveWorld = advance(cognitive);
    const first = utilityWorld.mapPresentation;
    const second = cognitiveWorld.mapPresentation;
    expect(first).toEqual(second);
    expect(first.trails[0]).toMatchObject({ cultivatorId: actor.id, fromLocationId: actor.locationId, toLocationId: 'loc-market' });
    const start = world.locations.find(({ id }) => id === actor.locationId);
    const end = world.locations.find(({ id }) => id === 'loc-market');
    expect(first.trails[0].points[0]).toEqual({ x: start?.x, y: start?.y });
    expect(first.trails[0].points.at(-1)).toEqual({ x: end?.x, y: end?.y });

    const paintAndPick = (nativeWorld: typeof world) => {
      const viewer = nativeWorld.cultivators.find(row => row.id === actor.id)!;
      const view = createTerrainMapView(nativeWorld, viewer, false);
      const positions = mapActorPositions(view.seenLocations, view.liveActors, view.trailPositions);
      const { routes } = buildMapPresentation(nativeWorld, view, positions);
      const route = routes.get(actor.id)!;
      expect(route.points.length).toBeGreaterThan(2);
      const expected = sampleFlight(route.points, 0.5).point;
      const inks: string[] = [];
      const ctx = {
        save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
        stroke() { inks.push(this.strokeStyle); },
        strokeStyle: '', shadowColor: '', shadowBlur: 0, lineWidth: 0, lineCap: 'round',
      };
      const canvas = ctx as unknown as CanvasRenderingContext2D;
      const alignment = ({ sectId }: Pick<typeof viewer, 'sectId'>) =>
        nativeWorld.sects.find(sect => sect.id === sectId)?.alignment;
      expect(alignment(viewer)).toBe('正道');
      const legacyFrame = drawFlights(canvas, positions, routes, 390, true);
      const legacyInk = [...inks];
      inks.length = 0;
      const frame = drawFlights(canvas, positions, routes, 390, true, alignment);
      expect(frame).toEqual(legacyFrame);
      expect(inks).not.toEqual(legacyInk);
      expect(inks).toContain('#99f6e4');
      const flying = frame.find(row => row.actor.id === actor.id)!;
      expect(flying).toEqual({ actor: viewer, ...expected });
      expect(flying).not.toEqual(positions.find(row => row.actor.id === actor.id));
      const camera = DEFAULT_CAMERA;
      const size = { width: 390, height: 234 };
      const scope = 'native-current';
      const markers = planActorMarkers(frame, camera, size, actor.id);
      const hit = resolveMapEntityHit({
        screen: mapToScreen(camera, expected), isTouch: true, size,
        painted: { markers, positions, camera, size, scope }, scope, positions, camera,
        actorById: new Map(view.liveActors.map(row => [row.id, row])),
        seenLocations: view.seenLocations, isCurrentLocation: view.isCurrentLocation,
      });
      expect(hit).toMatchObject({ kind: 'actor', id: actor.id });
      expect(drawFlights(canvas, positions, routes, 390, false, alignment)).toBe(positions);

      const fog = createTerrainMapView(nativeWorld, viewer, true);
      expect(fog.isCurrentLocation(actor.locationId)).toBe(false);
      const fogPositions = mapActorPositions(fog.seenLocations, fog.liveActors, fog.trailPositions);
      const fogRoutes = buildMapPresentation(nativeWorld, fog, fogPositions).routes;
      expect(fogRoutes.has(actor.id)).toBe(false);
      const strokeCount = inks.length;
      expect(drawFlights(canvas, fogPositions, fogRoutes, 390, true, alignment)
        .find(row => row.actor.id === actor.id)).toEqual(fogPositions.find(row => row.actor.id === actor.id));
      expect(inks).toHaveLength(strokeCount);
      return { point: expected, hit, inks };
    };

    expect(paintAndPick(utilityWorld)).toEqual(paintAndPick(cognitiveWorld));
  });

  it('animates the applied God Strike and its actual clamped damage, not its nominal damage', () => {
    const world = createInitialWorld();
    const actor = world.cultivators[0];
    actor.hp = 10;
    const struck = executeGodIntervention(world, { type: 'TRIBULATION_STRIKE', targetCultivatorId: actor.id });
    expect(struck.cultivators[0].hp).toBe(1);
    expect(struck.events[0].damage).toEqual([{ cultivatorId: actor.id, amount: 9 }]);
    expect(struck.mapPresentation.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'lightning', locationId: actor.locationId }),
      expect.objectContaining({ kind: 'damage', locationId: actor.locationId, text: expect.stringContaining('9') }),
    ]));
  });
});
