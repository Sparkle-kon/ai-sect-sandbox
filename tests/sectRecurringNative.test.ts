import { describe, expect, it, vi } from 'vitest';
import { llmScheduler } from '../src/engine/llmScheduler';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { projectSectRecurring, settleSectRecurringMonth } from '../src/engine/sectRecurring';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { createManagedSectWorld } from '../src/engine/starterSectWorld';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { SECT_RECURRING_ROLES, sectRecurringEventId, sectRecurringIdentity } from '../src/types/sectRecurring';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '先在原处歇息。' };
function starter() {
  const world = createManagedSectWorld(13071, 'classic', 'qingyun-odd-jobs', 0);
  if (!world?.sectManagement?.debt) throw new Error('Expected actual managed genesis and original Wang debt');
  return world;
}
function team(world: WorldState) {
  const value = world.sectManagement;
  if (!value) throw new Error('Expected managed sect');
  return value;
}
function ledger(world: WorldState) {
  const value = team(world).recurring;
  if (!value) throw new Error('Expected five actual recurring entities in the native world record');
  return value;
}
function person(world: WorldState, id: string) {
  const actor = world.cultivators.find(row => row.id === id);
  if (!actor) throw new Error(`Unknown cultivator ${id}`);
  return actor;
}
function identity(world: WorldState) {
  const { sectId, debt } = team(world);
  if (!debt) throw new Error('Original debt unexpectedly gone');
  return sectRecurringIdentity(sectId, debt.creditorId);
}
function beast(world: WorldState, id: string) {
  const row = world.spiritBeasts.find(candidate => candidate.id === id);
  if (!row) throw new Error('Expected one living native starter cat');
  return row;
}

function month(world: WorldState, model?: { id: string; reply: LLMDecisionPayload },
  additional: Readonly<Record<string, LLMDecisionPayload>> = {}, holdBeast = false) {
  const settled = vi.fn();
  const orders = Object.fromEntries(world.cultivators.filter(row => row.alive).map(row =>
    [row.id, additional[row.id] ?? (model?.id === row.id ? model.reply : rest)]));
  const next = advanceWorldTick(world, orders, holdBeast ? () => .9999 : undefined, model ? 'deferred' : 'utility', settled, {
    modelActors: model ? new Set([model.id]) : undefined,
    capturePresentation: false,
  });
  expect(next.tick).toBe(world.tick + 1);
  if (model) expect(settled).toHaveBeenCalledWith(model.id, true);
  return next;
}
/** Discover the already existing neighboring slope; location changes only through native travel. */
function travelOrder(world: WorldState, id: string, siteId: string) {
  const subject = person(world, id);
  const site = world.locations.find(row => row.id === siteId);
  const tile = site && terrainTileAt(world, site.x, site.y);
  if (!tile) throw new Error('Expected the actual backhill map tile');
  if (!subject.exploredTileIds.includes(tile.id)) subject.exploredTileIds.push(tile.id);
  return { chosenAction: 'EXPLORE', targetLocationId: siteId, innerMonologue: '循熟路走一趟后山。' } as const;
}

function reseal(world: WorldState) {
  const bytes = encodeEraWorldSave(world), restored = decodeEraWorldSave(bytes);
  expect(encodeEraWorldSave(restored)).toBe(bytes);
  return restored;
}
function current(world: WorldState) {
  return ledger(world).encounters.filter(row => row.tick === world.tick);
}

describe('固定笑点跟着真实人、兽与月份回归', () => {
  it('十二个月原生月步各角色至少两次出现，私人旧事追溯到本人原记忆', () => {
    const opening = starter(), bytes = encodeEraWorldSave(opening);
    const ids = identity(opening);
    const first = month(opening);
    expect(person(first, ids.wang).name).toBe('王掌柜');
    expect(first.sects.find(row => row.id === ids.rivalSectId)).toMatchObject({
      leaderId: ids.rival, headquartersId: ids.rivalSiteId,
    });
    expect(beast(first, ids.cat).alive).toBe(true);
    expect(person(first, ids.ancestor).alive).toBe(true);
    expect(person(first, ids.host).alive).toBe(true);
    expect(new Set(SECT_RECURRING_ROLES.map(role => ids[role])).size).toBe(5);
    let world = first;
    const walker = team(first).foundingDiscipleIds[0];
    const counts = new Map<string, number>();
    const recalls = new Set<string>();
    for (let i = 0; i < 12; i++) {
      if (i > 0) {
        const target = beast(world, ids.cat).locationId;
        world = month(world, undefined, person(world, walker).locationId === target ? {} :
          { [walker]: travelOrder(world, walker, target) }, true);
      }
      const batch = current(world);
      expect(batch.length).toBeGreaterThan(0);
      expect(new Set(batch.map(row => row.role)).size).toBe(batch.length);
      for (const encounter of batch) {
        expect(encounter.entityId).toBe(ids[encounter.role]);
        const shell = world.events.find(row => row.id === sectRecurringEventId(world.tick, team(world).sectId, encounter.role));
        expect(shell).toMatchObject({ tick: world.tick, witnessScope: 'participants' });
        expect(shell?.actorIds).not.toContain(ids.cat);
        counts.set(encounter.role, (counts.get(encounter.role) ?? 0) + 1);
        const view = projectSectRecurring(world).find(row => row.role === encounter.role);
        expect(view).toMatchObject({ entityId: encounter.entityId, outcome: encounter.outcome });
        if (encounter.role === 'rival') {
          const relevant = world.sects.filter(row => row.id === ids.rivalSectId || row.id === team(world).sectId);
          for (const sect of relevant) expect(view?.report).toContain(String(Math.floor(sect.reputation)));
          expect(shell?.duelWinnerId).toBeUndefined();
        }
        if (view?.sourceEventId) {
          const publicEvent = world.events.find(row => row.id === view.sourceEventId);
          expect(publicEvent?.tick).toBe(world.tick);
          expect(publicEvent?.witnessScope).toBeUndefined();
        }
        if (encounter.recalled) {
          const recalled = encounter.recalled;
          expect(recalled.tick).toBeLessThan(encounter.tick);
          const native = person(world, recalled.memory.actorId);
          expect([...native.memories, ...native.coreMemories].find(row => row.id === recalled.memory.id))
            .toMatchObject({ tick: recalled.tick });
          expect(ledger(world).encounters.some(row => row.entityId === encounter.entityId &&
            row.role === encounter.role && row.tick === recalled.tick && row.memory?.id === recalled.memory.id)).toBe(true);
          recalls.add(encounter.role);
        }
      }
      if (i === 5) world = reseal(world);
    }
    for (const role of SECT_RECURRING_ROLES) expect(counts.get(role), role).toBeGreaterThanOrEqual(2);
    expect(recalls.size).toBeGreaterThanOrEqual(2);
    expect(encodeEraWorldSave(opening)).toBe(bytes);
    expect(projectSectRecurring(reseal(world))).toEqual(projectSectRecurring(world));
  });

  it('同地同门的余丹只少一枚，异地与外人或空手不会凭空少丹', () => {
    const opening = month(starter());
    const ids = identity(opening);
    const holder = person(opening, team(opening).foundingDiscipleIds[0]);
    const slope = ledger(opening).catHomeSiteId;
    expect(beast(opening, ids.cat).locationId).toBe(slope);
    holder.pills.foundation = 3;
    holder.pills.heart_poison = 2;
    const away = opening.locations.find(site => site.id !== holder.locationId && site.type === 'market');
    if (!away) throw new Error('Expected real away market');
    const outsider = person(opening, ids.wang);
    expect(outsider.locationId).toBe(away.id);
    outsider.pills.foundation = 6;

    const staged = month(opening, undefined, { [holder.id]: travelOrder(opening, holder.id, slope) }, true);
    expect(person(staged, holder.id).locationId).toBe(slope);
    expect(person(staged, holder.id).pills.foundation).toBe(3);
    const next = month(staged, undefined, {}, true);
    const row = current(next).find(encounter => encounter.role === 'cat');
    expect(row).toMatchObject({ entityId: ids.cat, outcome: 'pill_taken',
      pill: { holderId: holder.id, id: 'foundation', count: 1 }, siteId: slope });
    expect(person(next, holder.id).pills.foundation).toBe(2);
    expect(person(next, holder.id).pills.heart_poison).toBe(2);
    expect(person(next, outsider.id).pills.foundation).toBe(6);
    expect(beast(next, ids.cat).cultivation).toBe(beast(opening, ids.cat).cultivation + 1);
    expect(beast(next, ids.cat).tamedBy).toBeUndefined();
    const saved = reseal(next);
    const bytes = encodeEraWorldSave(saved);
    expect(settleSectRecurringMonth(saved, staged, [])).toEqual([]);
    expect(encodeEraWorldSave(saved)).toBe(bytes);
    expect(person(month(saved), holder.id).pills.foundation).toBe(2);

    const noSpare = month(starter());
    const resident = person(noSpare, team(noSpare).foundingDiscipleIds[0]);
    resident.pills.foundation = 1;
    resident.pills.heart_poison = 4;
    const unwelcome = person(noSpare, identity(noSpare).wang);
    unwelcome.pills.foundation = 7;
    const refuseSite = ledger(noSpare).catHomeSiteId;
    const bothAtSlope = month(noSpare, undefined, {
      [resident.id]: travelOrder(noSpare, resident.id, refuseSite),
      [unwelcome.id]: travelOrder(noSpare, unwelcome.id, refuseSite),
    }, true);
    expect(person(bothAtSlope, unwelcome.id).locationId).toBe(refuseSite);
    const sighting = month(bothAtSlope, undefined, {}, true);
    expect(current(sighting).find(encounter => encounter.role === 'cat')).toMatchObject({ outcome: 'cat_sighting' });
    expect(person(sighting, resident.id).pills).toEqual(resident.pills);
    expect(person(sighting, unwelcome.id).pills.foundation).toBe(7);
  });

  it('遗失老记忆不乱补引语，死人和死猫不会再回来', () => {
    let world = month(starter());
    const ids = identity(world);
    world = month(world);
    const latest = current(world).find(row => row.role === 'wang');
    if (!latest?.recalled) throw new Error('Expected original Wang to actually recall his dated previous entry');
    const recalling = latest.recalled.memory;
    const kept = projectSectRecurring(world).find(row => row.role === 'wang');
    expect(kept?.recall).toBeTruthy();
    const fork = structuredClone(world);
    const witness = person(fork, recalling.actorId);
    witness.memories = witness.memories.filter(row => row.id !== recalling.id);
    witness.coreMemories = witness.coreMemories.filter(row => row.id !== recalling.id);
    expect(projectSectRecurring(fork).find(row => row.role === 'wang')?.recall).toBeUndefined();

    for (const deadId of [ids.ancestor, ids.host]) {
      const dead = person(fork, deadId);
      dead.alive = false;
      dead.hp = 0;
    }
    const deadCat = beast(fork, ids.cat);
    deadCat.alive = false;
    deadCat.hp = 0;
    fork.cultivators = fork.cultivators.filter(row => row.id !== ids.rival);
    for (let i = 0; i < 6; i++) {
      world = month(i === 0 ? fork : world);
      expect(current(world).some(row => row.role === 'ancestor' || row.role === 'host' || row.role === 'cat' || row.role === 'rival')).toBe(false);
    }
    expect(beast(world, ids.cat).alive).toBe(false);
    expect(person(world, ids.ancestor).alive).toBe(false);
    expect(world.cultivators.some(row => row.id === ids.rival)).toBe(false);
  });

  it('Utility 与真正解码的模拟 Cognitive 同月产出相同回归、同一随机流', async () => {
    const world = starter();
    const free = team(world).foundingDiscipleIds[0];
    const response = vi.fn(async () => new Response(JSON.stringify({ choices: [
      { message: { content: JSON.stringify({ chosenAction: 'REST' }) } },
    ] })));
    vi.stubGlobal('fetch', response);
    let reply: LLMDecisionPayload | undefined;
    try {
      llmScheduler.resetTickBudget();
      reply = await requestCultivatorLLMDecision(person(world, free), world, {
        enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'sects-recurring',
      }, world.tick + 1);
      expect(response).toHaveBeenCalledOnce();
      expect(reply?.chosenAction).toBe('REST');
    } finally {
      vi.unstubAllGlobals();
      llmScheduler.resetTickBudget();
    }
    if (!reply) throw new Error('Expected admitted native decision');
    const utility = month(world), cognitive = month(world, { id: free, reply });
    expect(ledger(cognitive)).toEqual(ledger(utility));
    expect(cognitive.random).toEqual(utility.random);
    expect(projectSectRecurring(cognitive)).toEqual(projectSectRecurring(utility));
  });
});
