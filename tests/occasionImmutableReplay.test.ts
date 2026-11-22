import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {availableOccasionJoins} from '../src/engine/occasionEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const tick=(world:WorldState,chosen:Record<string,LLMDecisionPayload>={})=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(actor=>[actor.id,chosen[actor.id]??{chosenAction:'REST',innerMonologue:'静候原生年月。'}])),
  ()=>.1,'utility');
describe('native dated occasion opening is not an alias into future registration',()=>{
  it('keeps the actual empty opening immutable through native T61 joining and JSON replay',()=>{
    const start=createInitialWorld(70,'spirit-bloom');
    start.tick=59;start.year=1005;start.month=11;
    const opened=tick(start);
    expect(opened.regionalSimulation).toBeUndefined();
    const occasion=opened.occasions.find(row=>row.kind==='tournament'&&row.startedTick===60)!;
    expect(occasion?.status).toBe('registration');
    const openingId=`evt-60-${occasion.id}-open`;
    expect(opened.events.find(event=>event.id===openingId)?.actorIds).toEqual([]);
    const actor=opened.cultivators.find(actor=>actor.id==='npc-6')!;
    const eligible=availableOccasionJoins(actor,opened,61).find(option=>option.targetOccasionId===occasion.id);
    expect(eligible).toBeDefined();
    const choice:LLMDecisionPayload={chosenAction:'JOIN_OCCASION',targetOccasionId:occasion.id,innerMonologue:'按真实大比登记。'};
    const packed=encodeEraWorldSave(opened);
    const continued=tick(opened,{[actor.id]:choice});
    const restored=tick(decodeEraWorldSave(packed),{[actor.id]:choice});
    expect(continued.occasions.find(row=>row.id===occasion.id)?.participantIds).toEqual([actor.id]);
    expect(continued.events.find(event=>event.id===`evt-61-${occasion.id}-join-${actor.id}`)?.actorIds).toEqual([actor.id]);
    expect(continued.events.find(event=>event.id===openingId)?.actorIds).toEqual([]);
    expect(continued.chronicleArchive.anchors.find(row=>row.id===openingId)?.actorIds).toEqual([]);
    expect(encodeEraWorldSave(continued)).toBe(encodeEraWorldSave(restored));
    expect(encodeEraWorldSave(opened)).toBe(packed);
  });
});
