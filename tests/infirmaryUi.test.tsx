import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { SectEconomyPanel } from '../src/components/SectEconomyPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { infirmaryCapacity } from '../src/engine/infirmaryEngine';
import type { InfirmaryCase, InfirmaryShift } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.tick = 13;
  const [patient, nurse, otherPatient] = world.cultivators;
  const sect = world.sects[0];
  const site = world.locations.find(({ id }) => id === sect.headquartersId)!;
  const market = world.locations.find(({ type }) => type === 'market')!;
  site.name = '照雪静养院';
  site.herbs.jade_leaf = 14;
  site.furnaceGrade = 3;
  sect.facilities.alchemy_hall = 3;
  patient.name = '所选就诊者';
  otherPatient.name = '不公开的排队病患';
  patient.hp = Math.max(1, Math.floor(patient.maxHp * 0.4));
  otherPatient.hp = Math.max(1, Math.floor(otherPatient.maxHp * 0.2));
  for (const actor of [patient, nurse, otherPatient]) {
    actor.sectId = sect.id;
    actor.locationId = site.id;
  }
  nurse.guardAssignment = { locationId: site.id, assignedTick: 11, expiresTick: 15 };
  const waiting: InfirmaryCase = {
    id: 'viewer-case', patientId: patient.id, sectId: sect.id, siteId: site.id,
    queuedTick: 11, expiresTick: 17, status: 'waiting',
  };
  const shift: InfirmaryShift = { id: 'found-guard-shift', guardId: nurse.id, sectId: sect.id, siteId: site.id, startedTick: 12, expiresTick: 15 };
  world.infirmaries.cases = [{ ...waiting, id: 'do-not-render-other-id', patientId: otherPatient.id, queuedTick: 12, expiresTick: 18 }, waiting];
  world.infirmaries.shifts = [shift];
  const html = (actor = patient) => renderToStaticMarkup(<SectEconomyPanel world={world} cultivator={actor} sect={sect} />);
  return { world, patient, nurse, otherPatient, sect, site, market, waiting, shift, html };
}

describe('private patient care in the existing sect treasury view', () => {
  it('adds a closed disclosure, shows actual clinic capacity and own queue rank without patient list', () => {
    const { world, sect, html } = fixture();
    const markup = html();
    const aggregate = infirmaryCapacity(world, sect.id);
    expect(aggregate.beds).toBeGreaterThan(0);
    expect(markup).toMatch(/<details class="[^"]+"><summary class="[^"]+">宗门静养院与救治调度/);
    expect(markup).toContain(`床位上限</dt><dd>${aggregate.beds}`);
    expect(markup).toContain(`本轮值守</dt><dd>${aggregate.onDuty}`);
    expect(markup).toContain(`本轮可救治</dt><dd>${aggregate.available}`);
    expect(markup).toContain('本人当前排位：第 ');
    expect(markup).toContain('开治时才消耗药资');
    expect(markup).not.toContain('不公开的排队病患');
    expect(markup).not.toContain('do-not-render-other-id');
    expect(markup).not.toContain('实际用药');
    expect(renderToStaticMarkup(<App />)).not.toContain('宗门静养院与救治调度');
  });

  it('shows only own historical consent, actual outcomes, and explicit refusal without claiming charges', () => {
    const { world, patient, nurse, waiting, shift, market, html } = fixture();
    world.tick = 14;
    waiting.status = 'treated';
    waiting.settledTick = 14;
    waiting.receipt = { guardId: nurse.id, shiftId: shift.id, tick: 14, stonesSpent: 12, herbsSpent: 2, hpRestored: 48, toxicityRemoved: 5 };
    world.infirmaries.cases.push({ ...waiting, id: 'older-refusal', queuedTick: 6, expiresTick: 12,
      status: 'refused', settledTick: 8, reason: 'refused', receipt: undefined });
    patient.locationId = market.id;
    const markup = html();
    expect(markup).toContain('未在诊台现场，仅显示本人档案');
    expect(markup).not.toContain('床位上限');
    expect(markup).not.toContain('本人当前排位');
    expect(markup).toContain('已同意并接受救治 · 照雪静养院');
    expect(markup).toContain('Tick #14 实际用药：12 灵石、翡翠灵叶 2 株 · 气血 +48 · 丹毒 −5');
    const refusedCaseMarkup = markup.split('本人已拒绝')[1];
    expect(refusedCaseMarkup).toContain('结案原因：未同意救治');
    expect(refusedCaseMarkup).not.toContain('实际用药');
  });

  it('keeps no-staff results and historical wait independent of a later receipt', () => {
    const { world, sect, waiting, html } = fixture();
    world.infirmaries.shifts = [];
    const older = structuredClone(world);
    expect(html()).toContain('本轮值守</dt><dd>0');
    expect(html()).toContain('本轮可救治</dt><dd>0');
    expect(html()).toContain('等待救治');
    world.tick = waiting.expiresTick;
    waiting.status = 'closed';
    waiting.reason = 'expiry';
    waiting.settledTick = world.tick;
    expect(html()).toContain('结案原因：等候期满');
    expect(html()).not.toContain('本人当前排位');
    const oldMarkup = renderToStaticMarkup(<SectEconomyPanel world={older} cultivator={older.cultivators[0]} sect={sect} />);
    expect(oldMarkup).toContain('等待救治');
    expect(oldMarkup).not.toContain('结案原因');
  });
});
