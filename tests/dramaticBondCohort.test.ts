import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { projectDramaticBondArcs } from '../src/engine/dramaticBondEngine';
import { availableEncounters } from '../src/engine/encounterEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

describe('native opposed practice and a verified third point of view', () => {
  it('threads a real opposite-school practice and names the third observer only in their own authorized view', () => {
    const leadId = 'npc-1', guestId = 'npc-4', witnessId = 'npc-2', siteId = 'loc-market';
    let world = createInitialWorld(2031);
    const person = (value: WorldState, id: string) => value.cultivators.find(actor => actor.id === id)!;
    for (const id of [leadId, guestId, witnessId]) {
      const actor = person(world, id);
      actor.locationId = siteId;
      actor.qiProgress = 0;
    }
    const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '此回静息。' };
    const turn = (value: WorldState, move: LLMDecisionPayload) => advanceWorldTick(value,
      Object.fromEntries(value.cultivators.map(actor => [actor.id, actor.id === leadId ? move : rest])),
      () => .1, 'utility');
    world = turn(world, { chosenAction: 'SOCIALIZE', targetCultivatorId: witnessId, innerMonologue: '今日当面论道。' });
    const canPractice = () => availableEncounters(person(world, leadId), world)
      .some(option => option.action === 'DUAL_CULTIVATE' && option.targetId === guestId);
    for (let i = 0; i < 12 && !canPractice(); i++) {
      world = turn(world, { chosenAction: 'SOCIALIZE', targetCultivatorId: guestId, innerMonologue: '与亲到此地者论道。' });
    }
    expect(canPractice()).toBe(true);
    world = turn(world, { chosenAction: 'DUAL_CULTIVATE', targetCultivatorId: guestId, innerMonologue: '在此共同吐纳。' });
    expect(world.dramaticBonds?.facts).toContainEqual(expect.objectContaining({ kind: 'practice',
      actorIds: [leadId, guestId], tick: world.tick, alignmentsAtSource: ['正道', '魔道'], venueKindAtSource: 'market' }));
    const scope = { currentVisibleSiteIds: new Set([siteId]) };
    const publicArc = projectDramaticBondArcs(world, scope).find(arc => arc.actorIds.includes(guestId));
    const asWitness = projectDramaticBondArcs(world, { ...scope, viewerId: witnessId }).find(arc => arc.actorIds.includes(guestId));
    expect(publicArc).toMatchObject({ title: '正魔同修' });
    expect(publicArc?.witnessName).toBeUndefined();
    expect(asWitness?.witnessName).toBe(person(world, witnessId).name);
    expect(asWitness?.milestones).toEqual(publicArc?.milestones);
    expect(publicArc?.title).not.toContain('道侣');
  });
});
