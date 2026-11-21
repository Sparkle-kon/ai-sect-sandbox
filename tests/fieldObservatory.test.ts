import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import {
  advanceFieldObservatories, availableObservatoryActions, OBSERVATORY_COST, OBSERVATORY_INBOX_LIMIT, OBSERVATORY_LEAD_TICKS,
  OBSERVATORY_RETENTION_TICKS, projectFieldObservatory, resolveObservatoryAction,
} from '../src/engine/fieldObservatoryEngine';
import { localQiWeather } from '../src/engine/weatherEngine';
import { currentVisibleTileIds, terrainTileAt } from '../src/engine/terrainEngine';
import { triggerTribulation } from '../src/engine/tribulationEngine';
import type { Cultivator, LLMDecisionPayload, WorldState } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(89);
  const [operator, listener, outsider] = world.cultivators;
  const site = world.locations.find(row => row.id === operator.locationId)!;
  listener.locationId = site.id;
  outsider.locationId = site.id;
  operator.spiritStones = OBSERVATORY_COST * 8;
  const act = (move: LLMDecisionPayload['observatoryMove'], fields: Partial<LLMDecisionPayload> = {}, actor = operator) =>
    resolveObservatoryAction(world, actor, { chosenAction: 'FIELD_OBSERVATORY', innerMonologue: '', observatoryMove: move, ...fields });
  const step = () => {
    ++world.tick;
    if (world.month === 12) { world.month = 1; ++world.year; } else ++world.month;
  };
  const target = (openedTick: number, targetCultivatorId?: string) => ({ targetLocationId: site.id, targetObservatoryTick: openedTick, targetCultivatorId });
  return { world, operator, listener, outsider, site, act, step, target };
}

const noEvidence = { runs: [], received: [], metrics: { scored: 0, kindHits: 0 } };
const own = (world: WorldState, actor: Cultivator) => projectFieldObservatory(world, actor).runs[0];

describe('paid field weather evidence', () => {
  it('charges one real private instrument cost and seals a local baseline without consulting the future', () => {
    const { world, operator, outsider, site, act } = fixture();
    const funds = operator.spiritStones;
    const before = localQiWeather(world, site);
    expect(availableObservatoryActions(operator, world)).toContainEqual({
      action: 'FIELD_OBSERVATORY', observatoryMove: 'fund', targetLocationId: site.id,
    });
    expect(act('fund', { targetLocationId: 'other-hidden-site' })).toBeNull();
    expect(act('fund')).toMatchObject({ actorIds: [operator.id], witnessScope: 'participants', locationId: site.id });
    expect(act('fund')).toBeNull();
    expect(operator.spiritStones).toBe(funds - OBSERVATORY_COST);
    const journal = world.resourceFlow.months.at(-1);
    expect(journal?.entries).toMatchObject([{
      kind: 'consumption', mechanism: 'observatory', reason: 'observatory_instrument',
      from: { kind: 'actor', id: operator.id }, good: 'stone', amount: OBSERVATORY_COST,
      visibility: { kind: 'participants', actorIds: [operator.id] },
    }]);
    const sample = { kind: before.kind, intensity: before.intensity };
    expect(own(world, operator)).toMatchObject({
      status: 'pending', openedTick: world.tick, targetTick: world.tick + OBSERVATORY_LEAD_TICKS,
      baseline: sample, forecast: sample,
    });
    expect(own(world, operator)?.reading).toBeUndefined();
    expect(projectFieldObservatory(world, outsider)).toEqual(noEvidence);
    expect(projectFieldObservatory(world)).toEqual(noEvidence);
    expect(projectFieldObservatory(world, { ...operator })).toEqual(noEvidence);
  });

  it('offers the due turn prospectively but only samples canonical location on that actual tick and scores actual error', () => {
    const { world, operator, site, act, step, target } = fixture();
    // Pick a real changing front at this site; neither engine output is mocked or overwritten.
    for (let i = 0; i < 30; i++) {
      const current = localQiWeather(world, site), future = localQiWeather(world, site, world.tick + 2);
      if (current.intensity !== future.intensity) break;
      step();
    }
    const start = world.tick;
    expect(act('fund')).not.toBeNull();
    const sealed = own(world, operator)!.forecast;
    step();
    expect(availableObservatoryActions(operator, world)).toEqual([]);
    expect(availableObservatoryActions(operator, world, world.tick + 2)).toEqual([]);
    expect(availableObservatoryActions(operator, world, world.tick + 1)).toEqual([{
      action: 'FIELD_OBSERVATORY', observatoryMove: 'measure', targetLocationId: site.id, targetObservatoryTick: start,
    }]);
    expect(act('measure', target(start))).toBeNull();
    step();
    const original = operator.locationId;
    operator.locationId = world.locations.find(row => row.id !== original)!.id;
    expect(act('measure', target(start))).toBeNull();
    operator.locationId = original;
    expect(act('measure', target(start + 1))).toBeNull();
    const { kind, intensity } = localQiWeather(world, site);
    expect(intensity).not.toEqual(sealed.intensity);
    expect(act('measure', target(start))).toMatchObject({ tick: world.tick, witnessScope: 'participants' });
    expect(act('measure', target(start))).toBeNull();
    const intensityErrorPp = Math.abs(Math.round(intensity * 100) - Math.round(sealed.intensity * 100));
    expect(own(world, operator)).toMatchObject({ status: 'measured', forecast: sealed, reading: { kind, intensity },
      kindHit: kind === sealed.kind, intensityErrorPp });
    expect(projectFieldObservatory(world, operator).metrics).toEqual({
      scored: 1, kindHits: Number(kind === sealed.kind), meanIntensityErrorPp: intensityErrorPp,
    });
    advanceFieldObservatories(world);
    expect(own(world, operator)?.status).toBe('measured');
  });

  it('closes a no-show without any reading, scores or weather reconstructed afterward', () => {
    const { world, operator, act, step, target } = fixture();
    const start = world.tick;
    expect(act('fund')).not.toBeNull();
    step(); advanceFieldObservatories(world);
    expect(own(world, operator)?.status).toBe('pending');
    step(); advanceFieldObservatories(world);
    expect(own(world, operator)).toMatchObject({ status: 'missed', targetTick: world.tick });
    expect(own(world, operator)?.reading).toBeUndefined();
    expect(act('measure', target(start))).toBeNull();
    step();
    expect(act('measure', target(start))).toBeNull();
    expect(projectFieldObservatory(world, operator).metrics).toEqual(noEvidence.metrics);
    expect(act('fund')).not.toBeNull();
  });

  it('hands an exact dated stale reading to only one actual colocated listener, cannot re-relay, and expires cleanly', () => {
    const { world, operator, listener, outsider, site, act, step, target } = fixture();
    const start = world.tick;
    expect(act('fund')).not.toBeNull();
    step(); step();
    expect(act('measure', target(start))).not.toBeNull();
    const measuredTick = world.tick;
    const reading = own(world, operator)!.reading;
    expect(act('relay', target(start, listener.id))).toBeNull();
    step();
    const remote = world.locations.find(location => location.id !== site.id)!;
    listener.locationId = remote.id;
    expect(act('relay', target(start, listener.id))).toBeNull();
    expect(act('relay', target(start, operator.id))).toBeNull();
    listener.locationId = site.id;
    const localTile = terrainTileAt(world, site.x, site.y)!;
    listener.exploredTileIds = [localTile.id];
    expect(act('relay', target(start, listener.id))).toMatchObject({ actorIds: [operator.id, listener.id],
      locationId: site.id, witnessScope: 'participants' });
    const relayedTick = world.tick;
    expect(own(world, operator)?.relayTick).toEqual(relayedTick);
    expect(projectFieldObservatory(world, listener)).toEqual({
      ...noEvidence,
      received: [{ locationId: site.id, locationName: site.name, measuredTick, relayedTick, reading, ageTicks: 1, stale: true }],
    });
    expect(projectFieldObservatory(world, outsider)).toEqual(noEvidence);
    step();
    expect(act('relay', target(start, outsider.id))).toBeNull();
    expect(act('relay', target(start, outsider.id), listener)).toBeNull();
    expect(projectFieldObservatory(world, listener).received[0]).toMatchObject({ ageTicks: 2, reading, measuredTick, relayedTick });
    while (world.tick <= measuredTick + OBSERVATORY_RETENTION_TICKS) { step(); advanceFieldObservatories(world); }
    expect(projectFieldObservatory(world, listener)).toEqual(noEvidence);
    expect(projectFieldObservatory(world, operator)).toEqual(noEvidence);
    expect(Object.keys(world.fieldObservatories.byActor)).toEqual([]);
  });

  it('suppresses even older private evidence and rollups when that site is no longer part of viewer knowledge', () => {
    const { world, operator, listener, site, act, step, target } = fixture();
    const originTick = world.tick;
    site.type = 'abyss'; // Keep the fixture site out of the independently named public locations.
    for (const sect of world.sects) if (sect.headquartersId === site.id) sect.headquartersId = 'different-hq';
    const tile = terrainTileAt(world, site.x, site.y)!;
    const remote = world.locations.find(candidate => {
      if (candidate === site) return false;
      operator.locationId = candidate.id;
      return !currentVisibleTileIds(world, operator).has(tile.id);
    })!;
    expect(remote).toBeDefined();
    operator.locationId = site.id;
    expect(act('fund')).not.toBeNull();
    step(); step();
    expect(act('measure', target(originTick))).not.toBeNull();
    step();
    expect(act('relay', target(originTick, listener.id))).not.toBeNull();
    expect(projectFieldObservatory(world, listener).received).toHaveLength(1);
    for (const actor of [operator, listener]) {
      actor.locationId = remote.id;
      actor.exploredTileIds = [];
      actor.rumors = [];
      expect(projectFieldObservatory(world, actor)).toEqual(noEvidence);
    }
  });

  it('handles canonical actor keys that overlap object prototypes without modifying global prototypes', () => {
    const { world, operator, listener, act, step, target } = fixture();
    operator.id = '__proto__';
    listener.id = 'constructor';
    const start = world.tick;
    expect(availableObservatoryActions(operator, world)).toHaveLength(1);
    expect(act('fund')).not.toBeNull();
    expect(Object.hasOwn(world.fieldObservatories.byActor, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(world.fieldObservatories.byActor)).toBe(Object.prototype);
    step(); step();
    expect(act('measure', target(start))).not.toBeNull();
    step();
    expect(act('relay', target(start, listener.id))).not.toBeNull();
    expect(Object.hasOwn(world.fieldObservatories.byActor, 'constructor')).toBe(true);
    expect(projectFieldObservatory(world, listener).received).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(world.fieldObservatories)).byActor['__proto__'].runs).toHaveLength(1);
  });

  it('limits retained messages per listener without denying actual participating operators', () => {
    const { world, listener, site, act, step, target } = fixture();
    const operators = world.cultivators.filter(person => person !== listener).slice(0, OBSERVATORY_INBOX_LIMIT + 1);
    expect(operators).toHaveLength(OBSERVATORY_INBOX_LIMIT + 1);
    const start = world.tick;
    for (const person of operators) {
      person.locationId = site.id;
      person.spiritStones = OBSERVATORY_COST;
      expect(act('fund', {}, person)).not.toBeNull();
    }
    step(); step();
    for (const person of operators) expect(act('measure', target(start), person)).not.toBeNull();
    step();
    for (const person of operators) expect(act('relay', target(start, listener.id), person)).not.toBeNull();
    expect(projectFieldObservatory(world, listener).received).toHaveLength(OBSERVATORY_INBOX_LIMIT);
    expect(world.fieldObservatories.byActor[listener.id].inbox.map(row => row.operatorId)).toEqual(operators.slice(1).map(person => person.id));
    for (const person of operators) expect(projectFieldObservatory(world, person).runs[0].relayTick).toEqual(world.tick);
  });

  it('rejects true-time measurement when an active trial interrupts the on-site operator', () => {
    const { world, operator, act, step, target } = fixture();
    const start = world.tick;
    expect(act('fund')).not.toBeNull();
    step(); step();
    operator.realm = '筑基';
    operator.realmStage = 9;
    operator.qiProgress = 100;
    expect(triggerTribulation(world, operator)).not.toBeNull();
    expect(availableObservatoryActions(operator, world)).toEqual([]);
    expect(act('measure', target(start))).toBeNull();
    advanceFieldObservatories(world);
    expect(own(world, operator)?.status).toBe('missed');
  });

  it('rejects invalid wallets, dead and detached actors without allocating state or consuming funds', () => {
    const { world, operator, act } = fixture();
    operator.spiritStones = OBSERVATORY_COST - 1;
    expect(act('fund')).toBeNull();
    operator.spiritStones = Infinity;
    expect(act('fund')).toBeNull();
    expect(act('fund', {}, { ...operator, spiritStones: OBSERVATORY_COST })).toBeNull();
    operator.spiritStones = OBSERVATORY_COST;
    operator.hp = 0;
    expect(act('fund')).toBeNull();
    expect(world.fieldObservatories.byActor).toEqual({});
    expect(world.resourceFlow.months).toEqual([]);
  });
});
