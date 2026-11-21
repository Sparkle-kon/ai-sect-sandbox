import { describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { activeAvatar, availableAvatarHosts, availableAvatarInteractions, consumeAvatarOrder, createPlayerAvatarState,
  maintainPlayerAvatar, possessAvatar, queueAvatarOrder, resolveAvatarInteraction } from '../src/engine/avatarEngine';
import type { AvatarIntent } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.playerAvatar = createPlayerAvatarState();
  const [host, target] = world.cultivators;
  const ask = (intent: AvatarIntent, mode: 'avatar' | 'ring' = 'ring') =>
    ({ mode, intent, targetCultivatorId: target.id, message: '且听一言' });
  return { world, host, target, ask };
}

describe('player possession and private ring interactions', () => {
  it('charges possession, refuses unsafe hosts/switches, and expires and regenerates at most once per tick', () => {
    const { world, host, target } = fixture();
    target.alive = false;
    expect(availableAvatarHosts(world)).not.toContain(target);
    expect(possessAvatar(world, target.id)).toBe(false);
    expect(possessAvatar(world, host.id)).toBe(true);
    expect(activeAvatar(world)).toBe(host);
    expect(world.playerAvatar.essence).toBe(76);
    expect(possessAvatar(world, host.id)).toBe(false);
    world.tick++;
    maintainPlayerAvatar(world); maintainPlayerAvatar(world);
    expect(world.playerAvatar.essence).toBe(81);
    world.tick = world.playerAvatar.possessionUntilTick!;
    maintainPlayerAvatar(world);
    expect(activeAvatar(world)).toBeUndefined();
    expect(world.playerAvatar.possessedId).toBeUndefined();
  });

  it('hands an explicit avatar order through once at the next tick and never on stale or released possession', () => {
    const { world, host } = fixture();
    possessAvatar(world, host.id);
    expect(queueAvatarOrder(world, 'REST')).toBe(true);
    expect(world.playerAvatar.essence).toBe(71);
    expect(queueAvatarOrder(world, 'CULTIVATE')).toBe(false);
    expect(consumeAvatarOrder(world)).toBeUndefined();
    world.tick++;
    expect(consumeAvatarOrder(world)).toMatchObject({ actorId: host.id, decision: { chosenAction: 'REST' } });
    expect(consumeAvatarOrder(world)).toBeUndefined();
    expect(queueAvatarOrder(world, 'CULTIVATE')).toBe(true);
    expect(possessAvatar(world, null)).toBe(true);
    world.tick++;
    expect(consumeAvatarOrder(world)).toBeUndefined();
  });

  it('applies real guidance, bounds cooldown, and never writes user dialogue into public events', () => {
    const { world, target, ask } = fixture();
    target.qiProgress = 97;
    const events = structuredClone(world.events);
    const entry = resolveAvatarInteraction(world, ask('guide'), () => 0, '且观星河');
    expect(entry).toMatchObject({ targetCultivatorId: target.id, outcome: 'agreed', source: 'llm' });
    expect(world.playerAvatar.essence).toBe(90); expect(target.qiProgress).toBe(100);
    expect(world.events).toEqual(events);
    const uncalled = vi.fn(() => 0);
    expect(resolveAvatarInteraction(world, ask('guide'), uncalled)).toBeNull();
    world.tick++;
    expect(resolveAvatarInteraction(world, ask('guide'), uncalled)).toBeNull();
    expect(uncalled).not.toHaveBeenCalled();
    world.tick++;
    expect(resolveAvatarInteraction(world, ask('guide'), () => .999, '强制代决')).toMatchObject({ outcome: 'resisted', source: 'utility' });
  });

  it('reveals only a public event and ignores advisory free text on questioning', () => {
    const { world, target, ask } = fixture();
    world.events = [
      { id: 'private', year: world.year, month: world.month, tick: world.tick, title: '独闻秘密', description: '保密',
        actorIds: [target.id], category: 'intrigue', witnessScope: 'participants' },
      { id: 'public', year: world.year, month: world.month, tick: world.tick, title: '谈丹会开放', description: '公开',
        actorIds: [target.id], category: 'diplomacy' },
    ];
    target.innerMonologue = '个人念头绝不能透出';
    const entry = resolveAvatarInteraction(world, ask('interrogate'), () => 0, '虚构另一个秘密');
    expect(entry?.reply).toContain('谈丹会开放');
    expect(entry?.reply).not.toMatch(/独闻秘密|个人念头|虚构另一个秘密/);
    expect(entry?.source).toBe('utility');
  });

  it('requires proximity and willing eligible recruitment, conserves the entry subsidy', () => {
    const { world, host, target, ask } = fixture();
    possessAvatar(world, host.id);
    target.sectId = '';
    target.locationId = 'elsewhere';
    expect(resolveAvatarInteraction(world, ask('recruit', 'avatar'), () => 0)).toBeNull();
    expect(availableAvatarInteractions(world, 'ring').some(({ intent }) => intent === 'recruit')).toBe(false);
    target.locationId = host.locationId;
    const assets = host.spiritStones + target.spiritStones;
    expect(resolveAvatarInteraction(world, ask('recruit', 'avatar'), () => 0)?.outcome).toBe('recruited');
    expect(host.spiritStones + target.spiritStones).toBe(assets);
    expect(target).toMatchObject({ sectId: host.sectId, sectRank: '外门弟子', contribution: 0 });
  });
});
