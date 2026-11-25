import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { MortalVillagesPanel } from '../src/components/MortalVillagesPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { VillageWorkProject } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.tick = 15;
  const [viewer] = world.cultivators;
  const [village] = world.settlements.villages;
  const site = world.locations.find(({ id }) => id === village.locationId)!;
  const distant = world.locations.find(({ x, y }) => Math.hypot(x - site.x, y - site.y) > 300)!;
  viewer.locationId = site.id;
  viewer.name = '现场赞助人';
  viewer.exploredTileIds = [terrainTileAt(world, site.x, site.y)!.id];
  const sect = world.sects.find(({ id }) => id === viewer.sectId)!;
  sect.name = '工役实付宗门';
  const project: VillageWorkProject = {
    id: 'tested-project', settlementId: village.id, sponsorSectId: sect.id, sponsorId: viewer.id,
    kind: 'well', startedTick: 13, deadlineTick: 19, status: 'building',
    laborTotal: 2, stonesSpent: 32, rootsSpent: 2, receipts: [{ tick: 14, labor: 2, adultsAvailable: 6 }], lastWorkedTick: 14,
  };
  world.villageWorks.projects = [project];
  const html = () => renderToStaticMarkup(<MortalVillagesPanel world={world} cultivator={viewer} />);
  return { world, viewer, village, site, distant, project, html };
}

describe('observed village public works and real carrying-capacity change', () => {
  it('keeps one closed local works fold with actual supplies/work and only a conditional return', () => {
    const { village, html } = fixture();
    const markup = html();
    expect(markup).toMatch(/<details class="[^"]+"><summary class="[^"]+">村镇工役与承载增长/);
    expect(markup).toContain('住位与新居民各有册');
    expect(markup).toContain(`村镇现有人口 ${village.population} · 当前总承载 ${village.capacity}`);
    expect(markup).toContain('工役实付宗门公库实付 32 灵石 · 现场赞助人自付玄土根 2 株');
    expect(markup).toContain('实记劳力 2/4 份工 · 若完工，可新增最多 8 人的承载');
    expect(markup).toContain('Tick #14 · 计入 2 份工 · 当时合格成年劳力 6 人');
    expect(markup).not.toContain('完工当时承载');
    village.stress = 100;
    expect(html()).toContain('村镇压力过高，暂缓施工');
    expect(renderToStaticMarkup(<App />)).not.toContain('村镇工役与承载增长');
  });

  it('renders actual completion capacity and preserves the original observed headcount and historical draft', () => {
    const { world, village, project, html } = fixture();
    const before = structuredClone(world);
    const population = village.population;
    const initialCapacity = village.capacity;
    project.status = 'completed'; project.settledTick = 15; project.laborTotal = 4;
    project.capacityBefore = initialCapacity; project.capacityAfter = initialCapacity + 8; village.capacity += 8;
    const done = html();
    expect(done).toContain('开凿水井 · 已完工');
    expect(done).toContain(`村镇现有人口 ${population} · 当前总承载 ${initialCapacity + 8}`);
    expect(done).toContain(`完工当时承载：${initialCapacity} → ${initialCapacity + 8}（新增 8），不是人口增量`);
    expect(renderToStaticMarkup(<MortalVillagesPanel world={before} cultivator={before.cultivators[0]} />)).not.toContain('完工当时承载');
  });

  it('does not invent returns or disclose offscreen collections after site was remembered', () => {
    const { world, viewer, village, distant, project, html } = fixture();
    world.tick = project.deadlineTick;
    project.status = 'abandoned'; project.settledTick = world.tick; project.endReason = 'deadline';
    expect(html()).toContain('未完工，已结案');
    expect(html()).toContain('工期已满，未新增承载');
    expect(html()).not.toContain('退款');
    viewer.locationId = distant.id;
    const hiddenMarkup = html();
    expect(hiddenMarkup).toContain(`${village.name} · 当前未观测`);
    expect(hiddenMarkup).not.toContain('工役实付宗门公库实付');
    expect(hiddenMarkup).not.toContain('村镇工役与承载增长');
  });
});
