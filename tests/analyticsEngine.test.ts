import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { buildWorldAnalytics } from '../src/engine/analyticsEngine';
import type { WorldEvent, WorldState } from '../src/types/world';

const point = (world: WorldState) => ({ tick: world.tick, world });
const death = (world: WorldState, id: string, actorIds: string[], duelWinnerId?: string): WorldEvent => ({
  id, tick: world.tick, year: world.year, month: world.month, title: '陨落', description: '死亡事件',
  category: 'death', actorIds, duelWinnerId,
});

describe('analytics from the viewed timeline', () => {
  it('counts live and fallen by realm and ranks using stable explicit current-record power', () => {
    const world = createInitialWorld(9);
    const [a, b, c] = world.cultivators;
    a.combatPower = 10_000; a.alive = false; a.hp = 0;
    b.combatPower = c.combatPower = 20_000;
    b.realm = '筑基'; c.realm = '金丹';
    const result = buildWorldAnalytics(world);
    expect(result.population.fallen).toBe(1);
    expect(result.population.byRealm.find(({ realm }) => realm === a.realm)?.fallen).toBe(1);
    expect(result.hallOfFame.fallen[0]).toMatchObject({ actorId: a.id, rank: 1 });
    expect(result.hallOfFame.living[0]).toMatchObject({ actorId: c.id, rank: 1 });
    expect(result.mortality.total).toBe(0);
    expect(result.coverage.leftCensoredDeaths).toBe(1);
  });

  it('filters future or mismatched-seed snapshots, deduplicates ticks, and never interpolates balances', () => {
    const oldest = createInitialWorld(19); oldest.tick = 30;
    const viewed = structuredClone(oldest); viewed.tick = 32; viewed.sects[0].spiritStones = 300;
    const staleViewed = structuredClone(viewed); staleViewed.sects[0].spiritStones = 200;
    const future = structuredClone(viewed); future.tick = 33; future.sects[0].spiritStones = 999;
    const foreign = createInitialWorld(20); foreign.tick = 29;
    const result = buildWorldAnalytics(viewed, [point(future),point(staleViewed),point(foreign),point(oldest),point(oldest)]);
    expect(result.coverage).toEqual({ firstTick: 30, lastTick: 32, snapshotCount: 2, missingTicks: 1,
      leftCensoredDeaths: 0, completeFromStart: false });
    expect(result.treasury.points.map(({ tick }) => tick)).toEqual([30,32]);
    expect(result.treasury.points.at(-1)?.balances[viewed.sects[0].id]).toBe(300);
  });

  it('deduplicates actual victim transitions and matches canonical causes without blaming the duel winner', () => {
    const first = createInitialWorld(29);
    const next = structuredClone(first); next.tick++;
    const [winner, slain, ancient, unknown] = next.cultivators;
    for (const actor of [slain, ancient, unknown]) { actor.alive = false; actor.hp = 0; }
    next.events = [
      death(next,'evt-2-actor-kill',[winner.id,slain.id],winner.id),
      death(next,'evt-2-ancient-oldage',[ancient.id]),
      { ...death(next,'evt-2-unknown-tribulation-failure',[unknown.id]), witnessScope: 'participants' },
    ];
    const last = structuredClone(next); last.tick++;
    const result = buildWorldAnalytics(last, [point(first),point(next)]);
    expect(result.coverage.completeFromStart).toBe(true);
    expect(result.mortality.total).toBe(3);
    expect(result.population.points.map(({ tick, byRealm }) =>
      [tick, byRealm.reduce((sum, realm) => sum + realm.fallen, 0)])).toEqual([[1,0],[2,3],[3,3]]);
    expect(result.mortality.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ actorId: slain.id, cause: 'combat', eventId: 'evt-2-actor-kill' }),
      expect.objectContaining({ actorId: ancient.id, cause: 'lifespan' }),
      expect.objectContaining({ actorId: unknown.id, cause: 'unknown' }),
    ]));
    expect(result.mortality.byCause.reduce((n, item) => n + item.count, 0)).toBe(3);
    expect(result.mortality.records.every(({ actorId }) => actorId !== winner.id)).toBe(true);
  });

  it('retains the actual observed death interval across a storage gap and leaves conflicting evidence unknown', () => {
    const first = createInitialWorld(37); first.tick = 7;
    const next = structuredClone(first); next.tick = 10;
    const actor = next.cultivators[0]; actor.alive = false; actor.hp = 0;
    next.events = [
      { ...death(next,'evt-8-actor-oldage',[actor.id]), tick: 8 },
      death(next,'evt-10-actor-tribulation-failure',[actor.id]),
    ];
    expect(buildWorldAnalytics(next,[point(first)]).mortality.records[0]).toMatchObject({
      actorId:actor.id, cause:'unknown', fromTick:7, throughTick:10,
    });
  });
});
