import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MortalVillagesPanel } from '../src/components/MortalVillagesPanel';
import { VillageFairPanel } from '../src/components/VillageFairPanel';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { advanceMarkets, resolveMarketAction } from '../src/engine/marketEngine';
import type { WorldState } from '../src/types/world';
import {
  announcedVillageFair, fairPayload, fairPerson, fairTurn, reservedVillageFair,
} from './fixtures/villageFairFixture';

const markup = (world: WorldState, actorId: string, villageId: string) =>
  renderToStaticMarkup(<VillageFairPanel world={world} cultivator={fairPerson(world, actorId)} villageId={villageId} />);

describe('on-site village fair proof and current offers', () => {
  it('keeps the existing village fold private to the actual site and marks pre-open held fees without implying payment', () => {
    const a = announcedVillageFair();
    const announced = markup(a.world, a.sponsorId, a.villageId);
    expect(announced).toMatch(/<details class="[^"]+"><summary class="[^"]+">乡集与摊位/);
    expect(announced).toContain('已排期，尚未开市');
    expect(announced).toContain('本期曾预留 0/2 席');
    expect(announced).toContain('摊位不是访客数，也不计入村籍');
    expect(announced).not.toContain('现有挂售');
    expect(announced).not.toContain('本人摊位');
    expect(announced).not.toContain('<button');
    expect(markup(a.world, a.outsiderId, a.villageId)).toBe('');
    expect(markup(a.world, a.sponsorId, 'unrelated-village')).toBe('');
    expect(renderToStaticMarkup(<MortalVillagesPanel world={a.world} cultivator={fairPerson(a.world, a.sponsorId)} />))
      .toContain('乡集与摊位');

    const b = reservedVillageFair();
    const [merchant, , localVisitor] = b.merchantIds;
    const reserved = markup(b.world, merchant, b.villageId);
    expect(reserved).toContain('本期曾预留 2/2 席');
    expect(reserved).toContain('摊费托管 4 灵石，尚未支付');
    expect(reserved).not.toContain('摊费已实退');
    expect(reserved).not.toContain('实付本地摊费');
    expect(markup(b.world, localVisitor, b.villageId)).not.toContain('本人摊位');
  });

  it('renders anonymous real unsold goods separately from the merchant opening receipt after native trades', () => {
    const f = reservedVillageFair();
    const [seller, buyer, visitor] = f.merchantIds;
    const open = fairTurn(f.world);
    const publicHtml = markup(open, visitor, f.villageId);
    expect(publicHtml).toContain('乡集正在开市');
    expect(publicHtml).toContain('现有挂售');
    expect(publicHtml.match(/玄土根 2 份 · 每份 12 灵石/g)).toHaveLength(2);
    expect(publicHtml).not.toContain('本人摊位');
    for (const secret of [f.fairId, f.orderFor(seller), seller, fairPerson(open, seller).name]) expect(publicHtml).not.toContain(secret);
    expect(resolveMarketAction(open, fairPerson(open, buyer), fairPayload('PLACE_MARKET_BUY', {
      marketGood: 'earth_root', marketQuantity: 4, marketLimitPrice: 12,
    }))).not.toBeNull();
    advanceMarkets(open);
    expect(markup(open, visitor, f.villageId).match(/玄土根 2 份 · 每份 12 灵石/g)).toHaveLength(1);
    const paid = markup(open, seller, f.villageId);
    expect(paid).toContain('实付本地摊费 4 灵石');
    expect(paid).toContain('开市时的原挂售：玄土根 2 份 · 每份 12 灵石。此凭据不是当前余货');
    const ended = markup(fairTurn(open), seller, f.villageId);
    expect(ended).toContain('本次乡集已收市');
    expect(ended).not.toContain('现有挂售');
    expect(ended).toContain('开市时的原挂售');
  });

  it('never shows live goods on a called-off day and distinguishes actual refund from still held', () => {
    const f = reservedVillageFair();
    const [merchant, , visitor] = f.merchantIds;
    const site = f.world.locations.find(({ id }) => id === f.siteId)!;
    const hazardous = applyMapBrush(applyMapBrush(f.world, 'beast_tide', [site]), 'beast_tide', [site]);
    expect(markup(hazardous, merchant, f.villageId)).toContain('摊费托管 4 灵石，尚未支付');
    const cancelled = fairTurn(hazardous);
    const own = markup(cancelled, merchant, f.villageId);
    expect(own).toContain('本次乡集已取消');
    expect(own).toContain('未能开市：场地有实际灾险');
    expect(own).toContain('第 ' + cancelled.tick + ' 轮取消');
    expect(own).toContain('摊费已实退 4 灵石');
    expect(own).not.toContain('现有挂售');
    expect(own).not.toContain('开市时的原挂售');
    expect(markup(cancelled, visitor, f.villageId)).not.toContain('摊费已实退');

    const delayed = structuredClone(cancelled);
    const pending = delayed.villageFairs.fairs[0].stalls[0];
    pending.status = 'refund_due';
    pending.settledTick = undefined;
    pending.feeEscrow = 4;
    const held = markup(delayed, merchant, f.villageId);
    expect(held).toContain('应退 4 灵石，仍在托管，尚未实退');
    expect(held).not.toContain('摊费已实退');
  });
});
