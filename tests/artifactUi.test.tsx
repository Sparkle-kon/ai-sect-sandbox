import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentInspector } from '../src/components/AgentInspector';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { createInitialWorld } from '../src/data/initialWorld';
import type { Cultivator } from '../src/types/world';

const noSelect = () => undefined;

function makeWorld() {
  const world = createInitialWorld();
  const [actor, other] = world.cultivators;
  actor.artifacts = [
    {
      id: 'ember-sword',
      name: '照骨剑',
      spiritRoot: '火',
      tier: '通天灵宝',
      durability: 67,
      maxDurability: 140,
      boundTo: actor.id,
      soul: { name: '炉影', experience: 18 },
      resonance: 12,
    },
    { name: '青铜牌', spiritRoot: '土' },
  ];
  other.artifacts = [{ name: '寒井钵', spiritRoot: '水', durability: 0, boundTo: 'missing-owner' }];
  const inspect = (cultivator: Cultivator) => renderToStaticMarkup(
    <AgentInspector world={world} cultivator={cultivator} onSelectCultivator={noSelect} />
  );
  const map = (id: string | null) => renderToStaticMarkup(
    <WorldMapCanvas world={world} selectedCultivatorId={id} onSelectCultivator={noSelect} />
  );
  return { actor, other, inspect, map };
}

describe('artifact equipment UI', () => {
  it('shows quality, affinity, binding, durability and soul alongside legacy defaults', () => {
    const { actor, inspect } = makeWorld();
    const html = inspect(actor);
    const artifacts = html.split('aria-label="法宝装备与器灵"')[1]?.split('</section>')[0];
    expect(artifacts).toMatch(/照骨剑<span[^>]*>火<\/span><span[^>]*>通天灵宝<\/span><span[^>]*>已装备/);
    expect(artifacts).toContain('耐久 67/140');
    expect(artifacts).toContain(`认主：${actor.name}`);
    expect(artifacts).toContain('器灵：炉影 · 经验 18');
    expect(artifacts).toContain('共鸣 12');
    expect(artifacts).toMatch(/青铜牌<span[^>]*>土<\/span><span[^>]*>法器<\/span><span[^>]*>未装备/);
    expect(artifacts).toContain('耐久 60/60');
    expect(artifacts).toContain('未认主');
    expect(artifacts).not.toContain('寒井钵');
  });

  it('does not show a broken or foreign-bound item as equipped', () => {
    const { actor, other, inspect } = makeWorld();
    let html = inspect(other);
    expect(html).toContain('耐久 0/60 · 已损坏');
    expect(html).toContain('认主：姓名未详');
    expect(html).not.toContain('已装备');

    actor.artifacts[0].boundTo = other.id;
    html = inspect(actor);
    expect(html).toContain(`认主：${other.name}`);
    expect(html).toMatch(/照骨剑<span[^>]*>火<\/span><span[^>]*>通天灵宝<\/span><span[^>]*>未装备/);
    expect(html).toMatch(/青铜牌<span[^>]*>土<\/span><span[^>]*>法器<\/span><span[^>]*>已装备/);
  });

  it('summarizes only the selected living actor’s equipped item and current condition', () => {
    const { actor, other, map } = makeWorld();
    expect(map(actor.id)).toContain('装备法宝：照骨剑 · 耐久 67/140');
    expect(map(actor.id)).not.toContain('青铜牌');
    expect(map(actor.id)).not.toContain('炉影');
    expect(map(other.id)).toContain('未装备法宝');
    expect(map(other.id)).not.toContain('照骨剑');
    expect(map(null)).not.toContain('装备法宝');
    actor.alive = false;
    expect(map(actor.id)).not.toContain('装备法宝：');
  });
});
