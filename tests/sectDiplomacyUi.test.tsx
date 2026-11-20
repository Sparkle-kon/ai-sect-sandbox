import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentInspector } from '../src/components/AgentInspector';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { createInitialWorld } from '../src/data/initialWorld';
import type { Cultivator } from '../src/types/world';

const noSelect = () => undefined;

function makeWorld() {
  const world = createInitialWorld();
  const [a, b, c] = world.sects;
  const [attacker, defender, unrelated] = world.cultivators;
  const destination = world.locations.find(({ id }) => id === b.headquartersId)!;
  const differentSite = world.locations.find(({ id }) => id === c.headquartersId)!;
  attacker.sectId = a.id;
  defender.sectId = b.id;
  unrelated.sectId = c.id;
  world.diplomacy = [
    { sectAId: b.id, sectBId: a.id, affinity: -70, pact: 'war', sinceTick: 6 },
    { sectAId: a.id, sectBId: c.id, affinity: 44, pact: 'alliance', sinceTick: 8 },
  ];
  const siege = {
    id: 'siege-fixture', attackerSectId: a.id, defenderSectId: b.id, destinationId: destination.id,
    participantIds: [attacker.id], status: 'sieging' as const, startedTick: 9, rounds: 2, lastResolvedTick: 11,
  };
  world.sieges = [siege, {
    ...siege, id: 'siege-past', status: 'repelled', startedTick: 6, lastResolvedTick: 7,
    outcome: '首度围攻无功而返。',
  }, {
    ...siege, id: 'other-siege', attackerSectId: b.id, defenderSectId: c.id, destinationId: differentSite.id,
    participantIds: [defender.id], status: 'marching', startedTick: 11,
  }];
  world.tributeDemands = [
    { id: 'tribute-out', demanderSectId: a.id, targetSectId: b.id, amount: 75, status: 'pending', startedTick: 8 },
    { id: 'tribute-in', demanderSectId: c.id, targetSectId: a.id, amount: 60, status: 'paid', startedTick: 5, resolvedTick: 6 },
  ];
  const inspect = (cultivator: Cultivator) => renderToStaticMarkup(
    <AgentInspector world={world} cultivator={cultivator} onSelectCultivator={noSelect} />
  );
  const map = (id: string | null) => renderToStaticMarkup(
    <WorldMapCanvas world={world} selectedCultivatorId={id} onSelectCultivator={noSelect} />
  );
  return { world, a, b, c, attacker, defender, unrelated, destination, differentSite, siege, inspect, map };
}

describe('sect diplomacy and siege UI', () => {
  it('renders the same reciprocal affinity and pact from either sect’s perspective', () => {
    const { a, b, c, attacker, defender, inspect } = makeWorld();
    const left = inspect(attacker);
    const right = inspect(defender);
    expect(left).toContain('双向关系 · 亲疏 −100 至 +100');
    expect(left).toContain(`↔ ${b.name}</th><td>交战</td><td>-70</td><td>6</td>`);
    expect(right).toContain(`↔ ${a.name}</th><td>交战</td><td>-70</td><td>6</td>`);
    expect(left).toContain(`↔ ${c.name}</th><td>盟友</td><td>+44</td><td>8</td>`);
    expect(right).toContain(`↔ ${c.name}</th><td>未记录</td>`);
  });

  it('distinguishes siege direction, progress and outcomes, and both directions of tribute', () => {
    const { a, b, c, attacker, unrelated, destination, differentSite, inspect } = makeWorld();
    const fighter = inspect(attacker);
    expect(fighter).toContain('进行中战役 1 场');
    expect(fighter).toContain(`${a.name} → ${b.name} · ${destination.name}`);
    expect(fighter).toContain('围攻 · 1 人列入 · 已推进 2 轮 · 始于 Tick #9 · 最近推进 Tick #11');
    expect(fighter).toContain('攻方遭击退');
    expect(fighter).toContain('首度围攻无功而返。');
    expect(fighter).not.toContain(`${b.name} → ${c.name} · ${differentSite.name}`);
    expect(fighter).toContain(`${a.name} 向 ${b.name} 索贡 75 灵石 · 待答复`);
    expect(fighter).toContain(`${c.name} 向 ${a.name} 索贡 60 灵石 · 已缴纳 · Tick #5 · 结于 Tick #6`);
    expect(inspect(unrelated)).not.toContain('首度围攻无功而返。');
    unrelated.sectId = 'no-faction';
    expect(inspect(unrelated)).toContain('散修，无本宗外交记录。');
  });

  it('summarizes living selected participants and marks only locations under actual siege', () => {
    const { world, attacker, defender, unrelated, destination, differentSite, siege, map } = makeWorld();
    expect(map(attacker.id)).toContain(`参与战役：围攻 · ${destination.name}`);
    expect(map(defender.id)).toContain(`参与战役：行军 · ${differentSite.name}`);
    expect(map(unrelated.id)).not.toContain('参与战役：');
    expect(map(null)).toContain('· 围攻中');
    expect(map(null).match(/· 围攻中/g)).toHaveLength(1);
    expect(map(null)).not.toContain('参与战役：');

    world.sieges[0] = { ...siege, status: 'victory' };
    expect(map(attacker.id)).not.toContain('参与战役：');
    expect(map(null)).not.toContain('· 围攻中');
  });
});
