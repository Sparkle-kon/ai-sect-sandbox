import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AgentInspector } from '../src/components/AgentInspector';
import { ArtifactPanel, ArtifactSalvageReview, artifactSalvageStampMatches } from '../src/components/ArtifactPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { wearArtifact } from '../src/engine/artifactEngine';
import { resolveArtifactSalvageAction } from '../src/engine/artifactSalvageEngine';
import { consumeAvatarOrder, possessAvatar, queueAvatarSalvage } from '../src/engine/avatarEngine';
import { resolveWorkshopAction } from '../src/engine/workshopEngine';
import type { Cultivator, LLMDecisionPayload } from '../src/types/world';

const noop = () => undefined;

function fixture() {
  const world = createInitialWorld(341);
  world.tick = 23;
  const site = world.locations.find(({ id }) => id === 'loc-market')!;
  const [maker, patron, outsider] = [...world.cultivators.slice(0, 3)].sort((a, b) => a.id < b.id ? -1 : 1);
  world.cultivators.forEach((actor) => { actor.locationId = world.locations[0].id; });
  for (const actor of [maker, patron, outsider]) {
    Object.assign(actor, { locationId: site.id, alive: true, hp: actor.maxHp, artifacts: [], spiritStones: 400, techniqueMastery: 70,
      tribulation: undefined });
    actor.herbs.earth_root = 10;
  }
  site.furnaceGrade = 1;
  maker.spiritRoot = site.spiritRoot;
  const craft = (actor: Cultivator, fields: Partial<LLMDecisionPayload>) =>
    resolveWorkshopAction(world, actor, { chosenAction: 'WORKSHOP', innerMonologue: '', ...fields }, () => .99);
  expect(craft(patron, { workshopMove: 'offer', targetCultivatorId: maker.id, workshopTier: '法器', workshopQuantity: 1,
    workshopQualityFloor: 'standard' })).not.toBeNull();
  const order = world.workshops.orders[0];
  expect(craft(maker, { workshopMove: 'accept', targetWorkshopId: order.id })).not.toBeNull();
  for (let work = 0; work < 2; work++) {
    ++world.tick;
    expect(craft(maker, { workshopMove: 'work', targetWorkshopId: order.id })).not.toBeNull();
  }
  ++world.tick;
  const item = patron.artifacts[0];
  item.name = '长名裂纹青剑';
  while (item.durability! > item.maxDurability! * .3) wearArtifact(patron, false);
  patron.artifacts.push({ id: 'fake-same-name', name: item.name, tier: '法器', spiritRoot: item.spiritRoot,
    durability: 0, maxDurability: item.maxDurability });
  const onConfirm = vi.fn(() => true);
  const html = (actor = patron, readOnly = false, busy = false) => renderToStaticMarkup(<ArtifactPanel
    cultivator={actor} cultivators={world.cultivators} world={world} salvage={{ scopeKey: 'live', onConfirm, busy, readOnly }} />);
  return { world, item, site, patron, outsider, onConfirm, html };
}

describe('exact worn item review and genuine owner receipts', () => {
  it('adds one existing card control only for the real eligible artifact and exact possessed live owner', () => {
    const { world, patron, outsider, html, item, onConfirm } = fixture();
    expect(html()).not.toContain('核对拆解');
    expect(possessAvatar(world, patron.id)).toBe(true);
    const has = html();
    expect(has.match(/>核对拆解<\/button>/g)).toHaveLength(1);
    expect(has).toContain(`核对拆解：${item.name}，法器，耐久 ${item.durability}/${item.maxDurability}`);
    expect(has).toMatch(/min-h-11[^>]*aria-label="核对拆解/);
    expect(has).not.toMatch(/本人拆解凭据|确认登记拆解|fake-same-name|workshop-artifact-/);
    expect(html(outsider)).not.toContain('核对拆解');
    expect(html(patron, true)).not.toContain('核对拆解');
    expect(html(patron, false, true)).not.toContain('核对拆解');
    const view = renderToStaticMarkup(<AgentInspector world={world} cultivator={patron} onSelectCultivator={noop}
      workspaceSection="cultivation" artifactSalvage={{ scopeKey: 'live', onConfirm }} />);
    expect(view).toContain('核对拆解');
    expect(onConfirm).not.toHaveBeenCalled();
    item.boundTo = patron.id;
    expect(html()).not.toContain('核对拆解');
  });

  it('describes exact item and furnace next-turn condition, not pre-issued material or an auto turn', () => {
    const confirm = vi.fn();
    const html = renderToStaticMarkup(<ArtifactSalvageReview name="断锋长剑" tier="法器" durability={6} maximum={72}
      site="公开工坊" onConfirm={confirm} onCancel={noop} />);
    expect(html).toContain('拆解：断锋长剑 · 法器 · 耐久 6/72');
    expect(html).toContain('下一轮复核炉点：公开工坊。提交此指令立即耗费 5 神识，但不推进时间。');
    expect(html).toContain('只有下一轮实际用炉并拆解成功，才永久移除这件器物，并回收玄土根 1 株。');
    expect(html).toContain('若条件变化，可能执行不了，不会发放材料。');
    expect(html).toContain('确认登记拆解');
    expect(html).toContain('取消核对');
    expect(html).not.toContain('已登记');
    expect(confirm).not.toHaveBeenCalled();
    const world = createInitialWorld(83);
    const stamp = { world, actorId: world.cultivators[0].id, scopeKey: 'origin-live' };
    expect(artifactSalvageStampMatches(stamp, { ...stamp })).toBe(true);
    expect(artifactSalvageStampMatches(stamp, { ...stamp, world: structuredClone(world) })).toBe(false);
    expect(artifactSalvageStampMatches(stamp, { ...stamp, actorId: world.cultivators[1].id })).toBe(false);
    expect(artifactSalvageStampMatches(stamp, { ...stamp, scopeKey: 'other-live' })).toBe(false);
  });

  it('keeps real queue, executed receipt and material inventory separate, never exposing someone else or the future', () => {
    const { world, patron, outsider, site, item, html } = fixture();
    expect(possessAvatar(world, patron.id)).toBe(true);
    const essence = world.playerAvatar.essence, roots = patron.herbs.earth_root, tick = world.tick;
    expect(queueAvatarSalvage(world, patron.id, item.id!, site.id)).toBe(true);
    expect(world.playerAvatar.essence).toBe(essence - 5);
    expect(world.tick).toBe(tick);
    expect(patron.herbs.earth_root).toBe(roots);
    expect(html()).toContain(`已登记拆解指令 · 第 ${tick + 1} 轮复核。此处未拆解器物，也未发放材料。`);
    expect(html()).not.toMatch(/本人拆解凭据|核对拆解/);
    expect(html(outsider)).not.toMatch(/拆解指令|拆解凭据/);
    const historical = structuredClone(world);
    ++world.tick;
    const command = consumeAvatarOrder(world)?.decision;
    expect(command?.chosenAction).toBe('SALVAGE_ARTIFACT');
    expect(resolveArtifactSalvageAction(patron, world, command!)).not.toBeNull();
    expect(patron.herbs.earth_root).toBe(roots + 1);
    expect(patron.artifacts.some(({ id }) => id === item.id)).toBe(false);
    patron.herbs.earth_root = 0;
    const result = html();
    expect(result).toContain('本人拆解凭据');
    expect(result).toContain(`第 ${tick + 1} 轮实际拆解`);
    expect(result).toContain('原器已永久移除；当时实收玄土根 1 株。');
    expect(result).toContain('记录当时回收，不证明材料至今仍在库存。');
    expect(result).not.toMatch(/workshop-artifact-|commission-|已登记拆解指令/);
    expect(html(outsider)).not.toContain('本人拆解凭据');
    expect(renderToStaticMarkup(<ArtifactPanel world={historical} cultivators={historical.cultivators}
      cultivator={historical.cultivators.find(({ id }) => id === patron.id)!} />)).not.toContain('本人拆解凭据');
  });
});
