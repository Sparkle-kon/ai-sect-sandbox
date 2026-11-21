import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableGuardianActions, householdCensus, visibleHouseholds } from '../src/engine/householdEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture' };
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '按实际世界状态调息' };
const action = <T extends Pick<LLMDecisionPayload, 'guardianMove'>>(args: T): LLMDecisionPayload =>
  ({ ...args, chosenAction: 'HOUSEHOLD_GUARDIAN', innerMonologue: '自愿互助，不改变血缘或宗籍' });
afterEach(() => vi.unstubAllGlobals());

describe('actual long-world household and separate consensual guardianship', () => {
  it('binds one actual recruit to their existing household and closes consent after a real in-game death without recounting mortals', async () => {
    const world = createInitialWorld(9);
    world.tick = 8; world.month = 8;
    const sponsor = world.cultivators[0];
    const village = world.settlements.villages.find(({ locationId }) => locationId === 'loc-market')!;
    sponsor.qiProgress = 20; sponsor.locationId = village.locationId;
    const before = householdCensus(world, village.id)!;
    const startingActors = world.cultivators.length;
    const recruit = computeHeuristicDecision(sponsor, world, () => .99);
    expect(recruit.chosenAction).toBe('RECRUIT_SETTLER');
    const personId = recruit.targetVolunteerId!;
    const original = world.households.members.find(({ volunteerId }) => volunteerId === personId)!;
    expect(original.status).toBe('resident');
    const forced: Record<string, LLMDecisionPayload> = Object.fromEntries(world.cultivators.map(({ id }) => [id, rest]));
    forced[sponsor.id] = recruit;
    const next = advanceWorldTick(world, forced, () => .99);
    expect(next.cultivators).toHaveLength(startingActors + 1);
    const after = householdCensus(next, village.id)!;
    expect(after.population).toBe(before.population - 1);
    expect(after.unassigned).toBe(0);
    const ward = next.cultivators.find(({ id }) => id === 'recruit-' + personId)!;
    const guardian = next.cultivators.find(({ id }) => id === sponsor.id)!;
    const onlook = next.cultivators.find(({ id }) => id !== guardian.id && id !== ward.id)!;
    const linked = next.households.members.find(({ volunteerId }) => volunteerId === personId)!;
    expect(linked).toMatchObject({ status: 'recruited', householdId: original.householdId, recruitedId: ward.id });
    const unchangedRank = ward.sectRank;
    const pendingOffer = availableGuardianActions(guardian, next).find(({ targetCultivatorId }) => targetCultivatorId === ward.id)!;
    expect(pendingOffer).toBeDefined();
    const response = (decision: LLMDecisionPayload) =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(decision) } }] }));
    const request = vi.fn(async () => response(action({ guardianMove: 'offer', targetCultivatorId: onlook.id })));
    vi.stubGlobal('fetch', request);
    const sources = vi.fn();
    const invalid = await queryCultivatorLLMDecision(guardian, next, config, sources);
    expect(sources).toHaveBeenLastCalledWith('utility');
    expect(invalid.targetCultivatorId).not.toBe(onlook.id);
    request.mockImplementation(async () => response(action(pendingOffer)));
    const valid = await queryCultivatorLLMDecision(guardian, next, config, sources);
    expect(sources).toHaveBeenLastCalledWith('llm');
    expect(applyCultivatorBrainDecision(next, guardian, valid, () => .99)?.witnessScope).toBe('participants');
    next.tick++;
    const consent = computeHeuristicDecision(ward, next, () => .99);
    expect(consent).toMatchObject({ chosenAction: 'HOUSEHOLD_GUARDIAN', guardianMove: 'accept' });
    expect(applyCultivatorBrainDecision(next, ward, consent, () => .99)?.witnessScope).toBe('participants');
    expect(ward.sectRank).toBe(unchangedRank);
    expect(visibleHouseholds(next, ward).guardianContracts[0]).toMatchObject({ status: 'active' });
    expect(visibleHouseholds(next, onlook).guardianContracts).toEqual([]);
    expect(next.cultivators).toHaveLength(startingActors + 1);
    expect(householdCensus(next, village.id)).toEqual(after);
    expect(decodeWorldSave(encodeWorldSave(next)).households).toEqual(next.households);

    guardian.hp = 1;
    const place = next.locations.find(({ id }) => id === village.locationId)!;
    const hit = applyMapBrush(next, 'meteor', [place]);
    expect(hit.cultivators.find(({ id }) => id === guardian.id)?.alive).toBe(false);
    expect(hit.households.guardianships[0]).toMatchObject({ status: 'ended', endReason: 'death' });
    expect(householdCensus(hit, village.id)?.population).toBe(after.population);
    const incompatible = structuredClone(hit);
    incompatible.households.groups.find(({ originSettlementId }) => originSettlementId === village.id)!.presences[0].adults += 10_000;
    expect(() => encodeWorldSave(incompatible)).toThrow(/households.population_budget/);
  });

  it('partitions the recorded mortal totals of an older save without adding anyone or guessing a birth parent', () => {
    const world = createInitialWorld(44);
    const { households: _atBirth, ...old } = world;
    const parsed = decodeWorldSave(JSON.stringify({ format: 'ai-sect-sandbox', version: 1, world: old }));
    expect(parsed.households.groups).toHaveLength(world.settlements.villages.length * 2);
    expect(parsed.cultivators.map(({ id }) => id)).toEqual(world.cultivators.map(({ id }) => id));
    for (const village of parsed.settlements.villages) {
      const grouped = householdCensus(parsed, village.id)!;
      expect(grouped.population).toBe(village.population);
      expect(grouped.adults + grouped.juveniles + grouped.namedResidents + grouped.unassigned).toBe(village.population);
    }
  });
});
