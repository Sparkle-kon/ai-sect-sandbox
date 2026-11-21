import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { legalTraceCandidates, recordDecisionTrace } from '../src/engine/decisionTraceEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { availableVillageGranaryActions, granaryAt } from '../src/engine/villageGranaryEngine';
import { availableVillageSupplyActions } from '../src/engine/villageSupplyEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { Cultivator, LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'mock-village-supply' };
const respond = (payload:object) => new Response(JSON.stringify({ choices:[{message:{content:JSON.stringify(payload)}}] }));
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld(725);
  world.tick = 37;
  const [offerer, accepter, bystander] = world.cultivators;
  const [origin,destination] = world.settlements.villages;
  const a = world.locations.find(({id})=>id===origin.locationId)!;
  const b = world.locations.find(({id})=>id===destination.locationId)!;
  a.x=220; a.y=220; b.x=380; b.y=220;
  offerer.exploredTileIds = accepter.exploredTileIds = world.terrain.tiles.map(({id})=>id);
  for (const [actor, village] of [[offerer,origin],[accepter,destination],[bystander,destination]] as const) {
    actor.locationId = village.locationId;
    actor.hp = actor.maxHp;
    actor.qiProgress = 20;
    actor.spiritStones = 100;
    actor.herbs.earth_root = 4;
    actor.herbs.jade_leaf = 3;
    actor.personality = '刚正';
    actor.techniqueMastery = 0;
    actor.age = 35;
    village.stress = 0;
  }
  const apply = (actor:Cultivator,decision:LLMDecisionPayload) =>
    applyCultivatorBrainDecision(world,actor,decision,()=>.99);
  const donate = (actor:Cultivator,villageId:string,granaryMove:'donate_roots'|'donate_stones') =>
    apply(actor,{chosenAction:'VILLAGE_GRANARY',granaryMove,targetSettlementId:villageId,innerMonologue:''});
  return {world,offerer,accepter,bystander,origin,destination,apply,donate};
}

describe('both brains follow actual village supply permissions',()=>{
  it('decodes only the legal single-resource donation and preserves the other asset',async()=>{
    const {world,offerer,origin,apply}=fixture();
    offerer.spiritStones=0;
    const roots={chosenAction:'VILLAGE_GRANARY',granaryMove:'donate_roots',targetSettlementId:origin.id,innerMonologue:'只捐在手的灵根。'};
    expect(availableVillageGranaryActions(offerer,world).map(({granaryMove})=>granaryMove)).toEqual(['donate_roots']);
    const mock=vi.fn(async ()=>respond({...roots,quantity:20}));
    vi.stubGlobal('fetch',mock);
    await expect(requestCultivatorLLMDecision(offerer,world,config,world.tick+1)).resolves.toBeUndefined();
    mock.mockImplementation(async ()=>respond({...roots,granaryMove:'donate_stones'}));
    await expect(requestCultivatorLLMDecision(offerer,world,config,world.tick+1)).resolves.toBeUndefined();
    mock.mockImplementation(async ()=>respond(roots));
    const choice=await requestCultivatorLLMDecision(offerer,world,config,world.tick+1);
    expect(choice).toMatchObject(roots);
    world.tick++;
    expect(apply(offerer,choice!)).not.toBeNull();
    expect([offerer.herbs.earth_root,offerer.spiritStones]).toEqual([2,0]);
  });

  it('can continue a local root reserve instead of always forcing a mixed gift',()=>{
    const {world,offerer,origin,apply,donate}=fixture();
    expect(donate(offerer,origin.id,'donate_roots')).not.toBeNull();
    let selected:LLMDecisionPayload|undefined;
    for(let tick=world.tick+1;tick<500;tick++){
      world.tick=tick;
      const option=computeHeuristicDecision(offerer,world,()=>.99);
      if(option.chosenAction==='VILLAGE_GRANARY'){selected=option;break;}
    }
    expect(selected).toMatchObject({chosenAction:'VILLAGE_GRANARY',granaryMove:'donate_roots',targetSettlementId:origin.id});
    expect(apply(offerer,selected!)).not.toBeNull();
    expect(granaryAt(world,origin.id)).toMatchObject({roots:4,stones:0});
    expect(offerer.spiritStones).toBe(100);
  });

  it('offers to a known village without its stock and accepts only as the actual local donor',async()=>{
    const {world,offerer,accepter,bystander,origin,destination,apply,donate}=fixture();
    expect(donate(offerer,origin.id,'donate_roots')).not.toBeNull();
    world.tick++;
    expect(donate(offerer,origin.id,'donate_roots')).not.toBeNull();
    const proposal={chosenAction:'VILLAGE_SUPPLY',villageSupplyMove:'offer',targetSettlementId:destination.id,innerMonologue:'请邻村自查实存。'} as const;
    expect(granaryAt(world,destination.id)).toBeUndefined();
    const mock=vi.fn(async (_endpoint: RequestInfo | URL,_init?:RequestInit)=>respond(proposal));
    vi.stubGlobal('fetch',mock);
    for(const wrong of [{targetVillageSupplyId:'fake'}, {targetSettlementId:'no-such-village'}, {path:['unseen']}, {cargo:100}]) {
      mock.mockImplementation(async()=>respond({...proposal,...wrong}));
      await expect(requestCultivatorLLMDecision(offerer,world,config,world.tick+1)).resolves.toBeUndefined();
    }
    mock.mockImplementation(async()=>respond(proposal));
    const validProposal=await requestCultivatorLLMDecision(offerer,world,config,world.tick+1);
    expect(validProposal).toMatchObject(proposal);
    world.tick++;
    expect(apply(offerer,validProposal!)).not.toBeNull();
    const row=world.villageSupply.agreements[0];
    expect(row).toMatchObject({status:'offered'});
    expect(row.path).toBeUndefined();
    expect(row.legs).toBeUndefined();
    expect(granaryAt(world,origin.id)?.roots).toBe(4);

    const accept={chosenAction:'VILLAGE_SUPPLY',villageSupplyMove:'accept',targetVillageSupplyId:row.id,innerMonologue:'到场按实存应允。'} as const;
    mock.mockImplementation(async()=>respond(accept));
    await expect(requestCultivatorLLMDecision(accepter,world,config,world.tick+1)).resolves.toBeUndefined();
    expect(donate(accepter,destination.id,'donate_stones')).not.toBeNull();
    world.tick++;
    expect(donate(accepter,destination.id,'donate_stones')).not.toBeNull();
    expect(availableVillageSupplyActions(accepter,world,world.tick+1)).toContainEqual({
      action:'VILLAGE_SUPPLY',villageSupplyMove:'accept',targetVillageSupplyId:row.id,
    });
    await expect(requestCultivatorLLMDecision(bystander,world,config,world.tick+1)).resolves.toBeUndefined();
    expect(mock.mock.calls.at(-1)?.[1]?.body).not.toContain(row.id);
    for(const wrong of [{targetSettlementId:destination.id}, {transportFee:0}, {proposerActorId:offerer.id},
      {outcome:'delivered'}, {hostName:offerer.name}]) {
      mock.mockImplementation(async()=>respond({...accept,...wrong}));
      await expect(requestCultivatorLLMDecision(accepter,world,config,world.tick+1)).resolves.toBeUndefined();
    }
    mock.mockImplementation(async()=>respond(accept));
    const signed=await requestCultivatorLLMDecision(accepter,world,config,world.tick+1);
    expect(signed).toMatchObject(accept);
    const prompt=mock.mock.calls.at(-1)?.[1]?.body;
    expect(prompt).toContain(row.id);
    expect(prompt).not.toContain('donationTick');
    expect(prompt).not.toContain('lastAdvancedTick');
    world.tick++;
    expect(computeHeuristicDecision(accepter,world,()=>.99)).toMatchObject({
      chosenAction:'VILLAGE_SUPPLY',villageSupplyMove:'accept',targetVillageSupplyId:row.id,
    });
    const starting = [offerer.spiritStones,accepter.spiritStones];
    offerer.locationId = destination.locationId;
    expect(apply(accepter,signed!)).toBeNull();
    expect([offerer.spiritStones,accepter.spiritStones]).toEqual(starting);
    offerer.locationId = origin.locationId;
    expect(apply(accepter,signed!)).not.toBeNull();
    expect(row.legs).toMatchObject([{phase:'outbound',checkpoint:0},{phase:'outbound',checkpoint:0}]);
    const trace=recordDecisionTrace(world,accepter.id,legalTraceCandidates(world,accepter),signed!,'model',true);
    expect(trace.chosenAction).toBe('redacted');
    expect(JSON.stringify(trace)).not.toContain(row.id);
    expect([offerer.spiritStones,accepter.spiritStones]).toEqual(starting.map(n=>n-4));
  });
});
