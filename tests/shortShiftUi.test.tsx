import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ShortShiftPanel } from '../src/components/ShortShiftPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import type { ShortShift } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(65);
  world.tick = 18;
  const [host, worker, outsider] = world.cultivators;
  const site = world.locations.find(({ id }) => id === host.locationId)!;
  worker.locationId = outsider.locationId = site.id;
  host.name = '真实出资者';
  worker.name = '应邀到班的修士';
  outsider.name = '旁观者不能知悉';
  site.name = '可查的临时观象站';
  const shift: ShortShift = {
    id: 'raw-private-short-shift-id', hostId: host.id, workerId: worker.id, hostSectId: host.sectId,
    workerSectId: worker.sectId, siteId: site.id, observatoryOpenedTick: 17,
    offeredTick: 18, offerExpiresTick: 21, status: 'offered', escrowStones: 12, paidStones: 0, refundedStones: 0,
  };
  world.shortShifts = { shifts: [shift], nextId: 2 };
  const html = (actor = host) => renderToStaticMarkup(<ShortShiftPanel world={world} cultivator={actor} />);
  return { world, host, worker, outsider, site, shift, html };
}

describe('private cross-sect short-shift receipts', () => {
  it('visibly separates invitation and personal funded custody from attendance and gives no record to a co-located outsider', () => {
    const { world, worker, outsider, shift, html } = fixture();
    const offer = html();
    expect(offer).toMatch(/<details class="[^"]+"><summary class="[^"]+">跨宗短聘与双向退出/);
    expect(offer).toContain('邀约待应答');
    expect(offer).toContain('邀约 Tick #18');
    expect(offer).toContain('约定工钱 12 灵石');
    expect(offer).toContain('出资者个人当前托管 12 灵石');
    expect(offer).not.toMatch(/raw-private-short-shift-id|旁观者不能知悉|当班实测|<button/);
    expect(html(worker)).toContain('本人为受聘者');
    expect(html(outsider)).toBe('');
    expect(renderToStaticMarkup(<ShortShiftPanel world={world} />)).toBe('');
    shift.status = 'active';
    shift.acceptedTick = 19;
    shift.shiftTick = 20;
    world.tick = 19;
    expect(html()).toContain('已同意，尚未实际到班');
    expect(html()).toContain('约定到班 Tick #20');
    expect(html()).not.toContain('当班实测');
  });

  it('shows actual weather and wage only on a dated worked shift; withdrawal or revocation does not fabricate work', () => {
    const { world, shift, worker, html } = fixture();
    Object.assign(shift, { status: 'completed', acceptedTick: 19, shiftTick: 20, closedTick: 20,
      escrowStones: 0, paidStones: 12, attendance: { tick: 20, reading: { kind: '罡风', intensity: .375 } } });
    world.tick = 20;
    const worked = html(worker);
    expect(worked).toContain('已实际到班并结算');
    expect(worked).toContain('当班实测 Tick #20：罡风 · 强度 37.5%');
    expect(worked).toContain('实际已付工钱 12 灵石');
    expect(worked).toContain('不改变宗属、品阶');
    delete shift.attendance;
    shift.paidStones = 0;
    shift.refundedStones = 12;
    shift.status = 'withdrawn';
    shift.closeReason = 'worker_withdrew';
    expect(html()).toContain('受聘者退出');
    expect(html()).toContain('实际已退原出资者 12 灵石');
    expect(html()).not.toContain('当班实测');
    shift.status = 'revoked';
    shift.closeReason = 'access_revoked';
    expect(html()).toContain('此地通行资格已失效');
    expect(html()).not.toContain('已实际到班并结算');
  });
});
