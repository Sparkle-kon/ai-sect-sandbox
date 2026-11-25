import { describe, expect, it, vi } from 'vitest';
import { createManagedSectWorld } from '../src/engine/starterSectWorld';
import { planSectJob } from '../src/engine/sectJobs';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { SectJobAssignment, SectJobObservation } from '../src/types/sectJobs';
import type { LLMDecisionPayload, WorldEvent, WorldState } from '../src/types/world';

function actor(world: WorldState, id: string) {
  const found = world.cultivators.find(row => row.id === id);
  if (!found) throw new Error(`Unknown test actor ${id}`);
  return found;
}

function fixture() {
  const world = createManagedSectWorld(13071, 'classic', 'qingyun-odd-jobs', 0);
  const management = world?.sectManagement;
  if (!world || !management) throw new Error('Expected a real starter sect');
  const [gatherer, courier, freeDisciple] = management.foundingDiscipleIds;
  const outsider = world.cultivators.find(row => row.sectId !== management.sectId && row.alive && row.hp > 0);
  if (!gatherer || !courier || !freeDisciple || !outsider) throw new Error('Expected managed disciples and district NPCs');
  // Give the two adventurers an already explored lower map, so either native plan has real known choices.
  const alreadyExplored = world.terrain.tiles.filter(tile => tile.biome !== '魔渊' && tile.biome !== '毒沼').map(tile => tile.id);
  for (const id of [gatherer, courier]) actor(world, id).exploredTileIds = [...alreadyExplored];
  return { world, gatherer, courier, freeDisciple, outsider: outsider.id, home: management.homeSiteId };
}

const options = { capturePresentation: false, captureTrace: true } as const;
function run(world: WorldState, assignments: readonly SectJobAssignment[],
  mode: 'utility' | 'deferred' = 'utility', model?: { id: string; reply: LLMDecisionPayload }) {
  const batches: Array<readonly SectJobObservation[]> = [];
  const months: Array<readonly WorldEvent[]> = [];
  const accepted = vi.fn();
  const after = advanceWorldTick(world, model ? { [model.id]: model.reply } : undefined, undefined, mode, accepted, {
    ...options, sectJobAssignments: assignments, modelActors: model ? new Set([model.id]) : undefined,
    onSectJobsSettled: rows => { batches.push(rows); },
    onCompletedEvents: events => { months.push(events); },
  });
  return { after, batches, months, accepted };
}

describe('晨会差事走真实月步', () => {
  it.each(['utility', 'deferred'] as const)('%s：采药和跑腿各自抵达，余下弟子不被派工', async mode => {
    const { world, gatherer, courier, freeDisciple, outsider, home } = fixture();
    const yard = world.locations.find(site => site.id === home);
    if (!yard) throw new Error('Expected real starter site');
    // This branch has no local herb bed. The task must travel to a known established herb site first.
    for (const herb of ['jade_leaf', 'earth_root', 'star_bloom', 'shadow_moss'] as const) {
      yard.herbs[herb] = 0;
      yard.herbCapacity[herb] = 0;
    }
    const assignments: readonly SectJobAssignment[] = [
      { discipleId: gatherer, jobId: 'gather' }, { discipleId: courier, jobId: 'deliver' },
    ];
    const routes = assignments.map(({ discipleId, jobId }) => {
      const job = planSectJob(world, actor(world, discipleId), jobId);
      if (job.kind === 'errand') return job.siteId;
      if (job.kind !== 'native' || job.decision.chosenAction !== 'EXPLORE' || !job.decision.targetLocationId)
        throw new Error(`Expected a genuine legal destination for ${jobId}`);
      return job.decision.targetLocationId;
    });
    expect(new Set(routes).size).toBe(2);
    const before = structuredClone(world);
    let model: { id: string; reply: LLMDecisionPayload } | undefined;
    if (mode === 'deferred') {
      const response = vi.fn(async () => new Response(JSON.stringify({ choices: [
        { message: { content: JSON.stringify({ chosenAction: 'REST' }) } },
      ] })));
      vi.stubGlobal('fetch', response);
      try {
        llmScheduler.resetTickBudget();
        const reply = await requestCultivatorLLMDecision(actor(world, freeDisciple), world, {
          enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'sect-jobs-test',
        }, world.tick + 1);
        expect(response).toHaveBeenCalledOnce();
        expect(reply?.chosenAction).toBe('REST');
        if (!reply) throw new Error('Expected admitted unassigned model decision');
        model = { id: freeDisciple, reply };
      } finally {
        vi.unstubAllGlobals();
        llmScheduler.resetTickBudget();
      }
    }

    const { after, batches, months, accepted } = run(world, assignments, mode, model);
    expect(after.tick).toBe(world.tick + 1);
    expect(after.month).toBe(world.month % 12 + 1);
    expect(months).toHaveLength(1);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    for (const [index, assignment] of assignments.entries()) {
      const { discipleId, jobId } = assignment;
      const actual = actor(after, discipleId);
      const roundTrip=jobId==='deliver';
      expect(actual.locationId).toBe(roundTrip?before.sectManagement?.homeSiteId:routes[index]);
      expect(actual.currentAction).toBe(roundTrip?'REST':'EXPLORE');
      const originalHerbs={...actor(before,discipleId).herbs};
      const comedy=after.sectManagement?.comedy?.moments.at(-1);
      if(comedy?.tick===after.tick&&comedy.speakerId===discipleId)for(const effect of comedy.effects){
        if(effect.kind==='herb')originalHerbs[effect.herb]+=effect.amount;
      }
      expect(actual.herbs).toEqual(originalHerbs);
      const observation = batches[0].find(row => row.discipleId === discipleId);
      expect(observation).toMatchObject({ discipleId, jobId, tick: after.tick, siteId: routes[index], phase: roundTrip?'performed':'on_route' });
      if (observation?.sourceEventId) {
        expect(months[0].find(row => row.id === observation.sourceEventId))
          .toMatchObject({ tick: after.tick, actorIds: expect.arrayContaining([discipleId]) });
      }
      expect(months[0].some(row => row.actorIds.includes(discipleId) &&
        /delivery|deliver|cargo/iu.test(row.id))).toBe(roundTrip);
    }
    expect(batches[0].some(row => row.discipleId === freeDisciple || row.discipleId === outsider)).toBe(false);
    expect(after.decisionTrace.records.find(row => row.actorId === freeDisciple && row.tick === after.tick))
      .toMatchObject(model ? { source: 'model', chosenAction: 'REST', applied: true } : { source: 'utility' });
    if (model) expect(accepted).toHaveBeenCalledWith(freeDisciple, true);
    expect(world).toEqual(before);
  });

  it('已亲在药地才记采药完成，并把汇报指向实际采药记录', () => {
    const { world, gatherer, home } = fixture();
    const person = actor(world, gatherer);
    const plan = planSectJob(world, person, 'gather');
    if (plan.kind !== 'native' || plan.decision.chosenAction !== 'GATHER_HERBS' || !plan.decision.targetHerbId)
      throw new Error('Expected the real stocked home herb plot to support harvest');
    const herb = plan.decision.targetHerbId;
    const assignment = { discipleId: gatherer, jobId: 'gather' } as const;
    const { after, batches, months } = run(world, [assignment]);
    const result = batches[0][0];
    expect(actor(after, gatherer).herbs[herb]).toBeGreaterThan(person.herbs[herb]);
    expect(result).toMatchObject({ ...assignment, tick: after.tick, phase: 'performed', siteId: home,
      sourceEventId: `evt-${after.tick}-${gatherer}-alchemy` });
    expect(months[0].filter(event => event.id === result.sourceEventId)).toMatchObject([
      { tick: after.tick, actorIds: [gatherer], locationId: home },
    ]);
  });

  it('不把外出的守门人算作在岗；走回山门也只是当月归途', () => {
    const { world, gatherer, home } = fixture();
    const person = actor(world, gatherer);
    const away = world.locations.find(site => site.type === 'market');
    if (!away) throw new Error('Expected an actual offsite market');
    person.locationId = away.id;
    const assignment = { discipleId: gatherer, jobId: 'guard' } as const;
    const plan = planSectJob(world, person, assignment.jobId);
    expect(plan).toMatchObject({ kind: 'native', phase: 'on_route', decision: {
      chosenAction: 'EXPLORE', targetLocationId: home,
    } });
    const { after, batches } = run(world, [assignment]);
    expect(actor(after, gatherer)).toMatchObject({ locationId: home, currentAction: 'EXPLORE' });
    expect(batches[0].find(row => row.discipleId === gatherer)).toMatchObject({
      ...assignment, tick: after.tick, phase: 'on_route', siteId: home,
    });
    expect(actor(after, gatherer).guardAssignment).toBeUndefined();
    expect(actor(world, gatherer).locationId).toBe(away.id);
  });

  it('原生吐纳留在山门；同一月的重复、外人和未知牌整批无效', () => {
    const { world, gatherer, outsider, home } = fixture();
    const person = actor(world, gatherer);
    person.hp = Math.round(person.maxHp * .75);
    person.qiProgress = 12;
    person.techniqueMastery = 0;
    const valid = { discipleId: gatherer, jobId: 'cultivate' } as const;
    const { after, batches } = run(world, [valid]);
    const changed = actor(after, gatherer);
    expect(changed.locationId).toBe(home);
    expect(changed.techniqueMastery).toBeGreaterThan(person.techniqueMastery);
    expect(changed.qiProgress).toBeGreaterThan(person.qiProgress);
    expect(batches[0]).toHaveLength(1);
    expect(batches[0][0]).toMatchObject({ ...valid, tick: after.tick, phase: 'performed' });

    const next = run(after, []);
    expect(next.after.tick).toBe(after.tick + 1);
    expect(next.batches.flat()).toEqual([]);
    expect(batches[0][0]).toMatchObject({ ...valid, tick: after.tick });

    const control = run(world, []);
    for (const batch of [
      [valid, { ...valid, jobId: 'deliver' } as const],
      [valid, { ...valid, discipleId: outsider }],
      [valid, { ...valid, jobId: 'not-a-job' } as unknown as SectJobAssignment],
      [valid, { ...valid, discipleId: '__proto__' }],
      [{ ...valid, targetLocationId: 'loc-market', payout: 999 } as SectJobAssignment],
      [Object.setPrototypeOf({}, valid) as SectJobAssignment],
    ]) {
      const rejected = run(world, batch);
      expect(rejected.batches).toEqual([]);
      expect(rejected.after).toEqual(control.after);
      expect(rejected.months).toEqual(control.months);
    }
  });
});
