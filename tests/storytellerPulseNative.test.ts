import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceStorytellerDirector,availableStorytellerActions,configureStoryteller,projectStoryteller,projectStorytellerPulse}
  from '../src/engine/storytellerDirector';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldEvent,WorldState} from '../src/types/world';

const subject='npc-1',seed=13071;
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'闲坐一月。'};
const person=(world:WorldState,id=subject)=>world.cultivators.find(actor=>actor.id===id)!;
const turn=(world:WorldState)=>advanceWorldTick(world,Object.fromEntries(world.cultivators.map(({id})=>[id,rest])),undefined,'utility');
const snapshot=(world:WorldState)=>{
  const bytes=encodeEraWorldSave(world),after=decodeEraWorldSave(bytes);
  expect(encodeEraWorldSave(after)).toBe(bytes);
  return after;
};
const make=(style:Parameters<typeof configureStoryteller>[1]='great_calamity')=>{
  const world=createInitialWorld(seed);
  expect(configureStoryteller(world,style,subject)).toBe(true);
  return world;
};
const event=(world:WorldState,category:WorldEvent['category'],name:string,scope?:'participants'):WorldEvent=>({
  id:`evt-test-${world.tick}-${name}`,tick:world.tick,year:world.year,month:world.month,
  title:'用于节奏输入的典型场面',description:'只在控制输入的测试中使用。',category,
  actorIds:scope?[subject]:[],...(scope?{witnessScope:scope}:{}),
});
type EventFeed=(world:WorldState)=>readonly WorldEvent[];
const conflict:EventFeed=world=>[event(world,'combat','combat-a'),event(world,'combat','combat-b'),event(world,'combat','combat-c')];

// Controlled monthly feed isolates the governor from native battles. Native unedited turns are checked separately below.
function sample(world:WorldState,feed:EventFeed=()=>[]){
  world.tick++;
  world.month=world.month%12+1;
  if(world.month===1)world.year++;
  advanceStorytellerDirector(world,feed(world));
  const current=projectStorytellerPulse(world)?.current;
  if(!current)throw new Error('Expected a real newly sampled calendar point');
  return current;
}

describe('天势 · G1-2 narrative pulse and pacing',()=>{
  it('prevents a third consecutive high-pressure authored opportunity when another real scene is eligible',()=>{
    const world=make(),a=sample(world,conflict),b=sample(world,conflict);
    expect([a.offeredTone,b.offeredTone]).toEqual(['crisis','crisis']);
    expect([a.worldBeat,b.worldBeat]).toEqual(['conflict','conflict']);
    const c=sample(world,conflict);
    expect(c.worldBeat).toBe('conflict'); // The director may change its scene, but cannot recast the world battle.
    expect(c.offeredTone).toBeDefined();
    expect(c.offeredTone).not.toBe('crisis');
    expect(c.reason).toBe('change_of_pace');
    expect(c.reasonLabel).toEqual(expect.any(String));
    const scene=projectStoryteller(world);
    expect(scene?.tone).toBe(c.offeredTone);
    const actor=person(world,scene?.actorId);
    expect(scene?.options.map(row=>row.decision)).toEqual(availableStorytellerActions(actor,world,world.tick+1));
    expect(scene?.options.length).toBeGreaterThanOrEqual(2);
  });

  it('does not invent a companion, nearby road, or high-stakes crisis if the only eligible story remains quiet',()=>{
    const world=make();
    const actor=person(world);
    for(const peer of world.cultivators)if(peer.id!==actor.id)peer.locationId='loc-market';
    actor.exploredTileIds=[];
    const points=[sample(world),sample(world),sample(world)];
    expect(points.map(({offeredTone})=>offeredTone)).toEqual(['quiet','quiet','quiet']);
    expect(points[2].reason).not.toBe('change_of_pace');
    expect(projectStoryteller(world)?.options.map(row=>row.decision.storytellerMove)).toEqual(['rest','cultivate']);
  });

  it('reads authoritative current public events only, deduplicates them and does not replay a month',()=>{
    const base=make('still_water');
    const hidden=structuredClone(base),empty=structuredClone(base),one=structuredClone(base),dupe=structuredClone(base);
    const quiet=sample(hidden,world=>[
      event(world,'combat','closed-door','participants'),
      {...event(world,'heavenly','older'),tick:world.tick-1},
    ]);
    expect(quiet).toEqual(sample(empty));
    expect(quiet.worldBeat).toBe('quiet');
    const raised=sample(one,world=>[event(world,'combat','same')]);
    const same=sample(dupe,world=>[event(world,'combat','same'),event(world,'combat','same')]);
    expect(raised).toEqual(same);
    expect(raised.worldBeat).toBe('conflict');
    expect(raised.tension).toBeGreaterThan(quiet.tension);
    const before=encodeEraWorldSave(one);
    advanceStorytellerDirector(one,conflict(one));
    expect(encodeEraWorldSave(one)).toBe(before);
    const peril=sample(one,world=>[event(world,'heavenly','storm')]);
    const joy=sample(one,world=>[event(world,'breakthrough','success')]);
    expect(peril.worldBeat).toBe('peril');
    expect(joy.worldBeat).toBe('celebration');
    expect(peril.tick+1).toBe(joy.tick);
  });

  it('stores exactly the most recent twenty-four real calendar samples, across a year and through branch saves',()=>{
    let world=make('wandering_jianghu');
    expect(projectStorytellerPulse(world)).toBeUndefined();
    const before=encodeEraWorldSave(world);
    const dates=new Map<number,{year:number;month:number}>();
    let branch:WorldState|undefined;
    for(let month=0;month<29;month++){
      world=turn(world);
      dates.set(world.tick,{year:world.year,month:world.month});
      const sample=projectStorytellerPulse(world);
      expect(sample?.points).toHaveLength(Math.min(month+1,24));
      expect(sample?.current).toMatchObject({tick:world.tick,year:world.year,month:world.month});
      if(month===10)branch=snapshot(world);
    }
    const later=projectStorytellerPulse(world);
    expect(later?.title).toBe('天势');
    expect(later?.points.map(({tick})=>tick)).toEqual([...dates.keys()].slice(-24));
    for(const point of later?.points??[]){
      expect(point).toMatchObject(dates.get(point.tick)!);
      expect(point.tension).toBeGreaterThanOrEqual(0);
      expect(point.tension).toBeLessThanOrEqual(100);
      expect(point.beatLabel).toEqual(expect.any(String));
    }
    expect(projectStorytellerPulse(snapshot(world))).toEqual(later);
    expect(projectStorytellerPulse(decodeEraWorldSave(before))).toBeUndefined();
    if(!branch)throw new Error('Expected an independently reopened fork checkpoint');
    const fork=turn(branch);
    expect(projectStorytellerPulse(fork)?.points).toHaveLength(12);
    expect(projectStorytellerPulse(branch)?.points).toHaveLength(11);
    expect(projectStorytellerPulse(world)?.points).toHaveLength(24);
    // A prior director version could already be configured but had no monthly curve.
    const withoutHistory=structuredClone(world);
    delete withoutHistory.storyteller!.pulse;
    const oldConfigured=snapshot(withoutHistory);
    expect(projectStorytellerPulse(oldConfigured)).toBeUndefined();
    const continued=turn(oldConfigured);
    expect(projectStorytellerPulse(continued)?.points.map(row=>row.tick)).toEqual([continued.tick]);
  },20000);

  it('keeps legacy worlds unsampled and rejects forged clocks, unpaired reasons or oversized histories',()=>{
    const legacy=createInitialWorld(seed);
    expect(projectStorytellerPulse(turn(legacy))).toBeUndefined();
    const world=make();
    sample(world);sample(world);
    const valid=encodeEraWorldSave(world);
    for(const mutate of [
      (w:WorldState)=>{w.storyteller!.pulse![0].tension=101;},
      (w:WorldState)=>{w.storyteller!.pulse![1].tick=w.storyteller!.pulse![0].tick;},
      (w:WorldState)=>{w.storyteller!.pulse!.at(-1)!.tick=w.tick+1;},
      (w:WorldState)=>{const point=w.storyteller!.pulse!.at(-1)!;point.reason='cadence';delete point.offeredTone;},
      (w:WorldState)=>{w.storyteller!.pulse=Array(25).fill(w.storyteller!.pulse![0]);},
    ]){
      const unsafe=structuredClone(world);
      mutate(unsafe);
      expect(()=>encodeEraWorldSave(unsafe)).toThrow(/storyteller/i);
    }
    expect(encodeEraWorldSave(world)).toBe(valid);
  });
});
