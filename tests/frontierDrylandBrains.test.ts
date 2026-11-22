import {afterEach,describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {AVATAR_ORDER_COST,possessFrontierAvatar,queueAvatarFrontier} from '../src/engine/avatarEngine';
import {availableFrontierDrylandLocalActions} from '../src/engine/frontierDrylandLocalEngine';
import {computeHeuristicDecision,requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {projectResourceFlowMonth} from '../src/engine/resourceFlowEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const host='npc-1';
const actor=(world:WorldState)=>world.cultivators.find(row=>row.id===host)!;
const action=(chosenAction:LLMDecisionPayload['chosenAction'],extra:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'只看手里的钱物和脚下真路。',...extra});
function step(world:WorldState,choice=action('REST')){
  const decisions=Object.fromEntries(world.cultivators.map(row=>[row.id,row.id===host?choice:action('REST')]));
  return advanceWorldTick(world,decisions,()=>.99,'utility');
}
function beforeFirstWater(){
  let world=createInitialWorld(1,'spirit-bloom');
  for(let index=0;index<4;index++)world=step(world,action('GATHER_HERBS',{targetHerbId:'earth_root'}));
  const travel=(frontierMove:NonNullable<LLMDecisionPayload['frontierMove']>,targetFrontierSiteId:NonNullable<LLMDecisionPayload['targetFrontierSiteId']>)=>{
    world=step(world,action('FRONTIER',{frontierMove,targetFrontierSiteId}));
    expect(actor(world).locationId).toBe(targetFrontierSiteId);
  };
  travel('enter','frontier-west-gate');travel('travel','frontier-west-trail');
  travel('travel','frontier-west-home');travel('settle','frontier-west-home');
  travel('travel','frontier-west-saltbed');travel('travel','frontier-west-well');
  world=step(world,action('FRONTIER_DRYLAND',{frontierDrylandMove:'open_well',targetFrontierSiteId:'frontier-west-well'}));
  expect(world.frontier?.drylands?.well).toMatchObject({water:0,readyTick:world.tick+1});
  return world;
}

afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});
describe('E4-5 the actual well shares one choice across brains and player',()=>{
  it('offers the same local water action, rejects fabricated amounts or feeding, and really fills the well',async()=>{
    const source=step(beforeFirstWater());
    const exact={chosenAction:'FRONTIER_DRYLAND',frontierDrylandMove:'draw_water',targetFrontierSiteId:'frontier-west-well'};
    let reply:object=exact;
    const request=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify({
      choices:[{message:{content:JSON.stringify(reply)}}],
    })));
    vi.stubGlobal('fetch',request);
    async function sample(value:object){
      reply=value;llmScheduler.resetTickBudget();
      return requestCultivatorLLMDecision(actor(source),source,{enabled:true,apiKey:'test',apiBaseUrl:'https://fixture.invalid/v1',model:'dryland-proof'},source.tick+1);
    }
    expect(computeHeuristicDecision(actor(source),source,()=>.99)).toMatchObject(exact);
    expect(await sample({...exact,water:6})).toBeUndefined();
    expect(await sample({...exact,frontierDrylandFeed:'salt'})).toBeUndefined();
    const model=await sample(exact);
    expect(model).toMatchObject(exact);
    expect(String(request.mock.calls.at(-1)?.[1]?.body)).toContain('本人实到另图 frontier-west-well');
    const modelResult=step(source,model),utilityResult=step(source,computeHeuristicDecision(actor(source),source,()=>.99));
    expect(source.frontier?.drylands?.well?.water).toBe(0);
    expect(modelResult.frontier?.drylands?.well?.water).toBe(3);
    expect(modelResult.frontier?.drylands?.receipts).toEqual(utilityResult.frontier?.drylands?.receipts);
    const publicBook=projectResourceFlowMonth(modelResult,modelResult.tick,{kind:'observer'});
    expect(publicBook?.rows.some(row=>row.mechanism==='frontier')).toBe(false);
    expect(publicBook?.totals.some(row=>row.good==='frontier_water')).toBe(false);
  });

  it('preserves a pending draw through strict storage and only draws on the next actual month',()=>{
    const source=beforeFirstWater();
    expect(possessFrontierAvatar(source,host)).toBe(true);
    const choice=availableFrontierDrylandLocalActions(actor(source),source,source.tick+1).find(row=>row.frontierDrylandMove==='draw_water')!;
    const essence=source.playerAvatar.essence;
    expect(queueAvatarFrontier(source,host,choice)).toBe(true);
    expect(queueAvatarFrontier(source,host,choice)).toBe(false);
    expect(source.playerAvatar.essence).toBe(essence-AVATAR_ORDER_COST);
    expect(source.frontier?.drylands?.well?.water).toBe(0);
    const raw=encodeEraWorldSave(source);
    const strict=decodeEraWorldSave(raw);
    expect(encodeEraWorldSave(strict)).toBe(raw);
    const advanced=step(strict),direct=step(source);
    expect(encodeEraWorldSave(advanced)).toBe(encodeEraWorldSave(direct));
    expect(advanced.frontier?.drylands?.well?.water).toBe(3);
    expect(advanced.playerAvatar.pendingOrder).toBeUndefined();
  });
});
