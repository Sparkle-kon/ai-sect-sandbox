import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { createOathState } from '../src/engine/oathEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import type { LLMConfig } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'test-key', model: 'fixture-model' };
afterEach(() => vi.unstubAllGlobals());

describe('contract outcomes across both AI paths', () => {
  it('passes a legal model offer into escrow and allows deterministic delivery with real stock', async () => {
    const world = createInitialWorld();
    const [requester, provider] = [world.cultivators[0], world.cultivators[4]];
    provider.locationId = requester.locationId;
    provider.personality = '刚正';
    provider.qiProgress = 20;
    provider.herbs.jade_leaf = 6;
    const fetched = vi.fn(async (_url: string, init: RequestInit) => {
      expect(String(init.body)).toContain('jade_herb');
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ chosenAction: 'OFFER_OATH',
          targetCultivatorId: provider.id, oathTerm: 'jade_herb', innerMonologue: '约取三叶' }) } }],
      }));
    });
    vi.stubGlobal('fetch', fetched);
    const offer = await queryCultivatorLLMDecision(requester, world, config);
    expect(offer).toMatchObject({ chosenAction: 'OFFER_OATH', oathTerm: 'jade_herb' });
    expect(applyCultivatorBrainDecision(world, requester, offer)).not.toBeNull();
    const signer = computeHeuristicDecision(provider, world, () => .9);
    expect(signer.chosenAction).toBe('ACCEPT_OATH');
    expect(applyCultivatorBrainDecision(world, provider, signer)).not.toBeNull();
    const delivery = computeHeuristicDecision(provider, world, () => .9);
    expect(delivery.chosenAction).toBe('FULFILL_OATH');
    const held = world.oaths.contracts[0].escrow;
    const coinsBefore = requester.spiritStones + provider.spiritStones + held.payment + held.collateral;
    expect(applyCultivatorBrainDecision(world, provider, delivery)).not.toBeNull();
    expect(world.oaths.contracts[0].status).toBe('fulfilled');
    expect(requester.spiritStones + provider.spiritStones).toBe(coinsBefore);
    expect(requester.herbs.jade_leaf).toBe(3);
    expect(provider.herbs.jade_leaf).toBe(3);
    expect(decodeWorldSave(encodeWorldSave(world)).oaths).toEqual(world.oaths);
    const recorded = world.resourceFlow.months[0].entries.filter(({ mechanism }) => mechanism === 'oath');
    expect(recorded).toHaveLength(5);
    expect(recorded.map(({ reason, good, amount }) => [reason, good, amount])).toEqual([
      ['oath_funded', 'stone', held.payment], ['oath_funded', 'stone', held.collateral], ['oath_goods', 'jade_leaf', 3],
      ['oath_paid', 'stone', held.payment], ['oath_refunded', 'stone', held.collateral],
    ]);
    expect(recorded.every(({ kind }) => kind === 'transfer')).toBe(true);
    expect(applyCultivatorBrainDecision(world, provider, delivery)).toBeNull();
    expect(world.resourceFlow.months[0].entries.filter(({ mechanism }) => mechanism === 'oath')).toHaveLength(5);
  });

  it('migrates an old version-one save without inventing outstanding payments', () => {
    const { oaths: _oaths, ...previous } = createInitialWorld();
    expect(decodeWorldSave(JSON.stringify({ format: 'ai-sect-sandbox', version: 1, world: previous })).oaths).toEqual(createOathState());
  });
});
