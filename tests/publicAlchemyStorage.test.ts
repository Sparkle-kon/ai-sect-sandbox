import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { decodeEraWorldSave,decodeWorldSave,encodeEraWorldSave,encodeWorldSave } from '../src/engine/storageEngine';
import { validatePublicAlchemyPractice } from '../src/engine/storagePublicAlchemyValidation';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { HerbId,LLMDecisionPayload,PillId,WorldState } from '../src/types/world';

const alchemistId='npc-5',siteId='loc-danxia';
const actor=(world:WorldState)=>world.cultivators.find(row=>row.id===alchemistId)!;
const practice=(world:WorldState)=>actor(world).publicAlchemy![0];
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'闭炉静候。'};
const gather=(targetHerbId:HerbId):LLMDecisionPayload=>({chosenAction:'GATHER_HERBS',targetHerbId,innerMonologue:'采集本地已有药材。'});
const brew=(targetPillId:PillId):LLMDecisionPayload=>({chosenAction:'BREW_PILL',targetPillId,innerMonologue:'实际开炉。'});
const turn=(world:WorldState,action=rest,random=.1)=>
  advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,row.id===alchemistId?action:rest])),()=>random,'utility');
const sourceID=(tick:number)=>`evt-${tick}-${alchemistId}-alchemy`;
const reopen=(world:WorldState)=>{
  const raw=encodeWorldSave(world),restored=decodeWorldSave(raw);
  expect(encodeWorldSave(restored)).toBe(raw);
  return restored;
};
function reject(world:WorldState,edit:(copy:WorldState)=>void,path:RegExp){
  const copy=structuredClone(world);edit(copy);
  expect(()=>encodeWorldSave(copy)).toThrow(path);
}
function firstBrew(){
  const start=createInitialWorld(1,'spirit-bloom');
  const jade=turn(start,gather('jade_leaf')),earth=turn(jade,gather('earth_root'));
  const success=turn(earth,brew('foundation'));
  expect(actor(success).pills.foundation-actor(earth).pills.foundation).toBe(1);
  expect(practice(success)).toEqual({siteId,firstTick:success.tick,lastTick:success.tick,successes:1,bestGrade:1});
  return {start,success};
}

describe('saved public alchemy uses only positive native public work',()=>{
  it('keeps old bytes and distinguishes recipe grade from the installed 3-grade furnace',()=>{
    const {start,success}=firstBrew();
    const legacy=encodeWorldSave(start);
    expect(legacy).not.toContain('"publicAlchemy"');
    expect(encodeWorldSave(decodeWorldSave(legacy))).toBe(legacy);
    expect(success.locations.find(row=>row.id===siteId)?.furnaceGrade).toBe(3);
    expect(practice(reopen(success))).toEqual(practice(success));
    reject(success,w=>{practice(w).bestGrade=3;},/cultivators.publicAlchemy.grade/);
    const moreJade=turn(success,gather('jade_leaf'));
    const star=turn(turn(moreJade,gather('star_bloom')),gather('star_bloom'));
    const golden=turn(star,brew('golden'));
    expect(actor(golden).pills.golden-actor(star).pills.golden).toBe(1);
    expect(practice(reopen(golden))).toEqual({siteId,firstTick:success.tick,lastTick:golden.tick,successes:2,bestGrade:3});
    const era=encodeEraWorldSave(golden);
    expect(encodeEraWorldSave(decodeEraWorldSave(era))).toBe(era);
    reject(golden,w=>{practice(w).bestGrade=2;},/cultivators.publicAlchemy.grade/);
  });

  it('rejects duplicate sites, impossible count/date and a private or unregistered venue',()=>{
    const {success}=firstBrew();
    reject(success,w=>{actor(w).publicAlchemy!.push({...practice(w)});},/cultivators.publicAlchemy.site/);
    reject(success,w=>{practice(w).siteId='loc-secret-1';},/cultivators.publicAlchemy.site/);
    reject(success,w=>{practice(w).siteId='not-a-current-registered-node';},/cultivators.publicAlchemy.site/);
    reject(success,w=>{practice(w).lastTick++;},/cultivators.publicAlchemy.chronology/);
    reject(success,w=>{practice(w).successes++;},/cultivators.publicAlchemy.chronology/);
    reject(success,w=>{practice(w).firstTick--;},/cultivators.publicAlchemy.chronology/);
    reject(success,w=>{Object.assign(practice(w),{inventedStory:'假托称号'});},/inventedStory/);
  });

  it('rejects a held/private appearance, substituted source and failed real brew even with a fixed generic event ID',()=>{
    const {success}=firstBrew(), source=sourceID(success.tick);
    reject(success,w=>{w.events.find(event=>event.id===source)!.witnessScope='participants';},/cultivators.publicAlchemy.source/);
    reject(success,w=>{w.events.find(event=>event.id===source)!.actorIds=['elder-danxia-1'];},/cultivators.publicAlchemy.source/);
    reject(success,w=>{w.events.find(event=>event.id===source)!.locationId='loc-market';},/cultivators.publicAlchemy.source/);
    const supplies=turn(success,gather('jade_leaf')),failure=turn(supplies,brew('foundation'),.999);
    const bad=failure.events.find(event=>event.id===sourceID(failure.tick));
    expect(bad?.title).toContain('炼丹失手');
    expect(practice(reopen(failure))).toEqual(practice(success));
    reject(failure,w=>{practice(w).lastTick=failure.tick;practice(w).successes++;},/cultivators.publicAlchemy.source/);
  });

  it('accepts old bounded corroboration loss without guessing from the current supply or furnace',()=>{
    const {success}=firstBrew();
    let historical=success;
    for(let i=0;i<7;i++)historical=turn(historical);
    expect(historical.furnaceReservations.uses.some(row=>row.tick===success.tick&&row.actorId===alchemistId)).toBe(false);
    expect(historical.resourceFlow.months.some(row=>row.tick===success.tick)).toBe(false);
    // Exercise genuine aged evidence with a deliberately omitted hot representation.
    historical.events=historical.events.filter(event=>event.id!==sourceID(success.tick));
    expect(practice(reopen(historical))).toEqual(practice(success));
    // A positively retained source is independent of the display site's current furnace grade.
    const copy=structuredClone(success);
    copy.locations.find(row=>row.id===siteId)!.furnaceGrade=0;
    expect(()=>validatePublicAlchemyPractice(copy,path=>{throw Error(path);})).not.toThrow();
  });
});
