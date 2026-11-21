import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { AgentInspector } from '../src/components/AgentInspector';
import { createInitialWorld } from '../src/data/initialWorld';
import type { BeastRelease, HabitatStewardship, SpiritBeast } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.tick = 12;
  const [owner, observer, outsider] = world.cultivators;
  owner.name = '当事放归者';
  observer.name = '实录复查人';
  const habitat = world.locations.find(({ id }) => id === 'loc-vein-north')!;
  const other = world.locations.find(({ id }) => id === 'loc-market-east')!;
  habitat.name = '旧地再栖灵脉';
  other.name = '不泄露当前位置的外坊';
  owner.locationId = observer.locationId = outsider.locationId = habitat.id;
  const animal: SpiritBeast = {
    id: 'one-animal', name: '一只归野瑞鹿', kind: '瑞兽', locationId: habitat.id, homeLocationId: habitat.id,
    hp: 45, maxHp: 80, power: 95, cultivation: 14, alive: true, nextActionTick: 16,
  };
  world.spiritBeasts = [animal];
  const restoration: HabitatStewardship = {
    id: 'repair', siteId: habitat.id, sponsorSectId: owner.sectId, stewardId: owner.id, restoredTick: 10, expiresTick: 34,
  };
  const receipt: BeastRelease = {
    id: 'one-receipt', beastId: animal.id, formerOwnerId: owner.id, siteId: habitat.id,
    releasedTick: 11, earliestSurveyTick: 14, deadlineTick: 23, status: 'monitoring',
  };
  world.habitats.stewardships = [restoration];
  world.habitats.releases = [receipt];
  const panel = (actor = owner) => renderToStaticMarkup(<AgentInspector
    world={world} cultivator={actor} workspaceSection="profile" onSelectCultivator={() => {}} />);
  const details = (actor = owner) => panel(actor).split('灵兽栖息地与放归</summary>')[1] ?? '';
  return { world, owner, observer, outsider, animal, habitat, other, restoration, receipt, panel, details };
}

describe('habitat stewardship and uniquely observed rewilding', () => {
  it('has one closed nested disclosure; actual current occupancy is distinct from a release receipt', () => {
    const { panel, details } = fixture();
    const html = panel();
    expect(html).toContain('灵宠与野兽');
    expect(html).toMatch(/<details class="[^"]+"><summary class="[^"]+">灵兽栖息地与放归/);
    const content = details();
    expect(content).toMatch(/本地现有野生灵兽：1 只 · 当前承载上限：\d+ 只/);
    expect(content).toContain('当事放归者修复 · Tick #10');
    expect(content).toContain('实付 24 灵石，护养者实付玄土根 2 株');
    expect(content).toContain('修复有效 · 到期 Tick #34');
    expect(content).toContain('一只归野瑞鹿 · 放归 Tick #11');
    expect(content).toContain('等待到场复查 · Tick #14 起，Tick #23 前 · 尚无复见');
    expect(content).not.toMatch(/目击时气血|新增 1 只/);
    expect(renderToStaticMarkup(<App />)).not.toContain('灵兽栖息地与放归');
  });

  it('shows historical real sightings, never remote current occupancy/position or current animal health', () => {
    const { world, owner, observer, outsider, animal, other, receipt, panel, details } = fixture();
    const past = structuredClone(world);
    world.tick = 18;
    receipt.status = 'sighted';
    receipt.settledTick = 14;
    receipt.observation = { observerId: observer.id, tick: 14, hp: 49 };
    animal.locationId = other.id;
    animal.hp = 64;
    outsider.locationId = other.id;
    expect(details()).toContain('实录复查人复见 · Tick #14 · 目击时气血 49 点');
    expect(details()).toContain('本地现有野生灵兽：0 只');
    expect(details()).not.toContain('目击时气血 64 点');
    expect(panel(outsider)).not.toContain('灵兽栖息地与放归');
    owner.locationId = other.id;
    expect(details()).toContain('仅本人旧放归记录；此时点无当地数量或承载观测');
    expect(details()).not.toContain('当前承载上限：');
    expect(details()).not.toContain('不泄露当前位置的外坊');
    const historical = renderToStaticMarkup(<AgentInspector world={past} cultivator={past.cultivators[0]} onSelectCultivator={() => {}} workspaceSection="profile" />);
    expect(historical).not.toContain('目击时气血 49 点');
  });

  it('leaves an expired or unresolved observation explicitly unconfirmed and never claims death', () => {
    const { world, receipt, details } = fixture();
    world.tick = receipt.deadlineTick;
    receipt.status = 'unconfirmed';
    receipt.settledTick = world.tick;
    const content = details();
    expect(content).toContain('未获复见，不等于死亡或仍在此地 · 记录结束 Tick #23');
    expect(content).not.toContain('复见 · Tick');
  });
});
