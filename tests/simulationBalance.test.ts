import { describe, expect, it } from 'vitest';
import { runBalanceSimulation, runSiegeBalanceFixture, tuneSimulationBalance } from '../src/engine/balanceEngine';
import { CORE_LIMIT, EPISODIC_LIMIT } from '../src/engine/memoryEngine';

describe('seeded offline world balance benchmark', () => {
  it('survives a 1000-tick run and two 500-tick holdouts without runaway population or invalid accounting', () => {
    for (const [seed, ticks] of [[0, 1000], [2031, 500], [0xffffffff, 500]]) {
      const report = runBalanceSimulation({ seed, ticks });
      expect(report.violations, `seed ${seed}`).toEqual([]);
      expect(report.minimumLiving, `seed ${seed}`).toBeGreaterThan(0);
      expect(report.maximumLiving).toBeLessThanOrEqual(report.initialLiving * 4);
      expect(report.maximumEpisodicMemory).toBeLessThanOrEqual(EPISODIC_LIMIT);
      expect(report.maximumCoreMemory).toBeLessThanOrEqual(CORE_LIMIT);
      expect(report.maximumTotalHerbs).toBeGreaterThan(0);
      expect(report.supervisedRestOrders).toBe(0);
      expect(report.longestObservedSiege).toBeLessThanOrEqual(9);
    }
  }, 40_000);

  it('uses a valid five-plus coalition and real assault that spends treasury, drains the array, and ends', () => {
    const report = runSiegeBalanceFixture();
    expect(new Set(report.participants).size).toBeGreaterThanOrEqual(5);
    expect(report.consumed).toBeGreaterThan(0);
    expect(report.arrayAfter).toBeLessThan(report.initialArray);
    expect(report.status).toBe('victory');
    expect(report.rounds).toBeLessThanOrEqual(7);
    expect(report.elapsed).toBeLessThanOrEqual(9);
  });

  it('ranks bounded tuning candidates deterministically and does not alter baseline behavior', () => {
    const args = { seeds:[12,413], ticks:24, candidates:[.35,0] };
    const baseline = runBalanceSimulation({ seed:12, ticks:24 });
    const ranking = tuneSimulationBalance(args);
    expect(ranking).toEqual(tuneSimulationBalance(args));
    expect(ranking.evaluations).toHaveLength(2);
    expect(ranking.evaluations[0].restBelow).toBe(ranking.recommendedRestBelow);
    expect(ranking.evaluations[0].score).toBeGreaterThanOrEqual(ranking.evaluations[1].score);
    expect(ranking.evaluations.find((item) => item.restBelow === 0)?.reports[0]).toEqual(baseline);
    expect(runBalanceSimulation({ seed:12, ticks:24 })).toEqual(baseline);
    expect(() => tuneSimulationBalance({ ...args, candidates:[.2,.7] })).toThrow(RangeError);
    expect(() => runBalanceSimulation({ seed:0, ticks:1501 })).toThrow(RangeError);
  }, 15_000);
});
