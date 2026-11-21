import {collectCampaignBenchmark,parseCampaignBenchmarkArgs} from './longCampaignBenchmark';
import { createInitialWorld } from '../src/data/initialWorld';
import { createFastForwardRunner, validFastForwardCount } from '../src/engine/fastForwardEngine';
import { encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { WorldState } from '../src/types/world';

const seed = 17091;
const round = (value: number) => Number(value.toFixed(2));
function fixture(actors: number): WorldState {
  const world = createInitialWorld(seed);
  const founders = [...world.cultivators];
  const publicSites = world.locations.filter(({ type }) => type === 'market' || type === 'sect_hq');
  for (let i = founders.length; i < actors; i++) {
    const source = structuredClone(founders[i % founders.length]);
    world.cultivators.push({ ...source, id: `fastforward-bench-${i}`, name: `快进演练修士${i}`, title: '长局压力夹具',
      realm: '练气', realmStage: 1, qiProgress: 0, age: 18 + i % 24, lifespan: 120, artifacts: [], reflections: [],
      memories: [], coreMemories: [], rumors: [], memorySequence: 0, exploredTileIds: [],
      locationId: publicSites[i % publicSites.length].id });
  }
  return world;
}

const runtime = globalThis as typeof globalThis & { process?: { argv: string[] } };
const flags = (runtime.process?.argv.slice(2) ?? []).filter((value) => value !== '--');
const campaignCount=flags.filter((flag)=>flag==='--campaign').length;
if(campaignCount>1)throw Error('只可提供一次 --campaign。');
if(campaignCount){
  const options=parseCampaignBenchmarkArgs(flags.filter((flag)=>flag!=='--campaign'));
  for(const report of collectCampaignBenchmark(options))console.log(JSON.stringify(report));
}else{
  runShortWorkerBenchmark(flags);
}

function runShortWorkerBenchmark(flags:readonly string[]):void {
  const ticks = Number(flags.find((flag) => flag.startsWith('--ticks='))?.slice(8) ?? 4);
  const chosen = flags.find((flag) => flag.startsWith('--actors='))?.slice(9);
  if (!validFastForwardCount(ticks) || (chosen !== undefined && chosen !== '48' && chosen !== '526') ||
      flags.some((flag) => !flag.startsWith('--ticks=') && !flag.startsWith('--actors='))) {
    throw Error('Usage: npm run fastforward:benchmark -- [--ticks=4] [--actors=48|526]');
  }
  for (const actors of chosen ? [Number(chosen)] : [48, 526]) {
    const base = fixture(actors);
    let straight = base;
    let maxOrdinaryTickMs = 0;
    const start = performance.now();
    for (let tick = 0; tick < ticks; tick++) {
      const now = performance.now();
      straight = advanceWorldTick(straight, undefined, undefined, 'utility');
      maxOrdinaryTickMs = Math.max(maxOrdinaryTickMs, performance.now() - now);
    }
    const ordinaryMs = performance.now() - start;
    const isolate = performance.now();
    const runner = createFastForwardRunner(base, ticks);
    let progress = runner.readProgress(), chunks = 0;
    while (progress.completedTicks < ticks) {
      progress = runner.advanceChunk();
      chunks++;
    }
    const checkpoint = runner.checkpoint()!;
    const isolatedMs = performance.now() - isolate;
    const plain = encodeWorldSave(straight), fork = encodeWorldSave(checkpoint.world);
    const savedIds = new Set(checkpoint.world.cultivators.map(({ id }) => id));
    if (plain !== fork || base.cultivators.some(({ id }) => !savedIds.has(id))) {
      throw Error('Fast forward and direct Utility are not equivalent.');
    }
    console.log(JSON.stringify({ fixture: 'synthetic-roster, production offline rules', seed, actorsAtStart: actors, ticks,
      finalTick: checkpoint.world.tick, finalActors: progress.totalActors, finalLiving: progress.living, finalRng: checkpoint.world.random.state,
      identicalVerifiedSave: true, noOriginalActorRemoved: true, chunks, ordinaryMs: round(ordinaryMs),
      isolatedMs: round(isolatedMs), maxOrdinaryTickMs: round(maxOrdinaryTickMs), maxWorkerChunkCpuMs: round(progress.maxChunkMs),
      measurementScope: 'local Node CPU; not a handset and excludes Worker message transfer and render' }));
  }
}
