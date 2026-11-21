import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import {
  advanceSparring, availableSparringActions, resolveSparringAction, SPARRING_ACTIVE_TICKS, SPARRING_MASTERY_MAX,
  SPARRING_OFFER_TICKS, SPARRING_QI_COST, sparringLocksActor, visibleSparring,
} from '../src/engine/sparringEngine';
import type { Cultivator, LLMDecisionPayload, SparringAgreement, SparringMove } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(762);
  world.tick = 12;
  world.month = 12;
  const [proposer,partner,other] = world.cultivators;
  partner.locationId = proposer.locationId;
  for (const person of [proposer,partner,other]) {
    person.hp = person.maxHp;
    person.qiProgress = 30;
    person.techniqueMastery = 40;
  }
  const act = (actor: Cultivator, sparringMove: SparringMove, fields: Partial<LLMDecisionPayload> = {}) =>
    resolveSparringAction(world,actor,{chosenAction:'SPARRING',sparringMove,innerMonologue:'遵从双方定下的上限',...fields});
  const take = (actor: Cultivator, move: SparringMove, row: SparringAgreement) => act(actor,move,{targetSparringId:row.id});
  const offer = (sparringRounds: 1|2 = 1) => {
    expect(act(proposer,'offer',{sparringRounds,targetCultivatorId:partner.id})).not.toBeNull();
    return world.sparring.agreements.at(-1)!;
  };
  const sign = (rounds: 1|2 = 1) => {
    const row = offer(rounds);
    expect(take(partner,'accept',row)).not.toBeNull();
    return row;
  };
  const step = () => { ++world.tick; if (world.month === 12) { world.month = 1; ++world.year; } else ++world.month; };
  return {world,proposer,partner,other,act,take,offer,sign,step};
}
const assetsAndStanding = (actors: Cultivator[]) => actors.map(actor=>({
  id:actor.id,hp:actor.hp,alive:actor.alive,stones:actor.spiritStones,artifacts:actor.artifacts,
  karma:actor.karma,rank:actor.sectRank,transgressions:actor.transgressions,contribution:actor.contribution,
}));

describe('mutually consented fictional practice', () => {
  it('rejects forged scope, requires the exact recipient to consent, and never converts refusal to practice', () => {
    const { world,proposer,partner,other,act,take,offer } = fixture();
    expect(act(proposer,'offer',{sparringRounds:3 as 1,targetCultivatorId:partner.id})).toBeNull();
    expect(act(proposer,'offer',{sparringRounds:1,targetCultivatorId:proposer.id})).toBeNull();
    const w = offer();
    expect(visibleSparring(world,other)).toEqual([]);
    expect(visibleSparring(world)).toEqual([]);
    expect(take(proposer,'accept',w)).toBeNull();
    expect(take(other,'accept',w)).toBeNull();
    expect(take(partner,'ready',w)).toBeNull();
    expect(act(proposer,'offer',{sparringRounds:1,targetCultivatorId:partner.id})).toBeNull();
    const declined = take(partner,'decline',w);
    expect(declined).toMatchObject({witnessScope:'participants'});
    expect(w).toMatchObject({status:'declined',closedById:partner.id,rounds:[]});
    expect(take(partner,'accept',w)).toBeNull();
    expect(advanceSparring(world)).toEqual([]);
    expect([proposer.qiProgress,partner.qiProgress]).toEqual([30,30]);
    expect([proposer.techniqueMastery,partner.techniqueMastery]).toEqual([40,40]);
    const later = offer();
    expect(take(proposer,'withdraw',later)).not.toBeNull();
    expect(later.status).toBe('withdrawn');
  });

  it.each([true,false])('honors a real tired participant yield even if the other actor is ordered first (%s)', earlyReady => {
    const { world,proposer,partner,step,take,sign } = fixture();
    const row = sign(2);
    expect(row.deadlineTick).toBe(world.tick+SPARRING_ACTIVE_TICKS);
    expect(sparringLocksActor(world,proposer)).toBe(false);
    expect(take(proposer,'ready',row)).toBeNull();
    expect(availableSparringActions(proposer,world,false,world.tick+1).map(move=>move.sparringMove)).toEqual(['yield','ready']);
    step();
    partner.qiProgress = 0;
    expect(sparringLocksActor(world,proposer)).toBe(true);
    expect(availableSparringActions(partner,world,false).map(move=>move.sparringMove)).toEqual(['yield']);
    if (earlyReady) {
      const staged = take(proposer,'ready',row);
      expect(staged?.witnessScope).toBe('participants');
      expect(row.readiness?.actorIds).toEqual([proposer.id]);
    }
    expect(take(partner,'yield',row)).toMatchObject({title:'认可当轮认输，切磋停止'});
    expect(take(proposer,'ready',row)).toBeNull();
    expect(take(partner,'yield',row)).toBeNull();
    expect(row).toMatchObject({status:'yielded',closedTick:world.tick,closedById:partner.id,rounds:[]});
    expect(row.readiness).toBeUndefined();
    expect(sparringLocksActor(world,proposer)).toBe(true);
    expect(sparringLocksActor(world,partner)).toBe(true);
    expect(advanceSparring(world)).toEqual([]);
    expect([proposer.qiProgress,partner.qiProgress]).toEqual([30,0]);
    expect([proposer.techniqueMastery,partner.techniqueMastery]).toEqual([40,40]);
    step();
    expect(sparringLocksActor(world,proposer)).toBe(false);
  });

  it('requires both current tokens, then applies only real gains/fatigue once for each promised round', () => {
    const { world,proposer,partner,other,step,take,sign } = fixture();
    const row = sign(2);
    proposer.techniqueMastery = 99.5;
    const baseline = JSON.stringify({
      actors:assetsAndStanding(world.cultivators),relationships:world.relationships,competitions:world.competitions,bounties:world.bounties,
    });
    step();
    expect(take(partner,'ready',row)).not.toBeNull();
    expect(take(proposer,'ready',row)).not.toBeNull();
    expect(take(proposer,'ready',row)).toBeNull();
    expect([proposer.qiProgress,partner.qiProgress]).toEqual([30,30]);
    expect(row.rounds).toEqual([]);
    const worked = advanceSparring(world);
    expect(worked).toHaveLength(1);
    expect(worked[0]).toMatchObject({category:'diplomacy',witnessScope:'participants'});
    expect(worked[0]).not.toHaveProperty('duelWinnerId');
    expect(worked[0]).not.toHaveProperty('damage');
    expect(worked[0]).not.toHaveProperty('dialogue');
    expect(row.rounds).toEqual([{tick:world.tick,members:[
      {actorId:proposer.id,qiSpent:SPARRING_QI_COST,masteryGained:.5},
      {actorId:partner.id,qiSpent:SPARRING_QI_COST,masteryGained:SPARRING_MASTERY_MAX},
    ]}]);
    expect(row.status).toBe('active');
    expect(advanceSparring(world)).toEqual([]);
    expect(take(partner,'ready',row)).toBeNull();
    step();
    expect(take(proposer,'ready',row)).not.toBeNull();
    expect(take(partner,'ready',row)).not.toBeNull();
    expect(advanceSparring(world)).toHaveLength(1);
    expect(row).toMatchObject({status:'completed',closedTick:world.tick});
    expect(row.rounds[1].members[0].masteryGained).toBe(0);
    expect([proposer.qiProgress,partner.qiProgress]).toEqual([24,24]);
    expect([proposer.techniqueMastery,partner.techniqueMastery]).toEqual([100,42]);
    expect(JSON.stringify({
      actors:assetsAndStanding(world.cultivators),relationships:world.relationships,competitions:world.competitions,bounties:world.bounties,
    })).toBe(baseline);
    expect(visibleSparring(world,other)).toEqual([]);
    const page = visibleSparring(world,partner);
    expect(page).toEqual([row]);
    page[0].rounds[0].members[0].qiSpent = 99;
    expect(row.rounds[0].members[0].qiSpent).toBe(3);
  });

  it('does not carry readiness across turns or beyond an unsigned/signed deadline', () => {
    const { world,proposer,partner,step,take,offer,sign } = fixture();
    const unsigned = offer();
    expect(unsigned.offerExpiresTick).toBe(world.tick+SPARRING_OFFER_TICKS);
    for (let i=0;i<SPARRING_OFFER_TICKS;i++) step();
    expect(take(partner,'accept',unsigned)).toBeNull();
    expect(advanceSparring(world)).toHaveLength(1);
    expect(unsigned.status).toBe('expired');
    const signed = sign(1);
    step(); expect(take(proposer,'ready',signed)).not.toBeNull();
    expect(advanceSparring(world)).toEqual([]);
    expect(signed.readiness).toBeUndefined();
    step(); expect(take(partner,'ready',signed)).not.toBeNull();
    expect(advanceSparring(world)).toEqual([]);
    expect(signed.rounds).toEqual([]);
    while (world.tick < signed.deadlineTick!) step();
    expect(take(proposer,'ready',signed)).toBeNull();
    expect(take(partner,'yield',signed)).toBeNull();
    expect(advanceSparring(world)).toHaveLength(1);
    expect(signed.status).toBe('expired');
    expect([proposer.qiProgress,partner.qiProgress]).toEqual([30,30]);
  });

  it('rechecks the real place at settlement and applies nothing after the party separates', () => {
    const { world,proposer,partner,step,take,sign } = fixture();
    const row = sign();
    step();
    expect(take(proposer,'ready',row)).not.toBeNull();
    expect(take(partner,'ready',row)).not.toBeNull();
    partner.locationId = world.locations.find(site=>site.id !== row.siteId)!.id;
    expect(advanceSparring(world)).toHaveLength(1);
    expect(row).toMatchObject({status:'interrupted',rounds:[],closedTick:world.tick});
    expect([proposer.qiProgress,partner.qiProgress]).toEqual([30,30]);
    expect(advanceSparring(world)).toEqual([]);
  });
});
