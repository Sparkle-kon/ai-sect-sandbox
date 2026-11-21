import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { advanceSettlements, availableSettlementActions, resolveSettlementAction, SETTLEMENT_RECRUIT_STIPEND } from '../src/engine/settlementEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture' };
const rest = (world: WorldState): Record<string, LLMDecisionPayload> => Object.fromEntries(
  world.cultivators.map(({ id }) => [id, { chosenAction: 'REST', innerMonologue: '调息' }]));
afterEach(() => vi.unstubAllGlobals());

describe('reincarnation through the actual engines', () => {
  it('uses a canonical old-age death, ordinary mature recruitment and the same private choice in both brains', async () => {
    const initial = createInitialWorld(6); // fixed seed with a successful canonical npc-1 death trial at tick 13
    initial.tick = 12;
    initial.month = 12;
    const original = initial.cultivators[0];
    original.age = original.lifespan - 1;
    const dead = advanceWorldTick(initial, rest(initial), () => .99);
    const death = dead.events.find(({ actorIds, category }) => category === 'death' && actorIds.includes(original.id))!;
    expect(death).toBeDefined();
    const waiting = dead.reincarnation.cases.find(({ deceasedId }) => deceasedId === original.id)!;
    expect(waiting).toMatchObject({ status: 'awaiting_birth', deathTick: 13, deathEventId: death.id });

    dead.tick = 25;
    dead.year++;
    dead.month = 1;
    dead.settlements.villages.forEach((village) => { village.stress = 0; });
    advanceSettlements(dead);
    expect(waiting).toMatchObject({ status: 'reserved', birthTick: 25, maturesTick: 241, birthSlot: 0 });
    const recorded = decodeWorldSave(encodeWorldSave(dead));
    expect(recorded.reincarnation).toEqual(dead.reincarnation);

    recorded.tick = waiting.maturesTick!;
    recorded.year += 18;
    const village = recorded.settlements.villages.find(({ id }) => id === waiting.settlementId)!;
    const adult = recorded.reincarnation.cases.find(({ deceasedId }) => deceasedId === original.id)!;
    advanceSettlements(recorded);
    const volunteer = village.volunteers.find(({ id }) => id === adult.volunteerId)!;
    expect(volunteer?.age).toBe(18);
    const sponsor = recorded.cultivators.find(({ alive, sectRank }) => alive && sectRank === '长老')!;
    sponsor.locationId = village.locationId;
    const sponsorSect = recorded.sects.find(({ id }) => id === sponsor.sectId)!;
    const beforeStones = sponsorSect.spiritStones;
    const beforePopulation = village.population;
    expect(availableSettlementActions(sponsor, recorded).some((option) => option.action === 'RECRUIT_SETTLER' &&
      option.targetVolunteerId === volunteer.id)).toBe(true);
    expect(resolveSettlementAction(recorded, sponsor, { chosenAction: 'RECRUIT_SETTLER', targetSettlementId: village.id,
      targetVolunteerId: volunteer.id, innerMonologue: '只依实有志愿者' })).not.toBeNull();
    expect(sponsorSect.spiritStones).toBe(beforeStones - SETTLEMENT_RECRUIT_STIPEND);
    expect(village.population).toBe(beforePopulation - 1);
    const actual = recorded.cultivators.find(({ id }) => id === adult.newActorId)!;
    expect(actual).toMatchObject({ age: 18, realm: '练气', sectRank: '外门弟子', spiritStones: SETTLEMENT_RECRUIT_STIPEND, artifacts: [] });
    actual.personality = '逍遥';
    const local = computeHeuristicDecision(actual, recorded, () => .99);
    expect(local).toMatchObject({ chosenAction: 'RECOLLECT', recollectionMove: 'consider' });
    let body = '';
    const request = vi.fn(async (_url: unknown, init?: RequestInit) => {
      body = String(init?.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(local) } }] }));
    });
    vi.stubGlobal('fetch', request);
    const source = vi.fn();
    const model = await queryCultivatorLLMDecision(actual, recorded, config, source);
    expect(source).toHaveBeenCalledWith('llm');
    expect(model).toMatchObject({ chosenAction: 'RECOLLECT', recollectionMove: 'consider' });
    expect(body).toContain('自身残响仅为未证实');
    expect(body).not.toContain(death.id);
    expect(body).not.toContain(waiting.id);
    const next = advanceWorldTick(recorded, { ...rest(recorded), [actual.id]: model }, () => .99);
    expect(next.reincarnation.echoes.find(({ actorId }) => actorId === actual.id)?.status).toBe('considered');
    expect(next.events.find(({ id }) => id.includes('-recollection-'))?.witnessScope).toBe('participants');
    expect(decodeWorldSave(encodeWorldSave(next)).reincarnation).toEqual(next.reincarnation);
  });

  it('captures a real terrain-intervention death and migrates legacy saves without inventing proofs', () => {
    const initial = createInitialWorld(8);
    const actor = initial.cultivators[0];
    actor.hp = 1;
    const location = initial.locations.find(({ id }) => id === actor.locationId)!;
    const struck = applyMapBrush(initial, 'meteor', [location]);
    const recorded = struck.reincarnation.cases.filter(({ deceasedId }) => deceasedId === actor.id);
    expect(recorded).toHaveLength(1);
    const repeat = applyMapBrush(struck, 'meteor', [location]);
    expect(repeat.reincarnation.cases.filter(({ deceasedId }) => deceasedId === actor.id)).toEqual(recorded);
    const { reincarnation: empty, ...legacy } = initial;
    const loaded = decodeWorldSave(JSON.stringify({ world: legacy, format: 'ai-sect-sandbox', version: 1 }));
    expect(loaded.reincarnation).toEqual(empty);
  });
});
