import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { storyTriggerAuditPhase19_20 } from '../scripts/storyTriggerAuditPhase19_20';
import { storyTriggerAuditPhase21_22 } from '../scripts/storyTriggerAuditPhase21_22';
import { runStoryTriggerAudit } from '../scripts/storyTriggerAuditRunner';
import type { WorldEvent } from '../src/types/world';

const probes = [...storyTriggerAuditPhase19_20, ...storyTriggerAuditPhase21_22];

describe('story trigger audit covers every P19–P22 item without counting narrative text', () => {
  it('covers each of the 40 roadmap items once and reports interface acceptance separately', () => {
    const expected = [19, 20, 21, 22].flatMap(phase =>
      Array.from({ length: 10 }, (_unused, index) => `P${phase}-${index + 1}`));
    expect(probes.map(({ id }) => id)).toEqual(expected);
    expect(probes.filter(row => row.mode === 'interface')).toHaveLength(7);
    for (const probe of probes) {
      expect(probe.evidence.trim().length).toBeGreaterThan(8);
      expect(Boolean(probe.observe)).toBe(probe.mode !== 'interface');
    }
  });

  it('does not turn an expert-sounding label into an occurrence without its real native source', () => {
    const world = createInitialWorld(13071);
    for (const probe of probes) {
      const event: WorldEvent = { id: 'evt-test-unbound-label', tick: world.tick, year: world.year, month: world.month,
        title: probe.title, description: probe.evidence, category: 'intrigue', actorIds: [] };
      expect(probe.observe?.({ before: world, after: world, events: [event] }) ?? []).toEqual([]);
    }
  });

  it('observes real completed months and reports numbers without collecting private text', () => {
    const report = runStoryTriggerAudit({ seed: 13071, ticks: 12, probes });
    expect(report.completedTicks).toBe(12);
    expect(report.counters).toHaveLength(40);
    expect(report.counters.filter(row => row.count === null)).toHaveLength(7);
    expect(report.rawEvents).toBeGreaterThan(0);
    expect(report.fingerprint).toMatch(/^fnv1a32-[0-9a-f]{8}$/);
  });
});
