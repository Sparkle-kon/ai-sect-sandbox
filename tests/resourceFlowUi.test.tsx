import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { MarketCaravansPanel } from '../src/components/MarketCaravansPanel';
import { ResourceFlowMonth } from '../src/components/ResourceFlowPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { flowActor, flowSite, projectResourceFlowMonth, recordResourceFlow } from '../src/engine/resourceFlowEngine';
import type { ResourceFlowDraft } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.tick = 13;
  const [viewer, partner] = world.cultivators;
  viewer.name = '相应用账修士';
  partner.name = '外方私人收据修士';
  const [local, elsewhere] = world.locations;
  local.name = '可见采集点'; elsewhere.name = '不泄露的远地';
  const record = (entry: ResourceFlowDraft) => recordResourceFlow(world, entry);
  record({ kind: 'transfer', from: flowSite(local.id), to: flowActor(viewer.id), mechanism: 'alchemy', refId: 'gather',
    reason: 'herb_harvest', amount: 2, good: 'jade_leaf', visibility: { kind: 'known_sites', siteIds: [local.id] } });
  record({ kind: 'production', to: flowSite(local.id), mechanism: 'alchemy', refId: 'grow',
    reason: 'herb_regrowth', amount: 3, good: 'jade_leaf', visibility: { kind: 'known_sites', siteIds: [local.id] } });
  record({ kind: 'consumption', from: flowActor(viewer.id), mechanism: 'alchemy', refId: 'fee',
    reason: 'brew_fee', amount: 7, good: 'stone', visibility: { kind: 'participants', actorIds: [viewer.id] } });
  record({ kind: 'loss', from: flowActor(partner.id), mechanism: 'market', refId: 'other-private',
    reason: 'shipment_loss', amount: 19, good: 'jade_leaf', visibility: { kind: 'participants', actorIds: [partner.id] } });
  record({ kind: 'production', to: flowSite(elsewhere.id), mechanism: 'alchemy', refId: 'hidden-grow',
    reason: 'herb_regrowth', amount: 11, good: 'earth_root', visibility: { kind: 'known_sites', siteIds: [elsewhere.id] } });
  const viewed = new Set([local.id]);
  const html = (scope: 'actor' | 'observer' = 'actor') => renderToStaticMarkup(<ResourceFlowMonth
    ledger={projectResourceFlowMonth(world, 13, scope === 'actor' ? { kind: scope, actorId: viewer.id, visibleSiteIds: viewed } : { kind: scope })!}
    world={world} scope={scope} visibleSiteIds={viewed} />);
  return { world, viewer, partner, local, elsewhere, html };
}

describe('monthly resource flow narrow mounted ledger', () => {
  it('adds one closed fold on existing market view with no default/home data', () => {
    const { world, viewer } = fixture();
    const markup = renderToStaticMarkup(<MarketCaravansPanel world={world} cultivator={viewer} />);
    expect(markup).toMatch(/<details class="[^"]+"><summary class="[^"]+">物资流向与月度对账/);
    expect(markup).toContain('不同物资不相加');
    expect(markup).not.toContain('按物资各自对账');
    expect(markup).not.toContain('对账视角');
    expect(renderToStaticMarkup(<App />)).not.toContain('物资流向与月度对账');
  });

  it('separates each asset and directed transfers, and does not make a hidden scope a zero report', () => {
    const { world, html } = fixture();
    world.tick = 14;
    const scope = html();
    expect(scope).toContain('已完成的月份');
    expect(scope).toContain('本月只列可见且保留的明细；未列明细不按零计');
    expect(scope).toContain('翡翠灵叶 · 单位：株');
    expect(scope).toContain('灵石 · 单位：灵石');
    expect(scope).toContain('转移 · 2 株 翡翠灵叶 · 现场采集');
    expect(scope).toContain('可见采集点 → 相应用账修士');
    expect(scope).toContain('产出 · 3 株 翡翠灵叶 · 灵草自然补生');
    expect(scope).toContain('消耗 · 7 灵石 · 炼丹炉费');
    expect(scope).not.toContain('外方私人收据修士');
    expect(scope).not.toContain('不泄露的远地');
    expect(scope).not.toContain('实际货损');
  });

  it('only offers bounded retained detail pages, with honest omission count and no cross-month mix', () => {
    const { world, html } = fixture();
    const month = world.resourceFlow.months.find(({ tick }) => tick === 13)!;
    for (let i = 0; i < 10; i++) month.entries.push({ ...month.entries[0], id: 100 + i });
    month.totalEntries = month.entries.length + 4;
    const markup = html('observer');
    expect(markup).toContain('另有 4 条明细超出保留上限，不能展开');
    expect(markup).toContain('明细第 1/2 页 · 每页最多 8 条');
    expect(markup).toContain('下一页');
    const receipts = markup.split('有方向的物资收据')[1].split('</ol>')[0];
    expect(receipts.match(/<li /g)).toHaveLength(8);
  });
});
