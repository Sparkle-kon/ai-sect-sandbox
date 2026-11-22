import {afterEach,describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {AVATAR_ORDER_COST,possessAvatar,queueAvatarWaterVein} from '../src/engine/avatarEngine';
import {computeHeuristicDecision,requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {decodeWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {availableWaterVeinActions,utilityWaterVeinDecision} from '../src/engine/waterVeinEngine';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import type {LLMConfig,LLMDecisionPayload,WorldState} from '../src/types/world';

const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'mock-cold-water'};
const north='loc-vein-north';
const elder='elder-danxia-1';
const actor=(world:WorldState,actorId=elder)=>world.cultivators.find(row=>row.id===actorId)!;
const sect=(world:WorldState)=>world.sects.find(row=>row.id===actor(world).sectId)!;
const action=(chosenAction:LLMDecisionPayload['chosenAction'],extra:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'照本人的实地许可办理。',...extra});
const open=action('WATER_VEIN',{waterVeinMove:'open',targetLocationId:north});
const turn=(world:WorldState,option?:LLMDecisionPayload,followAvatar=false)=>advanceWorldTick(world,Object.fromEntries(
  world.cultivators.flatMap(row=>row.id===elder?(followAvatar?[]:[[row.id,option??action('REST')]]):[[row.id,action('REST')]])),()=>.99,'utility');

function preparedWell(){
  let world=createInitialWorld(725,'spirit-bloom');
  const home=actor(world);
  const known=knownMapLocations(world,home);
  const unknown=world.locations.filter(row=>row.id!==home.locationId&&!known.includes(row));
  const candidates=unknown.length?unknown:world.locations.filter(row=>row.id!==home.locationId);
  const index=candidates.findIndex(row=>row.id===north);
  expect(index).toBeGreaterThanOrEqual(0);
  let count=0;
  applyCultivatorBrainDecision(world,home,action('EXPLORE'),()=>count++===0?(index+.2)/candidates.length:.99);
  expect(home.locationId).toBe(north);
  const village=world.settlements.villages.find(row=>row.locationId===north)!;
  world=turn(world,action('GATHER_HERBS',{targetHerbId:'earth_root'}));
  world=turn(world,action('VILLAGE_WORKS',{targetSettlementId:village.id,villageWorkKind:'well'}));
  world=turn(world);world=turn(world);
  expect(world.villageWorks.projects.find(row=>row.settlementId===village.id&&row.kind==='well')).toMatchObject({
    status:'completed',settledTick:5,stonesSpent:32,rootsSpent:2,laborTotal:4,
  });
  return world;
}

afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});
describe('north water in both brains and the next-month avatar queue',()=>{
  it('advertises exact admissible moves only, rejects remote/site/extra-field claims, and applies a native model opening once',async()=>{
    const world=preparedWell(),home=actor(world),remote=actor(world,'npc-1');
    expect(availableWaterVeinActions(home,world,world.tick+1).some(option=>option.waterVeinMove==='open')).toBe(true);
    expect(availableWaterVeinActions(remote,world,world.tick+1)).toEqual([]);
    let payload:object=open;
    const transport=vi.fn(async (_url:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify({
      choices:[{message:{content:JSON.stringify(payload)}}]
    })));
    vi.stubGlobal('fetch',transport);
    const consult=async(person=home)=>{llmScheduler.resetTickBudget();return requestCultivatorLLMDecision(person,world,config,world.tick+1);};
    const validated=await consult();
    expect(validated).toEqual(open);
    expect(String(transport.mock.calls.at(-1)?.[1]?.body)).toContain('本人在场的水线许可');
    expect(await consult(remote)).toBeUndefined();
    expect(String(transport.mock.calls.at(-1)?.[1]?.body)).not.toContain('本人在场的水线许可');
    for(const bad of [{...open,targetLocationId:'loc-danxia'},{...open,borrowedUnits:90},{...open,paidStones:1},
      {...open,targetCultivatorId:remote.id},{...open,chosenAction:'REST'}]){
      payload=bad;
      expect(await consult()).toBeUndefined();
    }
    const opened=turn(world,validated);
    expect(opened.coldWaterVein?.openings).toHaveLength(1);
    const baseline=turn(world);
    expect(sect(baseline).spiritStones-sect(opened).spiritStones).toBe(40);
    expect(applyCultivatorBrainDecision(opened,actor(opened),open,()=>.99)).toBeNull();
    expect(opened.coldWaterVein?.openings).toHaveLength(1);
  });

  it('selects only native local Utility proposals and never self-funds an unowned virgin gate',()=>{
    const world=preparedWell(),home=actor(world);
    const native=utilityWaterVeinDecision(home,world);
    expect(native?.waterVeinMove).not.toBe('open');
    expect(utilityWaterVeinDecision(actor(world,'npc-1'),world)).toBeUndefined();
    if(native)expect(availableWaterVeinActions(home,world)).toContainEqual(native);
    const ordinary=computeHeuristicDecision(home,world,()=>.99);
    expect(ordinary.waterVeinMove).not.toBe('open');
    // Only vary the person's budget to exercise the funded mine fallback; the well/address remain from actual play.
    home.spiritStones=35;
    const mining=computeHeuristicDecision(home,world,()=>.99);
    expect(mining).toMatchObject({chosenAction:'WATER_VEIN',waterVeinMove:'mine',targetLocationId:north});
    const extracted=turn(world,mining);
    expect(extracted.coldWaterVein?.mining).toMatchObject([{actorId:home.id,tick:world.tick+1,units:2}]);
  });

  it('spends only existing queue essence, persists an exact intent, and revalidates a stale intent without treasury debit',()=>{
    const world=preparedWell(),home=actor(world);
    expect(possessAvatar(world,home.id)).toBe(true);
    const options=availableWaterVeinActions(home,world,world.tick+1);
    const intent=options.find(option=>option.waterVeinMove==='open')!;
    expect(intent).toBeDefined();
    const before={essence:world.playerAvatar.essence,stones:sect(world).spiritStones,water:world.coldWaterVein};
    expect(queueAvatarWaterVein(world,home.id,{...intent,targetLocationId:'loc-danxia'})).toBe(false);
    expect(queueAvatarWaterVein(world,home.id,intent)).toBe(true);
    expect(queueAvatarWaterVein(world,home.id,intent)).toBe(false);
    expect(world.playerAvatar.essence).toBe(before.essence-AVATAR_ORDER_COST);
    expect(sect(world).spiritStones).toBe(before.stones);
    expect(world.coldWaterVein).toEqual(before.water);
    const roundTrip=decodeWorldSave(encodeWorldSave(world));
    expect(roundTrip.playerAvatar.pendingOrder).toMatchObject({actorId:home.id,action:'WATER_VEIN',targetLocationId:north,waterVeinMove:'open'});
    const stale=structuredClone(roundTrip);
    actor(stale).locationId='loc-danxia';
    const declined=turn(stale,undefined,true);
    expect(declined.coldWaterVein?.openings??[]).toEqual([]);
    expect(declined.playerAvatar.pendingOrder).toBeUndefined();
    expect(sect(declined).spiritStones).toBe(sect(turn(stale)).spiritStones);
    const valid=turn(roundTrip,undefined,true);
    expect(valid.coldWaterVein?.openings).toHaveLength(1);
  });
});
