import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { resolveObservatoryAction } from '../src/engine/fieldObservatoryEngine';
import { beginClinicDutyTurn, resolveInfirmaryAction } from '../src/engine/infirmaryEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import type { Cultivator, InfirmaryMove, WorldState } from '../src/types/world';

function proofFixture() {
  const world = createInitialWorld(8825);
  const sect = world.sects.find(({id}) => world.cultivators.filter(({sectId}) => sectId === id).length >= 4)!;
  const site = world.locations.find(({id}) => id === sect.headquartersId)!;
  const members = world.cultivators.filter(({id,sectId}) => sectId === sect.id && id !== sect.leaderId)
    .sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const [original,replacement,patient] = members;
  for (const actor of [original,replacement,patient]) {
    actor.hp = actor.maxHp;
    actor.locationId = site.id;
  }
  sect.facilities.alchemy_hall = 2;
  sect.spiritStones = 160;
  site.herbs.jade_leaf = Math.min(4, site.herbCapacity.jade_leaf);
  original.spiritStones = 40;
  const treatment = (actor: Cultivator, infirmaryMove: InfirmaryMove, targetInfirmaryCaseId?: string) =>
    resolveInfirmaryAction(world,actor,{chosenAction:'INFIRMARY',infirmaryMove,targetInfirmaryCaseId,innerMonologue:''});
  const step = () => { world.tick++; world.month++; };
  expect(resolveObservatoryAction(world,original,
    {chosenAction:'FIELD_OBSERVATORY',observatoryMove:'fund',targetLocationId:site.id,innerMonologue:''})).not.toBeNull();
  step();
  expect(treatment(original,'staff')).not.toBeNull();
  expect(treatment(replacement,'staff')).not.toBeNull();
  patient.hp = Math.round(patient.maxHp * .4);
  expect(treatment(patient,'request')).not.toBeNull();
  step();
  beginClinicDutyTurn(world);
  const request = world.infirmaries.cases[0];
  expect(treatment(patient,'accept_handoff',request.id)).not.toBeNull();
  expect(resolveObservatoryAction(world,original,{chosenAction:'FIELD_OBSERVATORY',observatoryMove:'measure',
    targetLocationId:site.id,targetObservatoryTick:world.tick-2,innerMonologue:''})).not.toBeNull();
  return {world,request,original,replacement};
}

function mutate(save: string, update: (world: WorldState) => void) {
  const parsed = JSON.parse(save) as {world:WorldState};
  update(parsed.world);
  return () => decodeWorldSave(JSON.stringify(parsed));
}

describe('clinical handoff save proof', () => {
  it('preserves exact two earlier voluntary signed shifts separately from one real care receipt', () => {
    const {world,request,original,replacement} = proofFixture();
    const decoded = decodeWorldSave(encodeWorldSave(world));
    const proof = decoded.infirmaries.cases[0];
    const [before,served] = decoded.infirmaries.shifts;
    expect(proof.receipt).toEqual(request.receipt);
    expect(before).toMatchObject({guardId:original.id,lastWithheld:{tick:world.tick,duty:'observatory'}});
    expect(before.lastServedTick).toBeUndefined();
    expect(served).toMatchObject({guardId:replacement.id,lastServedTick:world.tick});
    expect(proof.receipt?.handoff).toEqual({fromShiftId:before.id,duty:'observatory'});
  });

  it('rejects substitution with the same guard, missing dated proof or an invented duty', () => {
    const save = encodeWorldSave(proofFixture().world);
    expect(mutate(save, (world) => {
      const receipt = world.infirmaries.cases[0].receipt!;
      receipt.handoff!.fromShiftId = receipt.shiftId;
    })).toThrow('infirmaries.cases.handoff');
    expect(mutate(save, (world) => { delete world.infirmaries.shifts[0].lastWithheld; }))
      .toThrow('infirmaries.cases.handoff');
    expect(mutate(save, (world) => { world.infirmaries.cases[0].receipt!.handoff!.duty = 'cohort'; }))
      .toThrow('infirmaries.cases.handoff');
  });
});
