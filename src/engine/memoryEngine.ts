import type { Cultivator, MemoryEntry } from '../types/world';

export const EPISODIC_LIMIT = 32;
export const CORE_LIMIT = 12;
const ANNUAL_CONSOLIDATION_LIMIT = 3;
const CORE_DECAY_FACTOR = 0.08;

export function memoryDecayRate(importance: number, emotionalValence: number): number {
  return 0.17 - 0.012 * importance - 0.006 * Math.abs(emotionalValence);
}

export function memoryStrength(entry: MemoryEntry, tick: number): number {
  const elapsed = Math.max(0, tick - (entry.consolidatedAtTick ?? entry.tick));
  return entry.importance * Math.exp(-entry.decayRate * elapsed);
}

function byRecall(tick: number): (a: MemoryEntry, b: MemoryEntry) => number {
  return (a, b) =>
    memoryStrength(b, tick) - memoryStrength(a, tick) ||
    b.tick - a.tick ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function recordMemory(
  cultivator: Cultivator,
  tick: number,
  content: string,
  importance: number,
  category: MemoryEntry['category'],
  emotionalValence: number
): void {
  const weight = Math.max(1, Math.min(10, Math.round(importance)));
  const valence = Math.max(-5, Math.min(5, Math.round(emotionalValence)));
  cultivator.memorySequence += 1;
  cultivator.memories = [...cultivator.memories, {
    id: `mem-${tick}-${cultivator.id}-${cultivator.memorySequence}`, tick, content, importance: weight, category,
    emotionalValence: valence, decayRate: memoryDecayRate(weight, valence),
  }].sort(byRecall(tick)).slice(0, EPISODIC_LIMIT);
}

export function maintainMemories(cultivator: Cultivator, tick: number, yearly: boolean): void {
  let episodes = cultivator.memories.filter((m) => memoryStrength(m, tick) >= 1);
  let cores = cultivator.coreMemories.filter((m) => memoryStrength(m, tick) >= 1);
  if (yearly) {
    const key = (m: MemoryEntry) => JSON.stringify([m.category, m.content]);
    const distinct = new Map<string, MemoryEntry>();
    for (const memory of episodes.filter(
      (m) => m.importance >= 7 && memoryStrength(m, tick) >= 3
    ).sort(byRecall(tick))) {
      if (!distinct.has(key(memory))) distinct.set(key(memory), memory);
    }
    const promoted = [...distinct.values()].slice(0, ANNUAL_CONSOLIDATION_LIMIT);
    const promotedKeys = new Set(promoted.map(key));
    // A repeated experience refreshes one core episode rather than occupying
    // multiple slots. Non-promoted recollections retain their original age.
    const incumbentByKey = new Map(cores.map((m) => [key(m), m]));
    cores = cores.filter((memory) => !promotedKeys.has(key(memory)));
    for (const memory of promoted) {
      const incumbent = incumbentByKey.get(key(memory));
      const source = incumbent && incumbent.importance > memory.importance ? incumbent : memory;
      cores.push({
        ...source,
        consolidatedAtTick: tick,
        decayRate: memoryDecayRate(source.importance, source.emotionalValence) * CORE_DECAY_FACTOR,
      });
    }
    episodes = episodes.filter((m) => !promotedKeys.has(key(m)));
  }
  cultivator.memories = episodes.sort(byRecall(tick)).slice(0, EPISODIC_LIMIT);
  cultivator.coreMemories = cores.sort(byRecall(tick)).slice(0, CORE_LIMIT);
}

export function recallMemories(cultivator: Cultivator, tick: number, limit = 5): MemoryEntry[] {
  return [...cultivator.memories, ...cultivator.coreMemories]
    .filter((m) => memoryStrength(m, tick) >= 1)
    .sort(byRecall(tick))
    .slice(0, limit);
}
