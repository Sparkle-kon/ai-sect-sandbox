import { describe, expect, it, vi } from 'vitest';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { availableCourierActions, COURIER_SERVICE_FEE, resolveCourierAction, visibleCouriers } from '../src/engine/sealedCourierEngine';
import { planSectJob } from '../src/engine/sectJobs';
import { createManagedSectWorld } from '../src/engine/starterSectWorld';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { SectJobAssignment, SectJobReportRow } from '../src/types/sectJobs';
import type { LLMDecisionPayload, WorldEvent, WorldState } from '../src/types/world';

const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '且留原处调息。' };

function person(world: WorldState, id: string) {
  const actor = world.cultivators.find(row => row.id === id);
  if (!actor) throw new Error(`Expected original native person ${id}`);
  return actor;
}

function fixture() {
  const world = createManagedSectWorld(13071, 'classic', 'qingyun-odd-jobs', 0);
  const management = world?.sectManagement;
  if (!world || !management) throw new Error('Expected a real managed sect');
  const [gatherer, runner, meditator] = management.foundingDiscipleIds;
  if (!gatherer || !runner || !meditator) throw new Error('Expected three real disciples');
  person(world, runner).exploredTileIds = world.terrain.tiles.filter(tile =>
    tile.biome !== '魔渊' && tile.biome !== '毒沼').map(tile => tile.id);
  return { world, management, gatherer, runner, meditator };
}

function assignedMonth(world: WorldState, board?: readonly SectJobAssignment[], config?: {
  readonly model?: { readonly actorId: string; readonly reply: LLMDecisionPayload };
  readonly roll?: () => number;
}) {
  const commanded = new Set(board?.map(row => row.discipleId));
  const orders = Object.fromEntries(world.cultivators.filter(row => !commanded.has(row.id)).map(row =>
    [row.id, config?.model?.actorId === row.id ? config.model.reply : rest]));
  const events: Array<readonly WorldEvent[]> = [];
  const admitted = vi.fn();
  const after = advanceWorldTick(world, orders, config?.roll, config?.model ? 'deferred' : 'utility', admitted, {
    modelActors: config?.model ? new Set([config.model.actorId]) : undefined,
    capturePresentation: false,
    sectJobAssignments: board,
    onCompletedEvents: rows => { events.push(rows); },
  });
  expect(events).toHaveLength(1);
  return { after, events: events[0], admitted };
}

function readReport(world: WorldState) {
  const report = world.sectManagement?.latestReport;
  if (!report) throw new Error('Expected the monthly native tick to preserve its latest report');
  return report;
}

function findRow(rows: readonly SectJobReportRow[], discipleId: string) {
  const row = rows.find(report => report.discipleId === discipleId);
  if (!row) throw new Error('Expected one report for the submitted disciple');
  return row;
}

describe('回山汇报来自真实差事结算', () => {
  it('Utility 与真实 JSON 解码后的 Cognitive 以同一派工得同一可存读报告，跑腿当月回山', async () => {
    const { world, management, gatherer, runner, meditator } = fixture();
    const board: readonly SectJobAssignment[] = [
      { discipleId: gatherer, jobId: 'gather' }, { discipleId: runner, jobId: 'deliver' },
    ];
    const herbPlan = planSectJob(world, person(world, gatherer), 'gather');
    const deliveryPlan = planSectJob(world, person(world, runner), 'deliver');
    if (herbPlan.kind !== 'native' || !herbPlan.decision.targetHerbId ||
      deliveryPlan.kind !== 'errand' || !deliveryPlan.siteId)
      throw new Error('Expected one local herb harvest and one genuine known delivery route');
    const herbId = herbPlan.decision.targetHerbId;
    const original = encodeEraWorldSave(world);

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [
      { message: { content: JSON.stringify({ chosenAction: 'REST' }) } },
    ] })));
    vi.stubGlobal('fetch', fetchMock);
    let reply: LLMDecisionPayload | undefined;
    try {
      llmScheduler.resetTickBudget();
      reply = await requestCultivatorLLMDecision(person(world, meditator), world, {
        enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'monthly-job-report',
      }, world.tick + 1);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(reply?.chosenAction).toBe('REST');
    } finally {
      vi.unstubAllGlobals();
      llmScheduler.resetTickBudget();
    }
    if (!reply) throw new Error('Expected an admitted JSON decision on the unassigned disciple');

    const utility = assignedMonth(world, board);
    const cognitive = assignedMonth(world, board, { model: { actorId: meditator, reply } });
    expect(cognitive.admitted).toHaveBeenCalledWith(meditator, true);
    const report = readReport(utility.after);
    expect(readReport(cognitive.after)).toEqual(report);
    expect(utility.after.random).toEqual(cognitive.after.random);
    expect(report).toMatchObject({ openedTick: world.tick, settledTick: world.tick + 1,
      sectId: management.sectId, leaderId: management.leaderId });
    expect(report.rows.map(row => row.discipleId)).toEqual(board.map(row => row.discipleId));

    const gatherRow = findRow(report.rows, gatherer);
    const gathered = person(utility.after, gatherer).herbs[herbId] - person(world, gatherer).herbs[herbId];
    expect(gathered).toBeGreaterThan(0);
    expect(gatherRow).toMatchObject({ phase: 'performed', siteId: management.homeSiteId,
      sourceEventId: `evt-${utility.after.tick}-${gatherer}-alchemy` });
    expect(gatherRow.effects).toContainEqual({ kind: 'herb', amount: gathered, herbId, stage: 'native' });
    expect(utility.events.filter(event => event.id === gatherRow.sourceEventId)).toMatchObject([
      { tick: utility.after.tick, actorIds: [gatherer], locationId: management.homeSiteId },
    ]);

    const runnerRow = findRow(report.rows, runner);
    expect(runnerRow).toMatchObject({ phase: 'performed', siteId: deliveryPlan.siteId,
      errand:{fromId:management.homeSiteId,homeId:management.homeSiteId} });
    expect(runnerRow).toHaveProperty('tier');
    expect(person(utility.after, runner).locationId).toBe(management.homeSiteId);
    expect(utility.after.couriers.dispatches.some(row => row.courierId === runner)).toBe(false);
    expect(encodeEraWorldSave(world)).toBe(original);
    const packed = encodeEraWorldSave(utility.after);
    const restarted = decodeEraWorldSave(packed);
    expect(readReport(restarted)).toEqual(report);
    expect(encodeEraWorldSave(restarted)).toBe(packed);
  });

  it('密封信当月真实接件、付出原路费，也不发已送达的评级或奖励', () => {
    const { world, management } = fixture();
    const sender = person(world, management.leaderId);
    sender.spiritStones = 100;
    const opening = availableCourierActions(sender, world).find(option => option.courierMove === 'send' &&
      option.dispatchCue === 'request_audience' && option.targetCourierId &&
      management.foundingDiscipleIds.includes(option.targetCourierId));
    if (!opening?.targetCourierId) throw new Error('Expected a real bookable sealed job and local disciple');
    const { action, ...fields } = opening;
    const booking = resolveCourierAction(world, sender, { ...fields, chosenAction: action, innerMonologue: '送一封信。' });
    if (!booking) throw new Error('Expected an actual previous native booking');
    world.events.unshift(booking);
    const dispatch = world.couriers.dispatches.at(-1);
    if (!dispatch) throw new Error('Expected original dispatch');
    const courier = person(world, opening.targetCourierId);
    const board = [{ discipleId: courier.id, jobId: 'deliver' }] as const;
    const { after, events } = assignedMonth(world, board, { roll: () => .9999 });
    const receipt = after.couriers.dispatches.find(row => row.id === dispatch.id);
    expect(receipt).toMatchObject({ status: 'in_transit', acceptedTick: after.tick, feePaid: COURIER_SERVICE_FEE });
    expect(receipt).not.toHaveProperty('deliveredTick');
    expect(person(after, sender.id).spiritStones).toBe(sender.spiritStones - COURIER_SERVICE_FEE);
    expect(person(after, courier.id).spiritStones).toBe(courier.spiritStones + COURIER_SERVICE_FEE);
    expect(visibleCouriers(after, person(after, dispatch.recipientId))).toEqual([]);
    const report = findRow(readReport(after).rows, courier.id);
    expect(report).toMatchObject({ ...board[0], phase: 'on_route', effects: [],
      sourceEventId: `evt-${dispatch.id}-accepted-${after.tick}` });
    expect(report).not.toHaveProperty('tier');
    expect(events.find(event => event.id === report.sourceEventId)).toMatchObject({ witnessScope: 'participants', actorIds: [] });
    expect(world.couriers.dispatches.at(-1)).toMatchObject({ status: 'offered', feePaid: 0 });
  });

  it('重伤档的真实气血与吐纳增益准确入报；读档及下月不重复结算', () => {
    const { world, meditator } = fixture();
    const old = person(world, meditator);
    expect(old.hp).toBe(old.maxHp);
    const board: readonly SectJobAssignment[] = [{ discipleId: meditator, jobId: 'cultivate' }];
    // Fixed test RNG drives the real last weighted branch; no handcrafted report or injected effects.
    const settled = assignedMonth(world, board, { roll: () => .9999 });
    const report = readReport(settled.after);
    const row = findRow(report.rows, meditator);
    const actual = person(settled.after, meditator);
    expect(row).toMatchObject({ phase: 'performed', tier: 'disaster' });
    expect(actual.alive).toBe(true);
    expect(actual.hp).toBeLessThan(old.hp);
    expect(row.effects).toContainEqual({ kind: 'hp', amount: actual.hp - old.hp, stage: 'follow_up' });
    expect(row.effects).toContainEqual({ kind: 'qi', amount: actual.qiProgress - old.qiProgress, stage: 'native' });
    expect(world.sectManagement?.latestReport).toBeUndefined();

    const restored = decodeEraWorldSave(encodeEraWorldSave(settled.after));
    const next = assignedMonth(restored, undefined, { roll: () => .9999 });
    expect(next.after.tick).toBe(restored.tick + 1);
    expect(person(next.after, meditator).hp).toBeGreaterThanOrEqual(actual.hp);
    expect(readReport(restored)).toEqual(report);
    expect(readReport(next.after)).toEqual(report);
  });
});
