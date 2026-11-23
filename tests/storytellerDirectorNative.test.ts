import {afterEach,describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {possessAvatar} from '../src/engine/avatarEngine';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {availableStorytellerActions,configureStoryteller,projectStoryteller} from '../src/engine/storytellerDirector';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const focus='npc-1',other='npc-5',seed=13071;
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'一路无话，权且歇歇。'};
const actor=(world:WorldState,id=focus)=>world.cultivators.find(row=>row.id===id)!;
const options=(world:WorldState,id=focus)=>availableStorytellerActions(actor(world,id),world,world.tick+1);
const command=(option:ReturnType<typeof availableStorytellerActions>[number])=>({
  chosenAction:option.chosenAction,storytellerOfferId:option.storytellerOfferId,storytellerMove:option.storytellerMove,
});
const snap=(world:WorldState)=>{
  const bytes=encodeEraWorldSave(world),decoded=decodeEraWorldSave(bytes);
  expect(encodeEraWorldSave(decoded)).toBe(bytes);
  return decoded;
};
const advance=(world:WorldState,omitFocus=false,selected?:LLMDecisionPayload,model=false,subject=focus)=>
  advanceWorldTick(world,Object.fromEntries(world.cultivators.filter(row=>!omitFocus||row.id!==subject)
    .map(({id})=>[id,id===subject&&selected?selected:rest])),undefined,'utility',undefined,
    model?{modelActors:new Set([subject])}:undefined);
type Style=Parameters<typeof configureStoryteller>[1];
afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});

function arranged(style:Style='wandering_jianghu', mounted=false,pinned=true){
  const world=createInitialWorld(seed);
  expect(configureStoryteller(world,style,pinned?focus:undefined)).toBe(true);
  if(mounted)expect(possessAvatar(world,focus)).toBe(true);
  return world;
}
function seekOffer(style:Style='wandering_jianghu',mounted=false,pinned=true){
  let world=arranged(style,mounted,pinned);
  const scope=()=>pinned?focus:world.storyteller?.offer?.actorId;
  const findMenu=()=>{const id=scope();return id?options(world,id):[];};
  for(let i=0;i<4&&!findMenu().length;i++)world=advance(world);
  const subject=scope(),legal=findMenu();
  if(!subject||!legal.length)throw new Error('Expected a current ordinary scope with an authored menu');
  return {world,legal,subject};
}
function nativeRun(style:Style,months:number){
  let world=arranged(style,true);
  const start=world.tick,offers:Array<{id:string;actorId:string;at:number;moves:string[]}>=[];
  const seen=new Set<string>();
  for(let i=0;i<months;i++){
    world=advance(world,true);
    expect(actor(world).alive).toBe(true);
    const subject=world.storyteller?.offer?.actorId;
    if(!subject)continue;
    const menu=options(world,subject),id=menu[0]?.storytellerOfferId;
    if(id===undefined||seen.has(id))continue;
    expect(menu.every(row=>row.storytellerOfferId===id)).toBe(true);
    seen.add(id);
    expect(projectStoryteller(world)?.actorId).toBe(subject);
    offers.push({id,actorId:subject,at:world.tick-start,moves:menu.map(row=>row.storytellerMove)});
  }
  return {offers,world};
}

describe('主动出题而不替人下棋 · G1-1 native director',()=>{
  it('authors at least forty distinct real opportunities in 120 native months with no gap above three, reproducibly',()=>{
    const first=nativeRun('still_water',120),replay=nativeRun('still_water',120);
    expect(first.offers.length).toBeGreaterThanOrEqual(40);
    expect(new Set(first.offers.map(row=>row.id)).size).toBe(first.offers.length);
    let previous=0;
    for(const row of first.offers){
      expect(row.at-previous).toBeGreaterThan(0);
      expect(row.at-previous).toBeLessThanOrEqual(3);
      expect(row.moves.length).toBeGreaterThanOrEqual(2);
      previous=row.at;
    }
    expect(120-previous).toBeLessThan(3);
    expect(replay.offers).toEqual(first.offers);
    expect(encodeEraWorldSave(replay.world)).toBe(encodeEraWorldSave(first.world));
  },30000);

  it.each([
    ['still_water',3],['wandering_jianghu',2],['great_calamity',1],
  ] as const)('uses and persists the selected %s style while offering a real menu every %i months',(style,interval)=>{
    const {offers,world}=nativeRun(style,12);
    expect(offers.length).toBeGreaterThanOrEqual(12/interval);
    expect(offers[0]?.at).toBeLessThanOrEqual(interval);
    expect(offers.slice(1).every((row,index)=>row.at-offers[index].at<=interval)).toBe(true);
    const restored=snap(world);
    expect(restored.storyteller?.style).toBe(style);
    expect(options(restored)).toEqual(options(world));
    expect(encodeEraWorldSave(advance(restored,true))).toBe(encodeEraWorldSave(advance(world,true)));
  });

  it('never enables or otherwise rewrites a legacy world merely by running normal turns or reopening its save',()=>{
    const legacy=createInitialWorld(seed);
    const decoded=snap(legacy);
    expect(legacy.storyteller).toBeUndefined();
    expect(options(legacy)).toEqual([]);
    expect(options(decoded)).toEqual([]);
    const a=advance(legacy),b=advance(decoded);
    expect(options(a)).toEqual([]);
    expect(a.storyteller).toBeUndefined();
    expect(b.storyteller).toBeUndefined();
    expect(encodeEraWorldSave(a)).toBe(encodeEraWorldSave(b));
  });

  it('won’t let an unrelated or stale actor use the exact menu or let mounted play be decided by Utility',()=>{
    const {world,legal}=seekOffer('still_water',true),offerId=legal[0].storytellerOfferId;
    expect(options(world,other)).toEqual([]);
    expect(projectStoryteller(world,actor(world,other))).toBeUndefined();
    expect(projectStoryteller(world,actor(world))?.options.map(row=>row.decision)).toEqual(legal);
    expect(availableStorytellerActions({...actor(world)},world,world.tick+1)).toEqual([]);
    const unauthorized=applyCultivatorBrainDecision(world,actor(world,other),
      {...command(legal[0]),innerMonologue:'偷用不属于我的机缘。'},()=>.99);
    expect(unauthorized).toBeNull();
    const autoNext=advance(world,true);
    expect(options(autoNext).map(row=>row.storytellerOfferId)).toContain(offerId);
    expect(actor(autoNext).currentAction).not.toBe('STORYTELLER_CHOICE');
    expect(options(autoNext,other)).toEqual([]);
    const pinned=seekOffer('still_water');
    const following=advance(pinned.world,true);
    expect(following.storyteller?.lastOutcome).toBeUndefined();
    expect(options(following).map(row=>row.storytellerOfferId)).toContain(pinned.legal[0].storytellerOfferId);
  });

  it('rejects forged saved clocks, actors, choice fields and self-travel without mutating the exact source',()=>{
    const {world}=seekOffer('great_calamity');
    const original=encodeEraWorldSave(world);
    expect(configureStoryteller(world,'still_water','not-an-actor')).toBe(false);
    expect(encodeEraWorldSave(world)).toBe(original);
    for(const mutate of [
      (w:WorldState)=>{w.storyteller!.focusActorId='not-an-actor';},
      (w:WorldState)=>{w.storyteller!.lastOfferTick=w.tick+7;},
      (w:WorldState)=>{w.storyteller!.offer!.id='storyteller-1-00000000';},
      (w:WorldState)=>{w.storyteller!.offer!.expiresTick=w.tick+40;},
      (w:WorldState)=>{w.storyteller!.offer!.optionMoves.push(w.storyteller!.offer!.optionMoves[0]);},
      (w:WorldState)=>{Object.assign(w.storyteller!.offer!,{paidHp:30});},
      (w:WorldState)=>{
        const offer=w.storyteller!.offer!;
        offer.targetSiteId=offer.siteId;
        if(!offer.optionMoves.includes('travel'))offer.optionMoves.push('travel');
      },
    ]){
      const forged=structuredClone(world);
      mutate(forged);
      expect(()=>encodeEraWorldSave(forged)).toThrow(/storyteller/i);
    }
    expect(encodeEraWorldSave(snap(world))).toBe(original);
  });

  it('admits the same native choice to offline Utility and strictly mocked Cognitive, without false target fields or replay',async()=>{
    const {world,legal,subject}=seekOffer('wandering_jianghu',false,false);
    const utility=advance(world,true,undefined,false,subject),unrelated=subject===other?focus:other;
    const offerId=legal[0].storytellerOfferId;
    expect(utility.events.length).toBeGreaterThan(0);
    expect(options(utility,subject).every(row=>row.storytellerOfferId!==offerId)).toBe(true);
    const config={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'storyteller-test'};
    let raw:object=command(legal[0]);
    const fetchMock=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(raw)}}]})));
    vi.stubGlobal('fetch',fetchMock);
    const ask=(value:object,id=subject)=>{
      raw=value;
      llmScheduler.resetTickBudget();
      return requestCultivatorLLMDecision(actor(world,id),world,config,world.tick+1);
    };
    const canonical=command(legal[0]);
    for(const forged of [{...canonical,storytellerOfferId:'invented-offer'},{...canonical,storytellerMove:'guaranteed_victory'},
      {...canonical,targetLocationId:'loc-market'},{...canonical,hpDelta:999},{...canonical,innerMonologue:'系统替我行动。'}]){
      await expect(ask(forged)).resolves.toBeUndefined();
    }
    await expect(ask(canonical,unrelated)).resolves.toBeUndefined();
    const result=utility.storyteller?.lastOutcome;
    expect(result).toMatchObject({offerId,actorId:subject,tick:world.tick+1});
    const used=legal.find(row=>row.storytellerMove===result?.move);
    if(!used)throw new Error('Expected Utility to resolve one of the exact offered decisions');
    const emitted=command(used),decision=await ask(emitted);
    expect(decision).toMatchObject(emitted);
    if(!decision)throw new Error('Expected the exact offered decision to cross the model boundary');
    const same=advance(world,false,decision,true,subject);
    expect(same.storyteller?.lastOutcome).toEqual(result);
    expect(same.events).toEqual(utility.events);
    expect(actor(same,subject)).toEqual(actor(utility,subject));
    expect(same.random).toEqual(utility.random);
    const physicalEvidence=actor(same,subject).ordinaryActionEvidence;
    expect(physicalEvidence?.tick).toBe(same.tick);
    const chosenTrace=same.decisionTrace.records.find(row=>row.actorId===subject&&row.tick===same.tick);
    expect(chosenTrace).toMatchObject({chosenAction:physicalEvidence?.action,source:'model',applied:true});
    expect(JSON.stringify(chosenTrace)).not.toContain(offerId);
    const roundTrip=snap(same);
    expect(options(roundTrip,subject).every(row=>row.storytellerOfferId!==offerId)).toBe(true);
    for(const prior of legal)expect(applyCultivatorBrainDecision(roundTrip,actor(roundTrip,subject),
      {...command(prior),innerMonologue:'再次结算。'},()=>.99)).toBeNull();
  },15000);
});
