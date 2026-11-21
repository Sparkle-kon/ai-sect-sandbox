import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableCouncilPlans } from '../src/engine/councilEngine';
import { collectCouncilBallots } from '../src/engine/councilModel';
import { commitCouncilSnapshot, selectAnnualCouncil, settleAnnualCouncilOffline, settleCouncilSnapshot } from '../src/engine/councilRuntime';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'example-for-test', model: 'fixture-model' };
const envelope = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }));
afterEach(() => vi.unstubAllGlobals());

describe('council runtime across both AI paths', () => {
  it('collects two independent speaker rounds, passes prior speech and does not trust a foreign voter ID', async () => {
    const world = createInitialWorld();
    const plan = availableCouncilPlans(world, 'sect-danxia').find(({ proposal }) => proposal.kind === 'allocate_pill')!;
    const requests: Array<Record<string, unknown>> = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const data = JSON.parse(body.messages[1].content) as Record<string, unknown>;
      requests.push(data);
      return envelope('firstRound' in data
        ? '{"vote":"support","reason":"宗门余丹可救急","voterId":"impostor"}'
        : '{"opening":"先访执事核对丹册。"}');
    }));
    const result = await settleCouncilSnapshot(world, plan, config);
    expect(requests).toHaveLength(2 * plan.voterIds.length);
    expect(requests.slice(plan.voterIds.length).every((request) => Array.isArray(request.firstRound))).toBe(true);
    expect(result.councils[0].ballots.map(({ voterId }) => voterId)).toEqual(plan.voterIds);
    expect(result.councils[0].ballots.every(({ source }) => source === 'llm')).toBe(true);
    expect(result.councils[0].status).toBe('passed');
    expect(world.councils).toEqual([]);
  });

  it('keeps invalid JSON or HTTP failures in Utility AI mode, with no requests on blank keys', async () => {
    const world = createInitialWorld();
    const plan = availableCouncilPlans(world, 'sect-danxia')[0];
    const network = vi.fn(async () => envelope('bad JSON'));
    vi.stubGlobal('fetch', network);
    expect(await collectCouncilBallots(world, plan, { ...config, apiKey: ' ' })).toEqual([]);
    expect(network).not.toHaveBeenCalled();
    const result = await settleCouncilSnapshot(world, plan, config);
    expect(network).toHaveBeenCalledTimes(plan.voterIds.length);
    expect(result.councils[0].ballots.every(({ source }) => source === 'utility')).toBe(true);
    network.mockImplementation(async () => new Response('', { status: 429 }));
    expect(await collectCouncilBallots(world, plan, config)).toEqual([]);
  });

  it('discards outstanding model results when a reset or a leadership change wins the snapshot race', async () => {
    const world = createInitialWorld();
    const plan = availableCouncilPlans(world, 'sect-danxia')[0];
    let release: () => void = () => undefined;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    vi.stubGlobal('fetch', vi.fn(async () => { await wait; return envelope('{"opening":"议","vote":"support","reason":"赞成"}'); }));
    const pending = settleCouncilSnapshot(world, plan, config);
    const changed = structuredClone(world);
    changed.sects.find(({ id }) => id === plan.sectId)!.leaderId = 'elder-danxia-2';
    const reset = createInitialWorld();
    release();
    const debated = await pending;
    expect(debated.councils).toHaveLength(1);
    expect(commitCouncilSnapshot(changed, world, debated)).toBe(changed);
    expect(commitCouncilSnapshot(reset, world, debated)).toBe(reset);
    expect(changed.councils).toEqual([]);
    expect(reset.councils).toEqual([]);
  });

  it('runs annual Utility agenda in the engine and only commits one competing manual/annual snapshot', async () => {
    const world = createInitialWorld();
    world.tick = 12;
    world.month = 12;
    const decisions = Object.fromEntries(world.cultivators.map(({ id }): [string, LLMDecisionPayload] =>
      [id, { chosenAction: 'REST', innerMonologue: '静候开年' }]));
    const deferred = advanceWorldTick(world, decisions, () => 0.9, 'deferred');
    const offline = advanceWorldTick(world, decisions, () => 0.9);
    expect(deferred.councils).toEqual([]);
    const plan = selectAnnualCouncil(deferred)!;
    expect(plan).toBeDefined();
    expect(offline.councils.map(({ id }) => id)).toEqual([plan.id]);
    const manualResult = await settleCouncilSnapshot(deferred, plan, { ...config, enabled: false });
    settleAnnualCouncilOffline(manualResult);
    expect(manualResult.councils.filter(({ sectId }) => sectId === plan.sectId)).toHaveLength(1);
    expect(commitCouncilSnapshot(manualResult, deferred, offline)).toBe(manualResult);
  });
});
