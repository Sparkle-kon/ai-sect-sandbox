import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { sectRelation } from '../src/engine/diplomacyEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { activeSanctuaryPass, advanceSanctuaries, SANCTUARY_BLOCK_HP, SANCTUARY_FOUND_COST, SANCTUARY_MAX_SHIELD } from '../src/engine/sanctuaryEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture' };
afterEach(() => vi.unstubAllGlobals());

function place() {
  const world = createInitialWorld(19);
  world.tick = 23;
  world.month = 4;
  const [steward, challenger, , visitor] = world.cultivators;
  const market = world.locations.find(({ id }) => id === 'loc-market')!;
  const sect = world.sects.find(({ id }) => id === steward.sectId)!;
  steward.locationId = market.id;
  world.relationships = [];
  steward.hp = steward.maxHp;
  steward.qiProgress = 15;
  steward.techniqueMastery = 20;
  visitor.hp = Math.ceil(visitor.maxHp * .35);
  visitor.transgressions = 0;
  const pact = sectRelation(world, steward.sectId, visitor.sectId)!;
  pact.affinity = -65; pact.pact = 'war';
  return { world, market, sect, steward, visitor, challenger };
}

describe('sanctuary at the actual combat and movement gates', () => {
  it('uses both brains for funded site rights and consumes finite protection before any real duel damage', async () => {
    const { world, market, sect, steward, visitor, challenger } = place();
    const balance = sect.spiritStones;
    const a = computeHeuristicDecision(steward, world, () => .99);
    expect(a).toMatchObject({ chosenAction: 'SANCTUARY', sanctuaryMove: 'found', targetLocationId: market.id });
    const mocked = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(a) } }] })));
    vi.stubGlobal('fetch', mocked);
    const source = vi.fn();
    const model = await queryCultivatorLLMDecision(steward, world, config, source);
    expect(source).toHaveBeenCalledWith('llm');
    expect(model).toMatchObject({ chosenAction: 'SANCTUARY', sanctuaryMove: 'found', targetLocationId: market.id });
    expect(applyCultivatorBrainDecision(world, steward, model, () => .99)).not.toBeNull();
    const charter = world.sanctuary.charters[0];
    expect(sect.spiritStones).toBe(balance - SANCTUARY_FOUND_COST);
    expect(charter.shieldHp).toBe(SANCTUARY_MAX_SHIELD);
    const offsite = visitor.locationId;
    const pass = computeHeuristicDecision(visitor, world, () => .99);
    expect(pass).toMatchObject({ chosenAction: 'SANCTUARY', sanctuaryMove: 'take_pass', targetSanctuaryId: charter.id });
    expect(applyCultivatorBrainDecision(world, visitor, pass, () => .99)).not.toBeNull();
    expect(visitor.locationId).toBe(offsite);
    expect(sectRelation(world, steward.sectId, visitor.sectId)?.pact).toBe('war');
    const travel = computeHeuristicDecision(visitor, world, () => .99);
    expect(travel).toMatchObject({ chosenAction: 'EXPLORE', targetLocationId: market.id });
    applyCultivatorBrainDecision(world, visitor, travel, () => .99);
    expect(visitor.locationId).toBe(market.id);

    visitor.hp = visitor.maxHp;
    challenger.locationId = market.id;
    challenger.combatPower = visitor.combatPower * 3;
    const attack = { chosenAction: 'DUEL', targetCultivatorId: visitor.id, innerMonologue: '蓄意违站规' } satisfies LLMDecisionPayload;
    const unaffected = visitor.hp;
    const noRoll = vi.fn(() => .01);
    for (let i = 0; i < SANCTUARY_MAX_SHIELD / SANCTUARY_BLOCK_HP; i++) {
      world.tick++;
      const blocked = applyCultivatorBrainDecision(world, challenger, attack, noRoll);
      expect(blocked?.id).toBe(world.sanctuary.incidents.at(-1)?.sourceEventId);
      expect(visitor.hp).toBe(unaffected);
    }
    expect(noRoll).not.toHaveBeenCalled();
    expect(charter.shieldHp).toBe(0);
    expect(activeSanctuaryPass(world, visitor)).toBeDefined();
    world.tick++;
    const side = vi.fn();
    const clash = applyCultivatorBrainDecision(world, challenger, attack, () => .01, undefined, side);
    expect(clash?.damage?.some(({ cultivatorId }) => cultivatorId === visitor.id)).toBe(true);
    expect(side).toHaveBeenCalledWith(expect.objectContaining({ id: world.sanctuary.incidents.at(-1)?.sourceEventId }));
    expect(world.sanctuary.incidents.at(-1)?.kind).toBe('exhausted');
    expect(visitor.hp).toBeLessThan(unaffected);
    const loaded = decodeWorldSave(encodeWorldSave(world));
    expect(loaded.sanctuary).toEqual(world.sanctuary);
    expect(loaded.sanctuary.passes[0].status).toBe('active');
    loaded.tick = loaded.sanctuary.passes[0].expiresTick;
    advanceSanctuaries(loaded);
    expect(loaded.sanctuary.passes[0]).toMatchObject({ status: 'ended', endReason: 'expiry' });
  });

  it('loads older worlds without granting access or inventing site budgets', () => {
    const { world } = place();
    const { sanctuary, ...legacy } = world;
    const loaded = decodeWorldSave(JSON.stringify({ format: 'ai-sect-sandbox', version: 1, world: legacy }));
    expect(loaded.sanctuary).toEqual(sanctuary);
    expect(loaded.sects).toEqual(world.sects);
  });
});
