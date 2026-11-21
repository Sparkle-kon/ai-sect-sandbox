import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SealedCourierPanel } from '../src/components/SealedCourierPanel';
import type { WorldState } from '../src/types/world';
import {
  arrivedCourierHandoff, handoffDecision, handoffPerson, handoffSite, handoffTurn, offeredCourierHandoff, transferredCourierHandoff,
} from './fixtures/courierHandoffFixture';

const html = (world: WorldState, actorId: string) =>
  renderToStaticMarkup(<SealedCourierPanel world={world} cultivator={handoffPerson(world, actorId)} />);

describe('one original sealed packet and an exact shared-post transfer in the existing row', () => {
  it('separates actual arrival, invitation and absence without showing contents to any prospective carrier', () => {
    const a = arrivedCourierHandoff();
    const local = html(a.world, a.originalId);
    expect(local).toMatch(/<details class="[^"]+"><summary class="[^"]+">密函递送与消息失联/);
    expect(local).toContain('原信使已实际抵驿，尚未换手');
    expect(local).toContain(handoffSite(a.world, a.postId).name);
    expect(local).not.toContain('封泥未拆，信先换了肩');
    expect(html(a.world, a.newId)).toBe('');

    const f = offeredCourierHandoff();
    const invited = html(f.world, f.newId);
    expect(invited).toContain('本人受邀转接');
    expect(invited).toContain('原件在驿站候交，待受邀人明确同意');
    expect(invited).toContain('受邀不等于已承运；不可查看载荷');
    expect(invited).not.toContain('本人转接承运');
    expect(invited).not.toContain('承运费已实付');
    expect(invited).not.toContain('表达赈济意愿');
    expect(invited).not.toContain('明确签收');
    expect(invited).not.toContain('<button');
    for (const secret of [f.id, f.postId, f.newId, f.originalId, handoffPerson(f.world, f.recipientId).name]) {
      expect(invited).not.toContain(secret);
    }
    expect(html(f.world, f.outsiderId)).toBe('');
    expect(html(f.world, f.recipientId)).toBe('');

    handoffPerson(f.world, f.newId).locationId = f.originId;
    const failed = handoffTurn(f.world, { [f.newId]: handoffDecision('accept', f.id) });
    expect(html(failed, f.newId)).toContain('交接中断，原件未换手');
    expect(html(failed, f.newId)).not.toContain('封泥未拆，信先换了肩');
    expect(html(failed, f.newId)).not.toContain('明确签收');
  });

  it('renders actual transfer once, preserves original fee and separate zero transfer fee, and keeps the packet sealed', () => {
    const f = transferredCourierHandoff();
    const oldHtml = html(f.world, f.originalId);
    const newHtml = html(f.world, f.newId);
    const sender = html(f.world, f.senderId);
    for (const owned of [oldHtml, newHtml, sender]) {
      expect(owned.match(/aria-label="驿站转接"/g)).toHaveLength(1);
      expect(owned).toContain('封泥未拆，信先换了肩');
      expect(owned).toContain('换手不等于收件人签收');
      expect(owned).not.toContain('明确签收');
    }
    expect(oldHtml).toContain('本人原承运 · 已在驿站交出，本人无后续递送实录');
    expect(oldHtml).toContain('原承运费已实付 12 灵石');
    expect(oldHtml).not.toContain('原递送截止');
    expect(newHtml).toContain('本人转接承运');
    expect(newHtml).toContain('本人这次转接实收承运费 0 灵石');
    expect(newHtml).not.toContain('承运费已实付 12');
    expect(sender).toContain('承运费已实付 12 灵石');
    expect(sender).toContain('私人提示：表达赈济意愿');

    for (const carrier of [oldHtml, newHtml]) {
      expect(carrier).toContain('密封承运；不可查看载荷');
      expect(carrier).not.toContain('私人提示');
      expect(carrier).not.toContain('表达赈济意愿');
      expect(carrier).not.toContain(handoffPerson(f.world, f.recipientId).name);
    }
  });

  it('reveals the actual signed receipt only to the recipient and native roles, never the former or a waiting candidate', () => {
    const f = transferredCourierHandoff();
    let { world } = f;
    expect(html(world, f.recipientId)).toBe('');
    while (world.couriers.dispatches[0].status === 'in_transit') world = handoffTurn(world);
    const original = world.couriers.dispatches[0];
    expect(original.status).toBe('delivered');
    const recipient = html(world, f.recipientId);
    expect(recipient).toContain('本人签收 · 已确认签收');
    expect(recipient).toContain('明确签收 Tick #' + original.deliveredTick);
    expect(recipient).toContain('私人提示：表达赈济意愿');
    expect(html(world, f.newId)).toContain('明确签收');
    expect(html(world, f.newId)).not.toContain('私人提示');
    expect(html(world, f.originalId)).not.toContain('明确签收');
    expect(html(world, f.originalId)).not.toContain('已确认签收');
    expect(html(world, f.originalId)).not.toContain('私人提示');
    expect(html(world, f.outsiderId)).toBe('');
  });
});
