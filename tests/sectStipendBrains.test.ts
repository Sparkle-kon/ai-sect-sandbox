import { afterEach, describe, expect, it, vi } from 'vitest';
import { legalTraceCandidates, recordDecisionTrace } from '../src/engine/decisionTraceEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { maintainSectPolitics } from '../src/engine/sectPoliticsEngine';
import { advanceSectStipends, SECT_STIPEND_AMOUNT } from '../src/engine/sectStipendEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig } from '../src/types/world';
import { acceptedSectStipend, retiredClinicGuard, stipendDecision, stipendPerson, stipendSect } from './fixtures/sectStipendFixture';

const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'mock-sect-stipend'};
const reply=(payload:object)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(payload)}}]}));
afterEach(()=>vi.unstubAllGlobals());

describe('both brains use actual former service and finite current authorities',()=>{
  it('proposes from real completed private treatment, then accepts only the exact later offer without transferring money',async()=>{
    const f=retiredClinicGuard();
    const {world}=f;
    const leader=stipendPerson(world,f.leaderId);
    const recipient=stipendPerson(world,f.recipientId);
    const patient=stipendPerson(world,f.patientId);
    const sect=stipendSect(world,f.sectId);
    const offer=stipendDecision('offer',f.caseId);
    const mock=vi.fn(async (_url:RequestInfo|URL,_init?:RequestInit)=>reply(offer));
    vi.stubGlobal('fetch',mock);
    const treasury=sect.spiritStones;
    const balance=recipient.spiritStones;
    const rank=recipient.sectRank;
    await expect(requestCultivatorLLMDecision(leader,world,config,world.tick)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(patient,world,config,world.tick+1)).resolves.toBeUndefined();
    for(const extra of [{targetInfirmaryCaseId:'imagined'},{targetStipendId:'imagined'},{amount:20},{patientId:patient.id},
      {retirementId:f.retirementId},{medicine:'草药'},{dueTick:99},{spokenLine:'发放立即完成'}]){
      mock.mockImplementation(async()=>reply({...offer,...extra}));
      await expect(requestCultivatorLLMDecision(leader,world,config,world.tick+1)).resolves.toBeUndefined();
    }
    mock.mockImplementation(async()=>reply(offer));
    const planned=await requestCultivatorLLMDecision(leader,world,config,world.tick+1);
    expect(planned).toEqual(offer);
    const json=JSON.parse(String(mock.mock.calls.at(-1)?.[1]?.body)) as { messages:Array<{content:string}> };
    const line=json.messages.flatMap(row=>row.content.split('\n')).find(row=>row.startsWith('- 退居俸养'));
    expect(line).toContain(f.caseId);
    expect(line).not.toContain(f.patientId);
    expect(line).not.toContain(f.retirementId);
    expect(line).not.toContain(f.shiftId);
    world.tick++;
    expect(applyCultivatorBrainDecision(world,leader,planned!,()=>.99)).not.toBeNull();

    const row=world.sectStipends.stipends[0];
    const accept=stipendDecision('accept',row.id);
    mock.mockImplementation(async()=>reply(accept));
    await expect(requestCultivatorLLMDecision(recipient,world,config,world.tick)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(leader,world,config,world.tick+1)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(patient,world,config,world.tick+1)).resolves.toBeUndefined();
    const consent=await requestCultivatorLLMDecision(recipient,world,config,world.tick+1);
    expect(consent).toEqual(accept);
    world.tick++;
    expect(computeHeuristicDecision(recipient,world,()=>.99)).toMatchObject({
      chosenAction:'SECT_STIPEND',stipendMove:'accept',targetStipendId:row.id,
    });
    leader.locationId='loc-market';
    expect(applyCultivatorBrainDecision(world,recipient,consent!,()=>.99)).toBeNull();
    expect(row.status).toBe('offered');
    leader.locationId=f.siteId;
    expect(applyCultivatorBrainDecision(world,recipient,consent!,()=>.99)).not.toBeNull();
    expect(row).toMatchObject({status:'active',acceptedTick:world.tick,periods:[]});
    expect([sect.spiritStones,recipient.spiritStones,recipient.sectRank]).toEqual([treasury,balance,rank]);
    expect(applyCultivatorBrainDecision(world,recipient,consent!,()=>.99)).toBeNull();
    const trace=recordDecisionTrace(world,recipient.id,legalTraceCandidates(world,recipient),consent!,'model',true);
    expect(trace.chosenAction).toBe('redacted');
    expect(JSON.stringify(trace)).not.toContain(row.id);
  });

  it('adopts only on a later turn after an actual native succession, never paying back the missed period',async()=>{
    const f=acceptedSectStipend();
    const {world}=f;
    const sect=stipendSect(world,f.sectId);
    const old=stipendPerson(world,f.leaderId);
    const recipient=stipendPerson(world,f.recipientId);
    const balance=recipient.spiritStones;
    const adopt=stipendDecision('adopt',f.stipendId);
    const mock=vi.fn(async()=>reply(adopt));
    vi.stubGlobal('fetch',mock);
    await expect(requestCultivatorLLMDecision(stipendPerson(world,f.successorId),world,config,world.tick+1)).resolves.toBeUndefined();
    old.alive=false;
    old.hp=0;
    world.tick++;
    maintainSectPolitics(world);
    const succession=sect.succession!;
    expect(succession.method).toBe('election');
    const successor=stipendPerson(world,succession.leaderId);
    successor.locationId=f.siteId;
    advanceSectStipends(world);
    const row=world.sectStipends.stipends[0];
    expect(row.periods).toMatchObject([{paidAmount:0,reason:'authority_absent'}]);
    expect(row.handoffs).toEqual([]);
    await expect(requestCultivatorLLMDecision(successor,world,config,world.tick)).resolves.toBeUndefined();
    const adopted=await requestCultivatorLLMDecision(successor,world,config,world.tick+1);
    expect(adopted).toEqual(adopt);
    world.tick++;
    expect(computeHeuristicDecision(successor,world,()=>.99)).toMatchObject({
      chosenAction:'SECT_STIPEND',stipendMove:'adopt',targetStipendId:f.stipendId,
    });
    expect(applyCultivatorBrainDecision(world,successor,adopted!,()=>.99)).not.toBeNull();
    expect(applyCultivatorBrainDecision(world,successor,adopted!,()=>.99)).toBeNull();
    expect(recipient.spiritStones).toBe(balance); // Adopting is not itself any payment.
    advanceSectStipends(world);
    expect(row.handoffs).toMatchObject([{fromId:old.id,toId:successor.id,adoptedTick:world.tick}]);
    expect(row.periods.map(p=>p.paidAmount)).toEqual([0,SECT_STIPEND_AMOUNT]);
  });
});
