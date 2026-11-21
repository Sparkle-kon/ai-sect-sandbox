import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { activeCeasefireBetween, resolveCeasefireAction } from '../src/engine/ceasefireEngine';
import { causalChronicleEventId } from '../src/engine/chronicleCausalityEngine';
import { availableDiplomacyActions, resolveDiplomacyAction, SIEGE_COST } from '../src/engine/diplomacyEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision, utilityCeasefireDecision } from '../src/engine/llmBrain';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, SectSiege, WorldState } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture' };
const idle = (world: WorldState): Record<string, LLMDecisionPayload> => Object.fromEntries(
  world.cultivators.map(({ id }) => [id, { chosenAction: 'REST', innerMonologue: '静候' }]));
afterEach(() => vi.unstubAllGlobals());

function conflict() {
  const world = createInitialWorld(45);
  world.tick = 9;
  world.month = 9;
  const [attackers, defenders, others] = world.sects;
  const commander = world.cultivators.find(({ id }) => id === attackers.leaderId)!;
  const defender = world.cultivators.find(({ id }) => id === defenders.leaderId)!;
  commander.personality = defender.personality = '刚正';
  commander.qiProgress = defender.qiProgress = 0;
  commander.locationId = attackers.headquartersId;
  defender.locationId = defenders.headquartersId;
  attackers.spiritStones = 5000;
  defenders.spiritStones = 300;
  defenders.facilities.defense_array = 2;
  defenders.arrayMaxHp = 400;
  defenders.arrayHp = 150;
  world.diplomacy = [
    { sectAId: attackers.id, sectBId: defenders.id, pact: 'war', affinity: -80, sinceTick: 1 },
    { sectAId: attackers.id, sectBId: others.id, pact: 'alliance', affinity: 70, sinceTick: 1 },
  ];
  world.occasions = [];
  const launch = { chosenAction: 'LAUNCH_SIEGE', targetSectId: defenders.id, innerMonologue: '集结军队' } satisfies LLMDecisionPayload;
  return { world, attackers, defenders, others, commander, defender, launch };
}

function forgeLegacyWar(world: WorldState, mode: 'victory' | 'sieging'): SectSiege {
  const [attacking, defending] = world.sects;
  return {
    id: `legacy-${mode}`, attackerSectId: attacking.id, defenderSectId: defending.id,
    destinationId: defending.headquartersId, participantIds: [attacking.leaderId!], status: mode,
    startedTick: 5, rounds: 2, lastResolvedTick: 8,
  };
}

describe('proven diplomatic causes emitted by actual campaign and treaty mutations', () => {
  it('links the exact launched siege withdrawn at signing through Utility and validated model paths', async () => {
    const { world, attackers, defenders, others, commander, defender, launch } = conflict();
    expect(availableDiplomacyActions(commander, world)).toContainEqual({ action: 'LAUNCH_SIEGE', targetSectId: defenders.id });
    const utility = computeHeuristicDecision(commander, world, () => .99);
    expect(utility).toMatchObject({ chosenAction: 'LAUNCH_SIEGE', targetSectId: defenders.id });
    const provider = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(launch) } }] })));
    vi.stubGlobal('fetch', provider);
    const source = vi.fn();
    const chosen = await queryCultivatorLLMDecision(commander, world, config, source);
    expect(source).toHaveBeenCalledWith('llm');
    expect(chosen).toMatchObject({ chosenAction: 'LAUNCH_SIEGE', targetSectId: defenders.id });

    const startedByModel = advanceWorldTick(world, { ...idle(world), [commander.id]: chosen }, () => .99);
    const startedByUtility = advanceWorldTick(world, { ...idle(world), [commander.id]: utility }, () => .99);
    const [siege] = startedByModel.sieges;
    expect(siege.status).toBe('marching');
    expect(startedByModel.sieges).toEqual(startedByUtility.sieges);
    expect(startedByModel.chronicleCausality).toEqual(startedByUtility.chronicleCausality);
    const launched = causalChronicleEventId(startedByModel,'siege_launched',siege.id);
    expect(launched).toBeTruthy();
    const publicLaunch = startedByModel.events.find(row => row.id === launched)!;
    expect(publicLaunch).toMatchObject({ title:'宗门集结攻山', tick:startedByModel.tick });
    expect(publicLaunch.witnessScope).toBeUndefined();

    // A same-name old event is not a typed launch receipt. An unrelated active army is not withdrawn.
    startedByModel.events.push({ ...publicLaunch, id:'same-title-unrelated', tick:3 });
    const marched = advanceWorldTick(startedByModel,idle(startedByModel),() => .99);
    const arrived = advanceWorldTick(marched,idle(marched),() => .99);
    expect(arrived.sieges.find(({ id }) => id === siege.id)?.status).toBe('sieging');
    const other = { ...forgeLegacyWar(arrived,'sieging'), id:'outside-agreement', defenderSectId:others.id };
    // Keep the unrelated fixture genuinely active through this signing tick.
    other.lastResolvedTick = arrived.tick + 1;
    arrived.sieges.push(other);
    const defenderNow = arrived.cultivators.find(({ id }) => id === defender.id)!;
    const commanderNow = arrived.cultivators.find(({ id }) => id === commander.id)!;
    const offer = utilityCeasefireDecision(defenderNow,arrived)!;
    expect(offer).toMatchObject({ chosenAction:'CEASEFIRE',ceasefireMove:'offer',targetSectId:attackers.id });
    const offered = resolveCeasefireAction(arrived,defenderNow,offer)!;
    expect(offered.witnessScope).toBe('participants');
    expect(arrived.chronicleCausality.nodes.some(row => row.eventId === offered.id)).toBe(false);
    const dealId = arrived.ceasefires.agreements[0].id;
    const accept = utilityCeasefireDecision(commanderNow,arrived)!;
    expect(accept).toMatchObject({ chosenAction:'CEASEFIRE',ceasefireMove:'accept',targetCeasefireId:dealId });
    provider.mockImplementationOnce(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(accept) } }] })));
    const acceptModel = await queryCultivatorLLMDecision(commanderNow,arrived,config,source);
    expect(acceptModel).toMatchObject({ chosenAction:'CEASEFIRE',ceasefireMove:'accept',targetCeasefireId:dealId });
    const utilitySigned = advanceWorldTick(arrived,undefined,() => .99);
    const modelSigned = advanceWorldTick(arrived,{ ...idle(arrived), [commander.id]:acceptModel },() => .99);
    expect(activeCeasefireBetween(modelSigned,attackers.id,defenders.id)?.withdrawnSiegeIds).toEqual([siege.id]);
    expect(modelSigned.sieges.find(({ id })=> id === siege.id)?.status).toBe('withdrawn');
    expect(modelSigned.sieges.find(({ id })=> id === other.id)?.status).toBe('sieging');
    const proof = modelSigned.chronicleCausality.nodes.find(({ kind,entityId })=> kind === 'truce_signed' && entityId === dealId);
    expect(proof).toMatchObject({
      outcome:'truce_with_withdrawal',predecessors:[{ eventId:launched,relation:'withdrew_siege' }],
    });
    const utilityProof = utilitySigned.chronicleCausality.nodes.find(({ kind,entityId })=> kind === 'truce_signed' && entityId === dealId);
    expect(utilityProof).toMatchObject({ eventId:proof?.eventId,outcome:proof?.outcome,predecessors:proof?.predecessors });
    expect(modelSigned.events.find(row=> row.id === proof?.eventId)?.witnessScope).toBeUndefined();
    expect(resolveCeasefireAction(modelSigned,modelSigned.cultivators.find(row=> row.id === commander.id)!,acceptModel)).toBeNull();
    expect(modelSigned.chronicleCausality.nodes.filter(row=> row.eventId === proof?.eventId)).toHaveLength(1);
  });

  it.each(['victory','sieging'] as const)('omits manufactured causes for a %s campaign with no actual launch receipt', mode => {
    const { world, attackers, defenders, commander, defender, launch } = conflict();
    const army = forgeLegacyWar(world, mode);
    world.sieges.push(army);
    // Today's war evidence permits signing, but the prior campaign arrived without an authenticated launch event.
    const initialNodes = world.chronicleCausality.nodes.length;
    const other = world.cultivators.find(actor=> actor.sectId === commander.sectId && actor !== commander)!;
    expect(resolveDiplomacyAction(world,other,launch)).toBeNull();
    expect(world.chronicleCausality.nodes).toHaveLength(initialNodes);
    const offer = utilityCeasefireDecision(defender,world)!;
    expect(resolveCeasefireAction(world,defender,offer)?.witnessScope).toBe('participants');
    const accept = utilityCeasefireDecision(commander,world)!;
    expect(accept.ceasefireMove).toBe('accept');
    const signed = resolveCeasefireAction(world,commander,accept)!;
    expect(signed.witnessScope).toBeUndefined();
    expect(world.chronicleCausality.nodes.filter(({ kind }) => kind === 'siege_launched')).toEqual([]);
    expect(world.chronicleCausality.nodes.at(-1)).toMatchObject({
      eventId:signed.id, kind:'truce_signed', outcome:mode === 'victory' ? 'truce_signed' : 'truce_with_withdrawal', predecessors:[],
    });
    expect(army.status).toBe(mode === 'victory' ? 'victory' : 'withdrawn');
    expect(attackers.spiritStones).toBeGreaterThan(SIEGE_COST);
    expect(activeCeasefireBetween(world,attackers.id,defenders.id)?.withdrawnSiegeIds).toEqual(mode === 'victory' ? [] : [army.id]);
  });
});
