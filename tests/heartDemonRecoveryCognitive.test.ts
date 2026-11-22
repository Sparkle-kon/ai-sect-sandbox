import {afterEach,describe,expect,it,vi} from 'vitest';
import {availableHeartDemonRecovery,heartDemonRecoveryEventId} from '../src/engine/heartDemonAftermathEngine';
import {queueGuidedHeartDemonChoice} from '../src/engine/heartDemonEngine';
import {heartDemonRecoveryCommand} from '../src/engine/heartDemonRecoveryCognition';
import {sealedHeartDemonMemory} from '../src/engine/heartDemonPrivacy';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {recallMemories,recordMemory} from '../src/engine/memoryEngine';
import {enrichAnnualReflections} from '../src/engine/reflectionEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMConfig,LLMDecisionPayload,WorldState} from '../src/types/world';
import {actualNativeHeartFrame,trialActor,trialActorId,trialTurn} from './heartDemonNativeFixture';

const config:LLMConfig={enabled:true,apiBaseUrl:'https://hearts.invalid/v1',apiKey:'mock',model:'mock'};
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'今月静候。'};
const reply=(content:unknown)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(content)}}]}));

function backlash(){
  const {frame,trial}=actualNativeHeartFrame();
  const actor=trialActor(frame);
  actor.personality='刚正';actor.techniqueMastery=0;actor.karma=-100;trial.pressure=100;
  return trialTurn(queueGuidedHeartDemonChoice(frame,actor.id,trial.id,'wrath'));
}
const sendMonth=(world:WorldState,order:LLMDecisionPayload,applied:(id:string,ok:boolean)=>void)=>
  advanceWorldTick(world,Object.fromEntries(world.cultivators.map(actor=>[actor.id,actor.id===trialActorId?order:rest])),()=>.2,
    'deferred',applied,{modelActors:new Set([trialActorId])});

afterEach(()=>vi.unstubAllGlobals());

describe('quiet recovery uses exact native authority and seals the actual memory outbound',()=>{
  it('rejects authored details and accepts only the pre-existing native REST option, with real cost and no memory in the prompt',async()=>{
    const world=backlash(),actor=trialActor(world),scope=actor.heartDemonAftermath!;
    const option=availableHeartDemonRecovery(world,actor,world.tick+1);
    expect(option).toBeDefined();
    const exact=heartDemonRecoveryCommand(option!);
    const sealed=[...actor.memories,...actor.coreMemories].find(sealedHeartDemonMemory)!;
    expect(sealed.content).toContain('幻境之中');
    expect(actor.rumors.map(row=>row.originEventId)).not.toContain(scope.resultEventId);
    let answer:unknown={...exact,qiPaid:0};
    let prompt='';
    const provider=vi.fn(async (_url:RequestInfo|URL,init?:RequestInit)=>{
      prompt=(JSON.parse(String(init?.body)) as {messages:{content:string}[]}).messages.at(-1)!.content;
      return reply(answer);
    });
    vi.stubGlobal('fetch',provider);
    for(const forged of [{...exact,qiPaid:0},{...exact,targetHeartDemonAftermathId:'not-native'},
      {...exact,chosenAction:'SOCIALIZE'},{...exact,memory:sealed.content}]){
      answer=forged;
      llmScheduler.resetTickBudget();
      await expect(requestCultivatorLLMDecision(actor,world,config,world.tick+1)).resolves.toBeUndefined();
    }
    answer=exact;
    llmScheduler.resetTickBudget();
    const order=await requestCultivatorLLMDecision(actor,world,config,world.tick+1);
    expect(order).toMatchObject(exact);
    expect(prompt).toContain('本月可以用一次调息自持');
    for(const secret of [sealed.content,sealed.id,scope.resultEventId,'心魔反噬','余火未熄'])
      expect(prompt).not.toContain(secret);
    const applied=vi.fn(),next=sendMonth(world,order!,applied);
    const receipt=heartDemonRecoveryEventId(scope.trialId,next.tick);
    expect(applied).toHaveBeenCalledWith(actor.id,true);
    expect(trialActor(next).heartDemonAftermath?.recovery).toMatchObject({qiPaid:16,eventId:receipt});
    expect(trialActor(next).rumors.map(row=>row.originEventId)).not.toContain(receipt);
    expect(next.decisionTrace.records.find(row=>row.actorId===actor.id&&row.tick===next.tick))
      .toMatchObject({chosenAction:'redacted',candidates:[]});
  });

  it('withholds an annual finding and refuses an unsolicited rewrite linked to a real sealed memory',async()=>{
    const {frame,trial}=actualNativeHeartFrame();
    let year=trialTurn(queueGuidedHeartDemonChoice(frame,trialActorId,trial.id,'face'));
    while(year.month!==1)year=trialTurn(year);
    const actor=trialActor(year),sealed=[...actor.memories,...actor.coreMemories].find(sealedHeartDemonMemory)!;
    expect(actor.alive).toBe(true);
    expect(sealed).toBeDefined();
    recordMemory(actor,year.tick,'与同门看了一阵松风。',8,'social',2);
    const ordinary=actor.memories.find(row=>row.content.includes('看了一阵松风'))!;
    expect(recallMemories(actor,year.tick,Infinity)).toContain(ordinary);
    const privateFinding={id:'sealed-observation',tick:year.tick,kind:'heart_demon' as const,theme:'heavenly' as const,
      intensity:8,statement:sealed.content,sourceMemoryIds:[sealed.id],source:'utility' as const};
    const publicFinding={id:'ordinary-observation',tick:year.tick,kind:'belief' as const,theme:'community' as const,
      intensity:8,statement:'春风可等同门共看。',sourceMemoryIds:[ordinary.id],source:'utility' as const};
    actor.reflections=[privateFinding,publicFinding];
    for(const peer of year.cultivators)if(peer!==actor)peer.reflections=[];
    const provider=vi.fn(async (_url:RequestInfo|URL,init?:RequestInit)=>{
      const raw=String(init?.body);
      expect(raw).toContain(publicFinding.id);
      expect(raw).not.toContain(privateFinding.id);
      expect(raw).not.toContain(sealed.id);
      expect((JSON.parse(raw) as {messages:{content:string}[]}).messages.at(-1)?.content).not.toContain('幻境之中');
      return reply({reflections:[{id:privateFinding.id,statement:'试图替人书写未公开旧事。'}]});
    });
    vi.stubGlobal('fetch',provider);
    llmScheduler.resetTickBudget();
    const next=await enrichAnnualReflections(year,{...config,apiBaseUrl:'https://annual-heart-proof.invalid/v1'});
    expect(provider).toHaveBeenCalledTimes(1);
    expect(trialActor(next).reflections).toEqual([privateFinding,publicFinding]);
  });
});
