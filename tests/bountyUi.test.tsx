import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AgentInspector } from '../src/components/AgentInspector';
import { BountyBoard } from '../src/components/BountyBoard';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { createInitialWorld } from '../src/data/initialWorld';

const noSelect = () => undefined;

/** Wait for nested lazy views so the app assertion still tests the actual integrated panel. */
async function renderReady(element: ReactElement): Promise<string> {
  const { renderToReadableStream } = await vi.importActual<typeof import('react-dom/server')>('react-dom/server.browser');
  const stream = await renderToReadableStream(element);
  await stream.allReady;
  return new Response(stream).text();
}

function makeWorld() {
  const world = createInitialWorld();
  const [target, hunter, other] = world.cultivators;
  const [first, second] = world.sects;
  const open = {
    id: 'current-censure', targetCultivatorId: target.id, reason: '修士涉禁术，公榜记一笔。',
    issuedTick: 7, reward: 250, status: 'open' as const, sponsorSectIds: [first.id, second.id],
    escrow: [{ sectId: first.id, amount: 150 }, { sectId: second.id, amount: 100 }],
  };
  world.bounties = [open, {
    ...open, id: 'claimed-censure', reason: '旧案经追查结算。', status: 'claimed', settledTick: 9,
    hunterId: hunter.id,
  }, {
    ...open, id: 'withdrawn-censure', targetCultivatorId: hunter.id, reason: '误报后撤销。',
    status: 'withdrawn', settledTick: 8, escrow: [],
  }];
  target.karma = -73;
  target.transgressions = 4;
  const board = () => renderToStaticMarkup(<BountyBoard world={world} />);
  const inspect = () => renderToStaticMarkup(<AgentInspector world={world} cultivator={target} onSelectCultivator={noSelect} />);
  const map = (id: string | null) => renderToStaticMarkup(
    <WorldMapCanvas world={world} selectedCultivatorId={id} onSelectCultivator={noSelect} />
  );
  return { world, target, hunter, other, first, second, board, inspect, map };
}

describe('public bounty board UI', () => {
  it('separates open and resolved records, shows reward provenance, and does not print locations', () => {
    const { world, target, hunter, first, second, board } = makeWorld();
    const html = board();
    expect(html).toContain('aria-label="天机悬赏榜"');
    expect(html).toContain('公开悬赏 · 1 条');
    expect(html).toContain(target.name);
    expect(html).toContain('修士涉禁术，公榜记一笔。');
    expect(html).toContain('赏金 250 灵石');
    expect(html).toContain(`出资宗门：${first.name}、${second.name}`);
    expect(html).toContain(`托管赏金：${first.name} 150 灵石、${second.name} 100 灵石`);
    expect(html).toContain('查看已结案悬赏 · 2 条');
    expect(html).toContain('已领取');
    expect(html).toContain('已撤销');
    expect(html).toContain(`领赏：${hunter.name}`);
    expect(html).toContain('结案 Tick #9');
    expect(html.indexOf('修士涉禁术')).toBeLessThan(html.indexOf('查看已结案悬赏'));
    expect(html.indexOf('旧案经追查')).toBeGreaterThan(html.indexOf('查看已结案悬赏'));
    for (const location of world.locations) expect(html).not.toContain(location.name);
  });

  it('keeps the board in the application outside the selected-character inspector', async () => {
    const html = renderToStaticMarkup(<App initialWorkspace="world" initialSection="bounties" />);
    expect(html).toContain('aria-label="天机悬赏榜"');
    expect(html).toContain('当前没有公开悬赏。');
    expect(html).not.toContain('aria-label="业力与悬赏摘要"');
    const person = await renderReady(<App initialWorkspace="people" />);
    expect(person).toContain('aria-label="业力与悬赏摘要"');
    expect(person).not.toContain('aria-label="天机悬赏榜"');
  });

  it('prioritizes selected open status over history without placing bounty reasons or global markers on the map', () => {
    const { world, target, hunter, other, inspect, map } = makeWorld();
    expect(inspect()).toContain('业力 -73');
    expect(inspect()).toContain('恶行记录 4');
    expect(inspect()).toContain('悬赏：悬赏中');
    expect(map(target.id)).toContain('悬赏：悬赏中');
    expect(map(target.id)).not.toContain('修士涉禁术');
    expect(map(hunter.id)).toContain('悬赏：已撤销');
    expect(map(other.id)).not.toContain('悬赏：');
    expect(map(null)).not.toContain('悬赏：');

    world.bounties.shift();
    expect(map(target.id)).toContain('悬赏：已领取');
  });
});
