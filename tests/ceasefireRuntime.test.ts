import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceCeasefires, activeCeasefireBetween } from '../src/engine/ceasefireEngine';
import { availableDiplomacyActions, sectRelation } from '../src/engine/diplomacyEngine';
import { queryCultivatorLLMDecision, utilityCeasefireDecision } from '../src/engine/llmBrain';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture' };
const idle = (world: WorldState): Record<string, LLMDecisionPayload> => Object.fromEntries(
  world.cultivators.map(({ id }) => [id, { chosenAction: 'REST', innerMonologue: '静候' }]));
afterEach(() => vi.unstubAllGlobals());

function conflictFixture() {
  const world = createInitialWorld(45);
  world.tick = 16; world.month = 4;
  const [attackers, defenders] = world.sects;
  const commander = world.cultivators.find(({ id }) => id === attackers.leaderId)!;
  const defender = world.cultivators.find(({ id }) => id === defenders.leaderId)!;
  const row = sectRelation(world, attackers.id, defenders.id)!;
  row.pact = 'war'; row.affinity = -80; row.sinceTick = 1;
  defenders.facilities.defense_array = 2;
  defenders.arrayMaxHp = 400;
  defenders.arrayHp = 40;
  commander.locationId = defender.locationId = defenders.headquartersId;
  commander.personality = defender.personality = '刚正';
  commander.qiProgress = defender.qiProgress = 0;
  const fighters = world.cultivators.filter(({ sectId }) => sectId === attackers.id).map(({ id }) => id);
  const siege = { id: 'actual-field-campaign', attackerSectId: attackers.id, defenderSectId: defenders.id,
    destinationId: defenders.headquartersId, participantIds: fighters, status: 'sieging' as const,
    startedTick: 10, rounds: 2, lastResolvedTick: 15 };
  world.sieges.push(siege);
  return { world, attackers, defenders, commander, defender, siege };
}

describe('bilateral ceasefire through live settlement', () => {
  it('accepts a validated model action from a deployed leader and withdraws the real campaign before combat', async () => {
    const { world, attackers, defenders, commander, defender, siege } = conflictFixture();
    const suggest = utilityCeasefireDecision(defender, world);
    expect(suggest).toMatchObject({ chosenAction: 'CEASEFIRE', ceasefireMove: 'offer', targetSectId: attackers.id });
    expect(applyCultivatorBrainDecision(world, defender, suggest!, () => .99)).not.toBeNull();
    const terms = world.ceasefires.agreements[0];
    const reply = utilityCeasefireDecision(commander, world);
    expect(reply).toMatchObject({ chosenAction: 'CEASEFIRE', ceasefireMove: 'accept', targetCeasefireId: terms.id });
    const request = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] })));
    vi.stubGlobal('fetch', request);
    const source = vi.fn();
    const modelReply = await queryCultivatorLLMDecision(commander, world, config, source);
    expect(source).toHaveBeenCalledWith('llm');
    expect(modelReply).toMatchObject({ chosenAction: 'CEASEFIRE', ceasefireMove: 'accept', targetCeasefireId: terms.id });

    const signed = advanceWorldTick(world, { ...idle(world), [commander.id]: modelReply }, () => .99);
    const signedByUtility = advanceWorldTick(world, undefined, () => .99);
    expect(signedByUtility.sieges.find(({ id }) => id === siege.id)?.status).toBe('withdrawn');
    expect(signedByUtility.ceasefires.agreements[0]).toEqual(signed.ceasefires.agreements[0]);
    expect(signed.cultivators.filter(({ id }) => siege.participantIds.includes(id)).every(({ alive }) => alive)).toBe(true);
    const agreement = activeCeasefireBetween(signed, attackers.id, defenders.id)!;
    expect(agreement).toMatchObject({ status: 'active', withdrawnSiegeIds: [siege.id], escrow: { proposerBond: 60, targetBond: 60 } });
    expect(signed.sieges.find(({ id }) => id === siege.id)?.status).toBe('withdrawn');
    expect(signed.cultivators.find(({ id }) => id === commander.id)?.locationId).toBe(attackers.headquartersId);
    expect(sectRelation(signed, attackers.id, defenders.id)?.pact).toBe('neutral');
    const actualCommander = signed.cultivators.find(({ id }) => id === commander.id)!;
    expect(availableDiplomacyActions(actualCommander, signed).some((action) =>
      action.targetSectId === defenders.id && ['DECLARE_WAR', 'LAUNCH_SIEGE', 'DEMAND_TRIBUTE'].includes(action.action))).toBe(false);

    const restored = decodeWorldSave(encodeWorldSave(signed));
    const reopened = restored.ceasefires.agreements[0];
    restored.tick += 3;
    const receiver = restored.sects.find(({ id }) => id === reopened.terms.aidRecipientSectId)!;
    const receiverBefore = receiver.spiritStones;
    advanceCeasefires(restored);
    expect(receiver.spiritStones).toBe(receiverBefore + reopened.terms.aidAmount);
    expect(reopened.escrow.aid).toBe(0);
    expect(advanceCeasefires(restored)).toEqual([]);
    expect(receiver.spiritStones).toBe(receiverBefore + reopened.terms.aidAmount);
    expect(decodeWorldSave(encodeWorldSave(restored)).ceasefires).toEqual(restored.ceasefires);

    const aggressor = restored.cultivators.find(({ id }) => id === commander.id)!;
    const opponent = restored.cultivators.find(({ id }) => id === defender.id)!;
    aggressor.locationId = opponent.locationId;
    aggressor.combatPower = opponent.combatPower * 3;
    const attack = { chosenAction: 'DUEL', targetCultivatorId: opponent.id, innerMonologue: '明知停战仍发动攻击' } satisfies LLMDecisionPayload;
    const breached = advanceWorldTick(restored, { ...idle(restored), [aggressor.id]: attack }, () => .99);
    const outcome = breached.ceasefires.agreements.find(({ id }) => id === reopened.id)!;
    expect(outcome).toMatchObject({ status: 'breached', breach: { offenderSectId: aggressor.sectId, kind: 'hostile_damage', forfeitedBond: 60 } });
    expect(sectRelation(breached, attackers.id, defenders.id)?.pact).toBe('war');
    expect(decodeWorldSave(encodeWorldSave(breached)).ceasefires).toEqual(breached.ceasefires);
  });

  it('migrates old saves without signing on behalf of either faction or creating funds', () => {
    const { world } = conflictFixture();
    const { ceasefires, ...legacy } = world;
    const loaded = decodeWorldSave(JSON.stringify({ format: 'ai-sect-sandbox', version: 1, world: legacy }));
    expect(loaded.ceasefires).toEqual(ceasefires);
    expect(loaded.sects).toEqual(world.sects);
    expect(loaded.sieges).toEqual(world.sieges);
  });
});
