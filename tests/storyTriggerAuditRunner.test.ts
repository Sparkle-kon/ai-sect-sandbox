import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { configureStoryteller, projectStoryteller } from '../src/engine/storytellerDirector';
import { currentEventIds, type StoryAuditProbe } from '../scripts/storyTriggerAuditTerms';
import { runStoryTriggerAudit } from '../scripts/storyTriggerAuditRunner';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const seed = 13071;
const ui: StoryAuditProbe = {
  id: 'P22-10', title: 'Mobile verification', mode: 'interface', evidence: 'A physical acceptance check, not a native turn.',
};

describe('trigger audit over actual completed native months', () => {
  it('uses standard Utility progression, exact month books and independent unique episode counters', () => {
    const books: Array<{ old: number; next: number; raw: number }> = [];
    const series: StoryAuditProbe = {
      id: 'P19-1', title: 'Count once', mode: 'native', evidence: 'Stable example identities to test the runner, not product claims.',
      observe(turn) {
        expect(turn.after.storyteller?.style).toBe('wandering_jianghu');
        expect(turn.after.mapPresentation).toEqual({ tick: turn.after.tick, trails: [], effects: [] });
        books.push({ old: turn.before.tick, next: turn.after.tick, raw: turn.events.length });
        return ['same episode', 'same episode', `month-${turn.after.tick}`];
      },
    };
    const crossCounter: StoryAuditProbe = {
      id: 'P19-2', title: 'Independent scope', mode: 'native', evidence: 'Same identity in a separate task.',
      observe: () => ['same episode'],
    };
    const player: StoryAuditProbe = {
      id: 'P20-1', title: 'No forced player action', mode: 'player-triggered', evidence: 'The off-line run does not submit this choice.',
      observe: turn => currentEventIds(turn, /^a-nonexistent-native-event-/u),
    };
    const options = { seed, ticks: 3, probes: [series, crossCounter, player, ui] };
    const result = runStoryTriggerAudit(options);
    expect(result).toMatchObject({ mode: 'autonomous', endTick: result.startTick + 3, completedTicks: 3 });
    expect(books).toHaveLength(3);
    expect(books.every(({ old, next }) => next === old + 1)).toBe(true);
    expect(result.rawEvents).toBe(books.reduce((sum, row) => sum + row.raw, 0));
    expect(result.counters.map(row => row.count)).toEqual([4, 1, 0, null]);
    expect(result.counters[0]).toMatchObject({ firstTick: result.startTick + 1, lastTick: result.endTick });
    expect(result.counters[1]).toMatchObject({ firstTick: result.startTick + 1, lastTick: result.startTick + 1 });
    expect(result.counters[2].firstTick).toBeUndefined();
    expect(result.counters[3].lastTick).toBeUndefined();
    expect(result.fingerprint).toMatch(/^fnv1a32-[a-f0-9]{8}$/u);
    expect(JSON.stringify(result)).not.toContain('same episode');
    expect(runStoryTriggerAudit(options)).toEqual(result);
  });

  it('uses a trusted supplied source without modifying it or configuring legacy state, and labels scripted orders', () => {
    const source = createInitialWorld(seed), original = JSON.stringify(source);
    const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '只停一月。' };
    let policyCalls = 0;
    const result = runStoryTriggerAudit({
      seed, ticks: 2, initialWorld: source,
      guidedPolicy(before) {
        policyCalls++;
        return Object.fromEntries(before.cultivators.map(({ id }) => [id, rest]));
      },
      probes: [{
        id: 'P21-1', title: 'Legacy observation', mode: 'native', evidence: 'A legacy world has no director state.',
        observe: turn => {
          expect(turn.before.storyteller).toBeUndefined();
          expect(turn.after.storyteller).toBeUndefined();
          return [];
        },
      }],
    });
    expect(JSON.stringify(source)).toBe(original);
    expect(policyCalls).toBe(2);
    expect(result).toMatchObject({ mode: 'scripted', startTick: source.tick, endTick: source.tick + 2, completedTicks: 2 });
  });

  it('rejects ambiguous or invented audit counters before reporting a count', () => {
    expect(() => runStoryTriggerAudit({ seed, ticks: -1, probes: [] })).toThrow(/month count/);
    expect(() => runStoryTriggerAudit({ seed, ticks: 0, probes: [ui, ui] })).toThrow(/Duplicate/);
    expect(() => runStoryTriggerAudit({ seed, ticks: 0, probes: [{ ...ui, mode: 'native' }] })).toThrow(/observer/);
    expect(() => runStoryTriggerAudit({ seed, ticks: 0, probes: [{ ...ui, observe: () => [] }] })).toThrow(/observer/);
    expect(() => runStoryTriggerAudit({ seed, ticks: 0, initialWorld: createInitialWorld(seed + 1), probes: [] })).toThrow(/seed/);
    expect(() => runStoryTriggerAudit({
      seed, ticks: 1, probes: [{ ...ui, mode: 'native', observe: () => ['   '] }],
    })).toThrow(/episode identity/);
  });
  it('separates repeat-visible menus from genuinely accepted opportunities', () => {
    const source=createInitialWorld(seed);
    expect(configureStoryteller(source,'still_water','npc-1')).toBe(true);
    const resting=(world:WorldState):Record<string,LLMDecisionPayload>=>Object.fromEntries(
      world.cultivators.map(({id})=>[id,{chosenAction:'REST',innerMonologue:'这一月各自歇息。'} as const]));
    const passive=runStoryTriggerAudit({seed,ticks:9,initialWorld:source,probes:[],guidedPolicy:resting});
    expect(passive.opportunities.scheduled).toBeGreaterThan(1);
    expect(passive.opportunities.monthsWithLegalDirectorMenu).toBeGreaterThan(passive.opportunities.distinctLegalDirectorOffers);
    expect(passive.opportunities.acceptedDirectorOffers).toBe(0);
    const active=runStoryTriggerAudit({
      seed,ticks:9,initialWorld:source,probes:[],
      guidedPolicy(world){
        const menu=projectStoryteller(world);
        const selection=menu?.options.find(row=>row.decision.storytellerMove==='rest');
        return {...resting(world),...(menu&&selection?{[menu.actorId]:{ ...selection.decision,innerMonologue:'就在这里歇一歇。' }}:{})};
      },
    });
    expect(active.opportunities.acceptedDirectorOffers).toBeGreaterThan(0);
    expect(active.opportunities.acceptedDirectorOffers).toBeLessThanOrEqual(active.opportunities.distinctLegalDirectorOffers);
  });
  it('runs the new scripted policy only against distinct real high points', () => {
    const plan = { seed, ticks: 16, probes: [] };
    const autonomous = runStoryTriggerAudit(plan);
    const scripted = runStoryTriggerAudit({ ...plan, playHighlights: true });
    expect(autonomous.highlights.offered).toBeGreaterThan(0);
    expect(autonomous.highlights.chosen).toBe(0);
    expect(scripted.highlights.chosen).toBeGreaterThan(0);
    expect(scripted.highlights.settled).toBeGreaterThan(0);
    expect(scripted.highlights.settled).toBeLessThanOrEqual(scripted.highlights.chosen);
    expect(scripted.highlights.chosen).toBeLessThanOrEqual(scripted.highlights.offered);
    expect(scripted.opportunities.acceptedDirectorOffers).toBeLessThanOrEqual(scripted.opportunities.distinctLegalDirectorOffers);
    expect(runStoryTriggerAudit({ ...plan, playHighlights: true })).toEqual(scripted);
    expect(() => runStoryTriggerAudit({ ...plan, playHighlights: true, guidedPolicy: () => undefined })).toThrow(/one scripted/);
  });

});
