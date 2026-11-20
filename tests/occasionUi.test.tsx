import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentInspector } from '../src/components/AgentInspector';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { createInitialWorld } from '../src/data/initialWorld';

const noSelect = () => undefined;

function makeWorld() {
  const world = createInitialWorld();
  const [actor, opponent, other] = world.cultivators;
  const [arena, site] = world.locations;
  const tournament = {
    id: 'fixture-tournament', kind: 'tournament', title: '三峰论剑', locationId: arena.id,
    startedTick: 60, registrationClosesTick: 62, expiresTick: 69, status: 'running',
    participantIds: [actor.id, opponent.id, other.id], remainingIds: [actor.id, other.id],
    bouts: [
      { round: 1, firstId: actor.id, secondId: opponent.id, winnerId: actor.id },
      { round: 1, firstId: other.id, winnerId: other.id },
    ],
    expeditions: [], round: 1,
  } satisfies (typeof world.occasions)[number];
  world.occasions = [tournament, {
    id: 'fixture-expedition', kind: 'expedition', title: '迷雾古墟', locationId: site.id,
    startedTick: 55, registrationClosesTick: 57, expiresTick: 61, status: 'completed',
    participantIds: [actor.id, opponent.id], remainingIds: [], bouts: [],
    expeditions: [
      { cultivatorId: actor.id, tick: 60, outcome: 'loot', description: '从石台上发现旧符。' },
      { cultivatorId: opponent.id, tick: 61, outcome: 'wounded', description: '负伤返回坊市。' },
    ],
    round: 1, lastResolvedTick: 61,
  }];
  const inspect = () => renderToStaticMarkup(
    <AgentInspector world={world} cultivator={actor} onSelectCultivator={noSelect} />
  );
  const map = () => renderToStaticMarkup(
    <WorldMapCanvas world={world} selectedCultivatorId={null} onSelectCultivator={noSelect} />
  );
  return { world, actor, opponent, other, arena, tournament, inspect, map };
}

describe('world occasion UI', () => {
  it('renders active and recent event details with bracket winners, byes, and expedition outcomes', () => {
    const { actor, opponent, other, inspect } = makeWorld();
    const html = inspect();
    expect(html).toContain('查看盛会 · 活跃 1 场 · 近期结案 1 场');
    expect(html).toContain('宗门大比 · 进行中');
    expect(html).toContain('仍在进行 2 人 · 轮次 1');
    expect(html).toContain('选中修士参会');
    expect(html).toContain('aria-label="大比对阵结果"');
    expect(html).toContain(`第 1 轮：${actor.name} 对 ${opponent.name} · 胜者 ${actor.name}`);
    expect(html).toContain(`第 1 轮：${other.name} · 轮空晋级（${other.name}）`);
    expect(html).toContain('秘境远征 · 已结束');
    expect(html).toContain(`${actor.name} · 获得机缘 · Tick #60`);
    expect(html).toContain(`${opponent.name} · 负伤 · Tick #61`);
    expect(html).toContain('从石台上发现旧符。');
  });

  it('shows registration deadlines, then archives championships and omits terminal map badges', () => {
    const { world, actor, tournament, inspect, map } = makeWorld();
    expect(map()).toContain('宗门大比：三峰论剑（进行中）');
    expect(map()).not.toContain('秘境远征：迷雾古墟');
    world.occasions[0] = { ...tournament, status: 'registration', bouts: [] };
    expect(inspect()).toContain('报名截止 Tick #62');
    expect(inspect()).toContain('最晚结束 Tick #69');
    expect(map()).toContain('宗门大比：三峰论剑（报名中）');

    world.occasions[0] = { ...tournament, status: 'completed', championId: actor.id };
    expect(inspect()).toContain(`魁首：${actor.name}`);
    expect(inspect()).toContain('活跃 0 场 · 近期结案 2 场');
    expect(map()).not.toContain('三峰论剑');
  });

  it('provides a readable empty state before the first event', () => {
    const { world, inspect, map } = makeWorld();
    world.occasions = [];
    expect(inspect()).toContain('尚无盛会或远征记录。');
    expect(map()).not.toContain('宗门大比：');
  });
});
