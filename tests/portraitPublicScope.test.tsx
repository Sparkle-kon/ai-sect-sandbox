import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CultivatorPortrait } from '../src/components/CultivatorPortrait';
import { projectCultivatorPortrait } from '../src/components/cultivatorPortraitModel';
import { createInitialWorld } from '../src/data/initialWorld';
import { enrichTickDialogues } from '../src/engine/dialogueEngine';
import { queryCultivatorLLMDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import type { LLMConfig, WorldState } from '../src/types/world';
import { publicDialogueProofFixture } from './fixtures/publicDialogueFixture';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://portrait-no-network.invalid/v1', apiKey: 'mock', model: 'mock' };
const producerResponse = (reply: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }));
const person = (world: WorldState, id: string) => world.cultivators.find(actor => actor.id === id)!;
const snapshot = (world: WorldState) => JSON.stringify(world);
const theatreMenus = (input: string) => JSON.parse(input) as readonly {
  id: string; slots: readonly { slot: number; speakerId: string; options: readonly { id: string }[] }[];
}[];

afterEach(() => {
  vi.unstubAllGlobals();
  llmScheduler.resetTickBudget();
});

describe('the native fictional portrait is a local presentation, not provider context', () => {
  it('changes SVG for an explicit display-only descriptor but leaves Cognitive and verified public-dialogue HTTP bodies byte-identical', async () => {
    const plain = createInitialWorld(7631);
    const namedId = plain.cultivators[0].id;
    for (const actor of plain.cultivators) delete actor.gender; // Legacy absence is legitimate and renders neutrally.
    const styled = structuredClone(plain);
    for (const [i, actor] of styled.cultivators.entries()) actor.gender = i % 2 ? 'man' : 'woman';
    const before = snapshot(styled);
    const localPortrait = (world: WorldState) => {
      const portrait = projectCultivatorPortrait(world, person(world, namedId));
      expect(portrait).toBeDefined();
      return renderToStaticMarkup(<CultivatorPortrait portrait={portrait!} />);
    };
    const artwork = localPortrait(styled);
    expect(artwork).toContain('data-cultivator-portrait');
    expect(artwork).toContain('aria-hidden="true"');
    expect(artwork).not.toBe(localPortrait(plain));
    expect(artwork).not.toContain(person(styled, namedId).secretGoal);
    expect(snapshot(styled)).toBe(before);

    const bytes: string[] = [];
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(typeof init?.body).toBe('string');
      const raw = String(init?.body);
      bytes.push(raw);
      const content = (JSON.parse(raw) as { messages: { content: string }[] }).messages[1].content;
      if (!content.startsWith('[')) return producerResponse({ chosenAction: 'REST', innerMonologue: '在此调息。' });
      const [exchange] = theatreMenus(content);
      return producerResponse({ exchanges: [{ id: exchange.id, choices: exchange.slots.map(slot =>
        ({ slot: slot.slot, speakerId: slot.speakerId, optionId: slot.options[0].id })) }] });
    });
    vi.stubGlobal('fetch', fetchMock);

    await queryCultivatorLLMDecision(person(styled, namedId), styled, { ...config, enabled: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localPortrait(styled)).toBe(artwork);
    for (const frame of [plain, styled]) {
      llmScheduler.resetTickBudget();
      const answer = await requestCultivatorLLMDecision(person(frame, namedId), frame, config, frame.tick + 1);
      expect(answer?.chosenAction).toBe('REST');
      expect(localPortrait(styled)).toBe(artwork);
    }
    expect(bytes).toHaveLength(2);
    expect(bytes[1]).toBe(bytes[0]);
    expect(bytes[1]).toContain(person(styled, namedId).name); // An actual actor-bound Cognitive request, not an empty stub.
    expect(snapshot(styled)).toBe(before);

    const { world: encounter, event } = publicDialogueProofFixture();
    for (const actor of encounter.cultivators) delete actor.gender;
    const withPortraits = structuredClone(encounter);
    for (const [i, actor] of withPortraits.cultivators.entries()) actor.gender = i % 2 ? 'woman' : 'man';
    for (const frame of [encounter, withPortraits]) {
      llmScheduler.resetTickBudget();
      await enrichTickDialogues(frame, config);
    }
    expect(bytes).toHaveLength(4);
    expect(bytes[3]).toBe(bytes[2]);
    expect(bytes[3]).toContain(event.id); // Verified real current public dialogue, not an invented provider path.
    for (const body of bytes) {
      expect(body).not.toMatch(/<svg|data-cultivator-portrait|data-portrait-halo|"(?:gender|portrait|palette|ageBand|halo)"\s*:/u);
      expect(body).not.toContain(artwork);
    }
  });
});
