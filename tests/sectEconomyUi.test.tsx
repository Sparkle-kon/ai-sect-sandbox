import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentInspector } from '../src/components/AgentInspector';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { createInitialWorld } from '../src/data/initialWorld';
import type { Cultivator } from '../src/types/world';

const noSelect = () => undefined;
const noBuildings = () => ({ qi_array: 0, alchemy_hall: 0, scripture_pavilion: 0, defense_array: 0, spirit_mine: 0 });

function makeWorld() {
  const world = createInitialWorld();
  const [actor, other] = world.cultivators;
  const [sect, rival] = world.sects;
  const site = world.locations.find(({ type }) => type === 'spirit_vein')!;
  const far = world.locations.find(({ id }) => id === rival.headquartersId)!;
  world.tick = 7;
  actor.sectId = sect.id;
  if (sect.leaderId === actor.id) sect.leaderId = undefined;
  actor.locationId = site.id;
  site.ownerSectId = sect.id;
  actor.guardAssignment = { locationId: site.id, assignedTick: 5, expiresTick: 8 };
  sect.facilities = { ...noBuildings(), qi_array: 1, spirit_mine: 2, defense_array: 3 };
  sect.spiritStones = 406;
  sect.arrayHp = 431;
  sect.arrayMaxHp = 600;
  sect.monthlyEconomy = { tick: 7, taxes: 35, mining: 66, upkeep: 12, net: 80 };
  other.sectId = rival.id;
  other.locationId = far.id;
  rival.facilities = noBuildings();
  rival.arrayHp = rival.arrayMaxHp = 0;
  rival.monthlyEconomy = undefined;
  const inspect = (cultivator: Cultivator) => renderToStaticMarkup(
    <AgentInspector world={world} cultivator={cultivator} onSelectCultivator={noSelect} />
  );
  const map = (id: string | null) => renderToStaticMarkup(
    <WorldMapCanvas world={world} selectedCultivatorId={id} onSelectCultivator={noSelect} />
  );
  return { world, actor, other, site, far, sect, inspect, map };
}

describe('sect economy and guard UI', () => {
  it('shows actual building costs, a sect treasury snapshot with capped net, and array health', () => {
    const { actor, other, inspect } = makeWorld();
    const html = inspect(actor);
    expect(html).toContain('aria-label="宗门建筑与收支"');
    expect(html).toContain('406 灵石');
    expect(html).toContain('431/600');
    expect(html).toMatch(/<meter aria-label="护山阵耐久"[^>]*min="0" max="600" value="431"/);
    expect(html).toContain('聚灵阵：');
    expect(html).toContain('升至 2 阶需 560 灵石');
    expect(html).toContain('升至 3 阶需 900 灵石');
    expect(html).not.toContain('升至 4 阶');
    expect(html).toContain('最近月结 · Tick #7');
    expect(html).toContain('税收</dt><dd class="text-emerald-300">+35');
    expect(html).toContain('矿产</dt><dd class="text-emerald-300">+66');
    expect(html).toContain('维护</dt><dd class="text-rose-300">-12');
    expect(html).toContain('库容溢出</dt><dd class="text-rose-300">-9');
    expect(html).toContain('净收支</dt><dd class="text-slate-200">+80');
    expect(inspect(other)).toContain('尚无月结记录。');
    expect(inspect(other)).not.toContain('406 灵石');
  });

  it('derives duty and map coverage from the actual assigned location and expiry', () => {
    const { world, actor, other, site, far, inspect, map } = makeWorld();
    expect(inspect(actor)).toContain(`驻守：${site.name} · 在岗 · 派驻 Tick #5 · 至 Tick #8`);
    expect(map(actor.id)).toContain('此地驻守 1 人');
    expect(map(actor.id)).toContain('本宗护山阵 431/600');
    expect(map(other.id)).not.toContain('此地驻守');
    expect(map(null)).toContain('· 驻守 1 人');
    expect(map(null)).toContain('· 护山阵 431/600');

    actor.locationId = far.id;
    expect(inspect(actor)).toContain(`驻守：${site.name} · 尚未到岗`);
    expect(map(null)).not.toContain('· 驻守 1 人');

    actor.locationId = site.id;
    world.tick = 8;
    expect(inspect(actor)).toContain(`驻守：${site.name} · 已到期`);
    expect(map(actor.id)).not.toContain('此地驻守');
  });

  it('handles outsider and departed states without disclosing another sect’s ledger', () => {
    const { actor, other, inspect, map } = makeWorld();
    other.sectId = 'none';
    expect(inspect(other)).toContain('散修，无所属宗门的账本。');
    expect(inspect(other)).toContain('无驻守任务。');
    expect(inspect(other)).not.toContain('建筑与月度账本');

    actor.alive = false;
    expect(inspect(actor)).toContain('陨落留档');
    expect(map(actor.id)).not.toContain('此地驻守');
  });
});
