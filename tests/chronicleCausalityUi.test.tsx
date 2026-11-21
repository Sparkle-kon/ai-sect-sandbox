import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ChronicleFeed } from '../src/components/ChronicleFeed';
import type { CausalChronicleView } from '../src/engine/chronicleCausalityEngine';
import type { WorldEvent } from '../src/types/world';

function fact(id: string, tick: number, patch: Partial<WorldEvent> = {}): WorldEvent {
  return { id, tick, year: 1, month: tick, category: 'diplomacy', actorIds: [], title: '同名坊市纪事',
    description: '同名并不代表同一笔成交。', ...patch };
}

describe('typed reverse evidence within the existing chronicle', () => {
  it('starts with terminal result, uses exact ids rather than titles, and retains ordinary projected focus controls', () => {
    const close = fact('read-hidden-settlement-id', 9);
    const sameName = fact('reuse-same-title', 8);
    const secret = fact('participants-only', 7, { witnessScope: 'participants' });
    const view: CausalChronicleView = {
      entry: { eventId: close.id, tick: close.tick, kind: 'market_settlement', outcome: 'delivered' },
      previous: [{ relation: 'settled_shipment',
        node: { entry: { eventId: 'internal-shipment-id', tick: 6, kind: 'market_shipment' }, previous: [
          { relation: 'matched_buy_order', node: { entry: { eventId: 'private-buy-key', tick: 4, kind: 'market_buy_order' }, previous: [] } },
          { relation: 'matched_sell_order', node: { entry: { eventId: 'private-sell-key', tick: 3, kind: 'market_sell_order' }, previous: [] } },
        ] } }],
    };
    const resolve = vi.fn((id: string) => id === close.id ? view : undefined);
    const html = renderToStaticMarkup(<ChronicleFeed events={[close, sameName, secret]} category="diplomacy"
      causality={resolve} onJump={() => undefined} focusOptions={(id) => id === sameName.id
        ? { links: [{ eventId: id, kind: 'site', targetId: 'visible-place', label: '可见地点' }], withheld: false }
        : { links: [], withheld: false }} />);
    expect(html.match(/逆查可证原因/g)).toHaveLength(1);
    expect(html).toMatch(/<details class="[^"]+" data-chronicle-cause="true"><summary class="[^"]+">逆查可证原因/);
    expect(html).toMatch(/交易结算 · Tick #9[\s\S]*实际结果：商队已到货交割[\s\S]*实际结算的商队[\s\S]*商队启程 · Tick #6/);
    expect(html).toContain('实际撮合的买单');
    expect(html).toContain('挂出卖单 · Tick #3');
    expect(html).toContain('地图：可见地点');
    expect(html).not.toMatch(/private-buy-key|private-sell-key|internal-shipment-id|read-hidden-settlement-id/);
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(resolve).not.toHaveBeenCalledWith(secret.id);
  });

  it('shows a verified terminal even when predecessor is not available, without arguing that no earlier reason exists', () => {
    const agreed = fact('only-terminal', 11, { title: '停战结果' });
    const inconsistent = fact('different-id', 10, { title: '同名停战结果' });
    const terminal: CausalChronicleView = {
      entry: { eventId: agreed.id, tick: 11, kind: 'truce_signed', outcome: 'truce_with_withdrawal' }, previous: [],
    };
    const html = renderToStaticMarkup(<ChronicleFeed events={[agreed, inconsistent]} causality={() => terminal} />);
    expect(html.match(/逆查可证原因/g)).toHaveLength(1);
    expect(html).toContain('实际结果：停战生效，并有围攻实际撤回');
    expect(html).toContain('止于此处不代表没有更早原因');
    expect(html).not.toContain('已核验的前因');
    expect(html).not.toContain('停战实际撤回的围攻');
  });
});
