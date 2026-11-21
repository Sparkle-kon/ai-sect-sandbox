import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WeatherAtlasPanel } from '../src/components/WeatherAtlasPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { visibleQiWeather } from '../src/engine/weatherEngine';

const fixture = () => {
  const world = createInitialWorld(17);
  const [viewer] = world.cultivators;
  const [visible, remembered, hidden] = world.locations;
  viewer.locationId = visible.id;
  viewer.exploredTileIds = [visible, remembered].flatMap(({ x, y }) => {
    const tile = terrainTileAt(world, x, y);
    return tile ? [tile.id] : [];
  });
  return { world, viewer, visible, remembered, hidden };
};

describe('weather atlas presentation', () => {
  it('distinguishes the current measured reading and each future tick for a visible site', () => {
    const { world, viewer, visible } = fixture();
    const current = visibleQiWeather(world, viewer).find(({ locationId }) => locationId === visible.id);
    expect(current).toBeDefined();
    const html = renderToStaticMarkup(<WeatherAtlasPanel world={world} cultivator={viewer} />);
    expect(html).toContain('aria-label="四时灵潮图鉴"');
    expect(html).toContain(`aria-label="${visible.name}的当前观测"`);
    expect(html).toContain(`实测 · Tick #${world.tick}`);
    expect(html).toContain(`强度 ${Math.round((current?.observed.intensity ?? 0) * 100)}%`);
    expect(html).toContain('未来预测 · 非实测');
    expect(html).toContain(`aria-label="${visible.name}的未来预测"`);
    for (let i = 1; i <= 3; i += 1) expect(html).toContain(`Tick #${world.tick + i}`);
  });

  it('does not reveal hidden locations or measured/forecast data for a remembered offscreen site', () => {
    const { world, viewer, remembered, hidden } = fixture();
    const html = renderToStaticMarkup(<WeatherAtlasPanel world={world} cultivator={viewer} />);
    expect(html).toContain(`${remembered.name} · 当前未观测`);
    expect(html).not.toContain(`${remembered.name}的当前观测`);
    expect(html).not.toContain(`${remembered.name}的未来预测`);
    expect(html).not.toContain(hidden.name);
  });

  it('shows no omniscient weather when a viewer is absent or has died', () => {
    const { world, viewer, visible } = fixture();
    const noViewer = renderToStaticMarkup(<WeatherAtlasPanel world={world} cultivator={undefined} />);
    expect(noViewer).toContain('未选中修士，无观察数据');
    expect(noViewer).not.toContain(visible.name);
    viewer.alive = false;
    const archive = renderToStaticMarkup(<WeatherAtlasPanel world={world} cultivator={viewer} />);
    expect(archive).toContain('当前实测 0 处');
    expect(archive).not.toContain('未来预测 · 非实测');
  });
});
