import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RelationshipGraph } from '../src/components/RelationshipGraph';
import { buildRelationshipView, pageRelationshipRecords, RELATION_NEIGHBORHOOD_LIMIT, RELATION_PAGE_SIZE } from '../src/components/relationshipView';
import { createInitialWorld } from '../src/data/initialWorld';
import type { RelationshipEdge } from '../src/types/world';

function fixture(size: number) {
  const world = createInitialWorld(55);
  const actor = world.cultivators[0];
  const id = (i: number) => `actor-${String(i).padStart(4, '0')}`;
  world.cultivators = Array.from({ length: size }, (_, i) => ({ ...actor, id: id(i), name: `侠客${i}`, alive: i !== 1, hp: i === 1 ? 0 : actor.hp }));
  const record = (fromId: string, toId: string, affinity: number): RelationshipEdge => ({ fromId, toId, type: '同门', affinity, note: '' });
  const selected = id(0);
  world.relationships = [
    ...Array.from({ length: size - 1 }, (_, index) => index + 1).flatMap((i) => [
      record(selected, id(i), 100 - i % 40), record(id(i), selected, 60 - i % 30),
    ]),
    ...Array.from({ length: size - 2 }, (_, index) => index + 1).map((i) => record(id(i), id(i + 1), 20)),
    record(selected, 'missing-endpoint', 91), record(selected, selected, 90),
  ];
  return { world, selected, id };
}

describe('large relationship graph uses selected neighborhood and fully available paged directed records', () => {
  it.each([48, 526])('projects and renders a bounded neighborhood at %i real records holders', (size) => {
    const { world, selected, id } = fixture(size);
    const view = buildRelationshipView(world, selected);
    expect(world.cultivators).toHaveLength(size);
    expect(view.peers).toHaveLength(RELATION_NEIGHBORHOOD_LIMIT);
    expect(new Set(view.peers.map(({ actor }) => actor.id)).size).toBe(RELATION_NEIGHBORHOOD_LIMIT);
    expect(view.peerCount).toBe(size - 1);
    expect(view.direct).toHaveLength((size - 1) * 2 + 2);
    expect(view.direct.find(({ edge }) => edge.fromId === selected && edge.toId === id(1))?.reciprocal).toBe(true);
    expect(view.direct.find(({ direction }) => direction === 'self')?.reciprocal).toBe(false);
    expect(view.peers.every(({ actor, inbound, outbound }) => !!actor && inbound === 1 && outbound === 1)).toBe(true);
    const html = renderToStaticMarkup(<RelationshipGraph world={world} selectedCultivatorId={selected} onSelectCultivator={() => {}} />);
    expect(html.match(/data-relationship-peer=/g)).toHaveLength(RELATION_NEIGHBORHOOD_LIMIT);
    expect(html.match(/data-relationship-record=/g)).toHaveLength(RELATION_PAGE_SIZE);
    expect(html).toContain(`图示 6/${size - 1} 位直接相连的修士`);
    expect(html).toContain('全界有向记录（仅文字）');
    expect(html).toContain('双方姓名或关系类别');
    expect(html).toContain('下一页');
    expect(html.length).toBeLessThan(16000);
  });

  it('provides every persisted edge from full record scope, including duplicates, reciprocal and missing sides', () => {
    const { world, selected, id } = fixture(526);
    world.relationships.push({ ...world.relationships[0] }); // Exact duplicate remains a separately searchable record.
    const view = buildRelationshipView(world, selected);
    const start = pageRelationshipRecords(view.records, '', 'all', 0);
    const all = Array.from({ length: start.pages }, (_, page) => pageRelationshipRecords(view.records, '', 'all', page).rows).flat();
    expect(all).toHaveLength(world.relationships.length);
    expect(new Set(all.map(({ key }) => key)).size).toBe(world.relationships.length);
    expect(all.every(({ key, edge }) => edge === world.relationships[key])).toBe(true);
    expect(pageRelationshipRecords(view.direct, '侠客５２５', 'reciprocal', 900).rows).toHaveLength(2);
    expect(pageRelationshipRecords(view.direct, '侠客525', 'outbound', 0).rows[0]?.to?.id).toBe(id(525));
    expect(pageRelationshipRecords(view.direct, '侠客525', 'inbound', 0).rows[0]?.from?.id).toBe(id(525));
    const missing = pageRelationshipRecords(view.direct, '失载修士', 'outbound', 0).rows;
    expect(missing).toHaveLength(1);
    expect(missing[0].to).toBeUndefined();
    expect(buildRelationshipView(world, 'missing-endpoint').peers).toEqual([]);
    const html = renderToStaticMarkup(<RelationshipGraph world={world} selectedCultivatorId="missing-endpoint" onSelectCultivator={() => {}} />);
    expect(html).not.toContain('data-relationship-peer');
    expect(html).toContain('未选中有效修士');
  });

  it('keeps deterministic tie ordering, distinct directed negative/positive records and a fallen peer', () => {
    const { world, selected, id } = fixture(48);
    world.relationships = [
      { fromId: id(2), toId: selected, affinity: -88, type: '血仇', note: 'not displayed' },
      { fromId: selected, toId: id(2), affinity: 88, type: '同门', note: 'not displayed' },
      { fromId: selected, toId: id(1), affinity: 88, type: '竞争', note: 'not displayed' },
    ];
    const first = buildRelationshipView(world, selected);
    const html = renderToStaticMarkup(<RelationshipGraph world={world} selectedCultivatorId={selected} onSelectCultivator={() => {}} />);
    expect(first.peers.map(({ actor }) => actor.id)).toEqual([id(1), id(2)]);
    expect(html).toContain('侠客1（已陨落）');
    expect(html).toContain('本人 → 对方');
    expect(html).toContain('对方 → 本人');
    expect(html).toContain('好感 +88');
    expect(html).toContain('好感 -88');
    expect(html).toContain('有反向记录');
    expect(html).not.toContain('not displayed');
    world.relationships.reverse();
    const reversed = buildRelationshipView(world, selected);
    expect(reversed.peers).toEqual(first.peers);
    expect(reversed.records.map(({ edge }) => edge)).toEqual(first.records.map(({ edge }) => edge));
  });
});
