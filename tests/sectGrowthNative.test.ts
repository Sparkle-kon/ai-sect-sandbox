import { describe, expect, it, vi } from 'vitest';
import {comedyTreasuryDelta} from './sectComedyAccountingFixture';
import { createInitialWorld } from '../src/data/initialWorld';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { applySectGrowthCommand, projectSectGrowth, quoteSectGrowthCommand } from '../src/engine/sectGrowth';
import { createManagedSectWorld } from '../src/engine/starterSectWorld';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { MANAGEMENT_BUILDING_IDS } from '../src/types/sectManagement';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const REST: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '留在原处，听一月山风。' };

function start() {
  const world = createManagedSectWorld(13071, 'classic', 'qingyun-odd-jobs', 0);
  if (!world || !world.sectManagement?.debt) throw new Error('Expected an actual Qingyun genesis and loan');
  return world;
}
function management(world: WorldState) {
  if (!world.sectManagement) throw new Error('Expected a managed sect');
  return world.sectManagement;
}
function sect(world: WorldState) {
  const state = management(world);
  const found = world.sects.find(row => row.id === state.sectId);
  if (!found) throw new Error('Expected the actual managed native sect');
  return found;
}
function actor(world: WorldState, id: string) {
  const row = world.cultivators.find(person => person.id === id);
  if (!row) throw new Error(`Unknown native actor ${id}`);
  return row;
}
function bump(world: WorldState, model?: { readonly actorId: string; readonly reply: LLMDecisionPayload }) {
  const applied = vi.fn();
  const orders = Object.fromEntries(world.cultivators.filter(row => row.alive)
    .map(row => [row.id, model?.actorId === row.id ? model.reply : REST]));
  const next = advanceWorldTick(world, orders, () => .9999, model ? 'deferred' : 'utility', applied, {
    capturePresentation: false, captureTrace: true, modelActors: model ? new Set([model.actorId]) : undefined,
  });
  expect(next.tick).toBe(world.tick + 1);
  expect(next.month).toBe(world.month % 12 + 1);
  if (model) expect(applied).toHaveBeenCalledWith(model.actorId, true);
  return next;
}
function through(world: WorldState, tick: number) {
  if (tick < world.tick) throw new Error('Not a forward date');
  while (world.tick < tick) world = bump(world);
  return world;
}
function reseal(world: WorldState) {
  const bytes = encodeEraWorldSave(world);
  const restored = decodeEraWorldSave(bytes);
  expect(encodeEraWorldSave(restored)).toBe(bytes);
  return restored;
}
function project(world: WorldState) {
  const view = projectSectGrowth(world);
  if (!view) throw new Error('Expected the growth card for the real managed sect');
  return view;
}

describe('掌门经营沿用原生月步钱粮与日期', () => {
  it('按月收满借据本金，同一笔钱从公库到王掌柜，六种建筑逐次足额扣费', () => {
    const original = start();
    const state = management(original);
    const creditorId = state.debt?.creditorId;
    if (!creditorId || !state.debt) throw new Error('Expected Wang as original creditor');
    const due = state.debt.dueTick;
    const originalBytes = encodeEraWorldSave(original);
    let world = through(original, due - 1);
    expect(sect(world).spiritStones).toBeGreaterThanOrEqual(80);
    expect(project(world).debt).toMatchObject({ canRepay: true, principal: 80, monthsRemaining: 1 });
    const issuer = actor(world, state.leaderId);
    const creditor = actor(world, creditorId);
    const clerkBefore = creditor.spiritStones;
    const treasuryBefore = sect(world).spiritStones;
    const leaderBefore = issuer.spiritStones;
    const payment = { kind: 'repay' } as const;
    expect(quoteSectGrowthCommand(world, payment)).toMatchObject({ kind: 'repay', amount: 80 });
    expect(applySectGrowthCommand(world, payment)).toBeTruthy();
    expect(sect(world).spiritStones).toBe(treasuryBefore - 80);
    expect(actor(world, creditorId).spiritStones).toBe(clerkBefore + 80);
    expect(actor(world, issuer.id).spiritStones).toBe(leaderBefore);
    expect(world.resourceFlow.months.at(-1)?.entries.filter(row => row.reason === 'management_debt_repaid')).toMatchObject([{
      kind: 'transfer', amount: 80, good: 'stone', from: { kind: 'sect', id: state.sectId },
      to: { kind: 'actor', id: creditorId },
    }]);
    expect(quoteSectGrowthCommand(world, payment)).toBeUndefined();
    const afterPayment = encodeEraWorldSave(world);
    expect(applySectGrowthCommand(world, payment)).toBeFalsy();
    expect(encodeEraWorldSave(world)).toBe(afterPayment);

    const lastAllowed = world.tick + 72;
    for (const building of MANAGEMENT_BUILDING_IDS) {
      const order = { kind: 'upgrade', building } as const;
      let quote = quoteSectGrowthCommand(world, order);
      while (!quote && world.tick < lastAllowed) {
        world = bump(world);
        quote = quoteSectGrowthCommand(world, order);
      }
      if (quote?.kind !== 'upgrade') throw new Error(`Unable to finance genuine upgrade: ${building}`);
      const priorLevel = management(world).buildings[building];
      const money = sect(world).spiritStones;
      const wallets = world.cultivators.map(row => row.spiritStones);
      const artifacts = structuredClone(world.cultivators.map(row => row.artifacts));
      expect(quote.cost).toBeGreaterThan(0);
      expect(applySectGrowthCommand(world, order)).toBeTruthy();
      expect(management(world).buildings[building]).toBe(priorLevel + 1);
      expect(sect(world).spiritStones).toBe(money - quote.cost);
      expect(world.cultivators.map(row => row.spiritStones)).toEqual(wallets);
      expect(world.cultivators.map(row => row.artifacts)).toEqual(artifacts);
      expect(quote.level).toBe(priorLevel + 1);
      expect(world.resourceFlow.months.at(-1)?.entries.filter(row =>
        row.reason === 'management_building' && row.refId === state.sectId).at(-1))
        .toMatchObject({ kind: 'consumption', amount: quote.cost, from: { kind: 'sect', id: state.sectId } });
    }
    expect(project(reseal(world)).buildings).toEqual(project(world).buildings);
    expect(encodeEraWorldSave(original)).toBe(originalBytes);
  });

  it('仙盟于十二个月真正走完后的正月考核，两套引擎结果一致且不会重发补贴', async () => {
    const world = start();
    const endOfYear = through(world, world.tick + 11);
    expect(endOfYear.month).toBe(12);
    expect(project(endOfYear).review).toBeUndefined();
    expect(applySectGrowthCommand(endOfYear, { kind: 'repay', amount: 80 })).toBe(true);
    expect(applySectGrowthCommand(endOfYear, { kind: 'upgrade', building: 'hall' })).toBe(true);
    expect(applySectGrowthCommand(endOfYear, { kind: 'upgrade', building: 'gate' })).toBe(true);
    const free = management(world).foundingDiscipleIds[2];
    const response = vi.fn(async () => new Response(JSON.stringify({ choices: [
      { message: { content: JSON.stringify({ chosenAction: 'REST' }) } },
    ] })));
    vi.stubGlobal('fetch', response);
    let reply: LLMDecisionPayload | undefined;
    try {
      llmScheduler.resetTickBudget();
      reply = await requestCultivatorLLMDecision(actor(endOfYear, free), endOfYear, {
        enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'sect-growth',
      }, endOfYear.tick + 1);
      expect(response).toHaveBeenCalledOnce();
      expect(reply?.chosenAction).toBe('REST');
    } finally {
      vi.unstubAllGlobals();
      llmScheduler.resetTickBudget();
    }
    if (!reply) throw new Error('Expected a decoded native model decision');
    const utility = bump(endOfYear), cognitive = bump(endOfYear, { actorId: free, reply });
    const observed = project(utility);
    expect(project(cognitive)).toEqual(observed);
    expect(utility.month).toBe(1);
    const review = observed.review;
    expect(review).toMatchObject({ tick: world.tick + 12, year: utility.year });
    if (!review) throw new Error('Expected the actual annual review');
    expect(review.stipend).toBeGreaterThan(0);
    expect(utility.events.filter(row => row.id === `evt-${utility.tick}-${management(world).sectId}-annual-review`)).toHaveLength(1);
    expect(sect(utility).spiritStones - sect(endOfYear).spiritStones)
      .toBe((sect(utility).monthlyEconomy?.net ?? 0) + review.stipend + comedyTreasuryDelta(utility));
    const restarted = reseal(utility);
    const following = bump(restarted);
    expect(project(following).review).toEqual(review);
    expect(sect(following).spiritStones - sect(restarted).spiritStones).toBe((sect(following).monthlyEconomy?.net??0)+comedyTreasuryDelta(following));
    expect(following.resourceFlow.months.at(-1)?.entries.some(row => row.reason === 'management_annual_stipend')).toBe(false);
  });

  it('严格到期以后连亏三月才失败；中间复盈后真实还款可维持山门', () => {
    const original = start();
    const dueTick = management(original).debt?.dueTick;
    if (!dueTick) throw new Error('Expected loan due date');
    const onDue = through(original, dueTick);
    expect(project(onDue).closing).toMatchObject({ tick: dueTick, overduePrincipal: 0, negativeMonths: 0 });
    const treasuryAtDue = sect(onDue).spiritStones;
    const naturalGain = sect(onDue).monthlyEconomy?.net;
    if (!naturalGain || naturalGain <= 0) throw new Error('Expected working starter HQ income');
    // Fixtures represent treasuries after already spent operating capital. Actual future income is native.
    const shortfall = structuredClone(onDue);
    sect(shortfall).spiritStones = 0;
    const deficit1 = bump(shortfall);
    const deficit2 = bump(deficit1);
    expect(project(deficit1).closing).toMatchObject({ tick: dueTick + 1, overduePrincipal: 80, negativeMonths: 1 });
    expect(project(deficit2).closing).toMatchObject({ tick: dueTick + 2, overduePrincipal: 80, negativeMonths: 2 });
    expect(project(deficit2).failure).toBeUndefined();
    expect(project(deficit2).closing?.closingNet).toBe(sect(deficit2).spiritStones - comedyTreasuryDelta(deficit2) - 80);
    const deficit3 = bump(reseal(deficit2));
    expect(project(deficit3).failure).toMatchObject({ tick: dueTick + 3, reason: 'bankruptcy' });
    expect(sect(deficit3).spiritStones).toBeGreaterThanOrEqual(0);

    const recovery = structuredClone(onDue);
    sect(recovery).spiritStones = 80 - 3 * naturalGain;
    expect(sect(recovery).spiritStones).toBeGreaterThanOrEqual(0);
    const beforeRecovery = through(recovery, dueTick + 2);
    expect(project(beforeRecovery).closing?.negativeMonths).toBe(2);
    const recovered = bump(beforeRecovery);
    expect(project(recovered).closing?.negativeMonths).toBe(0);
    expect(project(recovered).failure).toBeUndefined();
    expect(applySectGrowthCommand(recovered, { kind: 'repay' })).toBeTruthy();
    expect(project(recovered).debt).toBeUndefined();
    expect(sect(onDue).spiritStones).toBe(treasuryAtDue);
  });

  it('远行弟子仍算门人；只有实际无弟子才判散伙，未托管旧档保持原样', () => {
    const world = start();
    const ids = management(world).foundingDiscipleIds;
    const away = world.locations.find(site => site.type === 'market');
    if (!away) throw new Error('Expected an actual away location');
    for (const id of ids) actor(world, id).locationId = away.id;
    const travelling = bump(world);
    expect(project(travelling).livingDisciples).toBe(ids.length);
    expect(project(travelling).failure).toBeUndefined();
    const leaderId = management(travelling).leaderId;
    const awayAuthority = structuredClone(travelling);
    actor(awayAuthority, leaderId).locationId = away.id;
    expect(project(awayAuthority).livingDisciples).toBe(ids.length);
    expect(quoteSectGrowthCommand(awayAuthority, { kind: 'repay', amount: 1 })).toBeUndefined();
    const missingSite = structuredClone(travelling);
    missingSite.locations = missingSite.locations.filter(site => site.id !== management(missingSite).homeSiteId);
    expect(projectSectGrowth(missingSite)).toBeUndefined();
    expect(applySectGrowthCommand(missingSite, { kind: 'repay', amount: 1 })).toBe(false);
    for (const id of ids) actor(travelling, id).sectId = '';
    const departed = bump(travelling);
    expect(project(departed).livingDisciples).toBe(0);
    expect(project(departed).failure).toMatchObject({ tick: departed.tick, reason: 'disciples_gone' });
    const classic = createInitialWorld(13071);
    const preserved = reseal(bump(classic));
    expect(preserved.sectManagement).toBeUndefined();
    expect(projectSectGrowth(preserved)).toBeUndefined();
  });
});
