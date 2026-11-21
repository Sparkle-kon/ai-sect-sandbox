import {describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {computeHeuristicDecision,utilityRankedOrdinaryDecision,requiredBeforeOrdinaryDecision} from '../src/engine/llmBrain';
import {rankOrdinaryIntents} from '../src/engine/ordinaryIntentEngine';
import {resolveOathAction} from '../src/engine/oathEngine';
import {advanceWorldTick,executeGodIntervention} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const decision=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'只核实实到和实物。',...fields});
const actorAt=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;

describe('E2-1 narrow Utility integration and protected native urgency',()=>{
  it('keeps the actual untouched classic2031 first-turn gift proof and does not rank without prior applied evidence',()=>{
    const initial=createInitialWorld(2031,'classic'),id='npc-2';
    expect(utilityRankedOrdinaryDecision(actorAt(initial,id),initial)).toBeUndefined();
    const control=advanceWorldTick(initial,undefined,undefined,'utility');
    const gifted=advanceWorldTick(executeGodIntervention(initial,{type:'SPAWN_TREASURE',targetLocationId:'loc-vein-north'}),
      undefined,undefined,'utility');
    expect(actorAt(control,id)).toMatchObject({currentAction:'EXPLORE',realm:'金丹',realmStage:7});
    expect(actorAt(gifted,id)).toMatchObject({currentAction:'BREAKTHROUGH',realm:'金丹',realmStage:8});
  });

  it('returns the actual top exact ordinary mechanical option once successive native actions are proved',()=>{
    const original=createInitialWorld(2031),id=original.cultivators[0].id;
    const prepared=advanceWorldTick(original,Object.fromEntries(original.cultivators.map(row=>[row.id,
      decision(row.id===id?'CULTIVATE':'REST')])),()=>.99);
    const actor=actorAt(prepared,id);
    const nextTick=prepared.tick+1;prepared.tick=nextTick;
    const best=rankOrdinaryIntents(prepared,actor)[0];
    const pick=utilityRankedOrdinaryDecision(actor,prepared);
    expect(pick).toMatchObject({chosenAction:best.action});
    if(best.action==='GATHER_HERBS')expect(pick).toMatchObject({targetHerbId:best.targetHerbId});
    if(best.action==='SOCIALIZE')expect(pick).toMatchObject({targetCultivatorId:best.targetCultivatorId});
    if(best.action==='EXPLORE')expect(pick).toMatchObject({targetLocationId:best.targetLocationId});
  });

  it('protects the exact last actionable native paid oath before ordinary behavior, without guessing absent funds or inducing a RNG probe',()=>{
    const world=createInitialWorld(2031),[buyer,seller]=world.cultivators;
    const market=world.locations.find(row=>row.id==='loc-market')!;
    buyer.locationId=seller.locationId=market.id;buyer.spiritStones=seller.spiritStones=1000;
    buyer.pills.foundation=0;seller.pills.foundation=2;
    expect(resolveOathAction(world,buyer,decision('OFFER_OATH',{oathTerm:'foundation_pill',targetCultivatorId:seller.id}))).not.toBeNull();
    const targetOathId=world.oaths.contracts[0].id;
    expect(resolveOathAction(world,seller,decision('ACCEPT_OATH',{targetOathId}))).not.toBeNull();
    expect(requiredBeforeOrdinaryDecision(seller,world)?.chosenAction).not.toBe('FULFILL_OATH');
    world.tick=world.oaths.contracts[0].deadlineTick!-1;
    expect(requiredBeforeOrdinaryDecision(seller,world)).toMatchObject({chosenAction:'FULFILL_OATH',targetOathId});
    const rng=vi.fn(()=>.99);
    expect(computeHeuristicDecision(seller,world,rng)).toMatchObject({chosenAction:'FULFILL_OATH',targetOathId});
    expect(rng).not.toHaveBeenCalled();
    seller.pills.foundation=0;
    expect(requiredBeforeOrdinaryDecision(seller,world)?.chosenAction).not.toBe('FULFILL_OATH');
  });

  it('does not let an ordinary candidate stand in for actual emergency care',()=>{
    const world=createInitialWorld(2031),actor=world.cultivators[0];
    actor.hp=Math.max(1,Math.floor(actor.maxHp*.21));
    actor.pills.golden=1;
    const priority=requiredBeforeOrdinaryDecision(actor,world);
    expect(priority).toMatchObject({chosenAction:'USE_PILL',targetPillId:'golden'});
    expect(rankOrdinaryIntents(world,actor)).toEqual([]);
  });
});
