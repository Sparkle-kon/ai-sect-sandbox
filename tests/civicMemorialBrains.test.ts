import { afterEach, describe, expect, it, vi } from 'vitest';
import { legalTraceCandidates, recordDecisionTrace } from '../src/engine/decisionTraceEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig } from '../src/types/world';
import { CIVIC_MEMORIAL_COST } from '../src/engine/civicMemorialEngine';
import { civicActor, civicMemorialFixture } from './fixtures/civicMemorialFixture';

const config: LLMConfig = {enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'mock-civic-memorial'};
const respond=(payload:object)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(payload)}}]}));
afterEach(()=>vi.unstubAllGlobals());

describe('civic memorial choices stay bound to actual relief and independent testimony',()=>{
  it('accepts only exact opaque deed and later independent verification, never generated civic records',async()=>{
    const { world, proposer: proposerId, witness, subjectId, sameNameId, outsider: outsiderId } = civicMemorialFixture();
    const proposer=civicActor(world,proposerId);
    const verifier=civicActor(world,witness);
    const subject=civicActor(world,subjectId);
    const outsider=civicActor(world,outsiderId);
    const deed=world.civicMemorials.deeds[0];
    subject.locationId=outsider.locationId;
    civicActor(world,sameNameId).locationId=outsider.locationId;
    // Wait through the real local miasma's last active turn. Safety takes priority over a memorial.
    world.tick=Math.max(world.tick,...world.mapHazards.map(({expiresTick})=>expiresTick));
    verifier.qiProgress=20;
    verifier.herbs.jade_leaf=0;
    const proposal={chosenAction:'CIVIC_MEMORIAL',civicMemorialMove:'propose',targetCivicDeedId:deed.id,innerMonologue:'只提真实旧事。'} as const;
    const mock=vi.fn(async (_url:RequestInfo|URL,_init?:RequestInit)=>respond(proposal));
    vi.stubGlobal('fetch',mock);
    for(const extra of [{targetCivicDeedId:undefined},{targetCivicMemorialId:'invented'},{name:deed.name},
      {householdId:deed.householdId},{witnessIds:[verifier.id]},{cause:'想象'},{stoneCost:0},{spokenLine:'我杜撰新事'}]){
      mock.mockImplementation(async()=>respond({...proposal,...extra}));
      await expect(requestCultivatorLLMDecision(proposer,world,config,world.tick+1)).resolves.toBeUndefined();
    }
    mock.mockImplementation(async()=>respond(proposal));
    const proposed=await requestCultivatorLLMDecision(proposer,world,config,world.tick+1);
    expect(proposed).toMatchObject(proposal);
    const prompt=mock.mock.calls.at(-1)?.[1]?.body;
    expect(prompt).toContain('乡祠只复制本人在村实际许可');
    expect(prompt).toContain(deed.id);
    // Already witnessed public events can say the same name; the new private civic projection never does.
    const messages=(JSON.parse(String(prompt)) as { messages:Array<{content:string}> }).messages;
    const civicLine=messages.flatMap(({content})=>content.split('\n')).find(line=>line.startsWith('- 乡祠'));
    expect(civicLine).not.toContain(deed.name);
    expect(civicLine).not.toContain(deed.householdId);
    expect(prompt).not.toContain(deed.householdId);
    expect(prompt).not.toContain('witnessIds');
    expect(prompt).not.toContain('reliefRecordId');
    world.tick++;
    expect(applyCultivatorBrainDecision(world,proposer,proposed!,()=>.99)).not.toBeNull();
    const row=world.civicMemorials.memorials[0];
    expect(row).toMatchObject({status:'proposed',deedId:deed.id});
    const verify={chosenAction:'CIVIC_MEMORIAL',civicMemorialMove:'verify',targetCivicMemorialId:row.id,innerMonologue:'只核本人亲见。'} as const;
    mock.mockImplementation(async()=>respond(verify));
    await expect(requestCultivatorLLMDecision(verifier,world,config,world.tick)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(proposer,world,config,world.tick+1)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(subject,world,config,world.tick+1)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(outsider,world,config,world.tick+1)).resolves.toBeUndefined();
    expect(mock.mock.calls.at(-1)?.[1]?.body).not.toContain(row.id);
    mock.mockImplementation(async()=>respond({...verify,targetCivicDeedId:deed.id}));
    await expect(requestCultivatorLLMDecision(verifier,world,config,world.tick+1)).resolves.toBeUndefined();
    mock.mockImplementation(async()=>respond(verify));
    const approved=await requestCultivatorLLMDecision(verifier,world,config,world.tick+1);
    expect(approved).toMatchObject(verify);
    world.tick++;
    expect(computeHeuristicDecision(verifier,world,()=>.99)).toMatchObject({
      chosenAction:'CIVIC_MEMORIAL',civicMemorialMove:'verify',targetCivicMemorialId:row.id,
    });
    const local=verifier.locationId;
    const funds=proposer.spiritStones;
    const roots=proposer.herbs.earth_root;
    verifier.locationId=outsider.locationId;
    expect(applyCultivatorBrainDecision(world,verifier,approved!,()=>.99)).toBeNull();
    expect(proposer.spiritStones).toBe(funds);
    verifier.locationId=local;
    expect(applyCultivatorBrainDecision(world,verifier,approved!,()=>.99)).not.toBeNull();
    expect(row).toMatchObject({status:'verified',verification:{verifierId:verifier.id,tick:world.tick}});
    expect([proposer.spiritStones,proposer.herbs.earth_root]).toEqual([
      funds-CIVIC_MEMORIAL_COST.stones,roots-CIVIC_MEMORIAL_COST.earthRoots,
    ]);
    expect(applyCultivatorBrainDecision(world,verifier,approved!,()=>.99)).toBeNull();
    const trace=recordDecisionTrace(world,verifier.id,legalTraceCandidates(world,verifier),approved!,'model',true);
    expect(trace.chosenAction).toBe('redacted');
    expect(JSON.stringify(trace)).not.toContain(row.id);
  });
});
