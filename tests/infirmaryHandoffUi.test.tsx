import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InfirmaryPanel } from '../src/components/InfirmaryPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { beginClinicDutyTurn, resolveInfirmaryAction } from '../src/engine/infirmaryEngine';
import { resolveObservatoryAction } from '../src/engine/fieldObservatoryEngine';
import type { Cultivator, InfirmaryMove } from '../src/types/world';

function fixture(backupReady: boolean) {
  const world = createInitialWorld(1810);
  world.tick = 20;
  const sect = world.sects[0];
  const site = world.locations.find(({ id }) => id === sect.headquartersId)!;
  const offsite = world.locations.find(({ id }) => id !== site.id)!;
  sect.facilities.alchemy_hall = 2;
  sect.spiritStones = 120;
  site.herbs.jade_leaf = 16;
  const [primary, backup, patient, other] = world.cultivators.filter(({ id }) => id !== sect.leaderId).slice(0, 4)
    .sort((a, b) => a.id.localeCompare(b.id));
  primary.name = '原值守姓名不可外传';
  backup.name = '候补姓名不可外传';
  other.name = '其他患者姓名不可外传';
  for (const actor of [primary, backup, patient, other]) {
    actor.sectId = sect.id;
    actor.locationId = site.id;
    actor.hp = actor.maxHp;
    actor.spiritStones = 150;
    actor.pillToxicity = 0;
  }
  patient.hp = Math.round(patient.maxHp * .25);
  patient.pillToxicity = 14;
  const clinic = (actor: Cultivator, infirmaryMove: InfirmaryMove, targetInfirmaryCaseId?: string) =>
    resolveInfirmaryAction(world, actor, { chosenAction: 'INFIRMARY', innerMonologue: '', infirmaryMove, targetInfirmaryCaseId });
  expect(resolveObservatoryAction(world, primary, { chosenAction: 'FIELD_OBSERVATORY', innerMonologue: '',
    observatoryMove: 'fund', targetLocationId: site.id })).not.toBeNull();
  world.tick++;
  expect(clinic(primary, 'staff')).not.toBeNull();
  if (backupReady) expect(clinic(backup, 'staff')).not.toBeNull();
  expect(clinic(patient, 'request')).not.toBeNull();
  world.tick++;
  beginClinicDutyTurn(world);
  const entry = world.infirmaries.cases[0];
  const original = world.infirmaries.shifts[0];
  const html = (actor = patient) => renderToStaticMarkup(<InfirmaryPanel world={world} cultivator={actor} />);
  const inventory = () => [sect.spiritStones, site.herbs.jade_leaf];
  return { world, site, offsite, primary, backup, patient, other, entry, original, html, clinic, inventory };
}

describe('actual clinic duty conflict and explicit patient consent', () => {
  it('shows no same-turn treatment or deduction if no backup, and hides onsite queue disposition offsite', () => {
    const { patient, primary, other, entry, original, offsite, html, inventory } = fixture(false);
    const before = inventory();
    expect(html()).toContain('当班职责冲突，暂无可交接者，继续等候。尚未施治，未扣耗材');
    expect(html()).not.toMatch(/原值守姓名|候补姓名|其他患者姓名|接手；|实际用药/);
    expect(html()).not.toContain(original.id);
    expect(html()).not.toContain('本人值守暂缓');
    expect(html(primary)).toContain('本人值守暂缓 Tick #22 · 同回合另有观象实测职责');
    expect(html(other)).not.toContain('本人值守暂缓');
    expect(entry.receipt).toBeUndefined();
    expect(inventory()).toEqual(before);
    patient.locationId = offsite.id;
    expect(html()).toContain('尚未施治，未扣耗材');
    expect(html()).not.toContain('当班职责冲突');
  });

  it('labels available backup before consent and shows only afterwards the true handoff, actual consumption, and completed consent', () => {
    const { world, site, patient, backup, entry, original, html, clinic, inventory } = fixture(true);
    expect(html()).toContain('有在场候补可接手，仍须本人明确同意。尚未施治，未扣耗材');
    expect(html()).not.toContain('实际接手');
    const before = inventory();
    expect(clinic(patient, 'accept', entry.id)).toBeNull();
    expect(inventory()).toEqual(before);
    const observed = resolveObservatoryAction(world, world.cultivators.find(({ id }) => id === original.guardId)!, {
      chosenAction: 'FIELD_OBSERVATORY', innerMonologue: '', observatoryMove: 'measure', targetLocationId: site.id, targetObservatoryTick: 20,
    });
    expect(observed).not.toBeNull();
    expect(clinic(patient, 'accept_handoff', entry.id)).not.toBeNull();
    expect(entry.receipt?.guardId).toBe(backup.id);
    const treated = html();
    expect(treated).toContain('本人已明确同意交棒，由在场候补实际接手；原值守另有观象实测职责');
    expect(treated).toContain('Tick #22 实际用药：12 灵石、翡翠灵叶 2 株');
    expect(treated).not.toMatch(/原值守姓名|候补姓名|其他患者姓名|有在场候补可接手|尚未施治/);
    expect(treated).not.toContain(original.id);
    expect(inventory()).toEqual([before[0] - 12, before[1] - 2]);
  });
});
