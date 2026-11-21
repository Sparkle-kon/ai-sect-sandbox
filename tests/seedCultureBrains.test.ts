import { afterEach, describe, expect, it, vi } from 'vitest';
import { legalTraceCandidates, recordDecisionTrace } from '../src/engine/decisionTraceEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { availableSeedCultureActions } from '../src/engine/seedCultureEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig } from '../src/types/world';
import { matureSeedCulture, seedCultureBase, seedDecision, seedPerson } from './fixtures/seedCultureFixture';

const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'mock-seed-stock'};
const respond=(payload:object)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(payload)}}]}));
afterEach(()=>vi.unstubAllGlobals());

describe('grounded fictional seed culture in both brains',()=>{
  it('converts actual gathered herbs, then tests and plants by exact owned lot without replacing the measured record',async()=>{
    const {world,siteId,ownerId,competitorId}=seedCultureBase();
    const owner=seedPerson(world,ownerId);
    const competitor=seedPerson(world,competitorId);
    owner.qiProgress=20;
    const reserve=seedDecision('reserve',siteId);
    const mock=vi.fn(async (_url:RequestInfo|URL,_init?:RequestInit)=>respond({...reserve,quantity:0}));
    vi.stubGlobal('fetch',mock);
    await expect(requestCultivatorLLMDecision(owner,world,config,world.tick+1)).resolves.toBeUndefined();
    mock.mockImplementation(async()=>respond(reserve));
    const permit=await requestCultivatorLLMDecision(owner,world,config,world.tick+1);
    expect(permit).toEqual(reserve);
    world.tick++;
    expect(applyCultivatorBrainDecision(world,owner,permit!,()=>.99)).not.toBeNull();
    const lot=world.seedCulture.lots[0];
    expect(owner.herbs.jade_leaf).toBe(0);
    expect(lot).toMatchObject({ownerId,siteId,remaining:6,tests:[]});
    const test=seedDecision('test',lot.id);
    mock.mockImplementation(async()=>respond(test));
    await expect(requestCultivatorLLMDecision(owner,world,config,world.tick)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(competitor,world,config,world.tick+1)).resolves.toBeUndefined();
    expect(mock.mock.calls.at(-1)?.[1]?.body).not.toContain(lot.id);
    for(const extra of [{targetSeedLotId:undefined},{targetSeedPlotId:'invented'},{targetLocationId:siteId},
      {soilQi:100},{sprouted:2},{sample:1},{spokenLine:'宣布出苗'}]){
      mock.mockImplementation(async()=>respond({...test,...extra}));
      await expect(requestCultivatorLLMDecision(owner,world,config,world.tick+1)).resolves.toBeUndefined();
    }
    mock.mockImplementation(async()=>respond(test));
    const actualTest=await requestCultivatorLLMDecision(owner,world,config,world.tick+1);
    expect(actualTest).toEqual(test);
    expect(mock.mock.calls.at(-1)?.[1]?.body).toContain('灵植留种只复制本人在实地可执行');
    world.tick++;
    expect(computeHeuristicDecision(owner,world,()=>.99)).toMatchObject({
      chosenAction:'SEED_CULTURE',seedMove:'test',targetSeedLotId:lot.id,
    });
    expect(applyCultivatorBrainDecision(world,owner,actualTest!,()=>.99)).not.toBeNull();
    const measurements=structuredClone(lot.tests);
    expect(lot.remaining).toBe(4);

    const plant=seedDecision('plant',lot.id);
    mock.mockImplementation(async()=>respond(plant));
    await expect(requestCultivatorLLMDecision(owner,world,config,world.tick)).resolves.toBeUndefined();
    const planting=await requestCultivatorLLMDecision(owner,world,config,world.tick+1);
    expect(planting).toEqual(plant);
    world.tick++;
    expect(availableSeedCultureActions(owner,world).map(({seedMove})=>seedMove)).toEqual(['test','plant']);
    expect(computeHeuristicDecision(owner,world,()=>.99)).toMatchObject({
      chosenAction:'SEED_CULTURE',seedMove:'plant',targetSeedLotId:lot.id,
    });
    expect(applyCultivatorBrainDecision(world,owner,planting!,()=>.99)).not.toBeNull();
    expect(lot.remaining).toBe(2);
    expect(lot.tests).toEqual(measurements);
    expect(world.seedCulture.plots[0]).toMatchObject({lotId:lot.id,status:'growing',weather:[]});
    expect(owner.herbs.jade_leaf).toBe(0);
  });

  it('uses only already matured own harvest at actual execution, does not mint or reveal the weather/proof',async()=>{
    const {world,plotId,siteId,ownerId,competitorId}=matureSeedCulture();
    const owner=seedPerson(world,ownerId);
    const competitor=seedPerson(world,competitorId);
    owner.qiProgress=20;
    const plot=world.seedCulture.plots[0];
    const herbCount=owner.herbs.jade_leaf;
    const nativeSite=world.locations.find(({id})=>id===siteId)!;
    const wildCount=nativeSite.herbs.jade_leaf;
    const harvest=seedDecision('harvest',plotId);
    const mock=vi.fn(async (_url:RequestInfo|URL,_init?:RequestInit)=>respond(harvest));
    vi.stubGlobal('fetch',mock);
    expect(plot).toMatchObject({status:'ready'});
    expect(plot.yield).toBeGreaterThan(0);
    await expect(requestCultivatorLLMDecision(competitor,world,config,world.tick)).resolves.toBeUndefined();
    mock.mockImplementation(async()=>respond({...harvest,yield:999}));
    await expect(requestCultivatorLLMDecision(owner,world,config,world.tick)).resolves.toBeUndefined();
    mock.mockImplementation(async()=>respond(harvest));
    const precise=await requestCultivatorLLMDecision(owner,world,config,world.tick);
    expect(precise).toEqual(harvest);
    const prompt=mock.mock.calls.at(-1)?.[1]?.body;
    expect(prompt).not.toContain('maturedTick');
    expect(prompt).not.toContain('soilQi');
    expect(computeHeuristicDecision(owner,world,()=>.99)).toMatchObject({
      chosenAction:'SEED_CULTURE',seedMove:'harvest',targetSeedPlotId:plotId,
    });
    owner.locationId='loc-market';
    expect(applyCultivatorBrainDecision(world,owner,precise!,()=>.99)).toBeNull();
    expect(owner.herbs.jade_leaf).toBe(herbCount);
    owner.locationId=siteId;
    expect(applyCultivatorBrainDecision(world,owner,precise!,()=>.99)).not.toBeNull();
    expect(applyCultivatorBrainDecision(world,owner,precise!,()=>.99)).toBeNull();
    expect(owner.herbs.jade_leaf).toBe(herbCount+plot.yield!);
    expect(nativeSite.herbs.jade_leaf).toBe(wildCount);
    const trace=recordDecisionTrace(world,owner.id,legalTraceCandidates(world,owner),precise!,'model',true);
    expect(trace.chosenAction).toBe('redacted');
    expect(JSON.stringify(trace)).not.toContain(plotId);
  });
});
