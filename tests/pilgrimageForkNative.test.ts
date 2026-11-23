import {afterEach,describe,expect,it,vi} from 'vitest';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {visiblePilgrimageForkSegments} from '../src/components/pilgrimageForkMapView';
import {createInitialWorld} from '../src/data/initialWorld';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {availablePilgrimageForkActions,pilgrimageForkCheckpoint,projectPilgrimageFork,projectPilgrimageForkTrace} from '../src/engine/pilgrimageFork';
import type {PilgrimageForkMove} from '../src/types/pilgrimageFork';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const leader='npc-1',companion='npc-2',outsider='npc-8',mid='loc-danxia',oldEnd='loc-market',origin='loc-taixu';
const actor=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'静候。'};
const order=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'只选本人有权走的实路。',...fields});
function turn(world:WorldState,choices:Record<string,LLMDecisionPayload>={},model?:string){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,choices[row.id]??rest])),()=>.99,
    model?'deferred':'utility',undefined,model?{modelActors:new Set([model])}:undefined);
}
function fixture(){
  const initial=createInitialWorld(13071,'classic');
  const joint=turn(initial,{[companion]:order('EXPLORE',{targetLocationId:origin})});
  expect([leader,companion].map(id=>actor(joint,id).locationId)).toEqual([origin,origin]);
  const asked=turn(joint,{[leader]:order('PILGRIMAGE',{pilgrimageMove:'propose',targetCultivatorId:companion,
    targetLocationId:mid,targetPilgrimageNextStopId:oldEnd})});
  const journey=asked.pilgrimages.journeys[0].id;
  const doIt=(pilgrimageMove:'accept'|'advance'|'withdraw')=>order('PILGRIMAGE',{pilgrimageMove,targetPilgrimageId:journey});
  const agreed=turn(asked,{[companion]:doIt('accept')});
  const first=turn(agreed,{[leader]:doIt('advance')});
  expect(first.pilgrimageForks).toBeUndefined();
  const midpoint=turn(first,{[leader]:doIt('advance')});
  expect([leader,companion].map(id=>actor(midpoint,id).locationId)).toEqual([mid,mid]);
  expect(midpoint.pilgrimageForks?.forks[0]).toMatchObject({arrivalTick:6,siteId:mid,arrivalEventId:'evt-pilgrimage-1-arrival-6'});
  return {midpoint:decodeEraWorldSave(encodeEraWorldSave(midpoint)),advance:doIt('advance')};
}
function choose(world:WorldState,id:string,move:PilgrimageForkMove){
  const quote=availablePilgrimageForkActions(actor(world,id),world).find(row=>row.pilgrimageForkMove===move);
  expect(quote).toBeDefined();
  return order(quote!.action,{pilgrimageForkMove:move,targetPilgrimageForkId:quote!.targetPilgrimageForkId,
    ...(quote!.targetLocationId?{targetLocationId:quote!.targetLocationId}:{})});
}
afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});
describe('independent branching from one real joint pilgrimage stop',()=>{
  it('charges only actual solo movement, records true prefix, and leaves the other traveller at 丹霞',()=>{
    const {midpoint,advance}=fixture();
    const base=actor(midpoint,leader).spiritStones,siblingBase=actor(midpoint,companion).spiritStones;
    expect(projectPilgrimageFork(midpoint,actor(midpoint,outsider))).toBeUndefined();
    const unchanged=turn(midpoint,{[leader]:advance});
    expect(unchanged.pilgrimages.journeys[0].status).toBe('active');
    expect(unchanged.pilgrimages.journeys[0].spentByEach).toBe(16);
    expect(unchanged.pilgrimageForks).toBeUndefined();
    const first=turn(midpoint,{[leader]:choose(midpoint,leader,'escort'),[companion]:choose(midpoint,companion,'remain')});
    expect(first.pilgrimages.journeys[0]).toMatchObject({status:'withdrawn',spentByEach:8,settledTick:7});
    expect(actor(first,leader).spiritStones).toBe(base-8);
    expect(actor(first,companion).spiritStones).toBe(siblingBase);
    expect(actor(first,companion).locationId).toBe(mid);
    const checkpoint=pilgrimageForkCheckpoint(first,actor(first,leader));
    const prefix=projectPilgrimageForkTrace(first,actor(first,leader));
    expect(prefix.length).toBeGreaterThan(1);
    expect(prefix.at(-1)).toEqual(checkpoint);
    expect(projectPilgrimageForkTrace(first,actor(first,companion))).toEqual([]);
    expect(prefix.at(-1)).not.toEqual({x:520,y:280});
    let reached=decodeEraWorldSave(encodeEraWorldSave(first));
    for(let i=0;i<10&&actor(reached,leader).locationId===mid;i++)reached=turn(reached);
    expect(actor(reached,leader).locationId).toBe(oldEnd);
    expect(actor(reached,companion).locationId).toBe(mid);
    expect(reached.pilgrimageForks?.forks[0].choices.find(row=>row.actorId===leader)).toMatchObject({status:'arrived',paidStones:8});
    expect(reached.resourceFlow.months.flatMap(row=>row.entries).filter(row=>row.reason==='pilgrimage_fork_fare')).toHaveLength(1);
    expect(decodeEraWorldSave(encodeEraWorldSave(reached)).pilgrimageForks).toEqual(reached.pilgrimageForks);
  });
  it('projects two separate real stepped lines, never a forecast or a borrowed traveler',()=>{
    const {midpoint}=fixture();
    const split=turn(midpoint,{[leader]:choose(midpoint,leader,'escort'),[companion]:choose(midpoint,companion,'detour')});
    const main=actor(split,leader), peer=actor(split,companion);
    const map=createTerrainMapView(split,main,false);
    const own=projectPilgrimageForkTrace(split,main), other=projectPilgrimageForkTrace(split,peer);
    expect(own[0]).toEqual(other[0]);
    expect(own.at(-1)).not.toEqual(other.at(-1));
    expect(projectPilgrimageFork(split,main)?.sharedWalk).toBeUndefined();
    expect(map.trailPositions.get(main.id)).toEqual(own.at(-1));
    expect(map.trailPositions.get(peer.id)).toEqual(other.at(-1));
    const lines=visiblePilgrimageForkSegments(split,map,main);
    expect(lines.filter(row=>row.side==='own').map(row=>row.to)).toEqual(own.slice(1));
    expect(lines.filter(row=>row.side==='companion').map(row=>row.to)).toEqual(other.slice(1));
    const remote=actor(split,outsider);
    expect(visiblePilgrimageForkSegments(split,createTerrainMapView(split,remote,false),remote)).toEqual([]);
    expect(visiblePilgrimageForkSegments(split,map,{...main})).toEqual([]);
    let further=decodeEraWorldSave(encodeEraWorldSave(split));
    for(let i=0;i<12&&[leader,companion].some(id=>actor(further,id).locationId===mid);i++)further=turn(further);
    expect([leader,companion].map(id=>actor(further,id).locationId)).toEqual([oldEnd,origin]);
    expect(further.resourceFlow.months.flatMap(row=>row.entries).filter(row=>row.reason==='pilgrimage_fork_fare')).toHaveLength(2);
  });
  it('stays at the same real crossed checkpoint when a native hazard outlasts the old travel timeout, then resumes',()=>{
    const {midpoint}=fixture();
    const start=turn(midpoint,{[leader]:choose(midpoint,leader,'escort')});
    const selected=start.pilgrimageForks!.forks[0].choices.find(row=>row.actorId===leader)!;
    const blockedTile=selected.path![selected.pathIndex!+1],checkpoint=pilgrimageForkCheckpoint(start,actor(start,leader));
    expect(checkpoint).toBeDefined();expect(blockedTile).toBeDefined();
    let stalled=start;
    // Refresh a real adjacent miasma until fifteen native months pass. Never paint the body tile.
    for(let attempt=0;attempt<15;attempt++){
      stalled=applyMapBrush(applyMapBrush(stalled,'cursed_miasma',[blockedTile]),'cursed_miasma',[blockedTile]);
      stalled=turn(stalled,{[leader]:order('EXPLORE',{targetLocationId:oldEnd})});
      expect(pilgrimageForkCheckpoint(stalled,actor(stalled,leader))).toEqual(checkpoint);
      expect(actor(stalled,leader).locationId).toBe(mid);
    }
    expect(actor(stalled,leader).spiritStones).toBe(actor(start,leader).spiritStones);
    stalled=decodeEraWorldSave(encodeEraWorldSave(stalled));
    expect(pilgrimageForkCheckpoint(stalled,actor(stalled,leader))).toEqual(checkpoint);
    let thawed=stalled;
    for(let wait=0;wait<15&&actor(thawed,leader).locationId===mid;wait++)thawed=turn(thawed);
    expect(actor(thawed,leader).locationId).toBe(oldEnd);
    expect(actor(thawed,leader).spiritStones).toBe(actor(start,leader).spiritStones);
    expect(actor(thawed,companion).locationId).toBe(mid);
    expect(decodeEraWorldSave(encodeEraWorldSave(thawed)).pilgrimageForks).toEqual(thawed.pilgrimageForks);
  });
  it('only reads a shared escort stride after both chose and actually walked the same segment',()=>{
    const {midpoint}=fixture();
    const choice=choose(midpoint,leader,'escort');
    const alone=turn(midpoint,{[leader]:choice});
    expect(projectPilgrimageFork(alone,actor(alone,leader))?.sharedWalk).toBeUndefined();
    const together=turn(midpoint,{[leader]:choice,[companion]:choose(midpoint,companion,'escort')});
    const shared=decodeEraWorldSave(encodeEraWorldSave(together));
    expect(projectPilgrimageForkTrace(shared,actor(shared,leader))).toEqual(projectPilgrimageForkTrace(shared,actor(shared,companion)));
    expect(projectPilgrimageFork(shared,actor(shared,leader))?.sharedWalk).toBe(true);
    expect(projectPilgrimageFork(shared,actor(shared,companion))?.sharedWalk).toBe(true);
    expect(projectPilgrimageFork(shared,actor(shared,outsider))).toBeUndefined();
  });
  it('admits exact model detour only, matches a trusted Utility action, and never allocates the other fare',async()=>{
    const {midpoint}=fixture(),detour=choose(midpoint,companion,'detour');
    expect(detour.targetLocationId).toBe(origin);
    const {innerMonologue:_,...exact}=detour;
    const ask=(body:object)=>{
      vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(body)}}]}))));
      llmScheduler.resetTickBudget();
      return requestCultivatorLLMDecision(actor(midpoint,companion),midpoint,{enabled:true,apiBaseUrl:'https://provider.invalid/v1',
        apiKey:'fixture',model:'fixture'},7);
    };
    expect(await ask({...exact,targetLocationId:'loc-secret-1'})).toBeUndefined();
    expect(await ask({...exact,escortBoth:true})).toBeUndefined();
    const actual=await ask(exact);
    expect(actual).toMatchObject(exact);
    let cognitive=turn(midpoint,{[companion]:actual!},companion),utility=turn(midpoint,{[companion]:detour});
    expect(cognitive.pilgrimageForks).toEqual(utility.pilgrimageForks);
    for(let i=0;i<10&&actor(cognitive,companion).locationId===mid;i++){cognitive=turn(cognitive);utility=turn(utility);}
    expect(actor(cognitive,companion).locationId).toBe(origin);
    expect(actor(cognitive,leader).locationId).toBe(mid);
    expect(actor(cognitive,leader).spiritStones).toBe(actor(midpoint,leader).spiritStones);
    expect(cognitive.pilgrimageForks).toEqual(utility.pilgrimageForks);
  });
});
