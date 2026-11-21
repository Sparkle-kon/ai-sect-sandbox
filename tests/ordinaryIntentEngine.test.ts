import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {rankOrdinaryIntents,hasOrdinaryIntentHistory,matchesOrdinaryIntent,type OrdinaryIntentCandidate}
  from '../src/engine/ordinaryIntentEngine';
import {advanceOccasions,joinOccasion} from '../src/engine/occasionEngine';
import {resolveOathAction} from '../src/engine/oathEngine';
import {advanceWorldTick,executeGodIntervention} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const action=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'只核对实际候选。',...fields});
const step=(world:WorldState,choices:Record<string,LLMDecisionPayload>={})=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(row=>[row.id,choices[row.id]??action('REST')])),()=>.99);
const actorAt=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const factor=(candidate:OrdinaryIntentCandidate|undefined,kind:string)=>candidate?.factors.find(row=>row.kind===kind)?.points??0;

describe('ordinary decision factors within native legality',()=>{
  it('starts without fabricated history, then uses the strongest actual same-action run without writes or draws',()=>{
    let world=createInitialWorld(2031);
    const actorId=world.cultivators[0].id;
    expect(hasOrdinaryIntentHistory(world,actorAt(world,actorId),world.tick+1)).toBe(false);
    const choices={[actorId]:action('CULTIVATE')};
    world=step(step(step(world,choices),choices),choices);
    const actor=actorAt(world,actorId),before=JSON.stringify(world),execution=world.tick+1;
    expect(hasOrdinaryIntentHistory(world,actor,execution)).toBe(true);
    const options=rankOrdinaryIntents(world,actor,execution);
    expect(factor(options.find(row=>row.action==='CULTIVATE'),'repetition')).toBe(-27);
    expect(factor(options.find(row=>row.action==='REST'),'repetition')).toBe(0);
    expect(rankOrdinaryIntents(world,actor,execution)).toEqual(options);
    expect(JSON.stringify(world)).toBe(before);
    delete actor.ordinaryActionEvidence;
    expect(hasOrdinaryIntentHistory(world,actor,execution)).toBe(false);
    expect(factor(rankOrdinaryIntents(world,actor,execution).find(row=>row.action==='CULTIVATE'),'repetition')).toBe(0);
  });

  it('scores personality, local stock and exact physical peers, but supplies no illegal action when resources or targets vanish',()=>{
    const world=createInitialWorld(2031),[actor,peer,remote]=world.cultivators;
    const own=world.locations.find(row=>row.id===actor.locationId)!;
    peer.locationId=own.id;remote.locationId='loc-blood';
    actor.herbs.jade_leaf=0;own.herbs.jade_leaf=9;
    actor.personality='痴情';
    const options=rankOrdinaryIntents(world,actor);
    const fellowship=options.find(row=>row.action==='SOCIALIZE'&&row.targetCultivatorId===peer.id)!;
    expect(factor(fellowship,'personality')).toBe(12);
    expect(options.some(row=>row.action==='SOCIALIZE'&&row.targetCultivatorId===remote.id)).toBe(false);
    expect(options.find(row=>row.action==='GATHER_HERBS'&&row.targetHerbId==='jade_leaf')).toBeDefined();
    expect(matchesOrdinaryIntent(fellowship,action('SOCIALIZE',{targetCultivatorId:peer.id}))).toBe(true);
    expect(matchesOrdinaryIntent(fellowship,action('SOCIALIZE',{targetCultivatorId:peer.id,targetLocationId:own.id}))).toBe(false);
    actor.personality='嗜血';
    expect(factor(rankOrdinaryIntents(world,actor).find(row=>row.action==='SOCIALIZE'&&row.targetCultivatorId===peer.id),'personality')).toBe(-9);
    own.herbs.jade_leaf=0;peer.locationId='loc-blood';
    const fresh=rankOrdinaryIntents(world,actor);
    expect(fresh.some(row=>row.targetHerbId==='jade_leaf'||row.targetCultivatorId===peer.id)).toBe(false);
  });

  it('weighs only personal credible known leads and never injects a secret or fabricated lead',()=>{
    let world=createInitialWorld(2031);
    const actorId=world.cultivators[0].id;
    const known='loc-market';
    actorAt(world,actorId).locationId=known;
    world=executeGodIntervention(world,{type:'SPAWN_TREASURE',targetLocationId:known});
    const home=world.sects.find(row=>row.id===actorAt(world,actorId).sectId)!.headquartersId;
    world=step(world,{[actorId]:action('EXPLORE',{targetLocationId:home})});
    const actor=actorAt(world,actorId);
    expect(actor.locationId).toBe(home);
    const witnessed=actor.rumors.find(row=>row.lead&&row.locationId===known)!;
    expect(witnessed).toBeDefined();
    const choices=()=>rankOrdinaryIntents(world,actor);
    expect(factor(choices().find(row=>row.targetLocationId===known),'known_intel')).toBeGreaterThan(0);
    actor.rumors=[{...witnessed,provenance:'fabricated'}, {...witnessed,id:'actual-secret-local-record',locationId:'loc-secret-1'}];
    expect(factor(choices().find(row=>row.targetLocationId===known),'known_intel')).toBe(0);
    expect(choices().some(row=>row.targetLocationId==='loc-secret-1')).toBe(false);
  });

  it('recognizes a genuinely settled local old promise, never a pending offer or remote party',()=>{
    const world=createInitialWorld(2031),[buyer,seller]=world.cultivators;
    seller.locationId=buyer.locationId;buyer.spiritStones=seller.spiritStones=1000;buyer.pills.foundation=0;seller.pills.foundation=2;
    const offer=resolveOathAction(world,buyer,action('OFFER_OATH',{oathTerm:'foundation_pill',targetCultivatorId:seller.id}));
    expect(offer).not.toBeNull();
    const relation=()=>rankOrdinaryIntents(world,buyer,world.tick+1).find(row=>row.targetCultivatorId===seller.id);
    expect(factor(relation(),'prior_commitment')).toBe(0);
    const targetOathId=world.oaths.contracts[0].id;
    expect(resolveOathAction(world,seller,action('ACCEPT_OATH',{targetOathId}))).not.toBeNull();
    expect(resolveOathAction(world,seller,action('FULFILL_OATH',{targetOathId}))).not.toBeNull();
    expect(world.oaths.contracts[0].status).toBe('fulfilled');
    expect(factor(relation(),'prior_commitment')).toBe(10);
    seller.locationId='loc-blood';
    expect(relation()).toBeUndefined();
  });

  it('offers no ordinary alternatives to a genuinely committed active tournament actor or acute scarcity of health',()=>{
    const world=createInitialWorld(2031),actor=world.cultivators[0];
    world.tick=60;
    expect(advanceOccasions(world,()=>0)).toHaveLength(1);
    const occasion=world.occasions[0];actor.locationId=occasion.locationId;
    expect(joinOccasion(world,actor,action('JOIN_OCCASION',{targetOccasionId:occasion.id}))).not.toBeNull();
    expect(rankOrdinaryIntents(world,actor)).toEqual([]);
    world.occasions=[];
    actor.hp=Math.floor(actor.maxHp*.2);
    expect(rankOrdinaryIntents(world,actor)).toEqual([]);
  });
});
