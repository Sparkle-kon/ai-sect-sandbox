import {afterEach,describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {possessAvatar} from '../src/engine/avatarEngine';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {activeRoguelikeEncounter,resolveGuidedRoguelikeChoice,roguelikeEncounterRoll} from '../src/engine/roguelikeEncounterEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {configureStoryteller} from '../src/engine/storytellerDirector';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import type {RoguelikeEncounterRecord} from '../src/types/roguelikeEncounter';

const id='npc-1',peerId='npc-2',siteId='loc-market-east';
const actor=(world:WorldState,actorId=id)=>world.cultivators.find(row=>row.id===actorId)!;
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'先歇下。'};
const move=(targetLocationId:string):LLMDecisionPayload=>({chosenAction:'EXPLORE',targetLocationId,innerMonologue:'只走已知的路。'});
const turn=(world:WorldState,orders:Record<string,LLMDecisionPayload>={},roll=.99)=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(person=>[person.id,orders[person.id]??rest])),()=>roll);
const know=(world:WorldState,where:string)=>{
  const site=world.locations.find(row=>row.id===where)!;
  const tile=terrainTileAt(world,site.x,site.y)!;
  if(!actor(world).exploredTileIds.includes(tile.id))actor(world).exploredTileIds.push(tile.id);
  return tile;
};
function offer(world:WorldState,expected:RoguelikeEncounterRecord['kind']) {
  const result=activeRoguelikeEncounter(world,actor(world));
  expect(result?.kind).toBe(expected);
  if(!result)throw new Error('Missing contextual opening');
  return result;
}
const roundTrip=(world:WorldState)=>{
  const raw=encodeEraWorldSave(world);
  expect(encodeEraWorldSave(decodeEraWorldSave(raw))).toBe(raw);
};

afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});
describe('G0-2 contextual Storylet folds',()=>{
  it('offers winter shelter only on a real arrival at a living village, and shares the native Cognitive choice',async()=>{
    let world=createInitialWorld(13071);
    // Advance to the next winter without forging existing dates, hunting a qualifying native hash.
    const village=world.settlements.villages.find(row=>row.locationId===siteId)!;
    expect(village.population).toBeGreaterThan(0);
    know(world,siteId);
    const atWinter=()=>[12,1].includes(world.month)&&
      roguelikeEncounterRoll(world,{actorId:id,openedTick:world.tick+1,fromSiteId:actor(world).locationId,siteId},'opening')<30;
    for(let i=0;i<120&&!atWinter();i++)world=turn(world);
    expect(atWinter()).toBe(true);
    expect(actor(world).locationId).not.toBe(siteId);
    actor(world).hp=Math.floor(actor(world).maxHp*.55);
    const historic=turn(world,{[id]:move(siteId)});
    expect(activeRoguelikeEncounter(historic,actor(historic))?.kind).not.toBe('snow-shelter');
    expect(historic.storyteller).toBeUndefined();
    expect(configureStoryteller(world,'wandering_jianghu')).toBe(true);
    world=turn(world,{[id]:move(siteId)});
    const row=offer(world,'snow-shelter');
    expect(row.context).toEqual({subjectId:village.id});
    roundTrip(world);
    const request={chosenAction:'ROGUELIKE_ENCOUNTER',targetRoguelikeEncounterId:row.id,roguelikeEncounterChoice:'cautious'};
    const fake=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(request)}}]})));
    vi.stubGlobal('fetch',fake);
    const exact=await requestCultivatorLLMDecision(actor(world),world,{enabled:true,apiBaseUrl:'https://mock.invalid/v1',
      apiKey:'mock',model:'mock'},world.tick+1);
    expect(fake).toHaveBeenCalledTimes(1);
    expect(exact).toMatchObject(request);
    const next=turn(world,{[id]:exact!});
    expect(next.roguelikeEncounters?.find(record=>record.id===row.id)).toMatchObject({status:'resolved',choice:'cautious',
      outcome:{success:true,hpDelta:expect.any(Number)}});
    expect(next.roguelikeEncounters?.find(record=>record.id===row.id)?.outcome?.hpDelta).toBeGreaterThan(0);
    roundTrip(next);
  });

  it('takes a real living bonded companion on an actual dangerous trip, and branches who gets hurt',()=>{
    let world=createInitialWorld(13071);
    const pet=world.spiritBeasts.find(row=>row.kind!=='凶兽')!;
    expect(pet).toBeDefined();
    const petSite=pet.locationId,petId=pet.id;
    know(world,petSite);
    world=turn(world,{[id]:move(petSite)});
    expect(actor(world).locationId).toBe(petSite);
    actor(world).herbs.jade_leaf=Math.max(actor(world).herbs.jade_leaf,1);
    world=turn(world,{[id]:{chosenAction:'TAME_BEAST',targetBeastId:petId,innerMonologue:'给这一株灵草。'}},.01);
    expect(world.spiritBeasts.find(row=>row.id===petId)?.tamedBy).toBe(id);
    const destination=world.locations.find(row=>row.id!==petSite&&row.type==='market')!;
    know(world,destination.id);
    world=applyMapBrush(world,'beast_tide',[destination]);
    expect(possessAvatar(world,id)).toBe(true);
    expect(configureStoryteller(world,'wandering_jianghu')).toBe(true);
    const lost=world.spiritBeasts.find(row=>row.id===petId)!;
    const leftBehind=structuredClone(world);
    leftBehind.spiritBeasts.find(row=>row.id===petId)!.tamedBy=undefined;
    const alone=turn(leftBehind,{[id]:move(destination.id)});
    expect(activeRoguelikeEncounter(alone,actor(alone))?.kind)
      .not.toBe('beast-guard');
    world=turn(world,{[id]:move(destination.id)});
    const row=offer(world,'beast-guard'),here=world.spiritBeasts.find(row=>row.id===petId)!;
    expect(row.context?.subjectId).toBe(petId);
    expect(here.locationId).toBe(destination.id);
    expect(lost.locationId).toBe(petSite);
    const shield=resolveGuidedRoguelikeChoice(world,row.id,'cautious');
    const charge=resolveGuidedRoguelikeChoice(world,row.id,'bold');
    expect(actor(shield).hp).toBe(actor(world).hp);
    expect(shield.spiritBeasts.find(row=>row.id===petId)?.hp).toBeLessThan(here.hp);
    expect(actor(charge).hp).toBeLessThan(actor(world).hp);
    expect(charge.spiritBeasts.find(row=>row.id===petId)?.hp).toBe(here.hp);
    roundTrip(world);roundTrip(shield);roundTrip(charge);
    const forged=structuredClone(world);
    forged.roguelikeEncounters!.find(value=>value.id===row.id)!.context!.subjectId='imaginary-pet';
    expect(()=>roundTrip(forged)).toThrow(/roguelikeEncounters/u);
  });

  it('admits a waterside farewell only after a known native death of an acquaintance',()=>{
    let world=createInitialWorld(13071);
    know(world,siteId);
    const shared=actor(world).locationId;
    world=turn(world,{[peerId]:move(shared)});
    expect(actor(world,peerId).locationId).toBe(shared);
    world=turn(world,{[id]:{chosenAction:'SOCIALIZE',targetCultivatorId:peerId,innerMonologue:'坐下说几句话。'}});
    expect(world.relationships.some(row=>[row.fromId,row.toId].includes(id)&&[row.fromId,row.toId].includes(peerId))).toBe(true);
    while(world.month!==12)world=turn(world);
    actor(world,peerId).lifespan=actor(world,peerId).age+1;
    world=turn(world);
    expect(actor(world,peerId).alive).toBe(false);
    const death=world.eraHistory.receipts.find(row=>row.kind==='death'&&row.actorId===peerId)!;
    expect(death).toBeDefined();
    expect(actor(world).rumors.some(row=>row.originEventId===death.eventId)).toBe(true);
    expect(possessAvatar(world,id)).toBe(true);
    expect(configureStoryteller(world,'wandering_jianghu')).toBe(true);
    const unacquainted=structuredClone(world);
    unacquainted.relationships=unacquainted.relationships.filter(row=>
      !([row.fromId,row.toId].includes(id)&&[row.fromId,row.toId].includes(peerId)));
    const alternate=turn(unacquainted,{[id]:move(siteId)});
    expect(activeRoguelikeEncounter(alternate,actor(alternate))?.kind).not.toBe('river-farewell');
    world=turn(world,{[id]:move(siteId)});
    const row=offer(world,'river-farewell');
    expect(row.context).toEqual({subjectId:peerId,sourceId:death.eventId});
    const forgotten=structuredClone(world);
    actor(forgotten).rumors=actor(forgotten).rumors.filter(value=>value.originEventId!==death.eventId);
    expect(activeRoguelikeEncounter(forgotten,actor(forgotten))).toBeUndefined();
    expect(()=>roundTrip(forgotten)).toThrow(/roguelikeEncounters/u);
    const result=resolveGuidedRoguelikeChoice(world,row.id,'bold');
    expect(actor(result,peerId).alive).toBe(false);
    expect(result.roguelikeEncounters?.at(-1)?.choice).toBe('bold');
    expect(result.events[0].witnessScope).toBe('participants');
    roundTrip(result);
  });
});
