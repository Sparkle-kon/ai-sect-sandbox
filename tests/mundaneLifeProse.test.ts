import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { resolveAlchemy } from '../src/engine/alchemyEngine';
import { advanceMarkets, resolveMarketAction } from '../src/engine/marketEngine';
import { writeMundaneLifeProse } from '../src/engine/mundaneLifeProse';
import { advanceWorldTick } from '../src/engine/worldEngine';

describe('native quiet-life prose', () => {
  it('adapts actual seed-1 quiet events without contemporaneous weather or unrecorded actions', () => {
    const expected = new Map([
      ['evt-2-npc-4-explore', /春月里，幽姬御剑到了丹霞灵谷.*99枚上品灵石/u],
      ['evt-3-elder-taixu-1-alchemy', /顾行舟在太虚剑峰采得两株翡翠灵叶/u],
      ['evt-10-npc-8-alchemy', /柳如烟借2阶炉炼筑基丹.*34灵石.*凝成一枚/u],
      ['evt-settlement-13-growth-village-loc-market-births', /开春，万仙坊市外村添了三个孩子。/u],
    ]);
    let world = createInitialWorld(1);
    for (let i = 1; i <= 13; i += 1) {
      for (const anchor of world.events.filter(event => event.tick === world.tick)) {
        const proof = expected.get(anchor.id);
        if (!proof) continue;
        const copy = writeMundaneLifeProse(anchor);
        expect(copy).toMatch(proof);
        expect(copy).not.toMatch(/落雨|大雪|风起|吐纳|潮起|井绳/u);
        expect(writeMundaneLifeProse({ ...anchor, id: `${anchor.id}-forged` })).toBeUndefined();
        const participant = { ...anchor, witnessScope: 'participants' as const };
        expect(writeMundaneLifeProse(participant)).toBeUndefined();
        expect(writeMundaneLifeProse({ ...anchor, locationId: 'loc-secret-1' })).toBeUndefined();
        expected.delete(anchor.id);
      }
      if (i < 13) world = advanceWorldTick(world, undefined, undefined, 'utility');
    }
    expect(expected.size).toBe(0);
  });

  it('recognizes an actual local exchange, rather than a bid or remote shipment', () => {
    const world = createInitialWorld(1);
    const [buyer, seller] = world.cultivators;
    for (const actor of [buyer, seller]) {
      actor.locationId = 'loc-market';
      actor.spiritStones = 1000;
    }
    seller.pills.foundation = 2;
    const sold = resolveMarketAction(world, seller, {
      chosenAction:'PLACE_MARKET_SELL',innerMonologue:'售丹',marketGood:'foundation',marketQuantity:2,marketLimitPrice:20,
    });
    const bought = resolveMarketAction(world, buyer, {
      chosenAction:'PLACE_MARKET_BUY',innerMonologue:'求丹',marketGood:'foundation',marketQuantity:2,marketLimitPrice:20,
    });
    expect(sold && writeMundaneLifeProse(sold)).toBeUndefined();
    expect(bought && writeMundaneLifeProse(bought)).toBeUndefined();
    const fact = advanceMarkets(world).find(event => event.title === '坊市当场结算');
    expect(fact && writeMundaneLifeProse(fact)).toContain('2份筑基丹，每份20灵石');
    expect(fact && writeMundaneLifeProse({ ...fact, actorIds: [buyer.id, buyer.id] })).toBeUndefined();
  });

  it('distinguishes a paid failed furnace from a successful one', () => {
    const world = createInitialWorld(1);
    const actor = world.cultivators.find(row => row.sectId === 'sect-danxia')!;
    actor.locationId = 'loc-danxia';
    actor.spiritStones = 500;
    actor.herbs.jade_leaf = 4;
    actor.herbs.earth_root = 2;
    const event = resolveAlchemy(world, actor, {
      chosenAction:'BREW_PILL',innerMonologue:'起炉',targetPillId:'foundation',
    }, () => 0.999);
    expect(event).not.toBeNull();
    if (!event) throw new Error('fixture did not use the furnace');
    expect(writeMundaneLifeProse(event)).toMatch(/丹霞谷中.*炉中没有成丹/u);
    expect(writeMundaneLifeProse({ ...event, description: event.description.replace(/\d+灵石/u,'99灵石') })).toBeUndefined();
  });

  it('retains only the public act of sitting in discussion, never the utterance or secret motive', () => {
    const start = createInitialWorld(1);
    const [first, second] = start.cultivators;
    second.locationId = first.locationId;
    const world = advanceWorldTick(start, {
      [first.id]:{chosenAction:'SOCIALIZE',innerMonologue:'不传内心独白',targetCultivatorId:second.id},
      [second.id]:{chosenAction:'REST',innerMonologue:'不传内心独白'},
    }, () => .5);
    const fact = world.events.find(event => event.id === `evt-${world.tick}-${first.id}-social`);
    expect(fact && writeMundaneLifeProse(fact)).toMatch(/坐下，说了一番天地法则。$/u);
    expect(fact && writeMundaneLifeProse(fact)).not.toMatch(/言道|“|”|内心|修为精进/u);
  });
});
