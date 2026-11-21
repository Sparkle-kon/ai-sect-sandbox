import { createInitialWorld } from '../src/data/initialWorld';
import { cloneWorldWithColdHistory, compactColdHistory } from '../src/engine/coldHistoryEngine';
import { encodeWorldSave, WORLD_SAVE_MAX_BYTES, worldSaveByteCount } from '../src/engine/storageEngine';
import type { ChronicleChapter, WorldState } from '../src/types/world';

const runtime = globalThis as typeof globalThis & {
  gc?: () => void;
  process?: { memoryUsage?: () => { heapUsed: number } };
};
const gc = runtime.gc;
const memory = runtime.process?.memoryUsage;
if (!gc || !memory) throw Error('Run npm run history:benchmark with Node and exposed garbage collection.');
const snapshotCount = 16;
const heap = () => { gc(); gc(); return memory().heapUsed; };
const token = '旧纪史料。';

function fixture(count: number): WorldState {
  const world = createInitialWorld(129);
  const initial = [...world.cultivators];
  for (let index = initial.length; index < count; index++) {
    const base = initial[index % initial.length];
    world.cultivators.push({ ...base, id: 'history-bench-' + index, name: '史档演练修士' + index });
  }
  world.tick = 800;
  const chapters: ChronicleChapter[] = [];
  for (let chapterNumber = 1; chapterNumber <= 42; chapterNumber++) {
    const tick = chapterNumber * 12;
    const title = '第' + chapterNumber + '章：基准夹具';
    chapters.push({
      id: 'chapter-' + (tick - 11) + '-' + tick, chapterNumber, startTick: tick - 11, endTick: tick, title,
      body: Array.from({ length: 210 }, (_, i) => token + chapterNumber + '/' + i + '。').join(''),
      anchors: Array.from({ length: 18 }, (_, i) => ({
        id: 'history-bench-anchor-' + chapterNumber + '-' + i, tick, year: 1000 + chapterNumber, month: 12,
        title: title + '史料' + i, category: 'diplomacy', actorIds: [world.cultivators[i % count].id],
        description: token.repeat(12) + chapterNumber + ':' + i,
      })),
      biographies: [], source: 'utility',
    });
  }
  world.chronicleArchive.chapters = chapters.reverse();
  compactColdHistory(world);
  return world;
}

for (const actors of [48, 526]) {
  const world = fixture(actors);
  const measure = (copy: (world: WorldState) => WorldState) => {
    const before = heap();
    const kept = Array.from({ length: snapshotCount }, () => copy(world));
    const fullSnapshotHeapDeltaBytes = heap() - before;
    return { fullSnapshotHeapDeltaBytes, distinctColdObjects: new Set(kept.map(({ coldHistory }) => coldHistory)).size };
  };
  // Both cases retain equally many complete snapshots. Only the immutable shelf's duplication differs.
  const fullClone = measure(structuredClone);
  const shareCold = measure(cloneWorldWithColdHistory);
  const saveBytes = worldSaveByteCount(world);
  if (saveBytes !== new TextEncoder().encode(encodeWorldSave(world)).byteLength) throw Error('Export byte mismatch.');
  console.log(JSON.stringify({ actors, snapshotCount, coldChapters: world.coldHistory.chapters.length,
    fullClone, shareCold, utf8SaveBytes: saveBytes, fileBudgetBytes: WORLD_SAVE_MAX_BYTES }));
}
