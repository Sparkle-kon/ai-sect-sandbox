import { afterEach, describe, expect, it, vi } from 'vitest';
import { legalTraceCandidates, recordDecisionTrace } from '../src/engine/decisionTraceEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { availableToolLoanActions, TOOL_LOAN_QUALITY_BONUS, TOOL_LOAN_WEAR } from '../src/engine/toolLoanEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import { availableWorkshopActions } from '../src/engine/workshopEngine';
import type { LLMConfig } from '../src/types/world';
import { offeredToolLoan, toolChoice, toolJob, toolPayload, toolPerson, toolTurn, toolWork, usedToolLoan } from './fixtures/toolLoanFixture';

const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'mock-tool-loan'};
const reply=(payload:object)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(payload)}}]}));
afterEach(()=>vi.unstubAllGlobals());

describe('tool custody and the exact workshop-assisted option in both brains',()=>{
  it('does not postpone the unassisted blank, does defer a finish for the unique same-workshop consent in time, then records one worn original',async()=>{
    const f=offeredToolLoan();
    const {world,id,workshopId}=f;
    const borrower=toolPerson(world,f.borrowerId);
    const lender=toolPerson(world,f.lenderId);
    const outsider=toolPerson(world,f.outsiderId);
    const tool=world.toolLoans.loans[0];
    const noTool=toolWork(workshopId);
    const accept=toolChoice('accept',id);
    const mock=vi.fn(async (_url:RequestInfo|URL,_init?:RequestInit)=>reply(accept));
    vi.stubGlobal('fetch',mock);
    expect(computeHeuristicDecision(borrower,world,()=>.99)).toMatchObject({chosenAction:'WORKSHOP',workshopMove:'work',targetWorkshopId:workshopId});
    await expect(requestCultivatorLLMDecision(borrower,world,config,world.tick)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(lender,world,config,world.tick+1)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(outsider,world,config,world.tick+1)).resolves.toBeUndefined();
    expect(mock.mock.calls.at(-1)?.[1]?.body).not.toContain(id);
    for(const extra of [{targetToolLoanId:undefined},{targetArtifactId:f.artifactId},{targetWorkshopId:workshopId},
      {wear:0},{qualityBonus:99},{borrowerId:borrower.id},{spokenLine:'我已经完工'}]){
      mock.mockImplementation(async()=>reply({...accept,...extra}));
      await expect(requestCultivatorLLMDecision(borrower,world,config,world.tick+1)).resolves.toBeUndefined();
    }
    mock.mockImplementation(async()=>reply(accept));
    const consent=await requestCultivatorLLMDecision(borrower,world,config,world.tick+1);
    expect(consent).toEqual(accept);
    expect(applyCultivatorBrainDecision(world,borrower,noTool,()=>.99)).not.toBeNull(); // The first actual blank uses no tool.
    expect(toolJob(world,workshopId).work).toMatchObject([{stage:'blank'}]);
    world.tick++;
    expect(availableWorkshopActions(borrower,world,false).some(option=>
      option.workshopMove==='work'&&option.targetWorkshopId===workshopId&&option.targetToolLoanId===undefined)).toBe(true);
    expect(computeHeuristicDecision(borrower,world,()=>.99)).toMatchObject({...accept,innerMonologue:expect.any(String)});
    expect(applyCultivatorBrainDecision(world,borrower,consent!,()=>.99)).not.toBeNull();
    expect(tool).toMatchObject({status:'active',acceptedTick:world.tick,custody:{id:f.artifactId}});
    expect(lender.artifacts.some(item=>item.id===f.artifactId)).toBe(false);
    expect(borrower.artifacts.some(item=>item.id===f.artifactId)).toBe(false);

    const linked=toolWork(workshopId,id);
    mock.mockImplementation(async()=>reply(linked));
    await expect(requestCultivatorLLMDecision(borrower,world,config,world.tick)).resolves.toBeUndefined();
    const exact=await requestCultivatorLLMDecision(borrower,world,config,world.tick+1);
    expect(exact).toMatchObject(linked);
    expect(mock.mock.calls.at(-1)?.[1]?.body).not.toContain('durabilityBefore');
    expect(mock.mock.calls.at(-1)?.[1]?.body).not.toContain('initialDurability');
    mock.mockImplementation(async()=>reply({...linked,targetToolLoanId:'tool-loan-999'}));
    await expect(requestCultivatorLLMDecision(borrower,world,config,world.tick+1)).resolves.toBeUndefined();
    mock.mockImplementation(async()=>reply({...linked,targetToolLoanId:null}));
    await expect(requestCultivatorLLMDecision(borrower,world,config,world.tick+1)).resolves.toBeUndefined();
    mock.mockImplementation(async()=>reply(noTool));
    await expect(requestCultivatorLLMDecision(borrower,world,config,world.tick+1)).resolves.toMatchObject(noTool);

    world.tick++;
    expect(computeHeuristicDecision(borrower,world,()=>.99)).toMatchObject({
      chosenAction:'WORKSHOP',workshopMove:'work',targetWorkshopId:workshopId,targetToolLoanId:id,
    });
    const job=toolJob(world,workshopId);
    const left=job.escrowHerbs;
    expect(applyCultivatorBrainDecision(world,borrower,{...linked,targetToolLoanId:'tool-loan-999'},()=>.99)).toBeNull();
    expect(job.work).toHaveLength(1);
    expect(job.escrowHerbs).toBe(left);
    expect(tool.wear).toBeUndefined();
    expect(applyCultivatorBrainDecision(world,borrower,exact!,()=>.99)).not.toBeNull();
    expect(applyCultivatorBrainDecision(world,borrower,exact!,()=>.99)).toBeNull();
    expect(job.work[1].toolUse).toMatchObject({loanId:id,scoreBonus:TOOL_LOAN_QUALITY_BONUS});
    expect(tool.wear).toMatchObject({durabilityAfter:tool.initialDurability-TOOL_LOAN_WEAR,workshopId});
    const trace=recordDecisionTrace(world,borrower.id,legalTraceCandidates(world,borrower),exact!,'model',true);
    expect(trace.chosenAction).toBe('redacted');
    expect(JSON.stringify(trace)).not.toContain(id);
  });

  it('does not defer a due finish when a legitimate next-turn reservation removes the actual work slot',()=>{
    const {world,id,siteId,workshopId,borrowerId,outsiderId}=offeredToolLoan();
    const maker=toolPerson(world,borrowerId);
    const other=toolPerson(world,outsiderId);
    expect(applyCultivatorBrainDecision(world,maker,toolWork(workshopId),()=>.99)).not.toBeNull();
    world.tick++;
    expect(availableToolLoanActions(maker,world)).toContainEqual({action:'TOOL_LOAN',toolLoanMove:'accept',targetToolLoanId:id});
    expect(applyCultivatorBrainDecision(world,other,toolPayload('FURNACE_RESERVATION',{
      furnaceMove:'reserve',targetLocationId:siteId,
    }),()=>.99)).not.toBeNull();
    expect(availableWorkshopActions(maker,world,false).some(({workshopMove})=>workshopMove==='work')).toBe(true);
    expect(availableWorkshopActions(maker,world,false,world.tick+1).some(({workshopMove})=>workshopMove==='work')).toBe(false);
    const chosen=computeHeuristicDecision(maker,world,()=>.99);
    expect(chosen).toMatchObject({chosenAction:'WORKSHOP',workshopMove:'work',targetWorkshopId:workshopId});
    expect(chosen.targetToolLoanId).toBeUndefined();
  });

  it('allows only the rightful present owner to reclaim the same worn tool in a later turn',async()=>{
    const f=usedToolLoan();
    const {world,id}=f;
    const borrower=toolPerson(world,f.borrowerId);
    const lender=toolPerson(world,f.lenderId);
    const reclaim=toolChoice('reclaim',id);
    const mock=vi.fn(async()=>reply(reclaim));
    vi.stubGlobal('fetch',mock);
    await expect(requestCultivatorLLMDecision(borrower,world,config,world.tick+1)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(lender,world,config,world.tick)).resolves.toBeUndefined();
    const ready=await requestCultivatorLLMDecision(lender,world,config,world.tick+1);
    expect(ready).toEqual(reclaim);
    const actual=toolTurn(world);
    const owner=toolPerson(actual,f.lenderId);
    expect(availableToolLoanActions(owner,actual)).toContainEqual({action:'TOOL_LOAN',toolLoanMove:'reclaim',targetToolLoanId:id});
    expect(computeHeuristicDecision(owner,actual,()=>.99)).toMatchObject({
      chosenAction:'TOOL_LOAN',toolLoanMove:'reclaim',targetToolLoanId:id,
    });
    owner.locationId='loc-market';
    expect(applyCultivatorBrainDecision(actual,owner,ready!,()=>.99)).toBeNull();
    owner.locationId=f.siteId;
    expect(applyCultivatorBrainDecision(actual,owner,ready!,()=>.99)).not.toBeNull();
    expect(owner.artifacts.filter(item=>item.id===f.artifactId)).toMatchObject([
      {id:f.artifactId,durability:actual.toolLoans.loans[0].initialDurability-TOOL_LOAN_WEAR},
    ]);
    expect(actual.toolLoans.loans[0]).toMatchObject({status:'returned'});
    expect(actual.toolLoans.loans[0].custody).toBeUndefined();
  });
});
