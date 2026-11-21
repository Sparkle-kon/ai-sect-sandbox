import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FieldObservatoryPanel } from '../src/components/FieldObservatoryPanel';
import { advanceAlignedWeather } from '../src/engine/alignedWeatherEngine';
import { advanceFieldObservatories } from '../src/engine/fieldObservatoryEngine';
import type { WorldState } from '../src/types/world';
import { comparedAlignedWeather, offeredAlignedWeather, weatherPerson, weatherSite } from './fixtures/alignedWeatherFixture';

const html = (world: WorldState, actorId: string) =>
  renderToStaticMarkup(<FieldObservatoryPanel world={world} cultivator={weatherPerson(world, actorId)} />);
const percent = (value: number) => Math.round(value * 1000) / 10;

describe('authorized independent weather comparisons inside the existing observatory', () => {
  it('renders current invitation only within the old closed fold, without assuming or leaking either peer reading', () => {
    const f = offeredAlignedWeather(true, 'absent');
    const made = html(f.world, f.proposerId);
    const invited = html(f.world, f.peerId);
    expect(invited).toMatch(/<details class="[^"]+"><summary class="[^"]+">观象台与区域实测校准/);
    expect(invited).toContain('本人受邀 · 待独立同意，尚未并读');
    expect(invited).toContain('此邀约不代表对方已有读数');
    expect(invited).not.toContain('强度');
    expect(invited).not.toContain('第二份');
    expect(made).toContain('仅本人原读数：台心');
    expect(made).not.toContain('第二份');
    expect(made).not.toContain('<button');
    expect(html(f.world, f.outsiderId)).not.toContain('同刻异读与观象复核');

    f.world.tick = f.world.alignedWeather.comparisons[0].expiresTick;
    advanceAlignedWeather(f.world);
    expect(html(f.world, f.peerId)).toContain('邀约已到期，未并读');
    expect(html(f.world, f.peerId)).not.toContain('强度');
  });

  it('preserves native differing old samples, separates personal edge forecasting and does not imply truth or identify participants', () => {
    const f = comparedAlignedWeather(true);
    const row = f.world.alignedWeather.comparisons[0];
    const a = row.first.reading, b = row.second!.reading;
    expect(row.outcome).toBe('uncertain');
    const copy = html(f.world, f.peerId);
    expect(copy).toContain(`原实测第 ${row.measuredTick} 轮（距今 ${f.world.tick - row.measuredTick} 轮）`);
    expect(copy).toContain(`第 ${row.settledTick} 轮实际并读`);
    expect(copy).toContain(`第一份：台心 · ${a.kind} · 强度 ${percent(a.intensity)}%`);
    expect(copy).toContain(`第二份：台缘 · ${b.kind} · 强度 ${percent(b.intensity)}%`);
    expect(copy).toContain('不把旧实测当作当前天象或预测');
    expect(copy).toContain('原读数有差异，仍不确定；不取平均，也不判哪份是真值');
    expect(copy).toMatch(new RegExp('台缘 Tick #' + row.measuredTick + ' 的基线延续预测：[^<]+（非实测）'));
    expect(copy).toContain('台缘实测 Tick #' + row.measuredTick);
    expect(copy).not.toContain('两份原读数一致');
    for (const sensitive of [f.id, f.siteId, f.peerId, f.proposerId, weatherPerson(f.world, f.proposerId).name]) {
      expect(copy).not.toContain(sensitive);
    }
    const point = row.second!.station!;
    expect(copy).not.toContain(`${point.x}, ${point.y}`);
  });

  it('reports agreement only as dated evidence and leaves it absent when the place is no longer known', () => {
    const f = comparedAlignedWeather(false);
    const exact = f.world.alignedWeather.comparisons[0];
    expect(exact.outcome).toBe('agrees');
    f.world.tick += 9;
    advanceFieldObservatories(f.world);
    const past = html(f.world, f.peerId);
    expect(past).toContain(`原实测第 ${exact.measuredTick} 轮（距今 ${f.world.tick - exact.measuredTick} 轮）`);
    expect(past).toContain('两份原读数一致。仅限该次实测，不代表其他地点或时段');
    expect(past).not.toContain('本人野外观测');
    const site = weatherSite(f.world, f.siteId);
    const far = [...f.world.locations].sort((a, b) => Math.hypot(b.x - site.x, b.y - site.y) - Math.hypot(a.x - site.x, a.y - site.y))[0];
    const viewer = weatherPerson(f.world, f.peerId);
    viewer.locationId = far.id;
    viewer.exploredTileIds = [];
    viewer.rumors = [];
    // A public market is still a known landmark even when not in current sight.
    f.world.locations = f.world.locations.filter(({ id }) => id !== f.siteId);
    expect(html(f.world, f.peerId)).not.toContain('同刻异读与观象复核');
  });
});
