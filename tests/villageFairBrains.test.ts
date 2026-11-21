import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { legalTraceCandidates, recordDecisionTrace } from '../src/engine/decisionTraceEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { marketClosureReason } from '../src/engine/marketEngine';
import { availableVillageFairActions, VILLAGE_FAIR_FEE } from '../src/engine/villageFairEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig } from '../src/types/world';
import { announcedVillageFair, fairPayload, fairPerson, fairReserve, fairTurn } from './fixtures/villageFairFixture';

const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'mock-village-fair'};
const respond=(payload:object)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(payload)}}]}));
afterEach(()=>vi.unstubAllGlobals());

describe('both brains attach fair stalls only to real local escrowed sell orders',()=>{
  it('announces with only the exact local settlement after a native paid donation',async()=>{
    const world=createInitialWorld(191);
    world.tick=29;world.month=6;
    const village=world.settlements.villages.find(({locationId})=>locationId==='loc-market')!;
    const [donor,other]=world.cultivators;
    donor.locationId=other.locationId=village.locationId;
    while ([0,1,2,3].some(delta=>marketClosureReason({...world,tick:world.tick+delta},village.locationId))) world.tick++;
    const announcement=fairPayload('VILLAGE_FAIR',{villageFairMove:'announce',targetSettlementId:village.id});
    const mock=vi.fn(async()=>respond(announcement));
    vi.stubGlobal('fetch',mock);
    expect(applyCultivatorBrainDecision(world,donor,fairPayload('VILLAGE_GRANARY',{
      granaryMove:'donate_stones',targetSettlementId:village.id,
    }),()=>.99)).not.toBeNull();
    await expect(requestCultivatorLLMDecision(donor,world,config,world.tick)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(other,world,config,world.tick+1)).resolves.toBeUndefined();
    mock.mockImplementation(async()=>respond({...announcement,targetVillageFairId:'invented'}));
    await expect(requestCultivatorLLMDecision(donor,world,config,world.tick+1)).resolves.toBeUndefined();
    mock.mockImplementation(async()=>respond(announcement));
    const actual=await requestCultivatorLLMDecision(donor,world,config,world.tick+1);
    expect(actual).toEqual(announcement);
    world.tick++;
    expect(applyCultivatorBrainDecision(world,donor,actual!,()=>.99)).not.toBeNull();
    expect(world.villageFairs.fairs[0]).toMatchObject({
      settlementId:village.id,sponsorId:donor.id,announcedTick:world.tick,opensTick:world.tick+2,stalls:[],
    });
  });

  it('copies both canonical reservation IDs for the claim turn, not another seller’s goods or exact fee',async()=>{
    const {world,villageId,siteId,fairId,sponsorId,merchantIds,outsiderId,orderFor}=announcedVillageFair();
    const [first,second,third]=merchantIds;
    const self=fairPerson(world,first);
    const reserve=fairReserve(fairId,orderFor(first));
    const provider=vi.fn(async (_url:RequestInfo|URL,_init?:RequestInit)=>respond(reserve));
    vi.stubGlobal('fetch',provider);
    const claimTick=world.villageFairs.fairs[0].claimTick;
    expect(claimTick).toBe(world.tick+1);
    expect(availableVillageFairActions(self,world)).toEqual([]);
    await expect(requestCultivatorLLMDecision(self,world,config,world.tick)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(fairPerson(world,sponsorId),world,config,claimTick)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(fairPerson(world,outsiderId),world,config,claimTick)).resolves.toBeUndefined();
    for(const extra of [{targetVillageFairId:undefined},{targetMarketOrderId:undefined},{targetMarketOrderId:orderFor(second)},
      {targetVillageFairId:'village-fair-999'},{targetSettlementId:villageId},{fee:0},{marketQuantity:5},
      {marketGood:'jade_leaf'},{opensTick:99},{merchantId:first},{spokenLine:'宣布开集成交'}]){
      provider.mockImplementation(async()=>respond({...reserve,...extra}));
      await expect(requestCultivatorLLMDecision(self,world,config,claimTick)).resolves.toBeUndefined();
    }
    provider.mockImplementation(async()=>respond(reserve));
    const planned=await requestCultivatorLLMDecision(self,world,config,claimTick);
    expect(planned).toEqual(reserve); // Runtime rejects stray enumerable undefined fields too.
    const prompt=provider.mock.calls.at(-1)?.[1]?.body;
    expect(prompt).toContain('乡集只复制本人执行回合已有的许可');
    expect(prompt).toContain(orderFor(first));
    expect(prompt).not.toContain(orderFor(second));
    expect(prompt).not.toContain('feeEscrow');

    const real=fairTurn(world);
    const merchant=fairPerson(real,first);
    merchant.qiProgress=20;
    merchant.herbs.jade_leaf=3;
    expect(computeHeuristicDecision(merchant,real,()=>.99).chosenAction).toBe('TRADE');
    merchant.spiritStones=100; // Enough to hold the stall, but no competing instrument trade.
    merchant.sectId=""; // An independent merchant also has no sect diplomacy appointment.
    real.relationships=real.relationships.filter(({fromId,toId})=>fromId!==merchant.id && toId!==merchant.id);
    const fare=merchant.spiritStones;
    const initialStock=merchant.herbs.earth_root;
    const ownOrderBefore=structuredClone(real.markets.orders.find(({id})=>id===orderFor(first))!);
    expect(computeHeuristicDecision(merchant,real,()=>.99)).toMatchObject({
      chosenAction:'VILLAGE_FAIR',villageFairMove:'reserve',targetVillageFairId:fairId,targetMarketOrderId:orderFor(first),
    });
    merchant.locationId=fairPerson(real,outsiderId).locationId;
    expect(applyCultivatorBrainDecision(real,merchant,planned!,()=>.99)).toBeNull();
    expect(merchant.spiritStones).toBe(fare);
    merchant.locationId=siteId;
    expect(applyCultivatorBrainDecision(real,merchant,planned!,()=>.99)).not.toBeNull();
    expect(merchant.spiritStones).toBe(fare-VILLAGE_FAIR_FEE);
    expect(merchant.herbs.earth_root).toBe(initialStock);
    expect(real.markets.orders.find(({id})=>id===orderFor(first))).toEqual(ownOrderBefore);
    expect(real.villageFairs.fairs[0].stalls).toHaveLength(1);
    expect(applyCultivatorBrainDecision(real,merchant,planned!,()=>.99)).toBeNull();

    provider.mockImplementation(async()=>respond(fairReserve(fairId,orderFor(third))));
    const thirdReady=await requestCultivatorLLMDecision(fairPerson(real,third),real,config,real.tick);
    expect(thirdReady).toBeDefined();
    expect(applyCultivatorBrainDecision(real,fairPerson(real,second),fairReserve(fairId,orderFor(second)),()=>.99)).not.toBeNull();
    const lastMerchant=fairPerson(real,third);
    const before=lastMerchant.spiritStones;
    expect(applyCultivatorBrainDecision(real,lastMerchant,thirdReady!,()=>.99)).toBeNull();
    expect(lastMerchant.spiritStones).toBe(before);

    const trace=recordDecisionTrace(real,merchant.id,legalTraceCandidates(real,merchant),planned!,'model',true);
    expect(trace.chosenAction).toBe('redacted');
    expect(JSON.stringify(trace)).not.toContain(orderFor(first));
  });
});
