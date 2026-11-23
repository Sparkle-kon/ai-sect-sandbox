import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { pruneExpiredNudges } from '../src/engine/director/nudge';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import type { StorytellerDirectorState } from '../src/types/storytellerDirector';

const fixture = () => {
  const world = createInitialWorld(13071);
  const state: StorytellerDirectorState = { style: 'wandering_jianghu', configuredTick: 0,
    lastOfferTick: 0, lastAdvancedTick: world.tick, tension: 0 };
  world.storyteller = state;
  return { world, state };
};

describe('bounded director save state', () => {
  it('keeps pre-highlight saves unchanged and restores typed dated references and future nudges unchanged', () => {
    const { world, state } = fixture();
    const oldBytes = encodeEraWorldSave(world);
    const restoredOld = decodeEraWorldSave(oldBytes);
    expect(restoredOld.storyteller?.highlights).toBeUndefined();
    expect(restoredOld.storyteller?.nudges).toBeUndefined();
    expect(encodeEraWorldSave(restoredOld)).toBe(oldBytes);

    state.lastHighlightTick = world.tick;
    state.highlights = [{ tick: world.tick, kind: 'encounter', sourceId: 'native-encounter-id', actorId: 'npc-1' }];
    state.highlightOffer = { kind: 'encounter', sourceId: 'native-encounter-id', actorId: 'npc-1',
      siteId: 'loc-taixu', openedTick: world.tick };
    state.nudges = [
      { kind: 'travel_bias', actorId: 'npc-2', targetSiteId: 'loc-taixu', weight: 35, reason: 'bond_reunion', expiresTick: world.tick + 1 },
      { kind: 'encounter_ticket', actorId: 'npc-1', targetSiteId: 'loc-market', reason: 'encounter', expiresTick: world.tick + 3 },
      { kind: 'omen_bias', siteId: 'loc-taixu', reason: 'dungeon', expiresTick: world.tick + 6 },
      { kind: 'npc_accept_bias', actorId: 'npc-3', towardActorId: 'npc-1', delta: 10, reason: 'bond_reunion', expiresTick: world.tick + 6 },
    ];
    const bytes = encodeEraWorldSave(world);
    const reopened = decodeEraWorldSave(bytes);
    expect(encodeEraWorldSave(reopened)).toBe(bytes);
    expect(reopened.storyteller).toEqual(state);
    pruneExpiredNudges(reopened.storyteller!, world.tick + 1);
    expect(reopened.storyteller?.nudges?.map(row => row.kind)).toEqual(['encounter_ticket', 'omen_bias', 'npc_accept_bias']);
    pruneExpiredNudges(reopened.storyteller!, world.tick + 6);
    expect(reopened.storyteller?.nudges).toBeUndefined();
  });

  it('roundtrips an exact pending choice separately from a settled history row', () => {
    const { world, state } = fixture();
    const key = { kind: 'encounter' as const, sourceId: 'native-encounter-id', actorId: 'npc-1',
      siteId: 'loc-taixu', openedTick: world.tick };
    state.lastHighlightTick = world.tick;
    const row = { tick: world.tick, kind: key.kind, sourceId: key.sourceId, actorId: key.actorId, chosen: 'study' };
    state.highlights = [row];
    state.pendingHighlightChoice = { key, optionId: 'study' };
    const pending = encodeEraWorldSave(world);
    expect(encodeEraWorldSave(decodeEraWorldSave(pending))).toBe(pending);

    for (const mutate of [
      (value: StorytellerDirectorState) => { value.pendingHighlightChoice!.optionId = 'leave'; },
      (value: StorytellerDirectorState) => { value.pendingHighlightChoice!.key = { ...key, openedTick: world.tick + 1 }; },
      (value: StorytellerDirectorState) => { value.pendingHighlightChoice!.key = { ...key, actorId: 'npc-2' }; },
      (value: StorytellerDirectorState) => { value.highlightOffer = { ...key }; },
      (value: StorytellerDirectorState) => { value.highlights![0].resolutionTick = world.tick; },
    ]) {
      const invalid = structuredClone(world);
      mutate(invalid.storyteller!);
      expect(() => encodeEraWorldSave(invalid)).toThrow(/storyteller.highlight/u);
    }
    delete state.pendingHighlightChoice;
    state.highlights = [{ ...row, resolutionTick: world.tick, consequences: ['technique'] }];
    const resolved = encodeEraWorldSave(world);
    expect(decodeEraWorldSave(resolved).storyteller).toEqual(state);
    const nativeProof = 'evt-director-storage-fixture';
    state.highlights[0].resolutionEventId = nativeProof;
    expect(() => encodeEraWorldSave(world)).toThrow(/storyteller.highlight.resolution/u);
    world.events.unshift({ id: nativeProof, tick: world.tick, year: world.year, month: world.month,
      category: 'combat', actorIds: [key.actorId], locationId: key.siteId, title: '断碑前', description: '旧碑落下一层尘。' });
    expect(decodeEraWorldSave(encodeEraWorldSave(world)).storyteller).toEqual(state);
    world.events[0].actorIds = ['npc-2'];
    expect(() => encodeEraWorldSave(world)).toThrow(/storyteller.highlight.resolution/u);
  });

  it('rejects beyond-cap, duplicate, stale and malformed rows without changing ordinary world fields', () => {
    const { world, state } = fixture();
    state.lastHighlightTick = world.tick;
    const row = { tick: world.tick, kind: 'encounter' as const, sourceId: 'native-encounter-id', actorId: 'npc-1' };
    const nudge = { kind: 'encounter_ticket' as const, actorId: 'npc-1', targetSiteId: 'loc-taixu',
      reason: 'encounter' as const, expiresTick: world.tick + 1 };
    state.highlights = [row];
    state.nudges = [nudge];
    const bytes = encodeEraWorldSave(world);
    for (const corrupt of [
      (value: StorytellerDirectorState) => { value.highlights = Array.from({ length: 121 }, () => row); },
      (value: StorytellerDirectorState) => { value.highlights = [row, row]; },
      (value: StorytellerDirectorState) => { value.highlights = [{ ...row, tick: world.tick + 1 }]; },
      (value: StorytellerDirectorState) => { value.highlights = [{ ...row, consequences: ['item'] }]; },
      (value: StorytellerDirectorState) => { value.nudges = [{ ...nudge, expiresTick: world.tick }]; },
      (value: StorytellerDirectorState) => { value.nudges = [{ ...nudge, targetSiteId: 'unregistered-place' }]; },
      (value: StorytellerDirectorState) => { value.nudges = [nudge, nudge]; },
      (value: StorytellerDirectorState) => { value.nudges = [Object.assign({}, nudge, { actorHp: 1 })]; },
      (value: StorytellerDirectorState) => { value.highlightOffer = { kind: row.kind, actorId: row.actorId, sourceId: 'wrong-source', openedTick: world.tick, siteId: 'loc-taixu' }; },
    ]) {
      const copy = structuredClone(world);
      corrupt(copy.storyteller!);
      expect(() => encodeEraWorldSave(copy)).toThrow(/storyteller.(?:highlight|nudges)/u);
    }
    expect(encodeEraWorldSave(world)).toBe(bytes);
  });
});
