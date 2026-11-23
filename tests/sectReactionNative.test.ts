import { describe, expect, it, vi } from 'vitest';
import { alchemyCost, availableAlchemy } from '../src/engine/alchemyEngine';
import { llmScheduler } from '../src/engine/llmScheduler';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { applySectGrowthCommand } from '../src/engine/sectGrowth';
import { projectSectFurnaceReaction, projectSectReportReaction } from '../src/engine/sectReaction';
import { createManagedSectWorld } from '../src/engine/starterSectWorld';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { SectJobAssignment } from '../src/types/sectJobs';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '先留原处。' };
const brew: LLMDecisionPayload = { chosenAction: 'BREW_PILL', targetPillId: 'foundation', innerMonologue: '正经开一炉。' };

function state(world: WorldState) {
  if (!world.sectManagement) throw new Error('Expected native managerial authority');
  return world.sectManagement;
}
function person(world: WorldState, id: string) {
  const actor = world.cultivators.find(row => row.id === id);
  if (!actor) throw new Error(`Expected original body ${id}`);
  return actor;
}
function site(world: WorldState, id: string) {
  const node = world.locations.find(row => row.id === id);
  if (!node) throw new Error(`Expected mapped native site ${id}`);
  return node;
}
function starter() {
  const world = createManagedSectWorld(13071, 'classic', 'qingyun-odd-jobs', 0);
  if (!world?.sectManagement) throw new Error('Expected native starter');
  return world;
}
function month(world: WorldState, roll: number, options?: {
  readonly actorId?: string;
  readonly reply?: LLMDecisionPayload;
  readonly cognitive?: boolean;
  readonly board?: readonly SectJobAssignment[];
}) {
  const assigned = new Set(options?.board?.map(row => row.discipleId));
  const orders = Object.fromEntries(world.cultivators.filter(row => row.alive && !assigned.has(row.id))
    .map(row => [row.id, options?.actorId === row.id ? options.reply ?? rest : rest]));
  const applied = vi.fn();
  const next = advanceWorldTick(world, orders, () => roll, options?.cognitive ? 'deferred' : 'utility', applied, {
    capturePresentation: false,
    sectJobAssignments: options?.board,
    modelActors: options?.cognitive && options.actorId ? new Set([options.actorId]) : undefined,
  });
  expect(next.tick).toBe(world.tick + 1);
  if (options?.cognitive) expect(applied).toHaveBeenCalledWith(options.actorId, true);
  return next;
}
function paidFurnace() {
  const world = month(starter(), .9999);
  expect(applySectGrowthCommand(world, { kind: 'upgrade', building: 'furnace' })).toBe(true);
  const hpSite = site(world, state(world).homeSiteId);
  expect(hpSite.furnaceGrade).toBe(1);
  const apprentice = person(world, state(world).foundingDiscipleIds[0]);
  apprentice.herbs.jade_leaf = 2;
  apprentice.herbs.earth_root = 1;
  apprentice.spiritStones = 70;
  expect(availableAlchemy(apprentice, world)).toContainEqual({ action: 'BREW_PILL', targetPillId: 'foundation' });
  return { world, apprentice, hpSite };
}

describe('小人反应只认实际月度差事与火候', () => {
  it('实际失败的原地一炉扣足丹费药材才见烟；模拟模型同一决定没有额外效果', async () => {
    const { world, apprentice, hpSite } = paidFurnace();
    const replies = vi.fn(async () => new Response(JSON.stringify({ choices: [
      { message: { content: JSON.stringify({ chosenAction: 'BREW_PILL', targetPillId: 'foundation' }) } },
    ] })));
    vi.stubGlobal('fetch', replies);
    let model: LLMDecisionPayload | undefined;
    try {
      llmScheduler.resetTickBudget();
      model = await requestCultivatorLLMDecision(apprentice, world, {
        enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'reaction-native',
      }, world.tick + 1);
      expect(replies).toHaveBeenCalledOnce();
      expect(model).toMatchObject({ chosenAction: 'BREW_PILL', targetPillId: 'foundation' });
    } finally {
      vi.unstubAllGlobals();
      llmScheduler.resetTickBudget();
    }
    if (!model) throw new Error('Expected an actually admitted native model reply');
    const utility = month(world, .9999, { actorId: apprentice.id, reply: brew });
    const cognitive = month(world, .9999, { actorId: apprentice.id, reply: model, cognitive: true });
    const actual = person(utility, apprentice.id);
    const eventId = `evt-${utility.tick}-${apprentice.id}-alchemy`;
    expect(utility.events.find(row => row.id === eventId))
      .toMatchObject({ title: expect.stringContaining('炼丹失手'), locationId: hpSite.id, actorIds: [apprentice.id] });
    expect(actual.herbs.jade_leaf).toBe(0);
    expect(actual.herbs.earth_root).toBe(0);
    expect(actual.spiritStones).toBe(apprentice.spiritStones - alchemyCost('foundation', hpSite.furnaceGrade));
    expect(actual.pills.foundation).toBe(apprentice.pills.foundation);
    const cue = projectSectFurnaceReaction(utility);
    expect(cue).toMatchObject({ actorId: apprentice.id, tick: utility.tick, kind: 'smoke', siteId: hpSite.id, cause: 'furnace' });
    expect(cue?.shake).toBeUndefined();
    expect(projectSectFurnaceReaction(cognitive)).toEqual(cue);

    const bytes = encodeEraWorldSave(utility);
    const reopened = decodeEraWorldSave(bytes);
    expect(projectSectFurnaceReaction(reopened)).toEqual(cue);
    expect(projectSectFurnaceReaction(reopened)).toEqual(cue);
    expect(encodeEraWorldSave(reopened)).toBe(bytes);
    expect(projectSectFurnaceReaction(month(reopened, .9999))).toBeUndefined();
    for (const alter of [
      (next: WorldState) => { next.events = next.events.filter(row => row.id !== eventId); },
      (next: WorldState) => { next.furnaceReservations.uses = next.furnaceReservations.uses.filter(row => row.actorId !== apprentice.id); },
      (next: WorldState) => {
        const book = next.resourceFlow.months.at(-1);
        if (book) book.entries = book.entries.filter(row => !(row.reason === 'brew_fee' && row.refId === hpSite.id));
      },
      (next: WorldState) => { person(next, apprentice.id).locationId = 'loc-market'; },
      (next: WorldState) => { person(next, apprentice.id).alive = false; person(next, apprentice.id).hp = 0; },
      (next: WorldState) => { site(next, hpSite.id).ownerSectId = undefined; },
    ]) {
      const fork = structuredClone(reopened);
      alter(fork);
      expect(projectSectFurnaceReaction(fork)).toBeUndefined();
    }
    const succeeds = month(world, 0, { actorId: apprentice.id, reply: brew });
    expect(person(succeeds, apprentice.id).pills.foundation).toBe(apprentice.pills.foundation + 1);
    expect(projectSectFurnaceReaction(succeeds)).toBeUndefined();
  });

  it('饭堂实际受损才在当地一抖，远处的汇报没有场景抖动', () => {
    const world = starter(), management = state(world);
    const cook = person(world, management.foundingDiscipleIds[0]);
    cook.quirks = ['drama'];
    const next = month(world, .92, { board: [{ discipleId: cook.id, jobId: 'kitchen' }] });
    const report = state(next).latestReport;
    const row = report?.rows.find(entry => entry.discipleId === cook.id);
    if (!report || !row) throw new Error('Expected an actual kitchen report');
    expect(row).toMatchObject({ tier: 'mishap', phase: 'performed' });
    expect(state(next).comedy?.moments.at(-1)).toMatchObject({
      tick: next.tick, speakerId: cook.id, siteId: management.homeSiteId,
      effects: [{ kind: 'kitchen_damage', amount: -1 }],
    });
    expect(state(next).buildings.kitchen).toBe(management.buildings.kitchen - 1);
    const cue = projectSectReportReaction(next, report, row);
    expect(cue).toMatchObject({ actorId: cook.id, tick: next.tick, kind: 'smoke', shake: 'kitchen',
      cause: 'report', siteId: management.homeSiteId });
    expect(projectSectReportReaction(next, structuredClone(report), row)).toBeUndefined();
    expect(projectSectReportReaction(next, report, { ...row, phase: 'on_route' })).toBeUndefined();

    const departure = starter();
    const absentCook = person(departure, state(departure).foundingDiscipleIds[0]);
    absentCook.locationId = 'loc-market';
    const returning = month(departure, .92, { board: [{ discipleId: absentCook.id, jobId: 'kitchen' }] });
    const incomplete = state(returning).latestReport;
    if (!incomplete) throw new Error('Expected the away disciple’s actual travel report');
    expect(incomplete.rows[0]).toMatchObject({ phase: 'on_route' });
    expect(projectSectReportReaction(returning, incomplete, incomplete.rows[0])).toBeUndefined();

    const remote = structuredClone(next);
    person(remote, cook.id).locationId = 'loc-market';
    const remoteReport = state(remote).latestReport;
    if (!remoteReport) throw new Error('Expected historic report when its actor leaves the courtyard');
    const remoteReaction = projectSectReportReaction(remote, remoteReport, remoteReport.rows[0]);
    expect(remoteReaction).toMatchObject({ cause: 'report', actorId: cook.id });
    expect(remoteReaction?.siteId).toBeUndefined();
    expect(remoteReaction?.shake).toBeUndefined();

    for (const alter of [
      (copy: WorldState) => { person(copy, cook.id).alive = false; person(copy, cook.id).hp = 0; },
      (copy: WorldState) => { copy.tick++; },
      (copy: WorldState) => { delete state(copy).latestReport; },
    ]) {
      const fork = structuredClone(next);
      alter(fork);
      const stale = state(fork).latestReport;
      if (!stale) {
        expect(projectSectReportReaction(fork, report, row)).toBeUndefined();
        continue;
      }
      const stored = stale.rows.find(entry => entry.discipleId === cook.id);
      if (!stored) throw new Error('Test lost its copied cook row');
      expect(projectSectReportReaction(fork, stale, stored)).toBeUndefined();
    }
  });
});
