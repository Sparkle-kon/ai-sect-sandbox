import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentInspector } from '../src/components/AgentInspector';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { createInitialWorld } from '../src/data/initialWorld';
import { maintainMemories, recordMemory } from '../src/engine/memoryEngine';

const ignoreSelection = () => undefined;

function makeWorld() {
  const world = createInitialWorld();
  const [actor, other] = world.cultivators;
  actor.memories = [];
  actor.coreMemories = [];
  other.memories = [];
  other.coreMemories = [];
  recordMemory(actor, 1, '入门旧事', 9, 'cultivation', 4);
  maintainMemories(actor, 13, true);
  recordMemory(actor, 13, '山门败阵', 6, 'combat', -3);
  world.tick = 13;
  return { world, actor, other };
}

describe('memory inspector and map summary', () => {
  it('separates core and episodic memories with emotion, age, and a current strength meter', () => {
    const { world, actor } = makeWorld();
    const render = () => renderToStaticMarkup(
      <AgentInspector world={world} cultivator={actor} onSelectCultivator={ignoreSelection} />
    );
    const atConsolidation = render();
    const corePanel = atConsolidation.match(/aria-label="核心记忆"[\s\S]*?<\/section>/)?.[0];
    const episodicPanel = atConsolidation.match(/aria-label="情景记忆"[\s\S]*?<\/section>/)?.[0];
    expect(corePanel).toContain('入门旧事');
    expect(corePanel).not.toContain('山门败阵');
    expect(episodicPanel).toContain('山门败阵');
    expect(episodicPanel).not.toContain('入门旧事');
    expect(atConsolidation).toContain('情绪 +4（正向）');
    expect(atConsolidation).toContain('情绪 -3（负向）');
    expect(atConsolidation).toContain('凝练于 Tick #13');
    expect(atConsolidation).toContain('Tick #1 · 12 月前');
    expect(atConsolidation).toContain('role="meter" aria-label="当前记忆强度" aria-valuemin="0" aria-valuemax="10" aria-valuenow="9"');
    expect(atConsolidation).toContain('aria-valuenow="6"');

    // No memory maintenance between renders: displayed strength still follows the world clock.
    world.tick = 17;
    const later = render();
    expect(later).toContain('Tick #1 · 16 月前');
    expect(later).toContain('Tick #13 · 4 月前');
    expect(later).toContain('强度 8.9/10');
    expect(later).toContain('强度 4.4/10');
  });

  it('shows explicit empty states for both memory banks', () => {
    const { world, other } = makeWorld();
    const html = renderToStaticMarkup(
      <AgentInspector world={world} cultivator={other} onSelectCultivator={ignoreSelection} />
    );
    expect(html).toContain('尚无凝练的核心记忆');
    expect(html).toContain('暂无情景记忆');
    expect(html).not.toContain('role="meter"');
  });

  it('derives the map summary from selection and the tick, including an archived cultivator', () => {
    const { world, actor, other } = makeWorld();
    const render = (id: string | null) => renderToStaticMarkup(
      <WorldMapCanvas world={world} selectedCultivatorId={id} onSelectCultivator={ignoreSelection} />
    );
    const initial = render(actor.id);
    expect(initial).toContain('aria-label="选中修士记忆摘要"');
    expect(initial).toContain(`>${actor.name}</span>`);
    expect(initial).toContain('情景记忆 1 条');
    expect(initial).toContain('核心记忆 1 条');
    expect(initial).toContain('最强记忆 9.0/10');

    const switched = render(other.id);
    expect(switched).toContain(`>${other.name}</span>`);
    expect(switched).not.toContain(`>${actor.name}</span>`);
    expect(switched).toContain('情景记忆 0 条');
    expect(switched).toContain('核心记忆 0 条');
    expect(switched).toContain('最强记忆 0.0/10');
    expect(render(null)).toContain('选择一位修士查看其当前记忆状态。');

    world.tick = 17;
    actor.alive = false;
    const archived = render(actor.id);
    expect(archived).toContain(`${actor.name}（已陨落，不在地图上显示）`);
    expect(archived).toContain('最强记忆 8.9/10');
  });
});
