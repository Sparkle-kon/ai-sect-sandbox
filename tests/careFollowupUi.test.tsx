import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InfirmaryPanel } from '../src/components/InfirmaryPanel';
import { advanceCareFollowups, resolveCareFollowupAction } from '../src/engine/careFollowupEngine';
import type { WorldState } from '../src/types/world';
import {
  attendedCareFollowup, careChoice, carePerson, dischargedCareFollowup, scheduledCareFollowup, supportedCareFollowup,
} from './fixtures/careFollowupFixture';

const html = (world: WorldState, viewer: string) =>
  renderToStaticMarkup(<InfirmaryPanel world={world} cultivator={carePerson(world, viewer)} />);

describe('follow-up receipt in the established clinic fold', () => {
  it('keeps previous discharge separate and does not publish a fiction of attendance or private identities', () => {
    const source = dischargedCareFollowup();
    expect(html(source.world, source.patientId)).not.toContain('静养复诊与到场接力');
    const f = scheduledCareFollowup();
    const row = f.world.careFollowups.appointments[0];
    const own = html(f.world, f.patientId);
    expect(own).toMatch(/<details class="[^"]+"><summary class="[^"]+">宗门静养院与救治调度/);
    expect(own).toContain('前诊已结，复诊另约');
    expect(own).toContain(`第 ${row.dischargedTick} 轮前诊已结 · 第 ${row.scheduledTick} 轮另约 · 约第 ${row.dueTick} 轮到场`);
    expect(own).toContain(`第 ${row.expiresTick - 1} 轮可现场核验，第 ${row.expiresTick} 轮起不可再复诊`);
    expect(own).toContain('未施治，未扣公库、药材或个人费用');
    expect(own).not.toContain('实际耗用宗库');
    expect(own).not.toContain('<button');
    for (const id of [f.guardId, f.sourceGuardId, f.outsiderId, f.acuteId]) {
      expect(html(f.world, id)).not.toContain('静养复诊与到场接力');
    }
    for (const sensitive of [f.id, f.sourceCaseId, f.sourceShiftId, f.patientId, f.sourceGuardId, f.guardId,
      carePerson(f.world, f.sourceGuardId).name, carePerson(f.world, f.guardId).name]) expect(own).not.toContain(sensitive);
  });

  it('labels the missed first appointment gracefully and closes without billing if only the former guard is present', () => {
    const f = supportedCareFollowup(true);
    f.world.tick++;
    expect(html(f.world, f.patientId)).toContain('已到约定轮，仍须现场确认');
    expect(resolveCareFollowupAction(f.world, carePerson(f.world, f.patientId), careChoice('attend', f.id))).toBeNull();
    expect(advanceCareFollowups(f.world)).toEqual([]);

    f.world.tick++;
    const deferred = html(f.world, f.patientId);
    expect(deferred).toContain('原定轮未施治，仍在宽限内');
    expect(deferred).not.toContain('实际耗用宗库');
    expect(advanceCareFollowups(f.world)).toHaveLength(1);
    const closed = html(f.world, f.patientId);
    expect(closed).toContain('复诊结束，未施治');
    expect(closed).toContain('没有可接手的独立值守');
    expect(closed).not.toContain('仍在宽限内');
    expect(closed).not.toContain('实际耗用宗库');
  });

  it('shows one authentic actual receipt to the patient and distinct onsite guard only', () => {
    const f = attendedCareFollowup();
    const receipt = f.world.careFollowups.appointments[0].receipt!;
    const own = html(f.world, f.patientId), guard = html(f.world, f.guardId);
    expect(own).toContain('本人同意到场，已实际接受复诊');
    expect(own).toContain('由另一位在场值守接手');
    expect(guard).toContain('本人值守接力');
    expect(guard).toContain('本人替前诊值守接力');
    expect(own).toContain('实际耗用宗库 6 灵石、院中翡翠灵叶 1 株');
    expect(own).toContain(`气血 +${receipt.hpRestored} · 丹毒 −${receipt.toxicityRemoved}。未向个人收费`);
    expect(own.match(/实际耗用宗库/g)).toHaveLength(1);
    expect(own.match(/实际用药/g)).toHaveLength(1);
    for (const viewer of [f.sourceGuardId, f.outsiderId, f.acuteId]) expect(html(f.world, viewer)).not.toContain('实际耗用宗库');
    expect(html(f.world, f.acuteId)).toContain('诊台本轮剩余复诊名额');
    expect(html(f.world, f.acuteId)).not.toContain(carePerson(f.world, f.patientId).name);
    for (const sensitive of [f.id, f.sourceCaseId, f.shiftId, f.patientId, carePerson(f.world, f.patientId).name]) {
      expect(guard).not.toContain(sensitive);
    }
  });
});
