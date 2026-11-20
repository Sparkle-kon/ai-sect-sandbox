import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentInspector } from '../src/components/AgentInspector';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { createInitialWorld } from '../src/data/initialWorld';
import { recordMemory } from '../src/engine/memoryEngine';

const ignoreSelection = () => undefined;

function makeWorld() {
  const world = createInitialWorld();
  const [actor, other] = world.cultivators;
  world.tick = 25;
  actor.memories = [];
  actor.coreMemories = [];
  recordMemory(actor, 25, '师门渡我过劫', 9, 'social', 3);
  actor.reflections = [
    {
      id: 'reflection-open',
      tick: 25,
      kind: 'belief',
      theme: 'community',
      intensity: 6,
      statement: '修行不必独行。',
      sourceMemoryIds: [actor.memories[0].id, 'removed-memory'],
      source: 'utility',
    },
    {
      id: 'reflection-memory',
      tick: 13,
      kind: 'obsession',
      theme: 'cultivation',
      intensity: 4,
      statement: '不亲见剑诀终卷绝不罢休。',
      sourceMemoryIds: [],
      source: 'utility',
    },
    {
      id: 'reflection-fear',
      tick: 25,
      kind: 'heart_demon',
      theme: 'conflict',
      intensity: 9,
      statement: '闻铃便疑敌至。',
      sourceMemoryIds: [actor.memories[0].id],
      source: 'llm',
    },
  ];
  return { world, actor, other };
}

describe('cultivator reflection UI', () => {
  it('groups active entries by kind and explains surviving or missing memory sources', () => {
    const { world, actor } = makeWorld();
    const html = renderToStaticMarkup(
      <AgentInspector world={world} cultivator={actor} onSelectCultivator={ignoreSelection} />
    );
    expect(html).toContain('aria-label="道心反思"');
    for (const [kind, statement] of [
      ['信念', '修行不必独行。'],
      ['执念', '不亲见剑诀终卷绝不罢休。'],
      ['心魔', '闻铃便疑敌至。'],
    ]) {
      const group = html.split(`aria-label="${kind}"`)[1]?.split('</section>')[0];
      expect(group).toContain(statement);
    }
    expect(html).toContain('宗门与人情 · 强度 6/10 · Tick #25 · 离线推演');
    expect(html).toContain('争斗 · 强度 9/10 · Tick #25 · 模型反思');
    expect(html).toContain('记忆依据 · 2 条');
    expect(html).toContain('>师门渡我过劫</li>');
    expect(html).toContain('1 条来源记忆已不在当前记忆中。');
    expect(html).not.toContain('removed-memory');
  });

  it('shows an empty state for an unreflected cultivator and distinguishes a retained record', () => {
    const { world, actor, other } = makeWorld();
    other.reflections = [];
    const empty = renderToStaticMarkup(
      <AgentInspector world={world} cultivator={other} onSelectCultivator={ignoreSelection} />
    );
    expect(empty).toContain('尚无道心反思。');
    expect(empty).not.toContain('aria-label="心魔"');

    actor.alive = false;
    const archived = renderToStaticMarkup(
      <AgentInspector world={world} cultivator={actor} onSelectCultivator={ignoreSelection} />
    );
    expect(archived).toContain('此处保留修士陨落时的道心记录。');
    expect(archived).toContain('闻铃便疑敌至。');
  });

  it('refreshes the selected map summary without leaking another cultivator’s statements', () => {
    const { world, actor, other } = makeWorld();
    other.reflections = [];
    const render = (id: string | null) => renderToStaticMarkup(
      <WorldMapCanvas world={world} selectedCultivatorId={id} onSelectCultivator={ignoreSelection} />
    );
    expect(render(actor.id)).toContain('道心：信念 1 · 执念 1 · 心魔 1');
    expect(render(actor.id)).not.toContain('闻铃便疑敌至。');
    expect(render(other.id)).toContain('道心：信念 0 · 执念 0 · 心魔 0');
    expect(render(null)).not.toContain('道心：信念');
    actor.alive = false;
    expect(render(actor.id)).toContain('道心留影：信念 1 · 执念 1 · 心魔 1');
  });
});
