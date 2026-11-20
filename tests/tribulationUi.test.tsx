import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentInspector } from '../src/components/AgentInspector';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { createInitialWorld } from '../src/data/initialWorld';
import type { Cultivator } from '../src/types/world';

const noSelect = () => undefined;

function makeWorld() {
  const world = createInitialWorld();
  const [actor, neighbor, remote] = world.cultivators;
  const [site, otherSite] = world.locations;
  actor.locationId = site.id;
  neighbor.locationId = site.id;
  remote.locationId = otherSite.id;
  const trial = {
    id: 'lightning-trial', targetRealm: '金丹', startedTick: 12, stage: 'lightning',
    nextWave: 2, totalWaves: 3, pressure: 19, interruptions: 2, lastOutcome: '灵诀挡下第一道雷。',
  } satisfies NonNullable<Cultivator['tribulation']>;
  actor.tribulation = trial;
  neighbor.tribulation = { ...trial, id: 'demon-trial', stage: 'heart_demon', targetRealm: '元婴', nextWave: 4, lastOutcome: '前尘幻象涌现。' };
  const inspect = (cultivator: Cultivator) => renderToStaticMarkup(
    <AgentInspector world={world} cultivator={cultivator} onSelectCultivator={noSelect} />
  );
  const map = (id: string | null) => renderToStaticMarkup(
    <WorldMapCanvas world={world} selectedCultivatorId={id} onSelectCultivator={noSelect} />
  );
  return { actor, neighbor, remote, trial, inspect, map };
}

describe('tribulation stage UI', () => {
  it('distinguishes a selected actor’s lightning waves from the heart-demon stage', () => {
    const { actor, neighbor, inspect } = makeWorld();
    const lightning = inspect(actor);
    expect(lightning).toContain('aria-label="天劫与心魔劫"');
    expect(lightning).toContain('冲击金丹');
    expect(lightning).toContain('下一道雷劫：2/3');
    expect(lightning).toContain('当前劫压 19/100');
    expect(lightning).toMatch(/<meter aria-label="劫压"[^>]*min="0" max="100" value="19"/);
    expect(lightning).toContain('受扰 2 次');
    expect(lightning).toContain('始于 Tick #12');
    expect(lightning).toContain('最近结果：灵诀挡下第一道雷。');
    expect(lightning).not.toContain('当前考验：心魔');

    const heartTrial = inspect(neighbor);
    expect(heartTrial).toContain('冲击元婴');
    expect(heartTrial).toContain('当前考验：心魔 · 已历 3 道雷劫');
    expect(heartTrial).not.toContain('4/3');
    expect(heartTrial).not.toContain('下一道雷劫');
    expect(heartTrial).not.toContain('灵诀挡下第一道雷。');
  });

  it('renders terminal outcomes and their tick without prompting for another wave', () => {
    const { actor, remote, trial, inspect } = makeWorld();
    expect(inspect(remote)).toContain('尚无渡劫记录。');
    actor.tribulation = { ...trial, stage: 'passed', resolvedTick: 16, lastOutcome: '金丹既成。' };
    const success = inspect(actor);
    expect(success).toContain('已渡过');
    expect(success).toContain('结于 Tick #16');
    expect(success).toContain('记录劫压 19');
    expect(success).toContain('最近结果：金丹既成。');
    expect(success).not.toContain('下一道雷劫');

    actor.alive = false;
    actor.tribulation = { ...trial, stage: 'failed', resolvedTick: 15 };
    const failure = inspect(actor);
    expect(failure).toContain('渡劫失败');
    expect(failure).toContain('陨落留档');
    expect(failure).not.toContain('当前劫压');
  });

  it('scopes selected trial details and local active counts without relying on canvas pixels', () => {
    const { actor, neighbor, remote, trial, map } = makeWorld();
    const lightning = map(actor.id);
    expect(lightning).toContain('渡劫：金丹 · 雷劫 · 第 2/3 道');
    expect(lightning).toContain('此地渡劫中 2 人');
    expect(lightning).not.toContain('灵诀挡下第一道雷。');
    expect(map(neighbor.id)).toContain('渡劫：元婴 · 心魔劫');
    expect(map(remote.id)).not.toContain('此地渡劫中');
    expect(map(null)).toContain('· 渡劫中 2 人');

    actor.tribulation = { ...trial, stage: 'passed', resolvedTick: 16 };
    expect(map(actor.id)).toContain('渡劫：金丹 · 已渡过');
    expect(map(neighbor.id)).toContain('此地渡劫中 1 人');
  });
});
