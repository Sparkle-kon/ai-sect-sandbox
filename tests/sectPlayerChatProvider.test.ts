import { describe, expect, it, vi } from 'vitest';
import { llmScheduler } from '../src/engine/llmScheduler';
import { applySectPlayerChat, prepareSectPlayerChat, quoteSectPlayerChatOptions } from '../src/engine/sectPlayerChat';
import { requestSectPlayerChatIntent } from '../src/engine/sectPlayerChatProvider';
import { createManagedSectWorld } from '../src/engine/starterSectWorld';
import { encodeEraWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { SectPlayerChatDraft } from '../src/types/sectPlayerChat';
import type { LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled: false, sectChatEnabled: true, apiBaseUrl: 'https://sect-intent-fixture.invalid/v1',
  apiKey: 'local-placeholder-not-a-real-secret', model: 'simulated-parser' };
const privateNote = '慎藏走廊第三块石芽趁雨时的心事。';
const publicText = '本门下月开山收徒，愿学吐纳者可以上山问一问。';
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '本月不抢别人的差事。' };

function fixture() {
  const genesis = createManagedSectWorld(13071, 'classic', 'qingyun-odd-jobs', 0);
  if (!genesis?.sectManagement) throw new Error('Expected a real managed genesis');
  const leader = genesis.sectManagement.leaderId;
  const actor = genesis.cultivators.find(row => row.id === leader);
  if (!actor) throw new Error('Expected true leader');
  actor.secretGoal = privateNote;
  const speaker = genesis.cultivators.find(row => row.id === genesis.sectManagement?.foundingDiscipleIds[0]);
  if (!speaker) throw new Error('Expected a genuine witness-source actor');
  speaker.personality = '诡诈';
  const choices: Record<string, LLMDecisionPayload> = Object.fromEntries(genesis.cultivators.map(row => [row.id, rest]));
  choices[speaker.id] = { chosenAction: 'SCHEMING', targetCultivatorId: leader, rumorIntent: 'FABRICATE',
    innerMonologue: '吹一桩旁人不曾见过的机缘。' };
  const world = advanceWorldTick(genesis, choices, undefined, 'utility');
  const draft: SectPlayerChatDraft = { roomId: 'jiuzhou', identity: 'leader', body: { kind: 'free', text: publicText } };
  return { world, draft, leader };
}

interface ProviderMenu {
  readonly group: string;
  readonly identity: string;
  readonly text: string;
  readonly options: readonly { readonly optionId: string; readonly label: string; readonly intent: string; readonly targetLabel?: string }[];
}
function turnWire(options?: RequestInit) {
  const raw = String(options?.body ?? '');
  const body = JSON.parse(raw) as { messages: readonly { role: string; content: string }[] };
  const user = body.messages.find(row => row.role === 'user');
  if (!user) throw new Error('Expected actual provider request envelope');
  return { raw, menu: JSON.parse(user.content) as ProviderMenu };
}
const response = (value: unknown) => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify(value) } }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
}));

describe('公开群聊模拟解析器仅建议一项', () => {
  it('需求只送公开话语和当前限定菜单，模型解析本身不得发帖、招人或写入世界', async () => {
    const { world, draft: leadDraft, leader } = fixture();
    const draft: SectPlayerChatDraft = { ...leadDraft, identity: 'passing_senior' };
    const before = encodeEraWorldSave(world);
    const expected = quoteSectPlayerChatOptions(world, draft.roomId, draft.identity);
    const ad = expected.find(row => row.intent.kind === 'recruit_ad');
    if (!ad) throw new Error('Expected a lawful recruit advertisement option');
    const transport = vi.fn(async (_url: RequestInfo | URL, options?: RequestInit) => {
      const { raw, menu } = turnWire(options);
      expect(menu).toMatchObject({ group: '九州修仙交流群', identity: '路过的前辈', text: publicText });
      expect(menu.options.map(({ label, intent }) => ({ label, intent })))
        .toEqual(expected.slice(0, 24).map(({ label, intent }) => ({ label, intent: intent.kind })));
      expect(menu.options.every(row => /^option-[0-9]+$/.test(row.optionId))).toBe(true);
      expect(new Set(menu.options.map(row => row.optionId)).size).toBe(menu.options.length);
      expect(menu.options.some(row => row.intent === 'debunk')).toBe(true);
      expect(raw).not.toContain(leader);
      expect(raw).not.toContain('rumor-forged-');
      expect(raw).not.toContain(privateNote);
      expect(raw).not.toContain(config.apiKey);
      expect(raw).not.toContain('currentAction');
      expect(raw).not.toContain('witnessScope');
      expect(options?.redirect).toBe('error');
      expect(new Headers(options?.headers).get('authorization')).toBe(`Bearer ${config.apiKey}`);
      return response({ optionId: menu.options.find(row => row.intent === 'recruit_ad')?.optionId });
    });
    vi.stubGlobal('fetch', transport);
    llmScheduler.resetTickBudget();
    try {
      const beforeModel = llmScheduler.getSnapshot().byKind.sect_chat_intent;
      const chosen = await requestSectPlayerChatIntent(world, draft, config);
      expect(chosen).toBe(ad.id);
      expect(transport).toHaveBeenCalledOnce();
      expect(llmScheduler.getSnapshot().byKind.sect_chat_intent - beforeModel).toBe(1);
      expect(encodeEraWorldSave(world) === before).toBe(true);
      expect(prepareSectPlayerChat(world, draft, chosen)).toBeTruthy();
      expect(encodeEraWorldSave(world) === before).toBe(true);
      const sent = applySectPlayerChat(world, draft, chosen);
      expect(sent !== world).toBe(true);
      expect(sent.cultivators).toEqual(world.cultivators);
      expect(sent.random).toEqual(world.random);
      expect(sent.tick).toBe(world.tick);
    } finally {
      vi.unstubAllGlobals();
      llmScheduler.resetTickBudget();
    }
  });

  it('模型不得把不存在的宗名误配成真实宗门的放话选项', async () => {
    const { world, draft } = fixture();
    const available = quoteSectPlayerChatOptions(world, draft.roomId, draft.identity)
      .find(row => row.intent.kind === 'provoke');
    if (!available || available.intent.kind !== 'provoke') throw new Error('Expected a real known rival sect');
    const { targetSectId } = available.intent;
    const target = world.sects.find(row => row.id === targetSectId);
    if (!target) throw new Error('Expected the exact native rival name');
    const mock = vi.fn(async (_url: RequestInfo | URL, options?: RequestInit) => {
      const { menu } = turnWire(options);
      const exact = menu.options.find(row => row.intent === 'provoke' && row.targetLabel === target.name);
      if (!exact) throw new Error('Expected the real public named target on the wire');
      return response({ optionId: exact.optionId });
    });
    vi.stubGlobal('fetch', mock);
    llmScheduler.resetTickBudget();
    const custom = (text: string): SectPlayerChatDraft => ({ ...draft, body: { kind: 'free', text } });
    try {
      expect(await requestSectPlayerChatIntent(world, custom('无名鹤闲山门，下次敢来会一会我的剑么？'), config)).toBeUndefined();
      expect(await requestSectPlayerChatIntent(world, custom(`${target.name}，下次敢来会一会我的剑么？`), config)).toBe(available.id);
      expect(mock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
      llmScheduler.resetTickBudget();
    }
  });

  it('未知菜单、额外动作字段、别的房间、关闭和取消均不生效', async () => {
    const { world, draft } = fixture();
    const before = encodeEraWorldSave(world);
    let reply: unknown = { optionId: 'unquoted-target-999' };
    let delayed: (() => void) | undefined;
    let hold = false;
    const request = vi.fn(async (_url: RequestInfo | URL, options?: RequestInit) => {
      const { menu } = turnWire(options);
      const chatOption = menu.options.find(row => row.intent === 'chat');
      const payload = reply && typeof reply === 'object' && 'optionId' in reply && reply.optionId === 'option-1' && chatOption
        ? { ...reply, optionId: chatOption.optionId } : reply;
      return hold ? new Promise<Response>(resolve => { delayed = () => resolve(response(payload)); }) : response(payload);
    });
    vi.stubGlobal('fetch', request);
    llmScheduler.resetTickBudget();
    try {
      expect(await requestSectPlayerChatIntent(world, { ...draft, roomId: 'own' }, config)).toBeUndefined();
      expect(await requestSectPlayerChatIntent(world, draft, { ...config, sectChatEnabled: false })).toBeUndefined();
      expect(await requestSectPlayerChatIntent(world, draft, { ...config, apiBaseUrl: 'https://bad:password@sect-intent-fixture.invalid/v1' })).toBeUndefined();
      expect(await requestSectPlayerChatIntent(world, { ...draft, body: { kind: 'free', text: config.apiKey } }, config)).toBeUndefined();
      expect(request).not.toHaveBeenCalled();
      expect(await requestSectPlayerChatIntent(world, draft, config)).toBeUndefined();
      const legal = quoteSectPlayerChatOptions(world, draft.roomId, draft.identity).find(row => row.intent.kind === 'chat');
      if (!legal) throw new Error('Expected legitimate chat-only option');
      reply = { optionId: 'option-1', chosenAction: 'DUEL', spiritStones: 9999 };
      expect(await requestSectPlayerChatIntent(world, draft, config)).toBeUndefined();
      reply = { optionId: 'option-1' };
      hold = true;
      const controller = new AbortController();
      const pending = requestSectPlayerChatIntent(world, draft, config, controller.signal);
      await vi.waitFor(() => expect(delayed).toBeTypeOf('function'));
      controller.abort();
      delayed?.();
      expect(await pending).toBeUndefined();
      expect(encodeEraWorldSave(world) === before).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      llmScheduler.resetTickBudget();
    }
  });
});
