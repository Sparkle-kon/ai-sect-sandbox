import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { possessAvatar, queueAvatarOrder } from '../src/engine/avatarEngine';
import { resolveAvatarSnapshot } from '../src/engine/avatarRuntime';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { commitCouncilSnapshot } from '../src/engine/councilRuntime';
import type { LLMConfig } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-key', model: 'fixture' };
const envelope = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }));
afterEach(() => vi.unstubAllGlobals());

describe('possession and ring runtime integration', () => {
  it('runs one queued command instead of a competing AI intent', () => {
    const world = createInitialWorld();
    const avatar = world.cultivators[0];
    avatar.hp -= 100;
    expect(possessAvatar(world, avatar.id)).toBe(true);
    expect(queueAvatarOrder(world, 'REST')).toBe(true);
    const next = advanceWorldTick(world, { [avatar.id]: { chosenAction: 'CULTIVATE', innerMonologue: '模型测试' } }, () => .95);
    expect(next.cultivators[0].currentAction).toBe('REST');
    expect(next.cultivators[0].hp).toBeGreaterThan(avatar.hp);
    expect(next.playerAvatar.pendingOrder).toBeUndefined();
    const later = advanceWorldTick(next, { [avatar.id]: { chosenAction: 'CULTIVATE', innerMonologue: '按月修行' } }, () => .95);
    expect(later.cultivators[0].currentAction).toBe('CULTIVATE');
  });

  it('models only one new private line and never changes rules outcomes or the public chronicle', async () => {
    const world = createInitialWorld();
    world.cultivators[0].secretGoal = '秘密身世';
    const request = { mode: 'ring', intent: 'guide', targetCultivatorId: 'npc-1', message: '先听身外风声，再稳住心神。' } as const;
    const simulated = await resolveAvatarSnapshot(world, request, { ...config, enabled: false }, () => .01);
    const mock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(String(init.body)).toContain(request.message);
      expect(String(init.body)).not.toContain('秘密身世');
      return envelope('{"reply":"但愿借这阵风，悟出澄心之法。"}');
    });
    vi.stubGlobal('fetch', mock);
    const modeled = await resolveAvatarSnapshot(world, request, config, () => .01);
    expect(mock).toHaveBeenCalledTimes(1);
    expect(modeled.entry?.source).toBe('llm');
    expect(modeled.entry?.outcome).toBe(simulated.entry?.outcome);
    expect(modeled.entry?.effect).toBe(simulated.entry?.effect);
    expect(modeled.world.cultivators).toEqual(simulated.world.cultivators);
    expect(modeled.world.events).toEqual(world.events);
    expect(modeled.world.chronicleArchive).toEqual(world.chronicleArchive);
    expect(world.playerAvatar.transcript).toEqual([]);
    expect(commitCouncilSnapshot(createInitialWorld(), world, modeled.world)).not.toBe(modeled.world);
  });

  it('falls back for bad dialogue JSON and does not request private clues', async () => {
    const world = createInitialWorld();
    const mock = vi.fn(async () => envelope('{"reply":17}'));
    vi.stubGlobal('fetch', mock);
    const result = await resolveAvatarSnapshot(world, { mode: 'ring', intent: 'guide', targetCultivatorId: 'npc-1', message: '静一静。' }, config, () => .01);
    expect(result.entry?.source).toBe('utility');
    const clue = await resolveAvatarSnapshot(world, { mode: 'ring', intent: 'interrogate', targetCultivatorId: 'npc-1', message: '讲讲公开的见闻。' }, config, () => .01);
    expect(clue.entry?.outcome).toBe('revealed');
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
