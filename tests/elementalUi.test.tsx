import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentInspector } from '../src/components/AgentInspector';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { createInitialWorld } from '../src/data/initialWorld';

const ignoreSelection = () => undefined;

function makeWorld() {
  const world = createInitialWorld();
  const [actor, other] = world.cultivators;
  const [place, otherPlace] = world.locations;
  actor.locationId = place.id;
  actor.spiritRoot = '雷';
  actor.technique = { name: '折光水诀', spiritRoot: '水' };
  actor.artifacts = [
    { name: '熔焰佩', spiritRoot: '火' },
    { name: '玄金镜', spiritRoot: '金' },
  ];
  place.spiritRoot = '木';
  other.locationId = otherPlace.id;
  other.spiritRoot = '天灵根';
  other.technique = { name: '夜行秘卷', spiritRoot: '暗' };
  other.artifacts = [];
  otherPlace.spiritRoot = '土';
  return { world, actor, other, place, otherPlace };
}

describe('elemental affinity UI', () => {
  it('distinguishes a cultivator’s root, equipped technique, local vein, and object-valued artifacts', () => {
    const { world, actor } = makeWorld();
    const html = renderToStaticMarkup(
      <AgentInspector world={world} cultivator={actor} onSelectCultivator={ignoreSelection} />
    );
    expect(html).toContain('aria-label="灵根、功法与法宝"');
    expect(html).toMatch(/灵根：<\/span><span[^>]*>雷<\/span>/);
    expect(html).toMatch(/功法：<\/span><span[^>]*>折光水诀<\/span><span[^>]*>水<\/span>/);
    expect(html).toMatch(/所在灵脉：<\/span><span[^>]*>木<\/span>/);
    expect(html).toMatch(/熔焰佩<span[^>]*>火<\/span>/);
    expect(html).toMatch(/玄金镜<span[^>]*>金<\/span>/);
    expect(html).not.toContain('夜行秘卷');
    expect(html).not.toContain('[object Object]');
  });

  it('names the special root and has explicit fallbacks for no artifacts or unknown location', () => {
    const { world, other } = makeWorld();
    other.locationId = 'missing-place';
    const html = renderToStaticMarkup(
      <AgentInspector world={world} cultivator={other} onSelectCultivator={ignoreSelection} />
    );
    expect(html).toMatch(/灵根：<\/span><span[^>]*>天灵根<\/span>/);
    expect(html).toMatch(/夜行秘卷<\/span><span[^>]*>暗<\/span>/);
    expect(html).toMatch(/所在灵脉：<\/span><span[^>]*>未详<\/span>/);
    expect(html).toMatch(/本命与随身法宝：<\/span><span[^>]*>暂无<\/span>/);
  });

  it('provides a textual map vein list and changes the actor root readout with selection', () => {
    const { world, actor, other, place, otherPlace } = makeWorld();
    const render = (selectedCultivatorId: string | null) => renderToStaticMarkup(
      <WorldMapCanvas world={world} selectedCultivatorId={selectedCultivatorId} onSelectCultivator={ignoreSelection} />
    );
    const actorMap = render(actor.id);
    expect(actorMap).toMatch(/灵根 <span[^>]*>雷<\/span>/);
    expect(actorMap).toContain(`${place.name} · 灵脉 <span`);
    const otherMap = render(other.id);
    expect(otherMap).toMatch(/灵根 <span[^>]*>天灵根<\/span>/);
    expect(otherMap).toContain(`${otherPlace.name} · 灵脉 <span`);
    expect(otherMap).not.toMatch(/灵根 <span[^>]*>雷<\/span>/);
    const noSelection = render(null);
    expect(noSelection).toContain('查看各地点灵脉属性');
    expect(noSelection).toContain(`${place.name} · 灵脉</span>`);
    expect(noSelection).toContain(`${otherPlace.name} · 灵脉</span>`);
    expect(noSelection).not.toMatch(/灵根 <span/);
  });
});
