import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WeatherAtlasPanel } from '../src/components/WeatherAtlasPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { Cultivator, FieldObservatoryRun } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.tick = 24;
  const [operator, recipient, outsider] = world.cultivators;
  const [local, old] = world.locations;
  const hidden = world.locations.find(({ id }) => id === 'loc-vein-north')!;
  Object.assign(local, { x: 340, y: 340, name: '本地现场' });
  Object.assign(old, { x: 980, y: 20, name: '所知旧地点' });
  Object.assign(hidden, { x: 920, y: 545, name: '不应显示的隐秘地点' });
  operator.locationId = recipient.locationId = outsider.locationId = local.id;
  operator.exploredTileIds = recipient.exploredTileIds = [terrainTileAt(world, old.x, old.y)!.id];
  outsider.exploredTileIds = [];
  operator.name = '甲观测者';
  const reading = { kind: '灵潮' as const, intensity: 0.75 };
  const pending: FieldObservatoryRun = { locationId: local.id, openedTick: 23, targetTick: 25, baseline: reading, forecast: reading, status: 'pending' };
  const missed: FieldObservatoryRun = { ...pending, openedTick: 19, targetTick: 21, status: 'missed' };
  const measured: FieldObservatoryRun = {
    ...pending, locationId: old.id, openedTick: 17, targetTick: 19, status: 'measured', reading: { kind: '霜息', intensity: 0.45 },
    relay: { recipientId: recipient.id, relayedTick: 22 },
  };
  world.fieldObservatories.byActor[operator.id] = { runs: [pending, missed, measured], inbox: [] };
  world.fieldObservatories.byActor[recipient.id] = { runs: [], inbox: [{ operatorId: operator.id, openedTick: measured.openedTick }] };
  const render = (actor?: Cultivator) => renderToStaticMarkup(<WeatherAtlasPanel world={world} cultivator={actor} />);
  return { world, operator, recipient, outsider, old, hidden, pending, missed, measured, render };
}

describe('field observatory evidence and stale relay presentation', () => {
  it('uses one closed scope and calibrates an exact measurement, excluding missed or pending statuses', () => {
    const { operator, outsider, render } = fixture();
    const html = render(operator);
    expect(html).toMatch(/<details class="[^"]+"><summary class="[^"]+">观象台与区域实测校准/);
    expect(html).toContain('本人实付 5 灵石');
    expect(html).toContain('建台基线：灵潮 · 强度 75%');
    expect(html).toContain('目标 Tick #25 的基线延续预测：灵潮 · 强度 75%（非实测）');
    expect(html).toContain('等待目标回合的现场读数');
    expect(html).toContain('目标回合漏测 · 不填补读数，不计入校准');
    expect(html).toContain('目标实测 Tick #19：霜息 · 强度 45%');
    expect(html).toContain('已校准 1 次 · 类型命中 0/1 · 强度平均绝对误差 30 个百分点');
    expect(html).not.toContain('所知旧地点的当前观测');
    expect(render(outsider)).not.toContain('观象台与区域实测校准');
    expect(render()).not.toContain('观象台与区域实测校准');
  });

  it('relays only the authorized old sample, with distinct dates, preserving the almanac no-current state', () => {
    const { world, operator, recipient, hidden, measured, render } = fixture();
    const html = render(recipient);
    expect(html).toContain('所知旧地点 · 当前未观测');
    expect(html).toContain('所知旧地点 · 已过时 5 轮');
    expect(html).toContain('原实测 Tick #19：霜息 · 强度 45%');
    expect(html).toContain('转递 Tick #22 · 仅传原实测，不是当地现况或预测');
    expect(html).not.toContain('基线延续预测');
    expect(html).not.toContain('所知旧地点的当前观测');
    expect(html).not.toContain('甲观测者');
    world.tick = 28;
    expect(render(recipient)).not.toContain('观象台与区域实测校准');
    world.tick = 24;
    measured.locationId = hidden.id;
    expect(render(recipient)).not.toContain('观象台与区域实测校准');
    expect(render(recipient)).not.toContain(hidden.name);
    world.fieldObservatories.byActor[operator.id].runs = world.fieldObservatories.byActor[operator.id].runs.filter(({ status }) => status !== 'measured');
    expect(render(operator)).toContain('尚无可计分的实际读数');
    expect(render(operator)).not.toContain('平均绝对误差 0');
  });
});
