import {afterEach,describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {possessAvatar} from '../src/engine/avatarEngine';
import {computeHeuristicDecision,requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {activeRoguelikeEncounter,resolveGuidedRoguelikeChoice,roguelikeEncounterRoll} from '../src/engine/roguelikeEncounterEngine';
import {decodeEraWorldSave,encodeEraWorldSave,decodeWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import {actor,id,site} from './roguelikeEncounterNativeFixture';

const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'在原地停一月。'};
function arrive(seed:number,guided=true,witnesses=false){
  const initial=createInitialWorld(seed);
  const body=actor(initial),dest=initial.locations.find(row=>row.id===site)!;
  body.exploredTileIds.push(terrainTileAt(initial,dest.x,dest.y)!.id);
  body.personality='狂傲';
  if(witnesses)for(const who of ['npc-6','npc-7']){
    const peer=actor(initial,who);
    peer.locationId=site;
    peer.hp=peer.maxHp*.2;
  }
  if(guided)expect(possessAvatar(initial,id)).toBe(true);
  const draws=vi.fn(()=>.99);
  const travel:LLMDecisionPayload={chosenAction:'EXPLORE',targetLocationId:site,innerMonologue:'沿已知山径探古墟。'};
  const after=advanceWorldTick(initial,Object.fromEntries(initial.cultivators.map(row=>[row.id,row.id===id?travel:rest])),draws);
  expect(actor(after).locationId).toBe(site);
  return {initial,after,draws,record:activeRoguelikeEncounter(after,actor(after))};
}
function roundTrip(world:WorldState){
  const oldBytes=encodeWorldSave(world);
  expect(encodeWorldSave(decodeWorldSave(oldBytes))).toBe(oldBytes);
  const portable=encodeEraWorldSave(world);
  const decoded=decodeEraWorldSave(portable);
  expect(encodeEraWorldSave(decoded)).toBe(portable);
  return decoded;
}
const receipt=(world:WorldState,encounterId:string)=>world.roguelikeEncounters?.find(row=>row.id===encounterId);
afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});

describe('original native encounters behind data-driven storylets',()=>{
  it.each([
    {seed:3,kind:'sword-cave',aim:19,roll:62,success:false,qi:-8,hpRate:-.16,karma:-2,life:0},
    {seed:1,kind:'sealed-scroll',aim:75,roll:44,success:true,qi:20,hpRate:0,karma:3,life:3},
  ] as const)('retains exact native offer, historical effects, RNG and save $kind',({seed,kind,aim,roll,success,qi,hpRate,karma,life})=>{
    const {after,record}=arrive(seed);
    expect(record).toMatchObject({kind,guided:true,actorId:id,siteId:site});
    if(!record)throw Error('no native offer');
    expect(roguelikeEncounterRoll(after,record,'kind')).toBe(aim);
    expect(roguelikeEncounterRoll(after,record,'bold')).toBe(roll);
    const opened=encodeEraWorldSave(after),saved=roundTrip(after);
    const settled=resolveGuidedRoguelikeChoice(saved,record.id,'bold');
    const body=actor(saved);
    expect(receipt(settled,record.id)?.outcome).toEqual({
      success,qiDelta:Math.max(0,Math.min(100,body.qiProgress+qi))-body.qiProgress,
      hpDelta:Math.max(1,Math.min(body.maxHp,body.hp+Math.round(body.maxHp*hpRate)))-body.hp,
      karmaDelta:karma,lifespanDelta:life,affinityDelta:0,
    });
    expect(settled.random).toEqual(after.random);
    expect(encodeEraWorldSave(after)).toBe(opened);
    expect(encodeEraWorldSave(settled)).toBe(encodeEraWorldSave(resolveGuidedRoguelikeChoice(after,record.id,'bold')));
    expect(roundTrip(settled).roguelikeEncounters).toEqual(settled.roguelikeEncounters);
    expect(resolveGuidedRoguelikeChoice(settled,record.id,'bold')).toBe(settled);
  });

  it('selects the tied injured witness deterministically, but old healed authorizations still apply only to the exact live local witness',()=>{
    const {after,record}=arrive(23,true,true);
    expect(record).toMatchObject({kind:'wounded-traveler',guided:true,witnessId:'npc-6'});
    if(!record)throw Error('no native wounded offer');
    expect(roguelikeEncounterRoll(after,record,'kind')).toBe(35);
    expect(roguelikeEncounterRoll(after,record,'bold')).toBe(54);
    const healed=structuredClone(after);
    actor(healed,'npc-6').hp=actor(healed,'npc-6').maxHp;
    const oldHistory=roundTrip(healed);
    const settled=resolveGuidedRoguelikeChoice(oldHistory,record.id,'bold');
    expect(receipt(settled,record.id)).toMatchObject({status:'resolved',outcome:{success:true,affinityDelta:22}});
    expect(settled.relationships).toContainEqual(expect.objectContaining({fromId:id,toId:'npc-6',affinity:22}));
    expect(settled.relationships.some(row=>row.fromId===id&&row.toId==='npc-7'&&row.affinity===22)).toBe(false);
    for(const invalid of [
      (world:WorldState)=>{actor(world,'npc-6').locationId=record.fromSiteId;},
      (world:WorldState)=>{actor(world,'npc-6').alive=false;actor(world,'npc-6').hp=0;},
      (world:WorldState)=>{world.cultivators.push({...actor(world,'npc-6')});},
    ]){
      const forged=structuredClone(after);
      invalid(forged);
      expect(activeRoguelikeEncounter(forged,actor(forged))).toBeUndefined();
      expect(resolveGuidedRoguelikeChoice(forged,record.id,'bold')).toBe(forged);
    }
  });

  it('retains the original passive one percent gate and identical real Utility/provider payoff one month later',async()=>{
    const quiet=arrive(154,false),live=arrive(153,false);
    expect(quiet.record).toBeUndefined();
    const {after,record}=live;
    expect(record).toMatchObject({kind:'sealed-scroll',guided:false});
    if(!record)throw Error('no passive native offer');
    expect(roguelikeEncounterRoll(after,record,'opening')).toBe(0);
    const opened=roundTrip(after);
    const body=actor(opened);
    const later=structuredClone(opened);
    later.tick++;later.month++;
    const utility=computeHeuristicDecision(actor(later),later);
    const answer={chosenAction:'ROGUELIKE_ENCOUNTER',targetRoguelikeEncounterId:record.id,roguelikeEncounterChoice:'bold'};
    expect(utility).toMatchObject(answer);
    const fetch=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(answer)}}]})));
    vi.stubGlobal('fetch',fetch);
    llmScheduler.resetTickBudget();
    const decision=await requestCultivatorLLMDecision(body,opened,{
      enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'fixture',
    },opened.tick+1);
    expect(decision).toMatchObject(answer);
    expect(fetch).toHaveBeenCalledOnce();
    const orders=Object.fromEntries(opened.cultivators.filter(row=>row!==body).map(row=>[row.id,rest]));
    const a=advanceWorldTick(opened,orders,()=>.99);
    const b=advanceWorldTick(opened,{...orders,...(decision?{[id]:decision}:{})},()=>.99);
    const settled=receipt(a,record.id);
    expect(settled).toMatchObject({status:'resolved',choice:'bold',resolvedTick:opened.tick+1,outcome:{success:true}});
    expect(receipt(b,record.id)).toEqual(settled);
    expect(a.events.find(row=>row.id===`evt-${record.id}-settled`)).toEqual(b.events.find(row=>row.id===`evt-${record.id}-settled`));
    expect(a.random).toEqual(b.random);
    expect(receipt(roundTrip(a),record.id)).toEqual(settled);
  });
});
