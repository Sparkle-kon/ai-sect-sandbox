import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { resolveObservatoryAction } from '../src/engine/fieldObservatoryEngine';
import { resolveShortShiftAction } from '../src/engine/shortShiftEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';

function signedShift() {
  const world = createInitialWorld(4013);
  const sect = world.sects[0];
  const siteId = sect.headquartersId;
  const host = world.cultivators.find(({ id }) => id === sect.leaderId)!;
  const guest = world.cultivators.find(({ sectId }) => sectId && sectId !== sect.id)!;
  for (const actor of [host, guest]) {
    actor.locationId = siteId;
    actor.spiritStones = 100;
  }
  world.tick = 10;
  const opened = world.tick;
  expect(resolveObservatoryAction(world, host, {
    chosenAction: 'FIELD_OBSERVATORY', observatoryMove: 'fund', targetLocationId: siteId, innerMonologue: '',
  })).not.toBeNull();
  world.tick += 2;
  expect(resolveObservatoryAction(world, host, {
    chosenAction: 'FIELD_OBSERVATORY', observatoryMove: 'measure', targetLocationId: siteId,
    targetObservatoryTick: opened, innerMonologue: '',
  })).not.toBeNull();
  world.tick++;
  expect(resolveShortShiftAction(world, host, {
    chosenAction: 'SHORT_SHIFT', shortShiftMove: 'offer', targetCultivatorId: guest.id,
    targetObservatoryTick: opened, innerMonologue: '',
  })).not.toBeNull();
  const shift = world.shortShifts.shifts[0];
  world.tick++;
  expect(resolveShortShiftAction(world, guest, {
    chosenAction: 'SHORT_SHIFT', shortShiftMove: 'accept', targetShortShiftId: shift.id, innerMonologue: '',
  })).not.toBeNull();
  return { world, host, guest, shift };
}

describe('portable short shift wage and genuine attendance', () => {
  it('round-trips named escrow, rejects a forged source and double wages, and loads the actual measured record', () => {
    const { world, host, guest, shift } = signedShift();
    const active = decodeWorldSave(encodeWorldSave(world));
    expect(active.shortShifts.shifts[0]).toMatchObject({ status: 'active', escrowStones: 12, paidStones: 0, refundedStones: 0 });
    const noSource = structuredClone(active);
    delete noSource.fieldObservatories.byActor[host.id];
    expect(() => encodeWorldSave(noSource)).toThrow('shortShifts.shifts.source');
    world.tick++;
    expect(resolveShortShiftAction(world, guest, {
      chosenAction: 'SHORT_SHIFT', shortShiftMove: 'work', targetShortShiftId: shift.id, innerMonologue: '',
    })).not.toBeNull();
    const completed = decodeWorldSave(encodeWorldSave(world));
    expect(completed.shortShifts.shifts[0]).toMatchObject({ status: 'completed', paidStones: 12, escrowStones: 0,
      refundedStones: 0, attendance: { tick: world.tick } });
    const double = structuredClone(completed);
    double.shortShifts.shifts[0].refundedStones = 12;
    expect(() => encodeWorldSave(double)).toThrow('shortShifts.shifts.source');
    const invented = structuredClone(completed);
    invented.shortShifts.shifts[0].attendance!.tick++;
    expect(() => encodeWorldSave(invented)).toThrow('shortShifts.attendance.source');
  });
});
