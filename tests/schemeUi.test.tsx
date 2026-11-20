import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentInspector } from '../src/components/AgentInspector';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { createInitialWorld } from '../src/data/initialWorld';
import type { Cultivator } from '../src/types/world';

const ignoreSelection = () => undefined;
const secretTitle = '打探血月宗虚实';

function makeWorld() {
  const world = createInitialWorld();
  const [actor, target, observer] = world.cultivators;
  const place = world.locations[0];
  const scheme = {
    id: 'scheme-fixture',
    kind: 'infiltration',
    title: secretTitle,
    status: 'active',
    startedTick: 3,
    stepIndex: 1,
    targetCultivatorId: target.id,
    targetLocationId: place.id,
    steps: [
      { label: '打探入宗门径', completedTick: 4 },
      { label: '抵达山门' },
      { label: '结识接引人' },
    ],
  } satisfies NonNullable<Cultivator['activeScheme']>;
  actor.activeScheme = scheme;
  world.tick = 8;
  const inspect = (cultivator: Cultivator) => renderToStaticMarkup(
    <AgentInspector world={world} cultivator={cultivator} onSelectCultivator={ignoreSelection} />
  );
  const map = (id: string | null) => renderToStaticMarkup(
    <WorldMapCanvas world={world} selectedCultivatorId={id} onSelectCultivator={ignoreSelection} />
  );
  return { actor, target, observer, place, scheme, inspect, map };
}

describe('cultivator scheme UI', () => {
  it('shows the selected plan’s stated conditions, elapsed steps, and accessible current step', () => {
    const { actor, target, place, inspect } = makeWorld();
    const html = inspect(actor);
    const plan = html.split('aria-label="长线计划"')[1]?.split('</section>')[0];
    expect(plan).toContain(secretTitle);
    expect(plan).toContain('潜入宗门 · 始于 Tick #3 · 完成 1/3 步');
    expect(plan).toContain(`目标修士：${target.name}`);
    expect(plan).toContain(`目标地点：${place.name}`);
    expect(plan).toContain('完成于 Tick #4');
    expect(plan).toMatch(/<li aria-current="step"[^>]*><span>抵达山门<\/span>/);
    expect(plan).toContain('当前步骤');
    expect(plan).toContain('待推进');
  });

  it('retains completion history for failed and completed plans without an active step', () => {
    const { actor, scheme, inspect, map } = makeWorld();
    actor.activeScheme = { ...scheme, status: 'failed' };
    let html = inspect(actor);
    expect(html).toContain('已失败');
    expect(html).toContain('完成于 Tick #4');
    expect(html).toContain('未完成');
    expect(html).not.toContain('aria-current="step"');
    expect(map(actor.id)).toContain('长线计划：已失败 · 1/3 步');

    actor.activeScheme = {
      ...scheme,
      status: 'completed',
      stepIndex: scheme.steps.length,
      steps: scheme.steps.map((step, index) => ({ ...step, completedTick: 4 + index })),
    };
    html = inspect(actor);
    expect(html).toContain('已完成');
    expect(html).toContain('完成 3/3 步');
    expect(html).toContain('完成于 Tick #6');
    expect(html).not.toContain('aria-current="step"');
    expect(map(actor.id)).toContain('长线计划：已完成 · 3/3 步');
  });

  it('keeps a plan visible only to the chosen inspector and limits the matching map summary to progress', () => {
    const { actor, observer, inspect, map } = makeWorld();
    const selected = map(actor.id);
    expect(selected).toContain('长线计划：进行中 · 1/3 步');
    expect(selected).not.toContain(secretTitle);
    expect(selected).not.toContain('抵达山门');
    expect(map(observer.id)).not.toContain('长线计划：');
    expect(map(null)).not.toContain('长线计划：');

    const absent = inspect(observer);
    expect(absent).toContain('暂无长线计划记录。');
    expect(absent).not.toContain(secretTitle);
    expect(absent).not.toContain('抵达山门');
  });
});
