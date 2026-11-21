import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { AgentInspector } from '../src/components/AgentInspector';
import { WorkshopPanel } from '../src/components/WorkshopPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import type { WorkshopOrder } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.tick = 12;
  const [patron, maker, outsider] = world.cultivators;
  patron.name = '实际委托修士'; maker.name = '受托工匠'; outsider.name = '无权读取的外部修士';
  const site = world.locations.find(({ type }) => type === 'market')!;
  patron.locationId = maker.locationId = site.id;
  site.name = '有据可查的工坊';
  const order: WorkshopOrder = {
    id: 'order-game-only', patronId: patron.id, makerId: maker.id, siteId: site.id,
    tier: '法器', quantity: 2, qualityFloor: 'fine',
    status: 'offered', offeredTick: 10, offerExpiresTick: 13,
    escrowStones: 0, escrowHerbs: 0, refundedStones: 0, refundedHerbs: 0, work: [],
  };
  world.workshops.orders = [order];
  const html = (actor = patron) => renderToStaticMarkup(<WorkshopPanel world={world} cultivator={actor} />);
  return { world, patron, maker, outsider, order, html };
}

describe('workshop orders actual inputs, consent and persistent receipts', () => {
  it('is nested and closed, shows only actual scoped offer, and does not future-charge unfinished work', () => {
    const { world, patron, outsider, html } = fixture();
    const inspection = renderToStaticMarkup(<AgentInspector world={world} workspaceSection="cultivation" cultivator={patron} onSelectCultivator={() => {}} />);
    expect(inspection).toMatch(/<details class="[^"]+"><summary class="[^"]+">工坊委制与品质交割/);
    const text = html();
    expect(text).toContain('本人委制 · 法器 ×2 · 等待工匠同意');
    expect(text).toContain('对方 受托工匠 · 有据可查的工坊');
    expect(text).toContain('约定最低品质：精良');
    expect(text).toContain('约定整单托管 110 灵石与玄土根 4 株');
    expect(text).toContain('没有已同意的承制记录，未开工');
    expect(text).not.toContain('实测品质');
    expect(html(outsider)).toBe('');
    expect(renderToStaticMarkup(<App />)).not.toContain('工坊委制与品质交割');
  });

  it('shows attributed work, measured quality, only actual acceptance into storage and retained historical receipt', () => {
    const { world, patron, maker, order, html } = fixture();
    world.tick = 21;
    const past = structuredClone(world);
    order.status = 'completed'; order.acceptedTick = 12; order.deadlineTick = 19; order.settledTick = 18;
    order.refundedStones = 22;
    order.work = [
      { tick: 15, makerId: maker.id, piece: 1, stage: 'blank', stonesUsed: 17, herbsUsed: 1 },
      { tick: 16, makerId: maker.id, piece: 1, stage: 'finish', stonesUsed: 16, herbsUsed: 1, quality: 'standard', qualityScore: 55 },
      { tick: 17, makerId: maker.id, piece: 2, stage: 'blank', stonesUsed: 17, herbsUsed: 1 },
      { tick: 18, makerId: maker.id, piece: 2, stage: 'finish', stonesUsed: 16, herbsUsed: 1, quality: 'fine', qualityScore: 94,
        artifactId: 'one-accepted-artifact', feePaid: 22 },
    ];
    patron.artifacts = [{ id: 'one-accepted-artifact', name: 'Tangible', spiritRoot: '金' }];
    expect(html()).toContain('实际工序 4/4 · 已验质 2/2 件 · 实际交割 1 件');
    expect(html()).toContain('Tick #15 · 第 1 件 · 制坯 · 受托工匠');
    expect(html()).toContain('实际耗用 17 灵石、玄土根 1 株');
    expect(html()).toContain('实测品质：合格（评分 55） · 未达到约定品质，无成品入库');
    expect(html()).toContain('实测品质：精良（评分 94） · 已验收入库，当前仍持有');
    expect(html()).toContain('实付工费 22 灵石');
    expect(html()).toContain('已实退 22 灵石');
    expect(html(maker)).toContain('已交割');
    expect(html(maker)).not.toContain('当前仍持有');
    expect(html()).not.toContain('one-accepted-artifact');
    patron.artifacts = [];
    expect(html()).toContain('曾验收入库，当前未持有');
    expect(renderToStaticMarkup(<WorkshopPanel world={past} cultivator={past.cultivators[0]} />)).not.toContain('实测品质');
  });

  it('shows termination and recorded material returns without claiming all spent materials return', () => {
    const { world, maker, order, html } = fixture();
    world.tick = 18;
    order.status = 'cancelled'; order.acceptedTick = 11; order.deadlineTick = 18; order.settledTick = 16;
    order.closeReason = 'maker_cancelled'; order.refundedStones = 93; order.refundedHerbs = 3;
    order.work = [{ tick: 12, makerId: maker.id, piece: 1, stage: 'blank', stonesUsed: 17, herbsUsed: 1 }];
    expect(html()).toContain('结案：工匠取消 · Tick #16');
    expect(html()).toContain('已实退 93 灵石与玄土根 3 株');
    expect(html()).toContain('实际耗用 17 灵石、玄土根 1 株');
    expect(html()).toContain('实际交割 0 件');
    expect(html()).not.toContain('入库，当前');
  });
});
