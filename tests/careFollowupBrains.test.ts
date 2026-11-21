import { afterEach, describe, expect, it, vi } from 'vitest';
import { availableCareFollowupActions } from '../src/engine/careFollowupEngine';
import { CARE_FOLLOWUP_JADE_LEAF, CARE_FOLLOWUP_STONES } from '../src/engine/careFollowupTerms';
import { legalTraceCandidates, recordDecisionTrace } from '../src/engine/decisionTraceEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig } from '../src/types/world';
import { careChoice, carePayload, carePerson, careSect, careSite, careTurn, dischargedCareFollowup, scheduledCareFollowup }
  from './fixtures/careFollowupFixture';

const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'mock-followup'};
const respond=(payload:object)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(payload)}}]}));
afterEach(()=>vi.unstubAllGlobals());

describe('both brains require an actual later visit and an independently staffed clinic',()=>{
  it('schedules privately from a native paid discharge only for its former patient; no fabricated appointment dates or staff',async()=>{
    const f=dischargedCareFollowup(),{world}=f;
    const patient=carePerson(world,f.patientId);
    const outsider=carePerson(world,f.outsiderId);
    const schedule=careChoice('schedule',f.sourceCaseId);
    const mock=vi.fn(async (_url:RequestInfo|URL,_init?:RequestInit)=>respond(schedule));
    vi.stubGlobal('fetch',mock);
    await expect(requestCultivatorLLMDecision(patient,world,config,world.tick)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(outsider,world,config,world.tick+1)).resolves.toBeUndefined();
    for(const extra of [{targetInfirmaryCaseId:'imagined'},{targetCareFollowupId:'imagined'},{scheduledTick:world.tick},
      {guardId:f.guardId},{hpRestored:100},{cost:0},{spokenLine:'声称已经治愈'}]){
      mock.mockImplementation(async()=>respond({...schedule,...extra}));
      await expect(requestCultivatorLLMDecision(patient,world,config,world.tick+1)).resolves.toBeUndefined();
    }
    mock.mockImplementation(async()=>respond(schedule));
    const plan=await requestCultivatorLLMDecision(patient,world,config,world.tick+1);
    expect(plan).toEqual(schedule);
    const prompt=mock.mock.calls.at(-1)?.[1]?.body;
    expect(prompt).toContain('出院后复诊只复制本人实际许可');
    expect(prompt).not.toContain(f.sourceShiftId);
    expect(prompt).not.toContain('hpRestored');
    const prior={records:structuredClone(world.infirmaries),balance:patient.spiritStones,pills:patient.pillToxicity,hp:patient.hp};
    world.tick++;
    expect(applyCultivatorBrainDecision(world,patient,plan!,()=>.99)).not.toBeNull();
    expect(world.careFollowups.appointments).toMatchObject([{
      patientId:patient.id,sourceCaseId:f.sourceCaseId,scheduledTick:world.tick,dueTick:world.tick+2,status:'scheduled',
    }]);
    expect({records:world.infirmaries,balance:patient.spiritStones,pills:patient.pillToxicity,hp:patient.hp}).toEqual(prior);
    expect(applyCultivatorBrainDecision(world,patient,plan!,()=>.99)).toBeNull();
  });

  it('can genuinely volunteer distinct native staffing, rechecks acute priority, and treats at most once without charging the patient',async()=>{
    const f=scheduledCareFollowup(),{world}=f;
    const patient=carePerson(world,f.patientId);
    const original=carePerson(world,f.sourceGuardId);
    const guard=carePerson(world,f.guardId);
    const site=careSite(world,f.siteId),sect=careSect(world,f.sectId);
    // Still a genuine follow-up need, but not ill enough to enter the ordinary acute queue.
    patient.hp=155;
    patient.qiProgress=20;
    const staff=carePayload('INFIRMARY',{infirmaryMove:'staff'});
    const mock=vi.fn(async (_url:RequestInfo|URL,_init?:RequestInit)=>respond(staff));
    vi.stubGlobal('fetch',mock);
    await requestCultivatorLLMDecision(original,world,config,world.tick+1);
    expect(mock.mock.calls.at(-1)?.[1]?.body).not.toContain('此地已有可由后来当值人处理');
    const validStaff=await requestCultivatorLLMDecision(guard,world,config,world.tick+1);
    expect(validStaff).toMatchObject(staff);
    const body=String(mock.mock.calls.at(-1)?.[1]?.body);
    expect(body).toContain('此地已有可由后来当值人处理');
    expect(body).not.toContain(f.id);
    expect(body).not.toContain('sourceGuardId');
    world.tick++;
    expect(computeHeuristicDecision(guard,world,()=>.99)).toMatchObject({chosenAction:'INFIRMARY',infirmaryMove:'staff'});
    expect(applyCultivatorBrainDecision(world,guard,validStaff!,()=>.99)).not.toBeNull();

    const attend=careChoice('attend',f.id);
    mock.mockImplementation(async()=>respond(attend));
    await expect(requestCultivatorLLMDecision(patient,world,config,world.tick)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(guard,world,config,world.tick+1)).resolves.toBeUndefined();
    const approved=await requestCultivatorLLMDecision(patient,world,config,world.tick+1);
    expect(approved).toEqual(attend);
    expect(availableCareFollowupActions(patient,world,world.tick+1).some(({careFollowupMove})=>careFollowupMove==='attend')).toBe(true);

    const contested=structuredClone(world);
    const acute=carePerson(contested,f.acuteId);
    acute.hp=40;
    expect(applyCultivatorBrainDecision(contested,acute,carePayload('INFIRMARY',{infirmaryMove:'request'}),()=>.99)).not.toBeNull();
    const acuteId=contested.infirmaries.cases.at(-1)!.id;
    const urgentTurn=careTurn(contested,{[patient.id]:approved!,[acute.id]:carePayload('INFIRMARY',{
      infirmaryMove:'accept',targetInfirmaryCaseId:acuteId,
    })});
    expect(urgentTurn.infirmaries.cases.find(({id})=>id===acuteId)?.status).toBe('treated');
    expect(urgentTurn.careFollowups.appointments[0]).toMatchObject({status:'scheduled'});
    expect(urgentTurn.careFollowups.appointments[0].receipt).toBeUndefined();

    world.tick++;
    expect(computeHeuristicDecision(patient,world,()=>.99)).toMatchObject({chosenAction:'CARE_FOLLOWUP',careFollowupMove:'attend',targetCareFollowupId:f.id});
    const balances=[site.herbs.jade_leaf,sect.spiritStones,patient.spiritStones];
    expect(applyCultivatorBrainDecision(world,patient,approved!,()=>.99)).not.toBeNull();
    expect(applyCultivatorBrainDecision(world,patient,approved!,()=>.99)).toBeNull();
    expect(world.careFollowups.appointments[0]).toMatchObject({status:'attended',receipt:{guardId:guard.id}});
    expect([site.herbs.jade_leaf,sect.spiritStones,patient.spiritStones]).toEqual([
      balances[0]-CARE_FOLLOWUP_JADE_LEAF,balances[1]-CARE_FOLLOWUP_STONES,balances[2],
    ]);
    expect(world.infirmaries.cases).toHaveLength(1);
    const trace=recordDecisionTrace(world,patient.id,legalTraceCandidates(world,patient),approved!,'model',true);
    expect(trace.chosenAction).toBe('redacted');
    expect(JSON.stringify(trace)).not.toContain(f.id);
  });
});
