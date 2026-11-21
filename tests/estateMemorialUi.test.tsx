import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EstateMemorialPanel } from '../src/components/EstateMemorialPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import type { Cultivator, WorldState } from '../src/types/world';

type Estate = WorldState['estates']['entries'][number];
const herbs = { jade_leaf: 0, earth_root: 0, star_bloom: 0, shadow_moss: 0 };
const pills = { foundation: 0, golden: 0, barrier: 0, heart_poison: 0 };
const blank = () => ({ stones: 0, herbs: { ...herbs }, pills: { ...pills } });

function fixture() {
  const world = createInitialWorld();
  world.tick = 8;
  const [viewer, deceased, nominee, challenger, remoteDeceased, remoteObserver] = world.cultivators;
  const local = world.locations.find(({ id }) => id === viewer.locationId)!;
  const remote = world.locations.find(({ id }) => id !== local.id)!;
  deceased.name = '本地归葬之人';
  deceased.alive = false;
  deceased.hp = 0;
  deceased.locationId = local.id;
  deceased.spiritStones = 0;
  deceased.herbs = { ...herbs };
  deceased.pills = { ...pills };
  deceased.artifacts = [];
  remoteDeceased.name = '异地不可见的归葬';
  remoteDeceased.alive = false;
  remoteDeceased.hp = 0;
  remoteDeceased.locationId = remote.id;
  remoteObserver.locationId = remote.id;
  nominee.name = '遗嘱所指修士';
  challenger.name = '持有交情凭证的修士';
  local.name = '公开祭礼地点';
  remote.name = '不可见的异地道场';
  const eligible = [
    { actorId: nominee.id, basis: 'nomination' as const, strength: 100 },
    { actorId: challenger.id, basis: 'bond' as const, strength: 73 },
  ];
  const estate: Estate = {
    id: 'estate-local', deceasedId: deceased.id, locationId: local.id, openedTick: 5, closesTick: 9,
    namedHeirId: nominee.id, sponsorSectId: viewer.sectId, status: 'open', eligibleHeirs: eligible,
    holdings: { stones: 7, herbs: { ...herbs, jade_leaf: 2 }, pills: { ...pills, foundation: 1 },
      artifacts: [{ id: 'artifact-remnant', name: '剩余玉器', spiritRoot: '土' }] },
    distributed: { ...blank(), artifactIds: [] }, claims: eligible.map((entry) => ({ ...entry, tick: 6 })),
  };
  world.estates.entries.push(estate, {
    ...estate, id: 'estate-remote', deceasedId: remoteDeceased.id, locationId: remote.id,
    holdings: { ...blank(), stones: 321, artifacts: [] },
  });
  const markup = (actor: Cultivator | undefined = viewer) => renderToStaticMarkup(<EstateMemorialPanel world={world} cultivator={actor} />);
  return { world, viewer, deceased, remoteObserver, nominee, challenger, estate, markup };
}

describe('estate and memorial presentation', () => {
  it('shows actual post-loot holdings and competing claims without promising the nominated heir the estate', () => {
    const { markup } = fixture();
    const html = markup();
    expect(html).toContain('遗产待裁定');
    expect(html).toContain('遗产与祭礼登记地：公开祭礼地点');
    expect(html).toMatch(/遗身当前库存.*无登记资产/);
    expect(html).toContain('7 灵石 · 翡翠灵叶 2 株 · 筑基丹 1 枚 · 器物 剩余玉器');
    expect(html).toMatch(/已分配（历史交割）.*无登记资产/);
    expect(html).toContain('生前指定：遗嘱所指修士');
    expect(html).toContain('存在竞争申领 · 2 项');
    expect(html).toContain('持有交情凭证的修士 · 依据：生前交情 · 登记强度 73');
    expect(html).not.toContain('实际承领：');
    expect(html).not.toContain('<button');
  });

  it('keeps completed distributions distinct from held assets and shows actual memorial impacts', () => {
    const { world, estate, nominee, challenger, markup } = fixture();
    world.tick = 10;
    estate.status = 'settled';
    estate.settledTick = 9;
    estate.beneficiaryId = nominee.id;
    estate.distributed = { ...blank(), stones: 7, artifactIds: ['artifact-remnant'] };
    estate.holdings = { ...blank(), artifacts: [] };
    estate.memorial = { tick: 10, organizerId: nominee.id, attendeeIds: [nominee.id, challenger.id], relationshipImpacts: 2 };
    const html = markup();
    expect(html).toContain('已裁定');
    expect(html).toMatch(/遗产托管余额.*无登记资产/);
    expect(html).toMatch(/已分配（历史交割）.*7 灵石 · 器物 1 件/);
    expect(html).toContain('实际承领：遗嘱所指修士');
    expect(html).toContain('主祭：遗嘱所指修士 · 到场 2 人');
    expect(html).toContain('实际更新 2 项关系');
    expect(html).not.toContain('artifact-remnant');
    estate.status = 'unclaimed';
    delete estate.beneficiaryId;
    expect(markup()).toContain('无人承领');
  });

  it('scopes local ledgers to their viewers and deceased views to the actor’s own archive', () => {
    const { markup, world, viewer, deceased, remoteObserver } = fixture();
    expect(markup()).not.toContain('异地不可见的归葬');
    expect(markup()).not.toContain('321 灵石');
    expect(markup(remoteObserver)).not.toContain('本地归葬之人');
    expect(markup(deceased)).toContain('陨落修士仅显示本人归葬档案');
    expect(markup(deceased)).toContain('本地归葬之人');
    expect(markup(deceased)).toContain('此处未核对遗身库存');
    expect(markup(deceased)).not.toContain('异地不可见的归葬');
    const empty = renderToStaticMarkup(<EstateMemorialPanel world={world} cultivator={undefined} />);
    expect(empty).toContain('不展示全局案卷');
    expect(empty).not.toContain('本地归葬之人');
    viewer.alive = false;
    expect(markup()).not.toContain('本地归葬之人');
  });
});
