import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentInspector } from '../src/components/AgentInspector';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { createInitialWorld } from '../src/data/initialWorld';
import type { Cultivator } from '../src/types/world';

const ignoreSelection = () => undefined;

function makeWorld() {
  const world = createInitialWorld();
  const [actor, other] = world.cultivators;
  const [sect, otherSect] = world.sects;
  const [place, remote] = world.locations;
  for (const location of world.locations) location.inheritanceScrolls = [];
  for (const faction of world.sects) faction.pavilion = [];
  actor.sectId = sect.id;
  actor.locationId = place.id;
  actor.techniqueMastery = 73;
  actor.technique = { id: 'own-tech', name: '听雷集', spiritRoot: '雷', authorId: actor.id, createdTick: 12 };
  sect.pavilion = [actor.technique];
  place.inheritanceScrolls = [
    { id: 'local-scroll', name: '本地火诀', spiritRoot: '火', authorId: other.id, createdTick: 8 },
    { id: 'lost-scroll', name: '无主经', spiritRoot: '暗', authorId: 'forgotten-author', createdTick: 5 },
  ];

  other.sectId = otherSect.id;
  other.locationId = remote.id;
  other.techniqueMastery = 0;
  otherSect.pavilion = [{ id: 'rival-tech', name: '别宗秘本', spiritRoot: '水' }];
  remote.inheritanceScrolls = [{ id: 'remote-scroll', name: '远方遗卷', spiritRoot: '木' }];

  const inspect = (cultivator: Cultivator) => renderToStaticMarkup(
    <AgentInspector world={world} cultivator={cultivator} onSelectCultivator={ignoreSelection} />
  );
  const map = (id: string | null) => renderToStaticMarkup(
    <WorldMapCanvas world={world} selectedCultivatorId={id} onSelectCultivator={ignoreSelection} />
  );
  return { world, actor, other, sect, place, inspect, map };
}

describe('technique mastery and inheritance UI', () => {
  it('shows the current technique mastery, own pavilion, and current-site scrolls with authorship', () => {
    const { actor, other, sect, place, inspect } = makeWorld();
    const html = inspect(actor);
    expect(html).toContain('听雷集');
    expect(html).toContain('当前功法熟练度 73/100');
    expect(html).toMatch(/<meter aria-label="当前功法熟练度"[^>]*min="0" max="100" value="73"/);
    expect(html).toContain(`${sect.name}藏经阁 · 1 卷`);
    expect(html).toContain(`${place.name}遗卷 · 2 卷`);
    expect(html).toContain('本地火诀');
    expect(html).toContain(`创法者：${actor.name}`);
    expect(html).toContain(`创法者：${other.name}`);
    expect(html).toContain('创法者：姓名未详');
    expect(html).toContain('创于 Tick #12');
    expect(html).not.toContain('remote-scroll');
    expect(html).not.toContain('远方遗卷');
    expect(html).not.toContain('别宗秘本');
  });

  it('does not display a pavilion for outsiders or current-site scrolls for a dead cultivator', () => {
    const { actor, place, inspect } = makeWorld();
    actor.sectId = 'no-sect';
    place.inheritanceScrolls = [];
    const noSect = inspect(actor);
    expect(noSect).toContain('此修士未加入宗门，无本宗藏经阁。');
    expect(noSect).toContain('此地暂无传承遗卷。');

    actor.alive = false;
    const archive = inspect(actor);
    expect(archive).toContain('修士已陨落，不再查看所在地点的遗卷。');
    expect(archive).not.toContain('此地暂无传承遗卷。');
  });

  it('changes the map readout with selection and keeps scroll contents out of the map', () => {
    const { actor, other, map } = makeWorld();
    const first = map(actor.id);
    expect(first).toContain('此地遗卷 2 卷');
    expect(first).toContain('· 遗卷 2 卷');
    expect(first).not.toContain('本地火诀');
    expect(first).not.toContain('远方遗卷');

    expect(map(other.id)).toContain('此地遗卷 1 卷');
    expect(map(null)).not.toContain('此地遗卷');
    actor.alive = false;
    expect(map(actor.id)).not.toContain('此地遗卷');
  });
});
