import { createInitialWorld } from '../src/data/initialWorld';
import { centerCamera, DEFAULT_CAMERA, type MapCamera } from '../src/components/mapCamera';
import { planActorMarkers } from '../src/components/mapActorClusters';
import { createTerrainMapView, mapActorPositions } from '../src/components/terrainMapView';

const dimensions = [{ width: 360, height: 216 }, { width: 390, height: 234 }];
const percentile = (times: readonly number[], part: number) => times[Math.min(times.length - 1, Math.ceil(times.length * part) - 1)];

function fixture(count: number) {
  const world = createInitialWorld(4279);
  const root = world.cultivators[0];
  const market = world.locations.find(({ id }) => id === 'loc-market');
  if (!root || !market) throw new Error('The seed must have an actor and a public market.');
  const extra = world.locations.filter(({ id }) => id !== market.id);
  world.cultivators = Array.from({ length: count }, (_, index) => ({
    ...root, id: `benchmark-actor-${String(index).padStart(4, '0')}`, name: `演练修士${index + 1}`,
    locationId: index < Math.ceil(count * .86) ? market.id : extra[index % extra.length].id,
  }));
  return { world, market };
}

for (const total of [48, 526]) {
  const { world, market } = fixture(total);
  const view = createTerrainMapView(world, undefined, false);
  const positions = mapActorPositions(view.seenLocations, view.liveActors, view.trailPositions);
  const cameras: [string, MapCamera][] = [['1×', DEFAULT_CAMERA], ['4×', centerCamera({ ...DEFAULT_CAMERA, zoom: 4 }, market)]];
  for (const size of dimensions) for (const [zoom, camera] of cameras) {
    const selectedId = world.cultivators[0].id;
    const run = () => planActorMarkers(positions, camera, size, selectedId);
    for (let repeat = 0; repeat < 30; repeat++) run();
    const costs = Array.from({ length: 200 }, () => {
      const start = performance.now();
      run();
      return performance.now() - start;
    }).sort((a, b) => a - b);
    const rows = run();
    const covered = rows.reduce((sum, marker) => sum + (marker.kind === 'cluster' ? marker.ids.length : 1), 0);
    console.log(JSON.stringify({
      actors: total, width: size.width, height: size.height, zoom, onScreenActors: covered, markers: rows.length,
      medianMs: Number(percentile(costs, .5).toFixed(3)), p95Ms: Number(percentile(costs, .95).toFixed(3)),
    }));
  }
}
