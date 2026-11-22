import {describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {activeAvatar,possessAvatar} from '../src/engine/avatarEngine';
import {beastDuelEventId,projectGuidedBeastDuel,queueGuidedBeastDuelChoice} from '../src/engine/beastDuelProtection';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {publicChronicleSceneEvents} from '../src/engine/chronicleLead';
import {petCombatBonus} from '../src/engine/spiritBeastEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick,executeGodIntervention} from '../src/engine/worldEngine';
import type {LLMConfig,LLMDecisionPayload,WorldState} from '../src/types/world';

const ownerId='npc-2',opponentId='npc-5',observerId='npc-1';
const north='loc-vein-north',market='loc-market',beastId='beast-loc-vein-north';
const action=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'依实地情势行事。',...fields});
const resting=action('REST');
const moves=action('EXPLORE',{targetLocationId:market});
const gathers=action('GATHER_HERBS',{targetHerbId:'jade_leaf'});
const duel=action('DUEL',{targetCultivatorId:ownerId});
const person=(world:WorldState,id=ownerId)=>world.cultivators.find(row=>row.id===id)!;
const pet=(world:WorldState)=>world.spiritBeasts.find(row=>row.id===beastId)!;
const month=(world:WorldState,orders:Readonly<Record<string,LLMDecisionPayload>>={},roll=.10)=>
  advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,orders[row.id]??resting])),()=>roll,'utility');

function actualTame(seed:number){
  const initial=createInitialWorld(seed,'classic');
  expect(person(initial).locationId).toBe(north);
  expect(pet(initial)).toMatchObject({kind:'瑞兽',locationId:north,homeLocationId:north,alive:true,hp:180});
  let world=month(initial,{[ownerId]:gathers,[opponentId]:moves});
  expect(person(world,opponentId).locationId).toBe(market);
  expect(world.events).toContainEqual(expect.objectContaining({tick:world.tick,actorIds:[opponentId],locationId:market}));
  const leaf=person(world).herbs.jade_leaf;
  expect(leaf).toBeGreaterThan(0);
  world=month(world,{[ownerId]:action('TAME_BEAST',{targetBeastId:beastId})});
  expect(person(world).herbs.jade_leaf).toBe(leaf-1);
  expect(pet(world)).toMatchObject({tamedBy:ownerId,locationId:north,alive:true});
  expect(world.events.filter(row=>row.tick===world.tick&&row.title==='灵兽认主'))
    .toEqual([expect.objectContaining({actorIds:[ownerId],locationId:north})]);
  expect(person(world).artifacts.every(row=>row.soul===undefined)).toBe(true);
  expect(petCombatBonus(world,person(world))).toBeGreaterThan(1);
  return world;
}

/** A controlled setup: two actual sandbox lightning orders wound the owner before the native duel.
 * This changes neither the underlying pet nor a future combat/choice receipt. */
function actualEndangered(world:WorldState){
  const strike={type:'TRIBULATION_STRIKE',targetCultivatorId:ownerId} as const;
  const wounded=executeGodIntervention(executeGodIntervention(world,strike),strike);
  expect(wounded.events.filter(row=>row.id.startsWith('evt-god-strike-')&&row.actorIds[0]===ownerId)).toHaveLength(2);
  const owner=person(wounded);
  expect(owner.hp).toBeGreaterThan(0);
  expect(owner.hp/owner.maxHp).toBeLessThan(.25);
  expect(possessAvatar(wounded,ownerId)).toBe(true);
  expect(activeAvatar(wounded)?.id).toBe(ownerId);
  return wounded;
}

function atMarket(seed:number,guardBand=false,guided=true){
  const moved=month(actualTame(seed),{[ownerId]:moves});
  expect(person(moved).locationId).toBe(market);
  expect(pet(moved).locationId).toBe(north);
  const arrived=month(moved);
  expect(person(arrived,opponentId).locationId).toBe(market);
  expect(pet(arrived)).toMatchObject({tamedBy:ownerId,locationId:market,hp:180});
  if(!guardBand)return actualEndangered(arrived);
  // Controlled wound-band for the proof of both survivors, not a fabricated hit.
  // Same source fork without guard must still die to this exact native contact.
  const owner=person(arrived);
  owner.hp=Math.floor(owner.maxHp*.247);
  if(guided)expect(possessAvatar(arrived,ownerId)).toBe(true);
  return arrived;
}

function strict(world:WorldState){
  const raw=encodeEraWorldSave(world),restored=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(restored)).toBe(raw);
  return restored;
}

function actualEncounter(source:WorldState,roll=.10){
  const hp=person(source).hp, beastHp=pet(source).hp;
  const offered=month(source,{[ownerId]:gathers,[opponentId]:duel},roll);
  const view=projectGuidedBeastDuel(offered,person(offered));
  expect(view).toBeDefined();
  if(!view)throw new Error('Native lethal frontier failed to offer a genuinely present bonded beast.');
  expect(view.options.map(row=>row.choice)).toEqual(expect.arrayContaining(['guard','decline']));
  const contact=offered.beastDuelContacts?.find(row=>row.id===view.contactId);
  expect(contact).toBeDefined();
  if(!contact)throw new Error('The view must be backed by a native contact.');
  const openId=beastDuelEventId(contact,'open',offered.tick);
  expect(offered.events).toContainEqual(expect.objectContaining({
    id:openId,actorIds:[ownerId],locationId:market,witnessScope:'participants',
  }));
  expect(publicChronicleSceneEvents(offered).some(row=>row.id===openId)).toBe(false);
  expect(view).toMatchObject({ownerId,ownerHp:hp,beastHp});
  expect(person(offered)).toMatchObject({alive:true,hp,locationId:market});
  expect(pet(offered)).toMatchObject({alive:true,hp:beastHp,tamedBy:ownerId,locationId:market});
  expect(offered.forbiddenDuels??[]).toEqual([]);
  expect(offered.events.find(row=>row.tick===offered.tick&&row.category==='death'&&row.actorIds.includes(ownerId))).toBeUndefined();
  expect(projectGuidedBeastDuel(offered,person(offered,observerId))).toBeUndefined();
  return {offered,view,contact,hp,beastHp};
}

describe('genuine same-month beast and lethal duel integration',()=>{
  it('honors one exact player guard at genuine life-threatening contact and applies only the actual damage',()=>{
    const {offered,view,contact,hp,beastHp}=actualEncounter(atMarket(2031,true),.01);
    const sealed=strict(offered),raw=encodeEraWorldSave(sealed);
    expect(queueGuidedBeastDuelChoice(sealed,observerId,view.contactId,'guard')).toBe(sealed);
    expect(queueGuidedBeastDuelChoice(sealed,ownerId,'wrong-contact','guard')).toBe(sealed);
    const queued=queueGuidedBeastDuelChoice(sealed,ownerId,view.contactId,'guard');
    expect(queued).not.toBe(sealed);
    expect(queued.tick).toBe(sealed.tick);
    expect(person(queued).hp).toBe(hp);
    expect(pet(queued).hp).toBe(beastHp);
    expect(queued.events).toEqual(sealed.events);
    expect(encodeEraWorldSave(sealed)).toBe(raw);
    expect(queueGuidedBeastDuelChoice(queued,ownerId,view.contactId,'guard')).toBe(queued);
    const settled=month(strict(queued));
    expect(settled.tick).toBe(queued.tick+1);
    expect(person(settled).alive).toBe(true);
    expect(person(settled).hp).toBeGreaterThan(0);
    expect(person(settled).hp).toBeLessThan(hp);
    expect(pet(settled).hp).toBeLessThan(beastHp);
    expect(pet(settled)).toMatchObject({alive:true,tamedBy:ownerId,locationId:market});
    expect(pet(settled).hp).toBeGreaterThan(0);
    const receiptId=beastDuelEventId(contact,'guard',settled.tick);
    expect(settled.events.filter(row=>row.id===receiptId)).toEqual([expect.objectContaining({
      actorIds:[ownerId],witnessScope:'participants',locationId:market,description:expect.stringContaining(String(beastHp-pet(settled).hp)+'点伤'),
    })]);
    expect(publicChronicleSceneEvents(settled).some(row=>row.id===receiptId)).toBe(false);
    const declined=month(queueGuidedBeastDuelChoice(strict(offered),ownerId,view.contactId,'decline'));
    expect(person(declined)).toMatchObject({alive:false,hp:0});
    expect(pet(declined)).toMatchObject({alive:true,hp:beastHp});
    expect(declined.events.some(row=>row.id===receiptId)).toBe(false);
    expect(settled.events.find(row=>row.tick===settled.tick&&row.category==='death'&&row.actorIds.includes(ownerId))).toBeUndefined();
    expect(projectGuidedBeastDuel(settled,person(settled))).toBeUndefined();
    expect(queueGuidedBeastDuelChoice(settled,ownerId,view.contactId,'guard')).toBe(settled);
    strict(settled);
  });

  it('records actual exhaustion and severance only after a shield that cannot cover the native blow',()=>{
    const {offered,view,contact,beastHp}=actualEncounter(atMarket(2034));
    const queued=queueGuidedBeastDuelChoice(offered,ownerId,view.contactId,'guard');
    expect(queued).not.toBe(offered);
    expect(pet(queued)).toMatchObject({alive:true,hp:beastHp,tamedBy:ownerId});
    const settled=month(strict(queued));
    expect(pet(settled)).toMatchObject({alive:false,hp:0,locationId:market});
    expect(pet(settled).tamedBy).toBeUndefined();
    expect(person(settled)).toMatchObject({alive:false,hp:0,locationId:market});
    const id=beastDuelEventId(contact,'guard',settled.tick);
    expect(settled.events.filter(row=>row.id===id)).toEqual([expect.objectContaining({
      actorIds:[ownerId],witnessScope:'participants',
      description:expect.stringMatching(/原主未能生还。灵兽已亡，原契解除。/u),
    })]);
    expect(publicChronicleSceneEvents(settled).some(row=>row.id===id)).toBe(false);
    const later=month(strict(settled));
    expect(pet(later)).toMatchObject({alive:false,hp:0});
    expect(later.events.filter(row=>row.id===id)).toHaveLength(1);
  });

  it('resolves an exact player retreat as real separation rather than declaring a kill on a staged choice',()=>{
    const {offered,view,contact,hp,beastHp}=actualEncounter(atMarket(2033));
    const retreat=view.options.find(row=>row.choice==='withdraw'&&row.destinationId);
    expect(retreat).toBeDefined();
    if(!retreat?.destinationId)throw new Error('A declared retreat needs a real visible destination.');
    expect(queueGuidedBeastDuelChoice(offered,ownerId,view.contactId,'withdraw','unknown-retreat')).toBe(offered);
    const queued=queueGuidedBeastDuelChoice(offered,ownerId,view.contactId,'withdraw',retreat.destinationId);
    expect(queued).not.toBe(offered);
    expect(person(queued)).toMatchObject({locationId:market,hp,alive:true});
    expect(pet(queued)).toMatchObject({locationId:market,hp:beastHp,alive:true});
    expect(queued.events).toEqual(offered.events);
    const settled=month(strict(queued));
    expect(person(settled)).toMatchObject({locationId:market,alive:false,hp:0});
    expect(pet(settled)).toMatchObject({locationId:retreat.destinationId,alive:true,hp:beastHp});
    expect(pet(settled).tamedBy).toBeUndefined();
    const receiptId=beastDuelEventId(contact,'withdraw',settled.tick);
    expect(settled.events.filter(row=>row.id===receiptId)).toEqual([expect.objectContaining({
      actorIds:[ownerId],witnessScope:'participants',locationId:market,category:'combat',
    })]);
    expect(publicChronicleSceneEvents(settled).some(row=>row.id===receiptId)).toBe(false);
    expect(settled.events).toContainEqual(expect.objectContaining({
      id:`evt-${settled.tick}-${opponentId}-kill`,category:'death',actorIds:[opponentId,ownerId],locationId:market,
    }));
    expect(projectGuidedBeastDuel(settled,person(settled))).toBeUndefined();
    strict(settled);
  });

  it('accepts only an exact mocked Cognitive choice and Utility independently settles the same actual unguided front',async()=>{
    const start=atMarket(2031,true,false);
    expect(activeAvatar(start)).toBeUndefined();
    const offered=month(start,{[ownerId]:gathers,[opponentId]:duel},.01);
    const owner=person(offered);
    const contact=offered.beastDuelContacts?.[0];
    expect(contact).toMatchObject({guided:false,ownerId,attackerId:opponentId,siteId:market,beastId});
    expect(projectGuidedBeastDuel(offered,owner)).toBeUndefined();
    if(!contact)throw new Error('Cognitive must use an actual native front.');
    const exact={chosenAction:'BEAST_DUEL_RESPONSE' as const,targetBeastDuelId:contact.id,beastDuelChoice:'guard' as const};
    const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture-only',model:'mock'};
    const reply=(value:unknown)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}));
    let proposal:unknown=exact;
    const fetchMock=vi.fn(async (_url:RequestInfo|URL,_init?:RequestInit)=>reply(proposal));
    const before=encodeEraWorldSave(offered);
    vi.stubGlobal('fetch',fetchMock);
    try{
      llmScheduler.resetTickBudget();
      await expect(requestCultivatorLLMDecision(person(offered,opponentId),offered,config,offered.tick+1)).resolves.toBeUndefined();
      await expect(requestCultivatorLLMDecision(owner,offered,config,offered.tick+2)).resolves.toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
      for(const invalid of [{...exact,ownerHpAfter:999},{...exact,beastHpAfter:180},
        {...exact,severed:true},{...exact,targetLocationId:north},{...exact,innerMonologue:'虚构伤势。'}]){
        proposal=invalid;llmScheduler.resetTickBudget();
        await expect(requestCultivatorLLMDecision(owner,offered,config,offered.tick+1)).resolves.toBeUndefined();
      }
      proposal=exact;llmScheduler.resetTickBudget();
      const decision=await requestCultivatorLLMDecision(owner,offered,config,offered.tick+1);
      expect(decision).toMatchObject(exact);
      const prompt=String(fetchMock.mock.calls.at(-1)?.[1]?.body);
      expect(JSON.parse(prompt).messages.map((row:{content:string})=>row.content).join(' ')).toContain(JSON.stringify(exact));
      for(const unproven of [owner.name,pet(offered).name,'ownerHpAfter','beastHpAfter','"rolls"'])
        expect(prompt).not.toContain(unproven);
      expect(encodeEraWorldSave(offered)).toBe(before);
      const commonOrders=Object.fromEntries(offered.cultivators.filter(row=>row.id!==ownerId).map(row=>[row.id,resting]));
      const seen=vi.fn();
      const cognitive=advanceWorldTick(strict(offered),{...commonOrders,[ownerId]:decision!},()=>.10,'utility',seen,
        {modelActors:new Set([ownerId])});
      const utility=advanceWorldTick(strict(offered),commonOrders,()=>.10,'utility');
      const eventId=beastDuelEventId(contact,'guard',offered.tick+1);
      expect(seen).toHaveBeenCalledWith(ownerId,true);
      for(const result of [cognitive,utility]){
        expect(person(result)).toMatchObject({alive:true,hp:1,locationId:market});
        expect(pet(result).hp).toBeLessThan(pet(offered).hp);
        expect(result.events.filter(row=>row.id===eventId)).toHaveLength(1);
        expect(result.beastDuelContacts??[]).toEqual([]);
        strict(result);
      }
      expect(pet(cognitive)).toEqual(pet(utility));
      expect(cognitive.events.find(row=>row.id===eventId)).toEqual(utility.events.find(row=>row.id===eventId));
      const forged={...decision!,ownerHpAfter:999};
      const rejected=advanceWorldTick(strict(offered),{...commonOrders,[ownerId]:forged},()=>.10,'utility',undefined,
        {modelActors:new Set([ownerId])});
      expect(rejected.events.some(row=>row.id===eventId)).toBe(false);
      expect(person(rejected)).toMatchObject({alive:false,hp:0});
    }finally{
      vi.unstubAllGlobals();
      llmScheduler.resetTickBudget();
    }
  });

  it('does not protect across distance after a real move before a later actor attacks that same month',()=>{
    const source=actualEndangered(actualTame(2032));
    expect(person(source).locationId).toBe(north);
    expect(person(source,opponentId).locationId).toBe(market);
    expect(pet(source).locationId).toBe(north);
    const before=pet(source).hp;
    const next=month(source,{[ownerId]:moves,[opponentId]:duel});
    expect(person(next)).toMatchObject({locationId:market,alive:false,hp:0});
    expect(pet(next)).toMatchObject({locationId:north,alive:true,hp:before});
    expect(next.events).toContainEqual(expect.objectContaining({
      id:`evt-${next.tick}-${ownerId}-explore`,tick:next.tick,locationId:market,
    }));
    expect(next.events).toContainEqual(expect.objectContaining({
      id:`evt-${next.tick}-${opponentId}-kill`,tick:next.tick,category:'death',actorIds:[opponentId,ownerId],duelWinnerId:opponentId,locationId:market,
    }));
    expect(petCombatBonus(next,person(next))).toBe(1);
    expect(next.forbiddenDuels??[]).toEqual([]);
    expect(next.beastDuelContacts??[]).toEqual([]);
    expect(next.events.some(row=>row.tick===next.tick&&row.id.startsWith('evt-beast-duel-'))).toBe(false);
    expect(person(source).alive).toBe(true);
  });
});
