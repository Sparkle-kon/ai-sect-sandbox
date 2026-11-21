import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkshopPanel } from '../src/components/WorkshopPanel';
import { SectRelocationPanel } from '../src/components/SectRelocationPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceRelocations } from '../src/engine/relocationEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { findMapPath } from '../src/engine/mapMotionEngine';
import { advanceWorkshopInstitutionClosures, resolveWorkshopAction } from '../src/engine/workshopEngine';
import type { Cultivator, LLMDecisionPayload } from '../src/types/world';

function fixture(active: boolean) {
  const world = createInitialWorld(11311);
  world.tick = 20;
  const sect = world.sects[0];
  const origin = world.locations.find(({ id }) => id === sect.headquartersId)!;
  const destination = world.locations.find((site) => site.type === 'spirit_vein' && !site.ownerSectId &&
    !terrainTileAt(world, site.x, site.y)?.ownerSectId)!;
  origin.name = '旧章程所在峰';
  destination.name = '实际迁入新峰';
  origin.furnaceGrade = 3;
  sect.facilities.alchemy_hall = 1;
  const maker = world.cultivators.find(({ id }) => id === sect.leaderId)!;
  const patron = world.cultivators.find(({ id, sectId }) => id !== maker.id && sectId === sect.id)!;
  const outsider = world.cultivators.find(({ sectId }) => sectId !== sect.id)!;
  const neutral = world.locations.find(({ type }) => type === 'market')!;
  for (const actor of world.cultivators) actor.locationId = neutral.id;
  for (const actor of [maker, patron]) Object.assign(actor, { hp: actor.maxHp, locationId: origin.id, techniqueMastery: 100 });
  Object.assign(patron, { artifacts: [], spiritStones: 1000 });
  patron.herbs.earth_root = 20;
  const work = (actor: Cultivator, input: Partial<LLMDecisionPayload>) =>
    resolveWorkshopAction(world, actor, { chosenAction: 'WORKSHOP', innerMonologue: '', ...input }, () => .99);
  expect(work(patron, { workshopMove: 'offer', targetCultivatorId: maker.id,
    workshopTier: '法器', workshopQuantity: 2, workshopQualityFloor: 'standard' })).not.toBeNull();
  const order = world.workshops.orders[0];
  expect(order.institution).toEqual({ sectId: sect.id, establishedTick: 0 });
  if (active) {
    ++world.tick;
    expect(work(maker, { workshopMove: 'accept', targetWorkshopId: order.id })).not.toBeNull();
    ++world.tick;
    expect(work(maker, { workshopMove: 'work', targetWorkshopId: order.id })).not.toBeNull();
    ++world.tick;
    expect(work(maker, { workshopMove: 'work', targetWorkshopId: order.id })).not.toBeNull();
  }
  const path = findMapPath(world, origin, destination);
  expect(path.length).toBeGreaterThan(1);
  const plan = { id: 'internal-actual-arrival', sectId: sect.id, originId: origin.id, destinationId: destination.id,
    path, pathIndex: path.length - 2, openedTick: active ? 21 : 17, deadlineTick: active ? 24 : 21, status: 'in_transit' as const,
    proposerId: maker.id, voterIds: [maker.id], votes: [], garrisonIds: [maker.id],
    stoneCost: 40 + (path.length - 1) * 3, earthCost: 3, custody: { stones: 15, pavilion: [] }, spent: true,
    departedTick: world.tick, lastAdvancedTick: world.tick };
  world.relocations.plans.push(plan);
  const next = () => {
    ++world.tick;
    expect(advanceRelocations(world)).toMatchObject([{ title: '宗门安抵新址' }]);
    expect(advanceWorkshopInstitutionClosures(world)).toHaveLength(2);
    return world.workshopDisbandments.closures[0];
  };
  const personal = (actor = patron) => renderToStaticMarkup(<WorkshopPanel world={world} cultivator={actor} />);
  const sectArchive = (actor = maker) => renderToStaticMarkup(<SectRelocationPanel world={world} cultivator={actor} />);
  return { world, order, maker, patron, outsider, sect, destination, next, personal, sectArchive };
}

describe('workshop institutional closure in existing participant and relocation views', () => {
  it('records one actual unused-custody return only to the payer, retaining the accomplished item and wages', () => {
    const { world, order, patron, maker, outsider, next, personal } = fixture(true);
    const old = structuredClone(world);
    expect(personal()).not.toContain('旧工坊撤并凭据');
    const stonesBefore = patron.spiritStones;
    const rootsBefore = patron.herbs.earth_root;
    const paidMakerBefore = maker.spiritStones;
    expect(patron.artifacts).toHaveLength(1);
    const closure = next();
    const refund = closure.returns[0];
    expect(patron.spiritStones).toBe(stonesBefore + refund.refundedStones);
    expect(patron.herbs.earth_root).toBe(rootsBefore + refund.refundedHerbs);
    expect(maker.spiritStones).toBe(paidMakerBefore);
    expect(patron.artifacts).toHaveLength(1);
    const own = personal();
    expect(own).toContain('原山门工坊章程终止');
    expect(own).toContain(`已实退至本人：${refund.refundedStones} 灵石、玄土根 ${refund.refundedHerbs} 株，仅退未耗余料。`);
    expect(own).toContain('实际工序 2/4 · 已验质 1/2 件 · 实际交割 1 件');
    expect(own).toContain(`实付工费 ${refund.paidWages} 灵石`);
    expect(own).toContain('已验收入库，当前仍持有');
    const makerText = personal(maker);
    expect(makerText).toContain('未耗余料退给原委托方，不归承制人。');
    expect(makerText).not.toMatch(/已实退|已实退至本人|当前仍持有/);
    expect(personal(outsider)).toBe('');
    for (const id of [closure.id, closure.planId, order.id, patron.artifacts[0].id!]) expect(own).not.toContain(id);
    expect(renderToStaticMarkup(<WorkshopPanel world={old} cultivator={patron} />)).not.toContain('旧工坊撤并凭据');
  });

  it('labels the void of a non-funded offer, and only annotates the exact authorized actual arrival', () => {
    const { world, order, patron, outsider, destination, next, personal, sectArchive } = fixture(false);
    const before = patron.spiritStones;
    expect(sectArchive()).not.toContain('旧址工坊章程随迁移终止');
    const closure = next();
    expect(closure.voidedOfferIds).toEqual([order.id]);
    expect(closure.returns).toEqual([]);
    expect(patron.spiritStones).toBe(before);
    expect(personal()).toContain('未付款邀约已作废；没有托管或退款。');
    expect(personal()).not.toMatch(/实际耗用|已实退至本人/);
    const moved = sectArchive();
    expect(moved).toContain(`当前登记山门：${destination.name}`);
    expect(moved).toContain('旧址工坊章程随迁移终止。新址只接续山门，不接续旧委托，也不表示已开设新工坊。');
    expect(moved).not.toMatch(/已实退至本人|未付款邀约|internal-actual-arrival/);
    expect(sectArchive(outsider)).not.toContain('旧址工坊章程随迁移终止');
    closure.abandonedSiteId = 'not-the-proven-closed-site';
    expect(sectArchive()).not.toContain('旧址工坊章程随迁移终止');
    order.disbandmentId = 'not-the-proven-closure';
    expect(personal()).toContain('目前没有可核验的本单撤并款物凭据。');
    expect(personal()).not.toContain('未付款邀约已作废');
    expect(world.workshopDisbandments.closures).toHaveLength(1);
  });
});
