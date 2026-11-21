import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import { availableWorkshopCapacityActions, workshopTerms } from '../src/engine/workshopEngine';
import type { LLMConfig } from '../src/types/world';
import { workshopCapacityActor as actor, workshopCapacityFixture, workshopCapacityMove as move,
  workshopCapacityOrder as orderAt, workshopCapacityTurn as turn } from './fixtures/workshopCapacityFixture';

const config: LLMConfig = {enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'mock-workshop-capacity'};
const respond=(payload:object)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(payload)}}]}));
afterEach(()=>vi.unstubAllGlobals());

describe('workshop capacity negotiation in both brains',()=>{
  it('exposes no speculative agreement before actual damage, then only the maker may propose without changing custody',async()=>{
    const {hit,maker,payer,supervisor,orderId,originalDeadline}=workshopCapacityFixture();
    const offer=move('offer',orderId);
    const mock=vi.fn(async (_url:RequestInfo|URL,_init?:RequestInit)=>respond(offer));
    vi.stubGlobal('fetch',mock);
    expect(hit.furnaceSafety.cases).toEqual([]);
    await expect(requestCultivatorLLMDecision(actor(hit,maker),hit,config,hit.tick+1)).resolves.toBeUndefined();
    const damaged=turn(hit);
    const order=orderAt(damaged,orderId);
    expect(order.capacityOffer).toBeUndefined();
    expect(damaged.furnaceSafety.cases).toHaveLength(1);
    await expect(requestCultivatorLLMDecision(actor(damaged,payer),damaged,config,damaged.tick+1)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(actor(damaged,supervisor),damaged,config,damaged.tick+1)).resolves.toBeUndefined();
    expect(mock.mock.calls.at(-1)?.[1]?.body).not.toContain(orderId);
    expect(computeHeuristicDecision(actor(damaged,maker),damaged,()=>.99)).toMatchObject({
      chosenAction:'WORKSHOP_CAPACITY',workshopCapacityMove:'offer',targetWorkshopId:orderId,
    });
    const planned=await requestCultivatorLLMDecision(actor(damaged,maker),damaged,config,damaged.tick+1);
    expect(planned).toMatchObject(offer);
    expect(mock.mock.calls.at(-1)?.[1]?.body).toContain('工坊容量调整只抄自己可用');
    const offered=turn(damaged,{[maker]:planned!});
    const exact=orderAt(offered,orderId);
    expect(exact.capacityOffer).toMatchObject({offeredTick:offered.tick,makerId:maker});
    expect(exact.work).toEqual(order.work);
    expect(exact.escrowStones).toBe(order.escrowStones);
    expect(exact.escrowHerbs).toBe(order.escrowHerbs);
    expect(exact).toMatchObject({quantity:2,deadlineTick:originalDeadline});
    expect(exact.capacityAmendment).toBeUndefined();
  });

  it('needs the original patron next turn, rejects fabricated refund or count, and rechecks presence before release',async()=>{
    const {world,maker,payer,siteId,orderId,originalDeadline}=workshopCapacityFixture();
    const accept=move('accept',orderId);
    const mock=vi.fn(async (_url:RequestInfo|URL,_init?:RequestInit)=>respond(accept));
    vi.stubGlobal('fetch',mock);
    await expect(requestCultivatorLLMDecision(actor(world,payer),world,config,world.tick)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(actor(world,maker),world,config,world.tick+1)).resolves.toBeUndefined();
    for(const extra of [{targetWorkshopId:undefined},{targetWorkshopId:'commission-999'},
      {workshopQuantity:2},{refundStones:100},{targetCultivatorId:maker},{deadlineTick:999},
      {escrowHerbs:20},{condition:100},{spokenLine:'宣布交付'}]){
      mock.mockImplementation(async()=>respond({...accept,...extra}));
      await expect(requestCultivatorLLMDecision(actor(world,payer),world,config,world.tick+1)).resolves.toBeUndefined();
    }
    mock.mockImplementation(async()=>respond(accept));
    const signed=await requestCultivatorLLMDecision(actor(world,payer),world,config,world.tick+1);
    expect(signed).toMatchObject(accept);
    const prompt=mock.mock.calls.at(-1)?.[1]?.body;
    expect(prompt).not.toContain('releasedStones');
    expect(prompt).not.toContain('capacityOffer');
    expect(prompt).not.toContain('blankTick');
    const actual=turn(world);
    const patron=actor(actual,payer);
    expect(availableWorkshopCapacityActions(patron,actual)).toContainEqual({
      action:'WORKSHOP_CAPACITY',workshopCapacityMove:'accept',targetWorkshopId:orderId,
    });
    expect(computeHeuristicDecision(patron,actual,()=>.99)).toMatchObject({
      chosenAction:'WORKSHOP_CAPACITY',workshopCapacityMove:'accept',targetWorkshopId:orderId,
    });
    const original=orderAt(actual,orderId);
    const funds=patron.spiritStones;
    const herbs=patron.herbs.earth_root;
    patron.locationId='loc-market';
    expect(applyCultivatorBrainDecision(actual,patron,signed!,()=>.99)).toBeNull();
    expect(patron.spiritStones).toBe(funds);
    patron.locationId=siteId;
    expect(applyCultivatorBrainDecision(actual,patron,signed!,()=>.99)).not.toBeNull();
    const one=workshopTerms(original.tier,1);
    expect(original).toMatchObject({quantity:2,deadlineTick:originalDeadline,work:[{piece:1,stage:'blank'}],
      capacityAmendment:{keptQuantity:1,releasedQuantity:1,workUntilTick:originalDeadline+4}});
    expect(patron.spiritStones).toBe(funds+one.totalStones);
    expect(patron.herbs.earth_root).toBe(herbs+one.totalHerbs);
    expect(applyCultivatorBrainDecision(actual,patron,signed!,()=>.99)).toBeNull();
    expect(patron.spiritStones).toBe(funds+one.totalStones);
  });
});
