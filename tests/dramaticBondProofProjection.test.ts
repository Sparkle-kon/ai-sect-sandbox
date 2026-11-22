import { describe, expect, it } from 'vitest';
import { projectDramaticBondArcs } from '../src/engine/dramaticBondEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { WorldEvent, WorldState } from '../src/types/world';
import {
  actualCommonBond, actualDefenderWinsLethally, bondSite, firstId, nearId, noAct, secondId,
} from './dramaticBondNativeFixture';

const publicSites = new Set([bondSite]);
const project = (world: WorldState, scope?: Partial<Parameters<typeof projectDramaticBondArcs>[1]>) =>
  projectDramaticBondArcs(world, { currentVisibleSiteIds: publicSites, ...scope });
const VIEW_KEYS = ['actorIds', 'lastTick', 'milestones', 'names', 'summary', 'title', 'witnessName'];
const MILESTONE_KEYS = ['month', 'siteName', 'text', 'tick', 'year'];

type Actual = ReturnType<typeof actualDefenderWinsLethally>;
let result: Actual | undefined;
function lethal() {
  result ??= actualDefenderWinsLethally(actualCommonBond().clash);
  return { world: structuredClone(result.world), death: structuredClone(result.death) };
}

function source(world: WorldState, death: WorldEvent) {
  return world.events.find(({ id }) => id === death.id)!;
}

function omitLethalReceipt(world: WorldState, eventId: string) {
  const clone = structuredClone(world);
  clone.dramaticBonds!.facts = clone.dramaticBonds!.facts.filter(row => row.sourceEventId !== eventId);
  return clone;
}

const exactActors = (world: WorldState) => project(world, { subjectId: firstId }).find(row =>
  row.actorIds.includes(firstId) && row.actorIds.includes(secondId));

function checkShape(world: WorldState) {
  const view = exactActors(world)!;
  expect(Object.keys(view).filter(key => !VIEW_KEYS.includes(key))).toEqual([]);
  for (const row of view.milestones) expect(Object.keys(row).sort()).toEqual(MILESTONE_KEYS);
  return view;
}

describe('public dramatic arc source authority and read-only scope', () => {
  it('keeps native winner and fallen roles after hot source loss, not generic archived prose', () => {
    const { world, death } = lethal();
    const typed = world.dramaticBonds!.facts.find(row => row.sourceEventId === death.id);
    expect(typed).toMatchObject({
      actorIds: [firstId, secondId], winnerId: secondId, fallenId: firstId,
      kind: 'lethal_duel', tick: death.tick, siteId: bondSite,
    });

    const original = checkShape(world);
    expect(original.lastTick).toBe(death.tick);
    expect(original.milestones).toContainEqual(expect.objectContaining({ tick: death.tick }));

    // A generic ChronicleAnchor intentionally has no winner or fallen slot.
    const archiveCopy = world.chronicleArchive.anchors.find(row => row.id === death.id);
    expect(archiveCopy).toBeDefined();
    expect(archiveCopy).not.toHaveProperty('duelWinnerId');
    world.events = world.events.filter(row => row.id !== death.id);
    const afterHot = checkShape(world);
    expect(afterHot).toEqual(original);
    const noTypedProof = exactActors(omitLethalReceipt(world, death.id));
    expect(noTypedProof?.milestones.some(row => row.tick === death.tick)).not.toBe(true);

    world.chronicleArchive.anchors = world.chronicleArchive.anchors.filter(row => row.id !== death.id);
    expect(checkShape(world)).toEqual(afterHot);
    expect(JSON.stringify(checkShape(world))).not.toContain(death.description);
  });

  it('disallows same-ID conflicts and incorrect actor, venue, date, visibility or victory fields', () => {
    const { world, death } = lethal();
    const expected = project(omitLethalReceipt(world, death.id));
    const cases: [string, (world: WorldState, event: WorldEvent) => void][] = [
      ['different public site', (_copy, event) => { event.locationId = 'loc-market-east'; }],
      ['different underlying civil date', (_copy, event) => { event.year -= 1; }],
      ['same-name different actor', (_copy, event) => { event.actorIds[1] = nearId; }],
      ['inverted winner', (_copy, event) => { event.duelWinnerId = firstId; }],
      ['duplicate conflicting native ID', (copy, event) => {
        copy.events.unshift({ ...event, actorIds: [firstId, nearId], duelWinnerId: nearId });
      }],
      ['same-ID conflict marked private', (copy, event) => {
        copy.events.unshift({ ...event, witnessScope: 'participants', description: '不可公开的文本', duelWinnerId: firstId });
      }],
      ['forged role in typed receipt', (copy) => {
        const typed = copy.dramaticBonds!.facts.find(row => row.sourceEventId === death.id)!;
        typed.winnerId = firstId;
        typed.fallenId = secondId;
      }],
    ];

    for (const [label, mutate] of cases) {
      const clone = structuredClone(world);
      mutate(clone, source(clone, death));
      expect(project(clone), label).toEqual(expected);
      expect(exactActors(world)?.lastTick, label).toBe(death.tick); // No mutation or sibling borrowing.
    }
  });

  it('ranks only within the authorized sites and leaves a lower public scene intact when the stronger one is out of scope', () => {
    let { world } = lethal();
    const local = 'loc-taixu', localPair = ['elder-taixu-1', 'npc-1'];
    for (let month = 0; month < 2; month++) world = advanceWorldTick(world,
      Object.fromEntries(world.cultivators.map(actor => [actor.id, actor.id === 'npc-1' ?
        { chosenAction: 'SOCIALIZE', targetCultivatorId: 'elder-taixu-1', innerMonologue: '在山门论道。' } : noAct])),
      () => .1, 'utility');
    const whole = project(world, { currentVisibleSiteIds: new Set([bondSite, local]) });
    expect(whole[0]?.actorIds).toEqual([firstId, secondId]);
    const localArc = whole.find(row => row.actorIds.every((id, index) => id === localPair[index]));
    expect(localArc?.milestones).toHaveLength(2);

    const scoped = project(world, { currentVisibleSiteIds: new Set([local]) });
    expect(scoped).toEqual([localArc]);
    // Excluding the unobservable pair from the underlying history cannot alter authorized wording,
    // dates, fields or the order/number of rows.
    const pruned = structuredClone(world);
    pruned.dramaticBonds!.facts = pruned.dramaticBonds!.facts.filter(row => row.siteId !== bondSite);
    expect(project(pruned, { currentVisibleSiteIds: new Set([local]) })).toEqual(scoped);
  });

  it('filters visible sites and exact subject/tick before ranking, without mutating any state', () => {
    const { world, death } = lethal();
    const pointer = JSON.stringify(world);
    const global = project(world);
    expect(global.length).toBeGreaterThan(0);
    // Public eligibility is not an arbitrary actor selection.
    expect(project(world, { viewerId: nearId })).toEqual(global);
    expect(project(world, { subjectId: nearId })).toEqual([]);
    expect(project(world, { currentVisibleSiteIds: new Set(['loc-market-east']) })).toEqual([]);
    const past = project(world, { throughTick: death.tick - 1 });
    expect(past.length).toBeGreaterThan(0);
    expect(past.every(row => row.lastTick < death.tick && row.milestones.every(step => step.tick < death.tick))).toBe(true);
    expect(JSON.stringify(world)).toBe(pointer);
  });
});
