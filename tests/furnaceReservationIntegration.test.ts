import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload } from '../src/types/world';

const supplied = (action: LLMDecisionPayload['chosenAction'], fields: Partial<LLMDecisionPayload> = {}): LLMDecisionPayload =>
  ({ chosenAction: action, innerMonologue: '按现场契据行事。', ...fields });

describe('whole-world furnace arbitration', () => {
  it.each([48, 526])('awards the only physical turn by stable queue order at %i live actor records', (total) => {
    const world = createInitialWorld(5190);
    const market = world.locations.find((row) => row.id === 'loc-market')!;
    market.furnaceGrade = 1;
    const [later, winner] = world.cultivators;
    for (const person of [later, winner]) {
      person.locationId = market.id;
      person.spiritStones = 1000;
      person.herbs.jade_leaf = 6;
      person.herbs.earth_root = 6;
    }
    // Submit the later-order name first in the actual actor loop. Award does not use actor/action order.
    const contenders = [later, winner].sort((a, b) => a.id < b.id ? -1 : 1);
    world.cultivators = [contenders[1], contenders[0], ...world.cultivators.filter((actor) => !contenders.includes(actor))];
    const spare = world.cultivators[2];
    world.cultivators.push(...Array.from({ length: total - world.cultivators.length }, (_, i) => ({
      ...structuredClone(spare), id: `furnace-population-${i}`, name: `外地修士${i}`, sectId: '',
      sectRank: '外门弟子' as const, locationId: 'loc-vein-north', age: 24, lifespan: 150,
      artifacts: [],
    })));
    const toQueue = Object.fromEntries(world.cultivators.map((actor) => [actor.id, contenders.includes(actor)
      ? supplied('FURNACE_RESERVATION', { furnaceMove: 'reserve', targetLocationId: market.id }) : supplied('REST')]));
    const queued = advanceWorldTick(world, toQueue);
    expect(queued.furnaceReservations.reservations.filter(({ status }) => status === 'queued')).toHaveLength(2);
    expect(queued.furnaceReservations.uses).toHaveLength(0);
    const toWork = Object.fromEntries(queued.cultivators.map(({ id }) => [id, contenders.some((person) => person.id === id)
      ? supplied('BREW_PILL', { targetPillId: 'foundation' }) : supplied('REST')]));
    const worked = advanceWorldTick(queued, toWork);
    const use = worked.furnaceReservations.uses.filter(({ siteId }) => siteId === market.id);
    expect(use).toHaveLength(1);
    expect(use[0]).toMatchObject({ actorId: contenders[0].id, kind: 'brew', slot: 1, tick: worked.tick });
    expect(worked.furnaceReservations.reservations.find(({ id }) => id === use[0].reservationId))
      .toMatchObject({ actorId: contenders[0].id, status: 'used' });
    expect(worked.furnaceReservations.reservations.find(({ actorId }) => actorId === contenders[1].id)?.status).toBe('queued');
    expect(worked.cultivators).toHaveLength(total);
    expect(decodeWorldSave(encodeWorldSave(worked)).furnaceReservations).toEqual(worked.furnaceReservations);
    const forged = structuredClone(worked);
    forged.furnaceReservations.uses.push({ ...use[0], actorId: contenders[1].id });
    expect(() => encodeWorldSave(forged)).toThrow('furnaceReservations.uses.siteTurn');
  }, 20_000);

  it('never mistakes an inherited JavaScript key for an unscheduled actor’s model order', () => {
    const world = createInitialWorld(1850);
    const actor = structuredClone(world.cultivators[0]);
    actor.sectId = '';
    actor.sectRank = '外门弟子';
    actor.artifacts = [];
    world.cultivators.push({ ...actor, id: 'constructor', name: '真实导入修士' });
    const offline = advanceWorldTick(world, undefined, undefined, 'deferred');
    const explicitEmptyModel = advanceWorldTick(world, {}, undefined, 'deferred');
    expect(explicitEmptyModel).toEqual(offline);
  });
});
