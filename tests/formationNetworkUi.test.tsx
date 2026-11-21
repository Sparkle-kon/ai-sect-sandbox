import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { SectEconomyPanel } from '../src/components/SectEconomyPanel';
import { visibleFormationMapLinks } from '../src/components/formationMapView';
import { createTerrainMapView } from '../src/components/terrainMapView';
import { createInitialWorld } from '../src/data/initialWorld';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { FormationLink } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.tick = 15;
  const [own, other, foreign] = world.sects;
  own.facilities.qi_array = other.facilities.qi_array = 1;
  const viewer = world.cultivators.find(({ id }) => id === own.leaderId)!;
  const outsider = world.cultivators.find(({ id }) => id === foreign.leaderId)!;
  const a = world.locations.find(({ id }) => id === own.headquartersId)!;
  const b = world.locations.find(({ id }) => id === other.headquartersId)!;
  a.name = '青阵中枢'; b.name = '丹阵中枢';
  a.x = 405; a.y = 205; b.x = 525; b.y = 205;
  viewer.locationId = a.id;
  const link: FormationLink = {
    id: 'own-fixed-link', sectAId: own.id, sectBId: other.id, siteAId: a.id, siteBId: b.id,
    proposerId: viewer.id, recipientLeaderId: other.leaderId!, proposerSectId: own.id,
    openedTick: 10, offerExpiresTick: 13, steps: 3, status: 'broken', openedPaymentEach: 24, fundedTick: 11,
    heldA: 17, heldB: 24, sentTotal: 60, deliveredTotal: 41, transmissionLoss: 19, drawnTotal: 0,
    dissipatedTotal: 0, repairTotal: 0, brokenTick: 14, lastDispatchTick: 14,
    receipts: [
      { tick: 12, kind: 'dispatch', actorId: viewer.id, fromSiteId: b.id, toSiteId: a.id, sent: 20, delivered: 17, lost: 3 },
      { tick: 14, kind: 'overload', actorId: viewer.id, fromSiteId: a.id, toSiteId: b.id, sent: 40, delivered: 24, lost: 16 },
    ],
  };
  world.formations.links = [link];
  const html = (actor = viewer) => renderToStaticMarkup(<SectEconomyPanel world={world} cultivator={actor} sect={own} />);
  const map = () => visibleFormationMapLinks(world, createTerrainMapView(world, viewer, false), viewer);
  return { world, viewer, outsider, own, other, a, b, link, html, map };
}

describe('formation-directed receipts and full visible static standing link', () => {
  it('adds one closed ledger with actual paid, loss, broken and repaired quantities apart from offer', () => {
    const { world, link, html } = fixture();
    const markup = html();
    expect(markup).toMatch(/<details class="[^"]+"><summary class="[^"]+">阵网连通与灵气调拨/);
    expect(markup).toContain('两宗已各付 24 灵石 · 建成 Tick #11');
    expect(markup).toContain('两端当前存量：青阵中枢 17、丹阵中枢 24 灵气');
    expect(markup).toContain('累计调拨：发出 60、实收 41、途中损耗 19 灵气');
    expect(markup).toContain('丹阵中枢 → 青阵中枢 · 发出 20、实收 17、损耗 3');
    expect(markup).toContain('青阵中枢 → 丹阵中枢 · 发出 40、实收 24、损耗 16 · 调拨过载断链');
    expect(markup).toContain('过载仅断链，不造成爆炸伤害');
    expect(markup).toContain('断链始于 Tick #14');
    world.tick = 16;
    link.status = 'active'; link.lastRepairTick = 16; link.repairTotal = 18;
    link.receipts.push({ tick: 16, kind: 'repair', actorId: link.proposerId, stonesSpent: 18 });
    expect(html()).toContain('实付 18 灵石修复阵网');
    expect(html()).toContain('累计修复支出 18 灵石');
    expect(html()).toContain('阵网已连通');
    expect(html()).not.toContain('断链始于');
    link.status = 'offered'; link.fundedTick = undefined; link.openedPaymentEach = 0; link.offerExpiresTick = 17; link.receipts = [];
    expect(html()).toContain('拟每宗支付 24 灵石，尚未建成或付款 · 实付 0 灵石');
    expect(html()).not.toContain('两宗已各付');
    expect(renderToStaticMarkup(<App />)).not.toContain('阵网连通与灵气调拨');
  });

  it('suppresses whole link when a traversed interior tile is hidden despite both endpoints being visible', () => {
    const { world, viewer, outsider, a, b, link, html, map } = fixture();
    expect(map().map(({ status }) => status)).toEqual(['broken']);
    const base = createTerrainMapView(world, viewer, false);
    const aTile = terrainTileAt(world, a.x, a.y)!;
    const bTile = terrainTileAt(world, b.x, b.y)!;
    const current = new Set([aTile.id, bTile.id]);
    expect(visibleFormationMapLinks(world, { ...base, current }, viewer)).toEqual([]);
    for (let x = a.x; x <= b.x; x += 20) current.add(terrainTileAt(world, x, a.y)!.id);
    expect(visibleFormationMapLinks(world, { ...base, current }, viewer)).toHaveLength(1);
    expect(visibleFormationMapLinks(world, base, outsider)).toEqual([]);
    expect(html(outsider)).not.toContain('阵网连通与灵气调拨');
    link.status = 'active';
    expect(map().map(({ status }) => status)).toEqual(['active']);
  });

  it('does not draw or mislabel an active record suspended by war', () => {
    const { world, own, other, link, html, map } = fixture();
    link.status = 'active';
    const relation = world.diplomacy.find(({ sectAId, sectBId }) =>
      [sectAId, sectBId].includes(own.id) && [sectAId, sectBId].includes(other.id));
    if (relation) relation.pact = 'war';
    else world.diplomacy.push({ sectAId: own.id, sectBId: other.id, pact: 'war', affinity: -80, sinceTick: world.tick });
    expect(html()).toContain('宗门敌对，调拨暂停');
    expect(map()).toEqual([]);
  });
});
