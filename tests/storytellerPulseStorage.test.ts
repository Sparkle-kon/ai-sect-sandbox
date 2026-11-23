import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { configureStoryteller } from '../src/engine/storytellerDirector';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { STORYTELLER_PULSE_LIMIT } from '../src/types/storytellerDirector';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const quiet: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '在原地安稳歇一歇。' };
const advance = (world: WorldState) => advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(({ id }) => [id, quiet])), () => .99);

function configured(): WorldState {
  const world = createInitialWorld(13071);
  expect(configureStoryteller(world, 'wandering_jianghu', 'npc-1')).toBe(true);
  return world;
}

describe('strict bounded director pulse save evidence (G1-2)', () => {
  it('keeps earlier director saves without history byte-exact and only samples the next actual month', () => {
    const started = configured();
    const early = advance(advance(started));
    expect(early.storyteller?.pulse?.length).toBe(2);
    const prior = structuredClone(early);
    delete prior.storyteller?.pulse;
    const oldBytes = encodeEraWorldSave(prior);
    const reopened = decodeEraWorldSave(oldBytes);
    expect(encodeEraWorldSave(reopened)).toBe(oldBytes);
    expect(reopened.storyteller?.pulse).toBeUndefined();
    const next = advance(reopened);
    expect(next.storyteller?.pulse?.map(point => point.tick)).toEqual([next.tick]);
    expect(encodeEraWorldSave(decodeEraWorldSave(encodeEraWorldSave(next)))).toBe(encodeEraWorldSave(next));
    expect(reopened.storyteller?.pulse).toBeUndefined();
  });

  it('retains exactly the latest 24 native months and fails closed on forged dates, offers or private fields', () => {
    let current = configured();
    for (let month = 0; month < STORYTELLER_PULSE_LIMIT + 2; month++) current = advance(current);
    const real = current.storyteller?.pulse;
    expect(real?.map(point => point.tick)).toEqual(Array.from({ length: STORYTELLER_PULSE_LIMIT },
      (_, index) => current.tick - STORYTELLER_PULSE_LIMIT + 1 + index));
    expect(real?.at(-1)).toMatchObject({ tick: current.storyteller?.lastAdvancedTick, tension: current.storyteller?.tension });
    const bytes = encodeEraWorldSave(current);
    const corruptions = [
      (w: WorldState) => { w.storyteller!.pulse = []; },
      (w: WorldState) => { w.storyteller!.pulse!.splice(1, 2, w.storyteller!.pulse![2], w.storyteller!.pulse![1]); },
      (w: WorldState) => { Object.assign(w.storyteller!.pulse![2], { tick: w.storyteller!.pulse![1].tick }); },
      (w: WorldState) => { w.storyteller!.pulse!.unshift({ ...w.storyteller!.pulse![0] }); },
      (w: WorldState) => { Object.assign(w.storyteller!.pulse!.at(-1)!, { tension: (w.storyteller!.tension + 1) % 101 }); },
      (w: WorldState) => { Object.assign(w.storyteller!.pulse!.at(-1)!, { tick: w.tick + 1 }); },
      (w: WorldState) => {
        const offered = w.storyteller!.pulse!.find(point => point.offeredTone !== undefined);
        if (!offered) throw Error('Expected a real offered month');
        Reflect.deleteProperty(offered, 'reason');
      },
      (w: WorldState) => {
        const offered = w.storyteller!.pulse!.find(point => point.tick === w.storyteller!.lastOfferTick);
        if (!offered) throw Error('Expected the retained latest offer month');
        Reflect.deleteProperty(offered, 'offeredTone');
        Reflect.deleteProperty(offered, 'reason');
      },
      (w: WorldState) => { Object.assign(w.storyteller!.pulse![0], { actorId: 'npc-1', quote: '不进入天势图的私话。' }); },
    ];
    for (const corrupt of corruptions) {
      const forged = structuredClone(current);
      corrupt(forged);
      expect(() => encodeEraWorldSave(forged)).toThrow(/storyteller.pulse/);
    }
    expect(encodeEraWorldSave(current)).toBe(bytes);
  });
});
