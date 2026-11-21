import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FurnaceReservationPanel } from '../src/components/FurnaceReservationPanel';
import { AlchemyPanel } from '../src/components/AlchemyPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { resolveAlchemy } from '../src/engine/alchemyEngine';
import { openFurnaceTurn, resolveFurnaceReservationAction } from '../src/engine/furnaceReservationEngine';
import { damageFurnacesFromBeastTide, resolveFurnaceSafetyAction } from '../src/engine/furnaceSafetyEngine';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import type { FurnaceSafetyMove } from '../src/types/world';

function fixture() {
  let world = createInitialWorld(1717);
  world.tick = 20;
  const sect = world.sects[0];
  const originalSite = world.locations.find(({ id }) => id === sect.headquartersId)!;
  const originalOwner = world.cultivators.find(({ id }) => id === sect.leaderId)!;
  originalSite.furnaceGrade = 3;
  Object.assign(originalOwner, { locationId: originalSite.id, age: 75, spiritStones: 600 });
  originalOwner.herbs.earth_root = 12;
  originalOwner.herbs.jade_leaf = 12;
  expect(resolveAlchemy(world, originalOwner, { chosenAction: 'BREW_PILL', innerMonologue: '',
    targetPillId: 'foundation' }, () => 0)).not.toBeNull();
  ++world.tick;
  const orderId = 'private-commission-id';
  const patron = world.cultivators.find(({ id }) => id !== originalOwner.id)!;
  patron.locationId = originalSite.id;
  world.workshops.orders.push({
    id: orderId, patronId: patron.id, makerId: originalOwner.id, siteId: originalSite.id, tier: '法器',
    quantity: 1, qualityFloor: 'standard', status: 'active', offeredTick: 19, offerExpiresTick: 22,
    acceptedTick: 20, deadlineTick: 29, escrowStones: 60, escrowHerbs: 2, refundedStones: 0, refundedHerbs: 0, work: [],
  });
  expect(resolveFurnaceReservationAction(world, originalOwner, { chosenAction: 'FURNACE_RESERVATION', innerMonologue: '',
    furnaceMove: 'reserve', targetLocationId: originalSite.id, targetWorkshopId: orderId })).not.toBeNull();
  const requested = { ...world.furnaceReservations.reservations[0] };
  world = applyMapBrush(world, 'beast_tide', [{ x: originalSite.x, y: originalSite.y }]);
  const site = world.locations.find(({ id }) => id === originalSite.id)!;
  const actor = world.cultivators.find(({ id }) => id === originalOwner.id)!;
  const visitor = world.cultivators.find(({ id }) => id === patron.id)!;
  const hazard = world.mapHazards.find((row) => row.kind === 'beast_tide')!;
  ++world.tick;
  expect(damageFurnacesFromBeastTide(world, hazard)).toHaveLength(1);
  openFurnaceTurn(world);
  const safetyCase = world.furnaceSafety.cases[0];
  const book = () => renderToStaticMarkup(<AlchemyPanel world={world} cultivator={actor} location={site} />);
  const queue = (viewer = actor) => renderToStaticMarkup(<FurnaceReservationPanel world={world} cultivator={viewer} />);
  const act = (furnaceSafetyMove: FurnaceSafetyMove) => resolveFurnaceSafetyAction(world, actor, {
    chosenAction: 'FURNACE_SAFETY', innerMonologue: '', furnaceSafetyMove, targetFurnaceSafetyId: safetyCase.id,
  });
  return { world, site, actor, visitor, hazard, requested, safetyCase, orderId, book, queue, act };
}

describe('onsite furnace condition in the existing reservation and recipe folds', () => {
  it('reports installed grade and zero usable capacity, exact own paused reservation and unaffected historic craft', () => {
    const { world, requested, orderId, safetyCase, book, queue } = fixture();
    const html = queue();
    expect(html).toMatch(/<details class="[^"]+"><summary class="[^"]+">同刻炉位与预约/);
    expect(html).toContain('装设 3 阶 · 本回合可用炉位 0 个');
    expect(html).toContain('炉点停用，本回合不分配炉位，也不能用炉。');
    expect(html).toContain('兽潮损炉 Tick #22 · 炉体完好度 70/100');
    expect(html).toContain('第 1 位（本人） · 申请 Tick #21 · 截止 Tick #26 前');
    expect(html).toContain('本回合等候时限已暂停。');
    expect(html).toContain('原预约与排队顺序保留，已顺延 1 回合。');
    expect(html).toContain('此预约关联工坊委制；委托原截止不因停炉顺延。');
    expect(html).toContain('Tick #20 · 炉位 1 · 实际作业：炼丹');
    expect(html).not.toContain('本回合炉位状态');
    for (const key of [requested.id, orderId, safetyCase.id, safetyCase.hazardId]) expect(html).not.toContain(key);
    expect(world.furnaceReservations.reservations[0]).toMatchObject({ id: requested.id, workshopOrderId: orderId, expiresTick: 26 });
    expect(world.workshops.orders[0].deadlineTick).toBe(29);
    expect(book()).toContain('装设 3 阶，本回合停用，不能炼丹。');
    expect(book()).not.toMatch(/当前耗费|成丹率\s*[0-9]/);
  });

  it('keeps the reopen turn closed and only discloses the authorized actor’s own proof', () => {
    const { world, actor, visitor, hazard, book, queue, act } = fixture();
    world.tick = hazard.expiresTick;
    expect(act('inspect')).not.toBeNull();
    ++world.tick;
    expect(act('repair')).not.toBeNull();
    ++world.tick;
    openFurnaceTurn(world);
    expect(act('reopen')).not.toBeNull();
    const reopening = queue();
    expect(reopening).toContain('已签署复炉，本回合仍停用；下一回合起才可重新分配炉位。');
    expect(reopening).toContain('本人修复 · 完好度 70 → 100');
    expect(reopening).toContain('本人签署复炉');
    expect(queue(visitor)).not.toMatch(/本人修复|本人签署复炉/);
    expect(book()).toContain('已签复炉，本回合仍停用');
    ++world.tick;
    expect(queue()).toContain('本回合可用炉位 3 个（共 3 个）');
    expect(book()).toContain('当前耗费');
    actor.tribulation = { id: 'private-journey', targetRealm: '筑基', stage: 'lightning', startedTick: world.tick,
      nextWave: 1, totalWaves: 3, pressure: 60, interruptions: 0 };
    expect(queue()).toBe('');
    expect(book()).toContain('当地炉阶未核实');
    expect(book()).not.toMatch(/完好度|当前耗费|装设 3 阶|当前丹炉：3 阶|兽潮|炉点停用/);
  });
});
