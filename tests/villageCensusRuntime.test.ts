import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { createHouseholdState, initializeHouseholds } from '../src/engine/householdEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { availableSettlementActions, MORTAL_MATURITY_TICKS } from '../src/engine/settlementEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { projectVillageCensus } from '../src/engine/villageCensusEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMDecisionPayload } from '../src/types/world';

const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '按真实统计核点。' };
const config = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'test-fixture', model: 'fixture' };
afterEach(() => vi.unstubAllGlobals());

describe('real village flows and separately dated observations', () => {
  it('reconciles actual birth, coming of age, movement, disaster and one person transferring to the roster', () => {
    let world = createInitialWorld(11521);
    world.tick = 230;
    world.month = 12;
    world.year = 1030;
    const home = world.locations.find(({ id }) => id === 'loc-market')!;
    const east = world.locations.find(({ id }) => id === 'loc-market-east')!;
    const local = world.settlements.villages.find(({ locationId }) => locationId === home.id)!;
    const northern = world.settlements.villages.find(({ locationId }) => locationId === 'loc-vein-north')!;
    const afflicted = world.settlements.villages.find(({ locationId }) => locationId === east.id)!;
    for (const village of world.settlements.villages) {
      village.stress = village === local ? 5 : village === northern ? 70 : 12;
      village.lastCohortYear = undefined;
    }
    local.juvenileCohorts = [{ bornTick: 231 - MORTAL_MATURITY_TICKS, count: 3 }];
    world.households = createHouseholdState();
    initializeHouseholds(world);
    const patron = world.cultivators.find(({ id }) => id === world.sects[0].leaderId)!;
    patron.locationId = home.id;
    patron.hp = patron.maxHp;
    world.sects[0].spiritStones = 900;
    const volunteer = local.volunteers.find((row) => row.age >= 18 && row.age < 47)!;
    volunteer.aptitude = volunteer.willingness = 99;
    const proposal = availableSettlementActions(patron, world).find((item) =>
      item.action === 'RECRUIT_SETTLER' && item.targetVolunteerId === volunteer.id)!;
    expect(proposal).toBeDefined();
    const initialPopulation = local.population;
    const initialCultivators = world.cultivators.length;
    world = applyMapBrush(world, 'meteor', [east]);
    const decisions = Object.fromEntries(world.cultivators.map(({ id }) => [id, rest]));
    decisions[patron.id] = { ...rest, ...proposal, chosenAction: 'RECRUIT_SETTLER' };
    world = advanceWorldTick(world, decisions, () => .99);
    const resident = world.settlements.villages.find(({ id }) => id === local.id)!;
    const nearObserver = world.cultivators.find(({ id }) => id === patron.id)!;
    const detail = projectVillageCensus(world, nearObserver, resident.id, world.tick)!;
    const month = world.villageCensuses.periods.at(-1)!;
    expect(detail.closed).toBe(true);
    expect(detail.opening).toMatchObject({ population: initialPopulation, juveniles: 3 });
    expect(detail).toMatchObject({ births: 3, matured: 3, incoming: 4, outgoing: 0, deaths: 0, enlisted: 1, unobservedCrossings: 4,
      residual: { population: 0, juveniles: 0 } });
    expect(resident.population).toBe(initialPopulation + 6);
    expect(detail.observed).toMatchObject({ population: resident.population, juveniles: 3 });
    expect(world.cultivators).toHaveLength(initialCultivators + 1);
    expect(world.cultivators.filter(({ id }) => id === `recruit-${volunteer.id}`)).toHaveLength(1);
    expect(month.movements.filter(({ kind, villageId }) => kind === 'migration' && villageId === northern.id)).toHaveLength(1);
    expect(month.movements.find(({ kind, villageId }) => kind === 'death' && villageId === afflicted.id)?.people).toBeGreaterThan(0);
    expect(projectVillageCensus(world, nearObserver, northern.id, world.tick)).toBeUndefined();
    expect(JSON.stringify(detail)).not.toContain(northern.id);
    const raw = encodeWorldSave(world);
    expect(decodeWorldSave(raw).villageCensuses).toEqual(world.villageCensuses);
    const altered = JSON.parse(raw) as { world: typeof world };
    const row = altered.world.villageCensuses.periods.at(-1)!.movements.find(({ kind }) => kind === 'enrollment')!;
    row.cultivatorId = 'wrong-person';
    expect(() => decodeWorldSave(JSON.stringify(altered))).toThrow('villageCensuses.movements.references');
  });

  it('allows both brains to authorize one actual on-site inspection, not remote or repeated counts', async () => {
    const world = createInitialWorld(11522);
    const observer = world.cultivators[0];
    world.tick = Array.from({ length: 17 }, (_, index) => index + 30).find((tick) =>
      (tick + observer.id.charCodeAt(observer.id.length - 1)) % 17 === 3)!;
    const village = world.settlements.villages.find(({ locationId }) => locationId === 'loc-market')!;
    observer.locationId = village.locationId;
    observer.personality = '刚正';
    observer.hp = observer.maxHp;
    const option = { ...rest, chosenAction: 'VILLAGE_CENSUS', targetSettlementId: village.id } satisfies LLMDecisionPayload;
    expect(computeHeuristicDecision(observer, world, () => .99)).toMatchObject({ chosenAction: 'VILLAGE_CENSUS', targetSettlementId: village.id });
    const reply = (value: LLMDecisionPayload) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
    const fetchMock = vi.fn(async () => reply({ ...option, targetSettlementId: 'invented-remote-settlement' }));
    vi.stubGlobal('fetch', fetchMock);
    const source = vi.fn();
    await queryCultivatorLLMDecision(observer, world, config, source);
    expect(source).toHaveBeenLastCalledWith('utility');
    expect(world.villageCensuses.periods).toEqual([]);
    fetchMock.mockImplementation(async () => reply(option));
    const actual = await queryCultivatorLLMDecision(observer, world, config, source);
    expect(source).toHaveBeenLastCalledWith('llm');
    expect(applyCultivatorBrainDecision(world, observer, actual, () => .99)).not.toBeNull();
    expect(applyCultivatorBrainDecision(world, observer, actual, () => .99)).toBeNull();
    expect(world.villageCensuses.periods[0].observations).toHaveLength(1);
    const view = projectVillageCensus(world, observer, village.id, world.tick)!;
    expect(view.observation?.count.population).toBe(village.population);
    expect(view.observed).toBeUndefined();
    const companion = world.cultivators[1];
    companion.locationId = observer.locationId;
    expect(projectVillageCensus(world, companion, village.id, world.tick)?.observation).toBeUndefined();
  });
});
