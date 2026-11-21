import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AgentInspector } from '../src/components/AgentInspector';
import { SealedCourierPanel } from '../src/components/SealedCourierPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import * as courierEngine from '../src/engine/sealedCourierEngine';

type Row = ReturnType<typeof courierEngine.visibleCouriers>[number];

function fixture() {
  const world = createInitialWorld();
  world.tick = 13;
  const [sender, courier, recipient, outsider] = world.cultivators;
  const base: Row = {
    id: 'courier-ui-receipt', role: 'sender', status: 'in_transit', openedTick: 8, offerExpiresTick: 11, acceptedTick: 9,
    deadlineTick: 18, feePaid: 12, senderName: '实际寄件者', recipientName: '本封函件的收件人',
    originName: '实际交接坊', destinationName: '实际约定送达处', payload: { kind: 'private_cue', cue: 'request_audience' },
    checkpoint: { x: 399, y: 515 },
  };
  const spy = vi.spyOn(courierEngine, 'visibleCouriers').mockImplementation((_view, observer) => {
    if (observer?.id === sender.id) return [{ ...base }];
    if (observer?.id === courier.id) return [{ ...base, role: 'courier' }]; // Defense: payload/recipient ignored even in malformed projection.
    if (observer?.id === recipient.id) return [{ ...base, role: 'recipient' }];
    return [];
  });
  const html = (actor = sender) => renderToStaticMarkup(<SealedCourierPanel world={world} cultivator={actor} />);
  return { world, base, sender, courier, recipient, outsider, html, spy };
}

describe('sealed dispatch role-based read-only UI', () => {
  it('shows one closed own record nested in mind, conditions fee on recorded acceptance, no home entry', () => {
    const { world, sender, base, html, spy } = fixture();
    try {
      const actor = renderToStaticMarkup(<AgentInspector world={world} workspaceSection="mind" cultivator={sender} onSelectCultivator={() => {}} />);
      expect(actor).toMatch(/<details class="[^"]+"><summary class="[^"]+">密函递送与消息失联/);
      expect(html()).toContain('本人寄件 · 携函途中');
      expect(html()).toContain('已知交接地点：实际交接坊 → 实际约定送达处');
      expect(html()).toContain('承运同意 Tick #9 · 递送截止 Tick #18');
      expect(html()).toContain('承运费已实付 12 灵石');
      expect(html()).toContain('私人提示：请求会面');
      expect(html()).not.toContain('399');
      expect(html()).not.toContain('515');
      expect(html()).not.toContain('<button');
      base.status = 'offered'; base.offerExpiresTick = 15; base.acceptedTick = undefined; base.deadlineTick = undefined; base.feePaid = 0;
      expect(html()).toContain('待信使同意');
      expect(html()).toContain('未实付承运费');
      expect(renderToStaticMarkup(<App />)).not.toContain('密函递送与消息失联');
    } finally { spy.mockRestore(); }
  });

  it('courier sees sealed custody while recipient only sees verified receipt after delivery; outsider sees nothing', () => {
    const { base, courier, recipient, outsider, html, spy } = fixture();
    try {
      const carried = html(courier);
      expect(carried).toContain('本人承运 · 携函途中');
      expect(carried).toContain('密封承运；不可查看载荷');
      expect(carried).not.toContain('请求会面');
      expect(carried).not.toContain('本封函件的收件人');
      expect(carried).not.toContain('实际寄件者');
      expect(html(recipient)).toBe('');
      expect(html(outsider)).toBe('');
      base.status = 'delivered'; base.deliveredTick = 13;
      base.payload = { kind: 'public_relief', sourceEventId: 'do-not-print-source-id', settlementId: 'hidden-location-key', stones: 12, herbs: 2 };
      const signed = html(recipient);
      expect(signed).toContain('本人签收 · 已确认签收');
      expect(signed).toContain('明确签收 Tick #13');
      expect(signed).toContain('公开赈济凭证：实记灵石 12、翡翠灵叶 2 株');
      expect(signed).not.toContain('实际交接坊');
      expect(signed).not.toContain('hidden-location-key');
      expect(signed).not.toContain('承运费已实付');
      expect(html(outsider)).toBe('');
    } finally { spy.mockRestore(); }
  });

  it('does not reveal access from actual sealed ledger until the delivered role exists', () => {
    const world = createInitialWorld();
    const [sender, courier, recipient, outsider] = world.cultivators;
    const [origin, destination] = world.locations;
    world.tick = 12;
    world.couriers.dispatches = [{
      id: 'actual-dispatch', senderId: sender.id, courierId: courier.id, recipientId: recipient.id,
      originId: origin.id, destinationId: destination.id, openedTick: 8, offerExpiresTick: 11, acceptedTick: 9,
      deadlineTick: 17, status: 'in_transit', sealed: { kind: 'private_cue', cue: 'offer_relief' },
      path: [{ x: origin.x, y: origin.y }, { x: destination.x, y: destination.y }], pathIndex: 0, feePaid: 12,
    }];
    const html = (actor = recipient) => renderToStaticMarkup(<SealedCourierPanel world={world} cultivator={actor} />);
    expect(html()).toBe('');
    expect(html(outsider)).toBe('');
    expect(html(courier)).not.toContain('表达赈济意愿');
    expect(html(sender)).toContain('表达赈济意愿');
    const row = world.couriers.dispatches[0];
    row.status = 'delivered'; row.deliveredTick = 13; row.settledTick = 13;
    expect(html()).toBe('');
    world.tick = 13;
    expect(html()).toContain('私人提示：表达赈济意愿（意愿信号，不是已完成的行动）');
    expect(html(outsider)).toBe('');
  });

  it('distinguishes return in progress, confirmed return and loss without reversing actual fee', () => {
    const { base, recipient, html, spy } = fixture();
    try {
      base.status = 'returning'; base.reason = 'recipient_absent';
      expect(html()).toContain('返程中，仍未退回');
      expect(html()).toContain('抵达时未遇到收件人');
      expect(html()).not.toContain('明确签收');
      base.status = 'returned'; base.settledTick = 13;
      expect(html()).toContain('已退回，收件人未签收');
      expect(html()).toContain('承运费已实付 12 灵石');
      base.status = 'lost'; base.reason = 'hazard';
      expect(html()).toContain('已失联，未确认签收');
      expect(html()).toContain('途中遇灾');
      expect(html(recipient)).toBe('');
    } finally { spy.mockRestore(); }
  });
});
