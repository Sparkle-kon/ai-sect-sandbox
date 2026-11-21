import { afterEach, describe, expect, it, vi } from 'vitest';
import { availableDamageAssuranceActions } from '../src/engine/damageAssuranceEngine';
import { legalTraceCandidates, recordDecisionTrace } from '../src/engine/decisionTraceEngine';
import { FURNACE_SAFETY_REPAIR } from '../src/engine/furnaceSafetyEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig } from '../src/types/world';
import { assuranceCase, assuranceChoice, assurancePerson, inspectedDamageAssurance, nativeSafetyChoice }
  from './fixtures/damageAssuranceFixture';

const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'mock-damage-assurance'};
const respond=(payload:object)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(payload)}}]}));
afterEach(()=>vi.unstubAllGlobals());

describe('furnace assurance in both decision paths',()=>{
  it('seals exact actual inspected loss first without paying or changing the furnace, not a created or copied hazard record',async()=>{
    const f=inspectedDamageAssurance(),{world,caseId}=f;
    const owner=assurancePerson(world,f.actorId);
    owner.personality='苟道'; // No unrelated optional terrain restoration on this date.
    const outsider=assurancePerson(world,f.outsiderId);
    const inspected=assuranceCase(world,caseId);
    const seal=assuranceChoice('seal',caseId);
    const mock=vi.fn(async (_url:RequestInfo|URL,_init?:RequestInit)=>respond(seal));
    vi.stubGlobal('fetch',mock);
    expect(availableDamageAssuranceActions(owner,world)).toEqual([]);
    await expect(requestCultivatorLLMDecision(owner,world,config,world.tick)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(outsider,world,config,world.tick+1)).resolves.toBeUndefined();
    for(const extra of [{targetFurnaceSafetyId:'invented'},{targetDamageAssuranceId:'invented'},{integrity:100},
      {originalLoss:0},{hazardId:inspected.hazardId},{locationId:f.siteId},{responsibleSectId:f.sectId},
      {materials:0},{spokenLine:'假称炉已修好'}]){
      mock.mockImplementation(async()=>respond({...seal,...extra}));
      await expect(requestCultivatorLLMDecision(owner,world,config,world.tick+1)).resolves.toBeUndefined();
    }
    mock.mockImplementation(async()=>respond(seal));
    const approved=await requestCultivatorLLMDecision(owner,world,config,world.tick+1);
    expect(approved).toEqual(seal);
    const prompt=mock.mock.calls.at(-1)?.[1]?.body;
    expect(prompt).toContain('炉损封存与实修只复制本人在地合法许可');
    expect(prompt).not.toContain(inspected.hazardId);
    expect(prompt).not.toContain('creditedPoints');
    const before=structuredClone(inspected);
    const funds=[owner.spiritStones,owner.herbs.earth_root];
    world.tick++;
    expect(computeHeuristicDecision(owner,world,()=>.99)).toMatchObject({...seal,innerMonologue:expect.any(String)});
    expect(applyCultivatorBrainDecision(world,owner,approved!,()=>.99)).not.toBeNull();
    expect(inspected).toEqual(before);
    expect([owner.spiritStones,owner.herbs.earth_root]).toEqual(funds);
    expect(world.damageAssurance.claims[0]).toMatchObject({status:'open',sourceCaseId:caseId,contributions:[]});
    expect(applyCultivatorBrainDecision(world,owner,approved!,()=>.99)).toBeNull();

    const claim=world.damageAssurance.claims[0];
    const realRepair=assuranceChoice('make_good',claim.id);
    mock.mockImplementation(async()=>respond(realRepair));
    await expect(requestCultivatorLLMDecision(owner,world,config,world.tick)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(outsider,world,config,world.tick+1)).resolves.toBeUndefined();
    for(const extra of [{targetFurnaceSafetyId:caseId},{targetDamageAssuranceId:'invented'},{stoneCost:0},
      {rootsSpent:0},{creditedPoints:40},{settled:'paid'}]){
      mock.mockImplementation(async()=>respond({...realRepair,...extra}));
      await expect(requestCultivatorLLMDecision(owner,world,config,world.tick+1)).resolves.toBeUndefined();
    }
    mock.mockImplementation(async()=>respond(realRepair));
    const planned=await requestCultivatorLLMDecision(owner,world,config,world.tick+1);
    expect(planned).toEqual(realRepair);
    world.tick++;
    expect(computeHeuristicDecision(owner,world,()=>.99)).toMatchObject({...realRepair,innerMonologue:expect.any(String)});
    owner.locationId='loc-market';
    expect(applyCultivatorBrainDecision(world,owner,planned!,()=>.99)).toBeNull();
    expect([owner.spiritStones,owner.herbs.earth_root]).toEqual(funds);
    owner.locationId=f.siteId;
    expect(applyCultivatorBrainDecision(world,owner,planned!,()=>.99)).not.toBeNull();
    expect(applyCultivatorBrainDecision(world,owner,planned!,()=>.99)).toBeNull();
    expect([owner.spiritStones,owner.herbs.earth_root]).toEqual([
      funds[0]-FURNACE_SAFETY_REPAIR.stones,funds[1]-FURNACE_SAFETY_REPAIR.roots,
    ]);
    expect(inspected.receipts.map(({kind})=>kind)).toEqual(['inspect','repair']);
    expect(claim.contributions).toMatchObject([{tick:world.tick,creditedPoints:inspected.integrity-before.integrity}]);
    expect(claim.contributions[0].creditedPoints).toBeLessThanOrEqual(claim.initialLoss);
    const trace=recordDecisionTrace(world,owner.id,legalTraceCandidates(world,owner),planned!,'model',true);
    expect(trace.chosenAction).toBe('redacted');
    expect(JSON.stringify(trace)).not.toContain(claim.id);
    world.tick++;
    expect(computeHeuristicDecision(owner,world,()=>.99)).toMatchObject({
      ...nativeSafetyChoice('reopen',caseId),innerMonologue:expect.any(String),
    });
  });
});
