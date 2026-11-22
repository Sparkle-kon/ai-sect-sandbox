import {afterEach,describe,expect,it,vi} from 'vitest';
import {prepareNorthWellHistoricalSource} from './fixtures/northWellHistoricalNativeFixture';
import {AVATAR_ORDER_COST,possessAvatar,queueAvatarNorthGateRenewal} from '../src/engine/avatarEngine';
import {availableNorthGateRenewalActions,type NorthGateRenewalOption} from '../src/engine/northGateRenewalEngine';
import {availableNorthGateRenewalProviderActions,requestCultivatorLLMDecision,utilityNorthGateRenewalDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMConfig,LLMDecisionPayload,WorldState} from '../src/types/world';

const warden='elder-danxia-1', REST:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'保留原位。'};
const source=()=> {
  // Targeted adapter boundary fixture: real native charter and two delivered freight legs from T34.
  // Only the test clock is moved. The independent unaltered late-Era simulation covers exact 36,000 native monthly steps.
  const {world}=prepareNorthWellHistoricalSource();
  world.tick=36034; world.year=4003; world.month=10;
  return world;
};
const actor=(world:WorldState,id:string=warden)=>world.cultivators.find(row=>row.id===id)!;
const gate=(world:WorldState,move:NorthGateRenewalOption['northGateRenewalMove'],id=warden)=>
  availableNorthGateRenewalActions(actor(world,id),world,world.tick+1).find(option=>option.northGateRenewalMove===move)!;
const action=(option:NorthGateRenewalOption):LLMDecisionPayload=>({chosenAction:'NORTH_GATE_RENEWAL',
  northGateRenewalMove:option.northGateRenewalMove,targetNorthGateRenewalId:option.targetNorthGateRenewalId,innerMonologue:'只按本月本人许可。'});
const step=(world:WorldState,actors:Record<string,LLMDecisionPayload>={})=>
  advanceWorldTick(world,Object.fromEntries(world.cultivators.filter(row=>row.alive).map(row=>[row.id,actors[row.id]??REST])),()=>.99,'utility');
const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'mock-gate-renewal'};
function provider(){
  let contents:object=REST;
  const fetch=vi.fn(async(_uri:RequestInfo|URL,_args?:RequestInit)=>new Response(JSON.stringify({
    choices:[{message:{content:JSON.stringify(contents)}}],
  })));
  vi.stubGlobal('fetch',fetch);
  return {
    prompt:()=>String(fetch.mock.calls.at(-1)?.[1]?.body),
    request:(world:WorldState,person:typeof world.cultivators[number],response:object)=>{
      contents=response;llmScheduler.resetTickBudget();return requestCultivatorLLMDecision(person,world,config,world.tick+1);
    },
  };
}
afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});

describe('E3-9 monthly action adapters, identity and strict cognitive options',()=>{
  it('offers the exact current pilot identity to the provider, rejects forgery, and executes a legal returned choice',async()=>{
    const world=source(), option=gate(world,'sect'), model=provider(), expected=action(option);
    expect(gate(world,'accord')).toBeUndefined();
    expect(utilityNorthGateRenewalDecision(actor(world),world)).toBeUndefined();
    const outside=world.cultivators.find(row=>row.alive&&row.positionPlane===undefined&&row.locationId!==actor(world).locationId)!;
    expect(outside).toBeDefined();
    expect(await model.request(world,outside,expected)).toBeUndefined();
    expect(model.prompt()).not.toContain(option.targetNorthGateRenewalId);
    expect(model.prompt()).not.toContain('三千年重开会，只能复制');
    expect(await model.request(world,actor(world),{...expected,targetNorthGateRenewalId:'not-this-case'})).toBeUndefined();
    expect(await model.request(world,actor(world),{...expected,northGateRenewalMove:'accord'})).toBeUndefined();
    expect(await model.request(world,actor(world),{...expected,paidStones:0})).toBeUndefined();
    expect(await model.request(world,actor(world),{...REST,northGateRenewalMove:'sect'})).toBeUndefined();
    const valid=await model.request(world,actor(world),expected);
    expect(valid).toEqual(expected);
    expect(model.prompt()).toContain('三千年重开会，只能复制');
    expect(model.prompt()).toContain(option.targetNorthGateRenewalId);
    expect(step(world,{[warden]:valid!}).northGateRenewal?.hearing.outcome).toMatchObject({kind:'reopened',stance:'sect',paidStones:64});
  });

  it('spends only command essence until the possessed actor executes; passive months can actually expire the pilot',async()=>{
    const original=source(), option=gate(original,'reuse'), abandoned=structuredClone(original);
    expect(possessAvatar(original,warden)).toBe(true);
    const before=original.playerAvatar.essence, nativeWallet=original.sects.find(sect=>sect.id===actor(original).sectId)?.spiritStones;
    const model=provider();
    expect(availableNorthGateRenewalProviderActions(actor(original),original,original.tick+1)).toEqual([]);
    expect(await model.request(original,actor(original),action(option))).toBeUndefined();
    expect(step(original,{[warden]:action(option)}).northGateRenewal?.hearing.outcome).toBeUndefined();
    expect(queueAvatarNorthGateRenewal(original,warden,{...option,targetNorthGateRenewalId:'forged'})).toBe(false);
    expect(queueAvatarNorthGateRenewal(original,warden,option)).toBe(true);
    expect(original.playerAvatar.essence).toBe(before-AVATAR_ORDER_COST);
    expect(original.sects.find(sect=>sect.id===actor(original).sectId)?.spiritStones).toBe(nativeWallet);
    expect(original.coldWaterVein?.openings).toHaveLength(1);
    const resolved=step(original);
    expect(resolved.northGateRenewal?.hearing.outcome).toMatchObject({kind:'reopened',stance:'reuse',paidStones:40});
    expect(resolved.coldWaterVein?.openings).toHaveLength(2);
    expect(resolved.playerAvatar.pendingOrder).toBeUndefined();
    let unattended=abandoned;
    for(let tick=0;tick<6;tick++)unattended=step(unattended);
    expect(unattended.northGateRenewal?.hearing.outcome).toEqual({kind:'failed',closedTick:36040});
    expect(unattended.coldWaterVein?.openings).toHaveLength(1);
  });
});
