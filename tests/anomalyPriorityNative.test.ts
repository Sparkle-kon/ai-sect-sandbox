import { expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { configureStoryteller } from '../src/engine/storytellerDirector';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, Rumor, WorldState } from '../src/types/world';

function step(world: WorldState, moving?: string | readonly string[], mode: 'utility'|'deferred' = 'deferred') {
  const choices: Record<string, LLMDecisionPayload> = Object.fromEntries(world.cultivators.map(row => [
    row.id, (typeof moving === 'string' ? row.id === moving : moving?.includes(row.id)) ? { chosenAction: 'EXPLORE', targetLocationId: 'loc-market', innerMonologue: '到坊市。' } :
      { chosenAction: 'REST', innerMonologue: '静坐。' },
  ]));
  return advanceWorldTick(world, choices, () => .99, mode);
}
const origin='evt-36-beast-tide-beast-loc-blood';
const rumors=(world:WorldState, id:string)=>world.cultivators.find(row=>row.id===id)!.rumors;
const receipt=(world:WorldState)=>world.anomalyRelays?.receipts.find(row=>row.eventId===origin&&row.actorId==='npc-2');
it('chooses only the authentic new-site packet over a normal elective winner',()=>{
  let world=createInitialWorld(1,'spirit-bloom');
  for(let tick=2;tick<=36;tick++)world=step(world,tick===35?'npc-2':undefined);
  expect(world.anomalyRelays?.receipts.some(row=>row.eventId===origin&&row.actorId==='npc-3'&&row.hops===0)).toBe(true);
  // A controlled competitor in the ordinary mailbox; tide and every relay receipt use the native engine.
  const ordinary:Rumor={id:'rumor-0-elective',subject:'日前小闻',locationId:'loc-blood',originTick:36,learnedTick:36,
    provenance:'witness',confidence:100,hops:0,originSourceCultivatorId:'npc-3'};
  rumors(world,'npc-3').push(ordinary);
  const baseline=step(world,'npc-3');
  expect(rumors(baseline,'npc-2').some(row=>row.id===ordinary.id)).toBe(true);
  expect(receipt(baseline)).toBeUndefined();

  const enabled=structuredClone(world);
  expect(configureStoryteller(enabled,'wandering_jianghu')).toBe(true);
  for(const mode of ['utility','deferred'] as const){
    const after=step(enabled,'npc-3',mode);
    expect(receipt(after)).toMatchObject({tick:37,siteId:'loc-market',senderId:'npc-3',
      confidence:84,hops:1,channel:'conversation'});
    expect(rumors(after,'npc-2').some(row=>row.id===ordinary.id)).toBe(false);
  }

  const pinned=structuredClone(world);
  expect(configureStoryteller(pinned,'great_calamity','npc-3')).toBe(true);
  expect(receipt(step(pinned,'npc-3'))).toBeUndefined();
  const quiet=structuredClone(world);
  expect(configureStoryteller(quiet,'still_water')).toBe(true);
  expect(receipt(step(quiet,'npc-3'))).toBeUndefined();
  const mismatched=structuredClone(enabled);
  const copied=rumors(mismatched,'npc-3').find(row=>row.originEventId===origin)!;
  copied.originSourceCultivatorId='npc-9';
  expect(receipt(step(mismatched,'npc-3'))).toBeUndefined();

  const full=structuredClone(enabled);
  const mailbox=rumors(full,'npc-2');
  mailbox.splice(0,mailbox.length,...Array.from({length:18},(_,index)=>({...ordinary,id:`rumor-local-${index}`})));
  expect(receipt(step(full,'npc-3'))).toBeUndefined();

  const twoListeners=step(enabled,['npc-1','npc-3']);
  expect(twoListeners.anomalyRelays?.receipts.filter(row=>row.eventId===origin&&row.tick===37&&
    row.siteId==='loc-market'&&['npc-1','npc-2'].includes(row.actorId))).toHaveLength(1);
});
