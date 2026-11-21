import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { SectEconomyPanel } from '../src/components/SectEconomyPanel';
import { visibleLeaseMapSites } from '../src/components/leaseMapView';
import { createTerrainMapView } from '../src/components/terrainMapView';
import { createInitialWorld } from '../src/data/initialWorld';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { TerritorialLease } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.tick = 17;
  const [owner, lessee, third] = world.sects;
  owner.name = '实际甲地权'; lessee.name = '代采乙宗'; third.name = '无卷可见的第三方';
  const ownerActor = world.cultivators.find(({ id }) => id === owner.leaderId)!;
  const viewer = world.cultivators.find(({ id }) => id === lessee.leaderId)!;
  const stranger = world.cultivators.find(({ id }) => id === third.leaderId)!;
  viewer.name = '实际采集长老';
  const site = world.locations.find(({ id }) => id === 'loc-vein-north')!;
  site.name = '青露灵脉';
  site.ownerSectId = owner.id;
  ownerActor.exploredTileIds = [terrainTileAt(world, site.x, site.y)!.id];
  viewer.locationId = stranger.locationId = site.id;
  const lease: TerritorialLease = {
    id: 'lease-ledger', ownerSectId: owner.id, lesseeSectId: lessee.id, siteId: site.id,
    ownerSignerId: ownerActor.id, lesseeSignerId: viewer.id, openedTick: 14, offerExpiresTick: 17,
    status: 'active', startsTick: 15, endsTick: 21, escrow: 20, rentPaid: 4, refunded: 0, usedUnits: 1,
    receipts: [{ tick: 16, kind: 'harvest', amount: 4, actorId: viewer.id, herbId: 'jade_leaf', units: 1 }],
  };
  world.territorialLeases.leases = [lease];
  const html = (actor = viewer) => renderToStaticMarkup(<SectEconomyPanel
    world={world} cultivator={actor} sect={world.sects.find(({ id }) => id === actor.sectId)} />);
  const map = (actor = viewer, fog = false) => visibleLeaseMapSites(world, createTerrainMapView(world, actor, fog), actor);
  return { world, owner, lessee, third, ownerActor, viewer, stranger, site, lease, html, map };
}

describe('lease permission receipts apart from retained sovereignty', () => {
  it('shows one nested closed view with exact realized payments, quota and independent current owner', () => {
    const { html } = fixture();
    const markup = html();
    expect(markup).toMatch(/<details class="[^"]+"><summary class="[^"]+">地契租赁与采集许可/);
    expect(markup).toContain('青露灵脉 · 许可生效');
    expect(markup).toContain('采集许可不是领土转让，地主仍可采集');
    expect(markup).toContain('实际地权：实际甲地权');
    expect(markup).toContain('签约地主 实际甲地权 · 承租方 代采乙宗 · 本宗承租');
    expect(markup).toContain('实采 1/6 株 · 地主实收 4 灵石 · 承租方实收退款 0 灵石');
    expect(markup).toContain('实际预托管 24 灵石');
    expect(markup).toContain('还在托管的余款：20 灵石');
    expect(markup).toContain('实际采集长老采集 翡翠灵叶 1 株，实付租金 4 灵石');
    expect(renderToStaticMarkup(<App />)).not.toContain('地契租赁与采集许可');
  });

  it('distinguishes ownership transition, outstanding refund and original snapshot without reopening access', () => {
    const { world, third, viewer, site, lease, html, map } = fixture();
    const before = structuredClone(world);
    site.ownerSectId = third.id;
    expect(html()).toContain('地权变更，原许可失效');
    expect(map().size).toBe(0);
    lease.status = 'closed'; lease.endReason = 'title_change'; lease.settledTick = 17;
    lease.refunded = 12; lease.escrow = 8;
    lease.receipts.push({ tick: 17, kind: 'refund', amount: 12 });
    const htmlNow = html();
    expect(htmlNow).toContain('实际地权：无卷可见的第三方');
    expect(htmlNow).toContain('结案：实际地权已变更，原许可失效');
    expect(htmlNow).toContain('承租方实收退款 12 灵石');
    expect(htmlNow).toContain('待退未结的托管款：8 灵石');
    expect(htmlNow).toContain('托管实退 12 灵石');
    const oldHtml = renderToStaticMarkup(<SectEconomyPanel world={before} cultivator={viewer} sect={before.sects[1]} />);
    expect(oldHtml).toContain('实际地权：实际甲地权');
    expect(oldHtml).not.toContain('承租方实收退款 12 灵石');
  });

  it('does not give offers, outsiders, fogged places or exact-expiry sites a live lease map marker', () => {
    const { world, ownerActor, viewer, stranger, site, lease, html, map } = fixture();
    expect(map(viewer, true).get(site.id)).toEqual({ role: 'lessee', remaining: 5 });
    expect(map(ownerActor).get(site.id)).toEqual({ role: 'owner', remaining: 5 });
    expect(map(stranger).size).toBe(0);
    expect(html(stranger)).not.toContain('地契租赁与采集许可');
    viewer.exploredTileIds = [terrainTileAt(world, site.x, site.y)!.id];
    viewer.locationId = world.locations.find(({ id }) => id === 'loc-market')!.id;
    expect(map(viewer).has(site.id)).toBe(true);
    expect(map(viewer, true).has(site.id)).toBe(false);
    world.tick = 21;
    expect(map().size).toBe(0);
    expect(html()).toContain('租期已满，许可失效');
    lease.status = 'offered'; lease.offerExpiresTick = 23;
    lease.startsTick = undefined; lease.endsTick = undefined; lease.escrow = 0; lease.receipts = [];
    expect(map().size).toBe(0);
    expect(html()).toContain('拟预托管 24 灵石，未预付、不授予采集权');
  });
});
