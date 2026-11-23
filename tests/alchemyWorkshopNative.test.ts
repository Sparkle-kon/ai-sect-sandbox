import {describe,expect,it,vi} from 'vitest';
import {projectAlchemyWorkshop} from '../src/components/alchemyWorkshopVisualModel';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {createInitialWorld} from '../src/data/initialWorld';
import {resolveGuidedHeavenlyAlchemyTurn} from '../src/controllers/guidedHeavenlyAlchemyTurn';
import {possessAvatar} from '../src/engine/avatarEngine';
import {availableFurnaceSafetyActions,projectFurnaceSafety} from '../src/engine/furnaceSafetyEngine';
import {availableHeavenlyAlchemyActions,heavenlyAlchemyLightning} from '../src/engine/heavenlyAlchemyEngine';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {availableSeedCultureActions,projectLocalSeedCulture,projectSeedCulture} from '../src/engine/seedCultureEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {Cultivator,LLMDecisionPayload,WorldState} from '../src/types/world';
import {actualHighAlchemyMaterials,brewActor,brewActorId,brewMonth,brewSiteId,highBrew} from './alchemyLightningNativeFixture';
import {seedCultureBase,seedDecision,seedPerson,seedSite,seedTurn} from './fixtures/seedCultureFixture';

const person=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const still:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'在眼前实地等待。'};
const quiet=(world:WorldState):Record<string,LLMDecisionPayload>=>Object.fromEntries(world.cultivators.map(row=>[row.id,still]));
type Options=NonNullable<Parameters<typeof projectAlchemyWorkshop>[3]>;
const frame=(world:WorldState,viewer:Cultivator,siteId=viewer.locationId,options:Omit<Options,'viewer'>={})=>
  projectAlchemyWorkshop(world,createTerrainMapView(world,viewer,true),siteId,{...options,viewer});
function strict(world:WorldState){
  const source=encodeEraWorldSave(world),restored=decodeEraWorldSave(source);
  expect(encodeEraWorldSave(restored)).toBe(source);
  return restored;
}
async function reply(world:WorldState,actor:Cultivator,response:object){
  llmScheduler.resetTickBudget();
  const fetch=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(response)}}]})));
  vi.stubGlobal('fetch',fetch);
  try{
    const order=await requestCultivatorLLMDecision(actor,world,{enabled:true,apiBaseUrl:'https://provider.invalid/v1',
      apiKey:'fixture-only',model:'fixture'},world.tick+1);
    expect(fetch).toHaveBeenCalledTimes(1);
    return order;
  }finally{vi.unstubAllGlobals();llmScheduler.resetTickBudget();}
}
function actuallySown(){
  const {world:base,siteId,ownerId,competitorId,outsiderId}=seedCultureBase();
  const reserved=seedTurn(base,{[ownerId]:seedDecision('reserve',siteId)});
  const lot=reserved.seedCulture.lots.find(row=>row.ownerId===ownerId)!;
  expect(lot).toMatchObject({siteId,remaining:6});
  const tested=seedTurn(reserved,{[ownerId]:seedDecision('test',lot.id)});
  expect(tested.seedCulture.lots.find(row=>row.id===lot.id)?.tests).toHaveLength(1);
  const planted=seedTurn(tested,{[ownerId]:seedDecision('plant',lot.id)});
  const plot=planted.seedCulture.plots.find(row=>row.ownerId===ownerId)!;
  expect(plot).toMatchObject({siteId,plantedTick:planted.tick,status:'growing',weather:[]});
  expect(planted.events.some(row=>row.tick===planted.tick&&row.actorIds.includes(ownerId)&&row.witnessScope==='participants')).toBe(true);
  return {base,reserved,tested,planted,plotId:plot.id,siteId,ownerId,competitorId,outsiderId};
}

describe('alchemy workshop projects real locally authorized inputs and settled results',()=>{
  it('shows a genuinely sown plot, observed sprout, leaf and flower before a real harvest, not an advance sale',()=>{
    const f=actuallySown();
    const {ownerId,plotId,siteId,competitorId,outsiderId}=f;
    const observe=(world:WorldState)=>frame(world,seedPerson(world,ownerId),siteId)?.garden;
    const sameSite=(world:WorldState,id:string)=>frame(world,seedPerson(world,id),siteId)?.garden;
    const planted=f.planted,raw=encodeEraWorldSave(planted);
    expect(observe(planted)?.plots).toContainEqual(expect.objectContaining({id:plotId,stage:'sown'}));
    const one=seedTurn(planted),two=seedTurn(one),three=seedTurn(two);
    expect(one.seedCulture.plots[0]).toMatchObject({id:plotId,status:'growing',weather:[{tick:one.tick}]});
    expect(two.seedCulture.plots[0].weather.map(row=>row.tick)).toEqual([one.tick,two.tick]);
    const maturity=three.seedCulture.plots[0];
    expect(maturity).toMatchObject({id:plotId,status:'ready',maturedTick:three.tick});
    expect(maturity.yield).toBeGreaterThan(0);
    expect(observe(one)?.plots).toContainEqual(expect.objectContaining({id:plotId,stage:'sprout'}));
    expect(observe(two)?.plots).toContainEqual(expect.objectContaining({id:plotId,stage:'leaf'}));
    expect(observe(three)?.plots).toContainEqual(expect.objectContaining({id:plotId,stage:'flower'}));
    expect(three.seedCulture.plots[0].weather.map(row=>row.tick)).toEqual([one.tick,two.tick,three.tick]);
    expect(seedPerson(three,ownerId).herbs.jade_leaf).toBe(seedPerson(planted,ownerId).herbs.jade_leaf);
    for(const id of [competitorId,outsiderId])expect(projectSeedCulture(three,seedPerson(three,id)).plots).toEqual([]);
    expect(projectLocalSeedCulture(three,seedPerson(three,competitorId))).toMatchObject({siteId,growing:0,ready:1});
    expect(projectLocalSeedCulture(three,seedPerson(three,outsiderId))).toBeUndefined();
    expect(sameSite(three,competitorId)).toMatchObject({plots:[],anonymousGrowing:0,anonymousReady:1});
    const outsiderGarden=sameSite(three,outsiderId);
    expect(outsiderGarden?.plots??[]).toEqual([]);
    expect(outsiderGarden?.anonymousReady??0).toBe(0);
    expect(JSON.stringify(sameSite(three,competitorId))).not.toContain(plotId);
    const sameMonthWithoutHarvest=seedTurn(three);
    const wild=seedSite(sameMonthWithoutHarvest,siteId).herbs.jade_leaf;
    const menu=availableSeedCultureActions(seedPerson(three,ownerId),three,three.tick+1);
    expect(menu.some(row=>row.seedMove==='harvest'&&row.targetSeedPlotId===plotId)).toBe(true);
    const harvested=seedTurn(strict(three),{[ownerId]:seedDecision('harvest',plotId)});
    expect(harvested.seedCulture.plots[0]).toMatchObject({status:'harvested',settledTick:harvested.tick});
    expect(seedPerson(harvested,ownerId).herbs.jade_leaf).toBe(maturity.yield);
    expect(seedSite(harvested,siteId).herbs.jade_leaf).toBe(wild);
    expect(observe(harvested)?.plots??[]).toEqual([]);
    const again=seedTurn(harvested,{[ownerId]:seedDecision('plant',maturity.lotId)});
    const second=again.seedCulture.plots.at(-1)!;
    expect(second.id).not.toBe(plotId);
    const secondRipe=seedTurn(seedTurn(seedTurn(again)));
    const secondNative=secondRipe.seedCulture.plots.find(row=>row.id===second.id)!;
    expect(secondNative.status).toBe('ready');
    expect([maturity.yield,secondNative.yield]).toEqual([2,1]);
    expect(observe(secondRipe)?.plots).toContainEqual(expect.objectContaining({id:secondNative.id,stage:'flower'}));
    expect(JSON.stringify(sameSite(secondRipe,competitorId))).toBe(JSON.stringify(sameSite(three,competitorId)));
    expect(encodeEraWorldSave(planted)).toBe(raw);
  });

  it('shows no mature crop or refund for a native site hazard nor a counterfeit observation',()=>{
    const {planted,plotId,siteId,ownerId}=actuallySown();
    const changed=structuredClone(planted);
    changed.seedCulture.plots[0].weather.push({tick:planted.tick+1,season:'春',kind:'平息',intensity:0,soilQi:50});
    const fabricated=frame(changed,seedPerson(changed,ownerId),siteId)?.garden?.plots.find(row=>row.id===plotId);
    expect(fabricated?.stage).not.toBe('sprout');
    const site=seedSite(planted,siteId);
    const affected=applyMapBrush(applyMapBrush(planted,'beast_tide',[site]),'beast_tide',[site]);
    const lost=strict(seedTurn(affected));
    expect(lost.seedCulture.plots[0]).toMatchObject({id:plotId,status:'lost',loss:{reason:'site_hazard',units:2,good:'jade_seed'}});
    expect(frame(lost,seedPerson(lost,ownerId),siteId)?.garden?.plots??[]).toEqual([]);
    expect(seedPerson(lost,ownerId).herbs.jade_leaf).toBe(seedPerson(planted,ownerId).herbs.jade_leaf);
    expect(frame(planted,person(planted,'npc-6'),siteId)).toBeUndefined();
    expect(frame(planted,{...seedPerson(planted,ownerId)},siteId)).toBeUndefined();
    expect(frame(planted,seedPerson(planted,ownerId),siteId,{historical:true})).toBeUndefined();
  });

  it('shows lawful calm/balanced/fierce preview as not paid, and paid success, failure and only genuine lightning',()=>{
    const base=actualHighAlchemyMaterials(),actor=brewActor(base),bytes=encodeEraWorldSave(base);
    const siteId=brewSiteId,recipe='nine_turn_golden';
    for(const heat of ['calm','balanced','fierce'] as const){
      const shown=frame(base,actor,siteId,{heatPreview:{targetHeavenlyRecipeId:recipe,heavenlyAlchemyHeat:heat}})?.furnace;
      expect(shown).toMatchObject({grade:3,status:'open',mode:'preview',heat});
      expect(shown?.result).toBeUndefined();
    }
    const expected=[{heat:'calm',roll:.2,quality:'common',lightning:false},
      {heat:'fierce',roll:.99,quality:'peerless',lightning:true},
      {heat:'fierce',roll:.001,quality:undefined,lightning:false}] as const;
    for(const {heat,roll,quality,lightning} of expected){
      const cooked=strict(brewMonth(base,highBrew(recipe,heat),roll)),native=brewActor(cooked);
      const attempted=native.heavenlyAlchemy!.attempts.at(-1)!;
      expect(attempted).toMatchObject({tick:cooked.tick,siteId,heat,recipeId:recipe});
      expect(attempted.quality).toBe(quality);
      expect([actor.spiritStones-native.spiritStones,actor.herbs.jade_leaf-native.herbs.jade_leaf,
        actor.herbs.star_bloom-native.herbs.star_bloom]).toEqual([120,2,3]);
      expect(cooked.furnaceReservations.uses).toContainEqual(expect.objectContaining({tick:cooked.tick,siteId,actorId:actor.id,kind:'brew'}));
      expect(cooked.events.some(row=>!!heavenlyAlchemyLightning(cooked,row))).toBe(lightning);
      const valid=frame(cooked,native,siteId)?.furnace;
      expect(valid).toMatchObject({mode:'receipt',heat,result:{success:!!quality,lightning}});
      expect(valid?.result?.quality).toBe(quality);
      expect(JSON.stringify(valid)).not.toMatch(/"(?:roll|mastery|toxicity|fireRoot)"/);
      if(lightning){
        const away=brewMonth(cooked,{...still,chosenAction:'EXPLORE',targetLocationId:'loc-taixu'},.99);
        const observer=brewActor(away);
        expect(observer.locationId).toBe('loc-taixu');
        expect(observer.heavenlyAlchemy?.attempts.some(row=>row.id===attempted.id&&row.siteId===siteId&&row.quality==='peerless')).toBe(true);
        expect(frame(away,observer,siteId)).toBeUndefined();
        expect(frame(away,observer)?.furnace?.result).toBeUndefined();
      }
      const previous=brewMonth(cooked);
      expect(frame(previous,brewActor(previous),siteId)?.furnace?.mode).toBe('idle');
      const noReservation={...cooked,furnaceReservations:{...cooked.furnaceReservations,
        uses:cooked.furnaceReservations.uses.filter(row=>row.tick!==cooked.tick)}};
      expect(frame(noReservation,brewActor(noReservation),siteId)?.furnace?.result).toBeUndefined();
    }
    expect(encodeEraWorldSave(base)).toBe(bytes);
  });

  it('projects the same paid receipt for Cognitive and Utility and retains the existing exact guided request guards',async()=>{
    // Existing portable high-alchemy Cognitive admission economics: extra reserve and exact cadence,
    // as disclosed in heavenlyAlchemyCognitive.test.ts. No action, payment, roll or receipt prewritten.
    let base=createInitialWorld(2031);
    const ready=brewActor(base);
    ready.techniqueMastery=70;ready.spiritRoot='火';ready.qiProgress=24;
    ready.spiritStones=Math.max(720,ready.spiritStones);
    ready.herbs.jade_leaf=5;ready.herbs.star_bloom=7;
    for(let i=0;i<3;i++)base=brewMonth(base);
    expect(base.tick).toBe(4);
    const actor=brewActor(base);
    const exact=availableHeavenlyAlchemyActions(actor,base,base.tick+1).find(row=>
      row.heavenlyAlchemyMove==='brew'&&row.heavenlyAlchemyHeat==='balanced'&&row.targetHeavenlyRecipeId==='nine_turn_golden')!;
    const {action,...fields}=exact;
    const wire={chosenAction:action,...fields};
    expect(await reply(base,actor,{...wire,roll:999,heavenlyAlchemyQuality:'peerless'})).toBeUndefined();
    const parsed=await reply(base,actor,wire);
    expect(parsed).toMatchObject(wire);
    if(!parsed)throw new Error('Expected validated real eligible high alchemy choice');
    const utility=brewMonth(base,{...wire,innerMonologue:'照现有实炉。'},.75);
    const online=advanceWorldTick(base,{...quiet(base),[actor.id]:parsed},()=>.75,'utility',undefined,{modelActors:new Set([actor.id])});
    expect(brewActor(online).heavenlyAlchemy).toEqual(brewActor(utility).heavenlyAlchemy);
    expect(frame(online,brewActor(online))?.furnace).toEqual(frame(utility,brewActor(utility))?.furnace);
    const guided=strict(base);
    expect(possessAvatar(guided,brewActorId)).toBe(true);
    const request={kind:'heavenly-alchemy' as const,world:guided,branchId:'main',revision:8,actorId:brewActorId,option:exact};
    expect(resolveGuidedHeavenlyAlchemyTurn(request,guided,'mirror',8)).toBeUndefined();
    expect(resolveGuidedHeavenlyAlchemyTurn(request,guided,'main',9)).toBeUndefined();
    expect(resolveGuidedHeavenlyAlchemyTurn(request,guided,'main',8)?.decision).toMatchObject(wire);
    expect(brewActor(guided).heavenlyAlchemy).toBeUndefined();
  });

  it('keeps a genuinely damaged furnace cold until a native inspect, repair and reopen have actually taken effect',()=>{
    const base=actualHighAlchemyMaterials(['earth_root','earth_root']),site=seedSite(base,brewSiteId);
    let world=brewMonth(applyMapBrush(base,'beast_tide',[site]));
    const damaged=projectFurnaceSafety(world,brewActor(world),site.id)!;
    expect(damaged).toMatchObject({status:'closed',integrity:70});
    const cold=frame(world,brewActor(world),site.id,{heatPreview:'fierce'})?.furnace;
    expect(cold).toMatchObject({status:'closed',mode:'idle'});
    expect(cold?.heat).toBeUndefined();expect(cold?.result).toBeUndefined();
    while(world.mapHazards.some(row=>row.kind==='beast_tide'))world=brewMonth(world);
    for(const move of ['inspect','repair','reopen'] as const){
      const available=availableFurnaceSafetyActions(brewActor(world),world,world.tick+1).find(row=>row.furnaceSafetyMove===move)!;
      expect(available).toBeDefined();
      const {action,...fields}=available;
      world=brewMonth(world,{...still,chosenAction:action,...fields});
      expect(world.furnaceSafety.cases.find(row=>row.siteId===site.id)?.receipts.at(-1)?.kind).toBe(move);
    }
    const pending=frame(world,brewActor(world),site.id,{heatPreview:'fierce'})?.furnace;
    expect(pending).toMatchObject({status:'reopening',mode:'idle'});
    expect(pending?.heat).toBeUndefined();
    const opened=brewMonth(world);
    expect(frame(opened,brewActor(opened),site.id)?.furnace).toMatchObject({status:'open',mode:'idle'});
  });
});
