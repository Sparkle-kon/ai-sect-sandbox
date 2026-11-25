import { describe, expect, it, vi } from 'vitest';
import { findSectComedyTemplate, SECT_COMEDY_TEMPLATES } from '../src/data/sectComedy';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { projectSectComicMoment, sectComicEventId, settleSectComedyMonth } from '../src/engine/sectComedy';
import { createManagedSectWorld } from '../src/engine/starterSectWorld';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { SectComicMoment } from '../src/types/sectComedy';
import type { SectJobAssignment } from '../src/types/sectJobs';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '月间先留本处。' };

function starter() {
  const world = createManagedSectWorld(13071, 'classic', 'qingyun-odd-jobs', 0);
  if (!world?.sectManagement) throw new Error('Expected canonical managed genesis');
  return world;
}
function team(world: WorldState) {
  if (!world.sectManagement) throw new Error('Expected managed team');
  return world.sectManagement;
}
function person(world: WorldState, id: string) {
  const actor = world.cultivators.find(row => row.id === id);
  if (!actor) throw new Error(`Unknown native speaker ${id}`);
  return actor;
}
function fresh(world: WorldState) {
  const moments = team(world).comedy?.moments.filter(row => row.tick === world.tick) ?? [];
  expect(moments).toHaveLength(1);
  if (!moments[0]) throw new Error('Expected an actual new comic moment this month');
  return moments[0];
}

function advance(world: WorldState, board?: readonly SectJobAssignment[], model?: { actor: string; reply: LLMDecisionPayload }) {
  const assigned = new Set(board?.map(row => row.discipleId));
  const orders = Object.fromEntries(world.cultivators.filter(row => !assigned.has(row.id)).map(row =>
    [row.id, model?.actor === row.id ? model.reply : rest]));
  const accepted = vi.fn();
  const after = advanceWorldTick(world, orders, undefined, model ? 'deferred' : 'utility', accepted, {
    sectJobAssignments: board, modelActors: model ? new Set([model.actor]) : undefined,
    captureTrace: false, capturePresentation: false,
  });
  expect(after.tick).toBe(world.tick + 1);
  if (model) expect(accepted).toHaveBeenCalledWith(model.actor, true);
  return after;
}

function checkMoment(world: WorldState, moment: SectComicMoment) {
  const template = findSectComedyTemplate(moment.templateId);
  if (!template) throw new Error('Expected a real template in the registry');
  const speaker = person(world, moment.speakerId);
  expect(speaker.alive).toBe(true);
  expect(speaker.sectId).toBe(team(world).sectId);
  expect(template.match.phase).toBe(moment.source.phase);
  const projection = projectSectComicMoment(world, moment);
  expect(projection?.report).not.toMatch(/\{(?:name|site|job|sect)\}/u);
  if (projection?.chatHook && projection.chatHook.group !== 'own') {
    const publicProof = moment.source.phase !== 'ambient' && moment.source.reportEventId;
    expect(world.events.some(event => event.tick === moment.tick && event.id === publicProof &&
      event.witnessScope === undefined)).toBe(true);
  }
  expect(world.events.filter(event => event.id === sectComicEventId(moment.tick, team(world).sectId)))
    .toMatchObject([{ tick: moment.tick, actorIds: [speaker.id], witnessScope: 'participants' }]);
  if (template.match.quirks?.length) {
    expect(speaker.quirks).toEqual(expect.arrayContaining([...template.match.quirks]));
  }
  if (moment.source.phase !== 'ambient') {
    const source = moment.source;
    const report = team(world).latestReport;
    expect(report?.settledTick).toBe(moment.tick);
    const row = report?.rows.find(row => row.discipleId === speaker.id && row.jobId === source.jobId);
    expect(row?.phase).toBe(source.phase);
    expect(row?.sourceEventId).toEqual(source.reportEventId);
    if (source.phase === 'performed') expect(row?.tier).toBe(source.tier);
    else {
      expect(row?.tier).toBeUndefined();
      expect(row?.effects).toEqual([]);
      expect(moment.effects).toEqual([]);
    }
  } else if(moment.effects.length){
    expect(world.locations.some(site=>site.id===moment.siteId)).toBe(true);
    expect(projection?.report).toContain(speaker.name);
  }
}

describe('原生月步的山门趣闻供给', () => {
  it('新版桥段过七成有物质后果、十种双怪癖组合、四位可入门的怪人', () => {
    const templates = SECT_COMEDY_TEMPLATES;
    expect(new Set(templates.map(row => row.id)).size).toBe(templates.length);
    expect(templates.length).toBeGreaterThanOrEqual(86);
    expect(templates.filter(row=>row.effects.some(effect=>effect.kind!=='qi')).length/templates.length).toBeGreaterThanOrEqual(.7);
    expect(new Set(templates.flatMap(row=>row.effects.flatMap(effect=>effect.kind==='recruit'?[effect.template]:[]))).size)
      .toBeGreaterThanOrEqual(4);
    const pairs = templates.flatMap(row => row.match.quirks?.length === 2
      ? [[...row.match.quirks].sort().join('|')] : []);
    expect(new Set(pairs).size).toBeGreaterThanOrEqual(10);
    for (const row of templates) {
      expect(findSectComedyTemplate(row.id)).toEqual(row);
      expect(new Set(row.match.quirks).size).toBe(row.match.quirks?.length ?? 0);
      expect(row.report.trim().length).toBeGreaterThan(0);
      expect(row.quote.trim().length).toBeGreaterThan(0);
      expect(`${row.report}${row.quote}${row.chatHook?.line ?? ''}`).not.toMatch(/<[^>]*>|实付|托管|凭据|原生|不替|不补/u);
      if(row.match.phase==='on_route'||row.match.phase==='unavailable')expect(row.effects).toEqual([]);
      if(row.match.quirks?.length===2)expect(row.effects.some(effect=>effect.kind!=='qi')).toBe(true);
      if(row.effects.length)expect(row.report).toMatch(/\{name\}.*\{site\}/u);
    }
  });

  it.each(['repeat', 'varied'] as const)('%s：连续12次真月步都有新趣闻，至少八个不同模板', lane => {
    let world: WorldState = starter();
    const original = encodeEraWorldSave(world);
    const opening = world;
    const ids = team(world).foundingDiscipleIds;
    const [guard, extra] = ids;
    const idsSeen = new Set<string>();
    let lawfulEffects = 0;
    for (let month = 0; month < 12; month++) {
      const board: SectJobAssignment[] = [{ discipleId: guard, jobId: 'guard' }];
      if (lane === 'varied') board.push({ discipleId: extra, jobId: (['cultivate', 'gather', 'kitchen'] as const)[month % 3] });
      const before = world;
      world = advance(world, board);
      const moment = fresh(world);
      checkMoment(world, moment);
      idsSeen.add(moment.templateId);
      const watch = team(world).latestReport?.rows.find(row => row.discipleId === guard);
      expect(watch).toMatchObject({ phase: 'performed', jobId: 'guard' });
      if (lane === 'repeat' && moment.speakerId === guard) {
        const followUp = watch?.effects.flatMap(effect => effect.kind === 'qi' ? [effect.amount] : []) ?? [];
        const comicQi = moment.effects.flatMap(effect => effect.kind === 'qi' ? [effect.amount] : []);
        const total = [...followUp, ...comicQi].reduce((sum, amount) => sum + amount, 0);
        expect(person(world, guard).qiProgress - person(before, guard).qiProgress).toBeCloseTo(total, 8);
        if (comicQi.some(amount => amount !== 0)) lawfulEffects++;
      }
      if (month === 5) world = decodeEraWorldSave(encodeEraWorldSave(world));
    }
    expect(idsSeen.size, [...idsSeen].join(',')).toBeGreaterThanOrEqual(8);
    if (lane === 'repeat') expect(lawfulEffects).toBeGreaterThan(0);
    expect(encodeEraWorldSave(opening)).toBe(original);
  });

  it('未接到货的跑腿、无人或关了灶房时，不造送达、奖赏与传话人', () => {
    const world = starter();
    const [courier, cook, departed] = team(world).foundingDiscipleIds;
    const runner = person(world, courier);
    runner.exploredTileIds = world.terrain.tiles.filter(tile => tile.biome !== '魔渊' && tile.biome !== '毒沼').map(tile => tile.id);
    team(world).buildings.kitchen = 0;
    const noLongerMember = person(world, departed);
    noLongerMember.alive = false;
    noLongerMember.hp = 0;
    const branch = advance(world, [{ discipleId: courier, jobId: 'deliver' }, { discipleId: cook, jobId: 'kitchen' }]);
    const report = team(branch).latestReport;
    expect(report?.rows).toMatchObject([
      { discipleId: courier, jobId: 'deliver', phase: 'on_route', effects: [] },
      { discipleId: cook, jobId: 'kitchen', phase: 'unavailable', effects: [] },
    ]);
    expect(report?.rows.every(row => row.tier === undefined)).toBe(true);
    expect(person(branch, courier).locationId).not.toBe(runner.locationId);
    expect(branch.couriers.dispatches.some(row => row.courierId === courier)).toBe(false);
    expect(team(branch).buildings.kitchen).toBe(0);
    expect(branch.events.some(row => row.id === `evt-${branch.tick}-${cook}-management-kitchen`)).toBe(false);
    const moment = fresh(branch);
    expect(moment.source.phase).not.toBe('performed');
    if(moment.source.phase!=='ambient')expect(moment.effects).toEqual([]);
    expect(moment.speakerId).not.toBe(departed);
    checkMoment(branch, moment);
  });

  it('Cognitive JSON 的未派工订单与 Utility 真月步结出同一趣闻，可读档而不奖两次', async () => {
    const world = starter();
    const [guard, independent] = team(world).foundingDiscipleIds;
    const response = vi.fn(async () => new Response(JSON.stringify({ choices: [
      { message: { content: JSON.stringify({ chosenAction: 'REST' }) } },
    ] })));
    vi.stubGlobal('fetch', response);
    let reply: LLMDecisionPayload | undefined;
    try {
      llmScheduler.resetTickBudget();
      reply = await requestCultivatorLLMDecision(person(world, independent), world, {
        enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'sect-comedy-test',
      }, world.tick + 1);
      expect(response).toHaveBeenCalledOnce();
      expect(reply?.chosenAction).toBe('REST');
    } finally {
      vi.unstubAllGlobals();
      llmScheduler.resetTickBudget();
    }
    if (!reply) throw new Error('Expected actually decoded unassigned model order');
    const board = [{ discipleId: guard, jobId: 'guard' }] as const;
    const utility = advance(world, board);
    const cognitive = advance(world, board, { actor: independent, reply });
    expect(fresh(cognitive)).toEqual(fresh(utility));
    expect(team(cognitive).latestReport).toEqual(team(utility).latestReport);
    expect(cognitive.random).toEqual(utility.random);
    const bytes = encodeEraWorldSave(utility);
    const restored = decodeEraWorldSave(bytes);
    expect(fresh(restored)).toEqual(fresh(utility));
    const rendered = projectSectComicMoment(restored);
    expect(rendered).toMatchObject({ templateId: fresh(utility).templateId, speakerId: fresh(utility).speakerId });
    expect(rendered?.quote.trim().length).toBeGreaterThan(0);
    expect(settleSectComedyMonth(restored, world)).toBeUndefined();
    expect(encodeEraWorldSave(restored)).toBe(bytes);
    expect(team(advance(restored)).comedy?.moments.filter(row => row.tick === utility.tick)).toEqual([fresh(utility)]);
  });
});
