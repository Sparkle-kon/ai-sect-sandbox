import {afterEach,describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {possessAvatar,queueAvatarOrder} from '../src/engine/avatarEngine';
import {resolveOathAction} from '../src/engine/oathEngine';
import type {LLMConfig,LLMDecisionPayload,WorldState} from '../src/types/world';

const config:LLMConfig={enabled:true,model:'scope-fixture',apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture-only'};
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'留在实际所在地调息。'};
const reply=(value:LLMDecisionPayload)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}));
afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});
function prepared(){
  const original=createInitialWorld(2031),[first,second,third]=original.cultivators;
  first.locationId=second.locationId='loc-market';third.locationId='loc-blood';
  first.hp-=100;
  const next=advanceWorldTick(original,Object.fromEntries(original.cultivators.map(({id})=>[id,rest])),()=>.99);
  const actor=next.cultivators.find(({id})=>id===first.id)!;
  const peer=next.cultivators.find(({id})=>id===second.id)!;
  const distant=next.cultivators.find(({id})=>id===third.id)!;
  return {world:next,actor,peer,distant};
}
const response=(id:string):LLMDecisionPayload=>({chosenAction:'SOCIALIZE',targetCultivatorId:id,innerMonologue:'只与现场有缘之人交谈。'});

describe('Cognitive JSON receives the same local ordinary choices without claiming results',()=>{
  it('offers ranked local targets, accepts the exact choice and never lists the known remote test actor in the new section',async()=>{
    const {world,actor,peer,distant}=prepared();
    const api=vi.fn(async (_url:string,init:RequestInit)=>{
      const request=JSON.parse(String(init.body)) as {messages:{role:string;content:string}[]};
      const prompt=request.messages.find(row=>row.role==='user')?.content??'';
      const line=prompt.split('\n').find(row=>row.includes('日常选项'))??'';
      expect(line).toContain(peer.id);
      expect(line).not.toContain(distant.id);
      expect(line).toContain('"score"');
      expect(line).toContain('不可自报结果');
      return reply(response(peer.id));
    });
    vi.stubGlobal('fetch',api);
    await expect(requestCultivatorLLMDecision(actor,world,config,world.tick+1)).resolves.toMatchObject(response(peer.id));
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('does not turn an otherwise well-shaped out-of-scope same-action reply into native evidence',async()=>{
    const {world,actor,distant}=prepared();
    const api=vi.fn(async()=>reply(response(distant.id)));
    vi.stubGlobal('fetch',api);
    await expect(requestCultivatorLLMDecision(actor,world,config,world.tick+1)).resolves.toBeUndefined();
    expect(api).toHaveBeenCalledTimes(1);
  });
  it('rechecks an actually moved-away selected partner at execution and does not credit the rejected model proposal',()=>{
    const {world,actor,peer}=prepared();
    world.cultivators=[peer,actor,...world.cultivators.filter(row=>row!==actor&&row!==peer)];
    const choices:Record<string,LLMDecisionPayload>=Object.fromEntries(world.cultivators.map(({id})=>[id,rest]));
    choices[peer.id]={chosenAction:'EXPLORE',targetLocationId:'loc-danxia',innerMonologue:'前往已有坊志所载的地方。'};
    choices[actor.id]=response(peer.id);
    const effect=vi.fn();
    const next=advanceWorldTick(world,choices,()=>.99,'deferred',effect,{modelActors:new Set([actor.id])});
    expect(next.cultivators.find(row=>row.id===peer.id)?.locationId).toBe('loc-danxia');
    expect(effect).toHaveBeenCalledWith(actor.id,false);
    expect(next.decisionTrace.records.find(row=>row.actorId===actor.id&&row.tick===next.tick)?.source).toBe('utility');
    expect(next.events.some(row=>row.tick===next.tick&&row.id===`evt-${next.tick}-${actor.id}-social`&&row.actorIds.includes(peer.id))).toBe(false);
  });

  it('preserves the last real lawful oath for modeled routine, but never overrides the already authorized player order',()=>{
    const start=createInitialWorld(2031),[buyer,seller]=start.cultivators;
    buyer.locationId=seller.locationId='loc-market';
    buyer.spiritStones=seller.spiritStones=1000;
    buyer.pills.foundation=0;seller.pills.foundation=2;
    expect(resolveOathAction(start,buyer,{chosenAction:'OFFER_OATH',oathTerm:'foundation_pill',
      targetCultivatorId:seller.id,innerMonologue:'先由双方签约。'})).not.toBeNull();
    const paid=start.oaths.contracts[0];
    expect(resolveOathAction(start,seller,{chosenAction:'ACCEPT_OATH',targetOathId:paid.id,innerMonologue:'我按实物交付。'})).not.toBeNull();
    start.tick=paid.deadlineTick!-2;
    const choice:LLMDecisionPayload={chosenAction:'CULTIVATE',innerMonologue:'若无到期既约则修炼。'};
    const run=(world:WorldState,effect:(actorId:string,applied:boolean)=>void=()=>{})=>{
      const choices=Object.fromEntries(world.cultivators.map(({id})=>[id,id===seller.id?choice:rest]));
      return advanceWorldTick(world,choices,()=>.99,'deferred',effect,{modelActors:new Set([seller.id])});
    };
    const modelEffect=vi.fn();
    const paidNext=run(start,modelEffect);
    expect(paidNext.oaths.contracts.find(row=>row.id===paid.id)?.status).toBe('fulfilled');
    expect(paidNext.cultivators.find(row=>row.id===seller.id)?.currentAction).toBe('FULFILL_OATH');
    expect(modelEffect).toHaveBeenCalledWith(seller.id,false);
    const override=structuredClone(start);
    expect(possessAvatar(override,seller.id)).toBe(true);
    expect(queueAvatarOrder(override,'REST')).toBe(true);
    const overrideEffect=vi.fn();
    const playerNext=run(override,overrideEffect);
    expect(overrideEffect).toHaveBeenCalledWith(seller.id,false);
    expect(playerNext.oaths.contracts.find(row=>row.id===paid.id)?.status).toBe('active');
    expect(playerNext.cultivators.find(row=>row.id===seller.id)?.currentAction).toBe('REST');
    expect(playerNext.playerAvatar.pendingOrder).toBeUndefined();
  });

});
