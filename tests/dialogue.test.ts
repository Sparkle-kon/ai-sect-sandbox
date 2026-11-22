import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { applyDialogueLanguage, enrichTickDialogues, scriptedDialogue } from '../src/engine/dialogueEngine';
import { ARTIFACT_TRADE_PRICE, availableEncounters } from '../src/engine/encounterEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import { personaLine } from '../src/engine/wildPersonaEngine';
import type { ActionType, LLMConfig } from '../src/types/world';

afterEach(() => vi.unstubAllGlobals());
const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://example.invalid', apiKey: 'test', model: 'fixture' };

function meeting() {
  const world = createInitialWorld();
  const [actor, , target] = world.cultivators;
  const market = world.locations.find((place) => place.type === 'market');
  if (!market) throw new Error('fixture has no market');
  actor.locationId = target.locationId = market.id;
  world.cultivators = [actor, target];
  world.relationships = [{ fromId: actor.id, toId: target.id, type: '挚友', affinity: 70, note: '' }];
  const perform = (chosenAction: ActionType) => applyCultivatorBrainDecision(
    world, actor, { chosenAction, targetCultivatorId: target.id, innerMonologue: '观其来意' }, () => 0.1
  );
  return { world, actor, target, perform };
}

describe('dialogues and encounters', () => {
  it('records a combat transcript with the actual winner and two speakers', () => {
    const { actor, target, perform } = meeting();
    actor.combatPower = 10_000;
    const event = perform('DUEL');
    expect(event?.dialogue?.kind).toBe('combat');
    expect(event?.dialogue?.turns.map((turn) => turn.speakerId)).toEqual([actor.id, target.id, actor.id]);
    expect(event?.dialogue?.turns[2].text).toContain(`${actor.name}占得上风`);
  });

  it('only an exact dead participant can supply the spoken native farewell; explicit openings cannot rewrite it', () => {
    const { world, actor, target } = meeting();
    const closing = `${target.name}胜出，${actor.name}当场陨落。`;
    expect(scriptedDialogue('combat',actor,target,closing,undefined,actor).turns).toHaveLength(3);
    actor.alive=false;
    actor.hp=0;
    expect(scriptedDialogue('combat',actor,target,closing,undefined,{...actor}).turns).toHaveLength(3);
    const authored=scriptedDialogue('combat',actor,target,closing,'原来是你。',actor);
    expect(authored.turns.map(({speakerId})=>speakerId)).toEqual([actor.id,target.id,actor.id,actor.id]);
    expect(authored.turns[2].text).toBe(personaLine(actor,'farewell'));
    const id=`evt-${world.tick}-${actor.id}-kill`;
    const events=[{ id,tick:world.tick,year:world.year,month:world.month,title:closing,description:closing,
      category:'death' as const,actorIds:[actor.id,target.id],locationId:actor.locationId,dialogue:authored }];
    const approved=['先让一步。','容我问清。'];
    const changed=applyDialogueLanguage(events,[id],{exchanges:[{id,lines:approved}]});
    expect(changed[0].dialogue?.turns.slice(0,2).map(({text})=>text)).toEqual(approved);
    expect(changed[0].dialogue?.turns.slice(2)).toEqual(authored.turns.slice(2));
    expect(applyDialogueLanguage(events,[id],{exchanges:[{id,lines:[...approved,'假托遗言。']}]})).toBe(events);
    const privateOnly=events.map(event=>({...event,witnessScope:'participants' as const}));
    expect(applyDialogueLanguage(privateOnly,[id],{exchanges:[{id,lines:approved}]})).toBe(privateOnly);
  });

  it('executes real trades and conserves stones and artifacts, with deterministic Utility initiation', () => {
    const { world, actor, target, perform } = meeting();
    world.tick = 4;
    const artifact = target.artifacts[1];
    const wealth = actor.spiritStones + target.spiritStones;
    const originalBuyerStones = actor.spiritStones;
    expect(computeHeuristicDecision(actor, world, () => 0.9)).toMatchObject({ chosenAction: 'TRADE', targetCultivatorId: target.id });
    expect(perform('TRADE')?.dialogue?.kind).toBe('trade');
    expect(actor.spiritStones).toBe(originalBuyerStones - ARTIFACT_TRADE_PRICE);
    expect(actor.spiritStones + target.spiritStones).toBe(wealth);
    expect(actor.artifacts.some((item) => item.id === artifact.id)).toBe(true);
    expect(target.artifacts).not.toContain(artifact);
    expect(perform('TRADE')).toBeNull();
  });

  it('allows mutual cultivation only when compatible and pays both sides exactly once per encounter', () => {
    const { world, actor, target, perform } = meeting();
    actor.qiProgress = target.qiProgress = 40;
    world.relationships[0].affinity = 5;
    expect(perform('DUAL_CULTIVATE')).toBeNull();
    world.relationships[0].affinity = 79;
    expect(perform('DUAL_CULTIVATE')?.dialogue?.kind).toBe('dual_cultivation');
    expect([actor.qiProgress, target.qiProgress]).toEqual([52, 52]);
    expect(actor.memories.some((entry) => entry.content.includes('自愿同修'))).toBe(true);
  });

  it('uses local diplomatic meetings to spend each treasury and award reputation without forming an alliance', () => {
    const { world, actor, target, perform } = meeting();
    const first = world.sects.find((sect) => sect.id === actor.sectId);
    const second = world.sects.find((sect) => sect.id === target.sectId);
    if (!first || !second) throw new Error('fixture actors must have sects');
    const oldStones = first.spiritStones + second.spiritStones;
    const oldReputation = first.reputation + second.reputation;
    const result = perform('SECT_DIPLOMACY');
    expect(result?.dialogue?.kind).toBe('sect_diplomacy');
    expect(result?.description).toContain('未签盟约');
    expect(first.spiritStones + second.spiritStones).toBe(oldStones - 60);
    expect(first.reputation + second.reputation).toBe(oldReputation + 4);
    target.locationId = 'loc-secret-1';
    expect(availableEncounters(actor, world)).toHaveLength(0);
    expect(perform('SECT_DIPLOMACY')).toBeNull();
  });

  it('validates the JSON encounter and only rewrites permitted dialogue opening lines', async () => {
    const { world, actor, target } = meeting();
    const mockAction = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        chosenAction: 'TRADE', targetCultivatorId: target.id, innerMonologue: 42, spokenLine: 123,
      }) } }],
    })));
    vi.stubGlobal('fetch', mockAction);
    const proposed = await queryCultivatorLLMDecision(actor, world, config);
    expect(proposed).toMatchObject({ chosenAction: 'TRADE', spokenLine: undefined });
    const next = advanceWorldTick(world, {
      [actor.id]: proposed,
      [target.id]: { chosenAction: 'REST', innerMonologue: '整衣' },
    }, () => 0.5);
    const event = next.events[0];
    const id = event.id;
    const approved: string[] = [];
    const llm = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const request: { messages: { role: string; content: string }[] } = JSON.parse(String(init?.body));
      const scope: { id: string; slots: { slot: number; speakerId: string; options: { id: string; text: string }[] }[] }[] =
        JSON.parse(request.messages.find(message => message.role === 'user')!.content);
      expect(scope.map(menu => menu.id)).toEqual([id]);
      expect(JSON.stringify(scope)).not.toContain(event.description);
      const choices = scope[0].slots.map(({slot,speakerId,options}) => {
        const chosen = options.find(option => option.text !== event.dialogue!.turns[slot - 1].text);
        if (!chosen) throw Error('expected actual alternative authored line');
        approved.push(chosen.text);
        return {slot,speakerId,optionId:chosen.id};
      });
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ exchanges: [{ id, choices }] }) } }],
      }));
    });
    vi.stubGlobal('fetch', llm);
    const enriched = await enrichTickDialogues(next, config);
    expect(llm).toHaveBeenCalledTimes(1);
    expect(enriched.events[0]).toMatchObject({ description: event.description, dialogue: { source: 'llm' } });
    expect(enriched.events[0].dialogue?.turns.slice(0, 2).map(turn => turn.text)).toEqual(approved);
    expect(enriched.events[0].dialogue?.turns[2]).toEqual(event.dialogue?.turns[2]);
    expect(enriched.cultivators).toBe(next.cultivators);
    expect(applyDialogueLanguage(next.events, [id], {
      exchanges: [{ id: 'other', lines: ['无关之事。', '是。'] }],
    })).toBe(next.events);
  });
});
