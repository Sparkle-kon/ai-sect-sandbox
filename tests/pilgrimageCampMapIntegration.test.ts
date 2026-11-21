import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { visiblePilgrimageCampMarks } from '../src/components/pilgrimageMapView';
import { modelDecisionCandidates } from '../src/engine/modelDecisionTurn';
import { availablePilgrimageActions, resolvePilgrimageAction } from '../src/engine/pilgrimageEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { Cultivator, LLMDecisionPayload, PilgrimageMove } from '../src/types/world';

function crossing(two: boolean) {
  const world = createInitialWorld(13071);
  const parties = [[world.cultivators[0], world.cultivators[1]], [world.cultivators[2], world.cultivators[3]]];
  const travelers = (two ? parties : parties.slice(0, 1)).flat();
  const stranger = world.cultivators[5];
  const startingSite = world.locations.find(({ id }) => id === 'loc-taixu')!;
  for (const person of travelers) {
    person.locationId = startingSite.id;
    person.spiritStones = 200;
    person.herbs.earth_root = 2;
    person.exploredTileIds = [];
  }
  for (const person of world.cultivators.filter((person) => !travelers.includes(person))) person.locationId = 'loc-market-east';
  const act = (actor: Cultivator, move: PilgrimageMove, fields: Partial<LLMDecisionPayload> = {}) => {
    const result = resolvePilgrimageAction(world, actor, {
      chosenAction: 'PILGRIMAGE', innerMonologue: '以已踏过的关口为据。', pilgrimageMove: move, ...fields,
    });
    if (result) world.events.unshift(result);
    return result;
  };
  const journeys = (two ? parties : parties.slice(0, 1)).map(([leader, partner]) => {
    const proposal = availablePilgrimageActions(leader, world).find((option) =>
      option.pilgrimageMove === 'propose' && option.targetCultivatorId === partner.id)!;
    expect(proposal).toBeDefined();
    const { targetLocationId, targetPilgrimageNextStopId } = proposal;
    expect(act(leader, 'propose', { targetLocationId, targetPilgrimageNextStopId, targetCultivatorId: partner.id })).not.toBeNull();
    const row = world.pilgrimages.journeys.at(-1)!;
    expect(act(partner, 'accept', { targetPilgrimageId: row.id })).not.toBeNull();
    return row;
  });
  world.tick++;
  for (const [index, row] of journeys.entries()) {
    expect(act(parties[index][0], 'advance', { targetPilgrimageId: row.id })).not.toBeNull();
    expect(row.pathIndex).toBeGreaterThan(0);
    expect(row.pathIndex).toBeLessThan(row.path.length - 1);
  }
  world.tick++;
  for (const [index, row] of journeys.entries()) {
    const [leader, partner] = parties[index];
    partner.hp = Math.floor(partner.maxHp / 2);
    expect(act(leader, 'camp', { targetPilgrimageId: row.id })).not.toBeNull();
  }
  return { world, journeys, parties, stranger, act };
}

describe('camp projection and portable canonical proof', () => {
  it('shows only actual visible camps, merging co-located teams without extra destinations or title changes', () => {
    const { world, journeys, parties, stranger, act } = crossing(true);
    const first = journeys[0].camps![0];
    expect(journeys[1].camps![0].point).toEqual(first.point);
    const venues = structuredClone(world.locations);
    expect(visiblePilgrimageCampMarks(world, parties[0][0])).toEqual([{ point: first.point, parties: 2 }]);
    stranger.realm = '练气';
    const far = [...world.locations].sort((a, b) =>
      Math.hypot(b.x - first.point.x, b.y - first.point.y) - Math.hypot(a.x - first.point.x, a.y - first.point.y))[0];
    stranger.locationId = far.id;
    stranger.exploredTileIds.push(terrainTileAt(world, first.point.x, first.point.y)!.id);
    expect(visiblePilgrimageCampMarks(world, stranger)).toEqual([]);
    world.tick++;
    expect(act(parties[0][1], 'dismantle', { targetPilgrimageId: journeys[0].id })).not.toBeNull();
    expect(visiblePilgrimageCampMarks(world, parties[1][1])).toEqual([{ point: first.point, parties: 1 }]);
    expect(world.locations).toEqual(venues);
  });

  it('round-trips a paid checkpoint and its later recovery, rejects false pins and duplicate camp receipt', () => {
    const { world, journeys, parties, act } = crossing(false);
    const row = journeys[0];
    const payer = parties[0][0];
    expect(decodeWorldSave(encodeWorldSave(world)).pilgrimages.journeys[0].camps).toEqual(row.camps);
    expect(availablePilgrimageActions(payer, world, false).some(({ pilgrimageMove }) => pilgrimageMove === 'resume')).toBe(false);
    expect(modelDecisionCandidates(world).some(({ id }) => id === payer.id)).toBe(true);
    const fake = structuredClone(world);
    fake.pilgrimages.journeys[0].camps![0].point.x += 1;
    expect(() => encodeWorldSave(fake)).toThrow('pilgrimages.journeys.camp_source');
    const duplicate = structuredClone(world);
    const copies = duplicate.pilgrimages.journeys[0].camps!;
    copies.push({ ...copies[0] });
    expect(() => encodeWorldSave(duplicate)).toThrow('pilgrimages.journeys.camp_leg_once');
    world.tick++;
    expect(act(payer, 'resume', { targetPilgrimageId: row.id })).not.toBeNull();
    expect(decodeWorldSave(encodeWorldSave(world)).pilgrimages.journeys[0].camps).toEqual(row.camps);
    expect(visiblePilgrimageCampMarks(world, payer)).toEqual([]);
  });
});
