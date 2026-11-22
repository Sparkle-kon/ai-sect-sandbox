import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {activeAvatar,possessAvatar} from '../src/engine/avatarEngine';
import {activeRoguelikeEncounter,chooseRoguelikeEncounterDecision,resolveGuidedRoguelikeChoice,settleRoguelikeEncounter}
  from '../src/engine/roguelikeEncounterEngine';
import {sectGateNominalReputation,sectGateReceiptText,sectGateReputationDelta} from '../src/engine/sectGateTrialEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const memberId='npc-2',leaderId='npc-1',siteId='loc-taixu',sectId='sect-qingyun';
const actor=(world:WorldState)=>world.cultivators.find(row=>row.id===memberId)!;
const faction=(world:WorldState)=>world.sects.find(row=>row.id===sectId)!;
const settled=(world:WorldState)=>world.roguelikeEncounters?.find(row=>row.kind==='sect-gate');
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'静候。'};
const enter:LLMDecisionPayload={chosenAction:'EXPLORE',targetLocationId:siteId,innerMonologue:'亲身回到本门山门。'};
const month=(world:WorldState,memberOrder=rest)=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(row=>[row.id,row.id===memberId?memberOrder:rest])),()=>.9,'utility');

function entered(guided=true){
  const initial=createInitialWorld(1,'spirit-bloom');
  const origin=actor(initial).locationId,stones=actor(initial).spiritStones;
  expect(origin).not.toBe(siteId);
  expect(initial.cultivators.find(row=>row.id===leaderId)).toMatchObject({locationId:siteId,sectRank:'掌门',sectId});
  if(guided)expect(possessAvatar(initial,memberId)).toBe(true);
  const world=month(initial,enter);
  expect(actor(world)).toMatchObject({locationId:siteId,spiritStones:stones});
  return {initial,world,origin};
}

describe('native occupied sect gate at the actual local threshold',()=>{
  it('opens on real travel without loot and records three distinct bounded lawful results on exact sibling choices',()=>{
    const {world,origin}=entered(),before=JSON.stringify(world),offer=settled(world)!;
    expect(activeAvatar(world)).toBe(actor(world));
    expect(activeRoguelikeEncounter(world,actor(world))).toBe(offer);
    expect(offer).toMatchObject({actorId:memberId,openedTick:world.tick,siteId,fromSiteId:origin,guided:true,
      status:'offered',sectGate:{sectId,leaderId,possessionUntilTick:world.playerAvatar.possessionUntilTick}});
    expect(offer.witnessId).toBeUndefined();
    expect(world.events).toContainEqual(expect.objectContaining({id:`evt-${offer.id}-open`,actorIds:[memberId],
      witnessScope:'participants',category:'intrigue',locationId:siteId,...sectGateReceiptText()}));
    const amount=faction(world).reputation;
    for(const [choice,delta] of [['cautious',2],['bold',1],['leave',0]] as const){
      const result=resolveGuidedRoguelikeChoice(world,offer.id,choice);
      expect(result).not.toBe(world);
      expect(result.tick).toBe(world.tick);
      expect(actor(result)).toEqual(actor(world));
      expect(result.random).toEqual(world.random);
      expect(faction(result).reputation).toBe(amount+delta);
      expect(settled(result)).toMatchObject({status:'resolved',resolvedTick:result.tick,choice,outcome:{success:choice!=='leave',
        qiDelta:0,hpDelta:0,karmaDelta:0,lifespanDelta:0,affinityDelta:0,sectReputationDelta:delta}});
      expect(result.events).toContainEqual(expect.objectContaining({id:`evt-${offer.id}-settled`,actorIds:[memberId],
        witnessScope:'participants',category:'intrigue',locationId:siteId,...sectGateReceiptText(choice)}));
      expect(resolveGuidedRoguelikeChoice(result,offer.id,choice)).toBe(result);
    }
    expect(JSON.stringify(world)).toBe(before);
    expect(sectGateNominalReputation('魔道','bold')).toBe(2);
    expect(sectGateReputationDelta('中立','bold',99.5)).toBe(.5);
    expect(sectGateReputationDelta('正道','cautious',100)).toBe(0);
  });

  it('does not give the model or NPC an answer, and waits only the exact occupied opening month',()=>{
    const {world}=entered(),offer=settled(world)!;
    expect(chooseRoguelikeEncounterDecision(world,actor(world))).toBeUndefined();
    expect(settleRoguelikeEncounter(world,actor(world),offer.id,'leave')).toBeNull();
    expect(settleRoguelikeEncounter(world,actor(world),offer.id,'cautious')).toBeNull();
    expect(settled(world)?.status).toBe('offered');
    expect(settled(entered(false).world)).toBeUndefined();
    const later=month(world);
    expect(settled(later)).toMatchObject({status:'expired',resolvedTick:later.tick});
    expect(later.events.some(row=>row.id===`evt-${offer.id}-settled`)).toBe(false);
    expect(resolveGuidedRoguelikeChoice(later,offer.id,'leave')).toBe(later);
  });

  it('rejects changed incumbent, body, location, or stamped exact current possession before paying',()=>{
    const {world}=entered(),offer=settled(world)!;
    const cases:((copy:WorldState)=>void)[]=[
      copy=>{faction(copy).leaderId='elder-taixu-1';},
      copy=>{copy.cultivators.find(row=>row.id===leaderId)!.locationId='loc-market';},
      copy=>{copy.locations.find(row=>row.id===siteId)!.ownerSectId='sect-danxia';},
      copy=>{actor(copy).sectId='sect-danxia';},
      copy=>{copy.playerAvatar.possessionUntilTick=copy.tick;},
      copy=>{copy.playerAvatar.possessionUntilTick=(copy.playerAvatar.possessionUntilTick??0)+1;},
      copy=>{expect(possessAvatar(copy,null)).toBe(true);},
    ];
    for(const disrupt of cases){
      const copy=structuredClone(world);
      disrupt(copy);
      expect(activeRoguelikeEncounter(copy,actor(copy))).toBeUndefined();
      expect(resolveGuidedRoguelikeChoice(copy,offer.id,'bold')).toBe(copy);
      expect(faction(copy).reputation).toBe(faction(world).reputation);
    }
  });
});
