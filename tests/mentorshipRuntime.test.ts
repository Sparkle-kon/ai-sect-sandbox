import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'test-not-secret', model: 'fixture-model' };
const rest = (world: WorldState): Record<string, LLMDecisionPayload> => Object.fromEntries(world.cultivators.map(({ id }) =>
  [id, { chosenAction: 'REST', innerMonologue: '静候师门' } satisfies LLMDecisionPayload]));
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld();
  const [mentor, student] = world.cultivators;
  mentor.techniqueMastery = 88;
  student.techniqueMastery = 10;
  student.personality = '刚正';
  mentor.qiProgress = student.qiProgress = 25;
  student.locationId = mentor.locationId;
  world.tick = 2;
  world.month = 2;
  return { world, mentor, student };
}

describe('mentorship integration and save compatibility', () => {
  it('uses a validated model offer and offline acceptance on the same engine', async () => {
    const { world, mentor, student } = fixture();
    const reply = vi.fn(async (_url: string, init: RequestInit) => {
      expect(String(init.body)).toContain('targetTuitionId');
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ chosenAction: 'TEACH', targetCultivatorId: student.id, innerMonologue: '本月传经' }) } }],
      }));
    });
    vi.stubGlobal('fetch', reply);
    const decision = await queryCultivatorLLMDecision(mentor, world, config);
    expect(decision).toMatchObject({ chosenAction: 'TEACH', targetCultivatorId: student.id });
    const offered = advanceWorldTick(world, { ...rest(world), [mentor.id]: decision }, () => .9);
    const apprentice = offered.cultivators.find(({ id }) => id === student.id)!;
    const choice = computeHeuristicDecision(apprentice, offered, () => .9);
    expect(choice).toMatchObject({ chosenAction: 'ACCEPT_TUITION', targetTuitionId: offered.mentorship.offers[0].id });
    const taught = advanceWorldTick(offered, { ...rest(offered), [student.id]: choice }, () => .9);
    expect(taught.mentorship.lineage).toHaveLength(1);
    expect(taught.cultivators.find(({ id }) => id === student.id)!.techniqueMastery).toBeGreaterThan(10);
    expect(taught.chronicleArchive.anchors.some(({ id }) => id.includes('tuition'))).toBe(false);
    expect(decodeWorldSave(encodeWorldSave(taught)).mentorship).toEqual(taught.mentorship);
  });

  it('migrates an earlier valid save without inventing teaching history', () => {
    const { world } = fixture();
    const { mentorship: _history, ...earlier } = world;
    expect(decodeWorldSave(JSON.stringify({ format: 'ai-sect-sandbox', version: 1, world: earlier })).mentorship)
      .toEqual({ offers: [], lineage: [], budgets: [] });
  });
});
