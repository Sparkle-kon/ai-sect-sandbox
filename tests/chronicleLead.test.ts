import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { projectChronicleLead, publicChronicleSceneEvents } from '../src/engine/chronicleLead';
import { archiveChronicleEvents } from '../src/engine/novelGenerator';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { WorldEvent } from '../src/types/world';

function story(size?: 526) {
  const world = createInitialWorld(11945);
  if (size) world.cultivators.push(...Array.from({length:size-world.cultivators.length},(_, index) => ({
    ...structuredClone(world.cultivators[0]),id:`late-${index}`,name:`后来的修士${index}`,
  })));
  const opening = structuredClone(world);
  const lead = size ? world.cultivators.at(-1)! : world.cultivators[0];
  const [,peer,third] = world.cultivators;
  [lead.name,peer.name,third.name] = ['晏照夜','桑听雪','柳行舟'];
  lead.realm = '练气';
  lead.realmStage = 1;
  lead.qiProgress = 100;
  const line = '只愿看清这一关。';
  const events: WorldEvent[] = [];
  const turn = () => { world.tick++; world.month++; };
  function record(event: WorldEvent | null) {
    expect(event).not.toBeNull();
    world.events.unshift(event!);
    events.push(event!);
    archiveChronicleEvents(world,[event!]);
  }
  turn();
  record(applyCultivatorBrainDecision(world,lead,{chosenAction:'BREAKTHROUGH',innerMonologue:line},()=>0));
  turn();
  record(applyCultivatorBrainDecision(world,lead,{chosenAction:'EXPLORE',innerMonologue:line},()=>0));
  turn();
  peer.locationId = lead.locationId;
  record(applyCultivatorBrainDecision(world,lead,
    {chosenAction:'SOCIALIZE',innerMonologue:line,targetCultivatorId:peer.id},()=>0));
  return {world,opening,lead,peer,third,events};
}

describe('chronicle protagonist is earned by recurring actual public events', () => {
  it('begins as an ensemble, then identifies exactly one grounded actor without advancing or writing the world', () => {
    const {world,opening,lead,events} = story();
    expect(projectChronicleLead(opening)).toBeUndefined();
    expect(projectChronicleLead(world,events.slice(0,2),events[1].tick)).toBeUndefined();
    const before = JSON.stringify(world);
    const reading = projectChronicleLead(world);
    expect(reading).toEqual({actorId:lead.id,name:lead.name,eventIds:events.map(({id})=>id),firstTick:events[0].tick,lastTick:events[2].tick});
    expect(projectChronicleLead(structuredClone(world))).toEqual(reading);
    expect(JSON.stringify(world)).toBe(before);
    expect(events.map(({category})=>category)).toEqual(['breakthrough','breakthrough','diplomacy']);
  });

  it('can follow the last actual actor in a 526-person world, without limiting the roster', () => {
    const {world,lead,events} = story(526);
    expect(world.cultivators.at(-1)?.id).toBe(lead.id);
    expect(projectChronicleLead(world)?.eventIds).toEqual(events.map(({id})=>id));
    expect(world.cultivators).toHaveLength(526);
  });

  it('uses the active branch or viewed past and does not stitch a same-name peer or private record into a lead', () => {
    const {world,lead,third,events} = story();
    third.name = lead.name;
    expect(projectChronicleLead(world)?.actorId).toBe(lead.id);
    const alternate = structuredClone(world);
    const branchFact = alternate.events.find(({id})=>id===events[1].id)!;
    branchFact.actorIds = [third.id];
    expect(projectChronicleLead(alternate)).toBeUndefined();
    expect(projectChronicleLead(world,undefined,world.tick-1)).toBeUndefined();
    expect(projectChronicleLead(world,undefined,world.tick+1)).toBeUndefined();
    const privateFact = {...events[2],witnessScope:'participants' as const};
    world.events.unshift(privateFact);
    expect(publicChronicleSceneEvents(world).some(({id})=>id===privateFact.id)).toBe(false);
    expect(projectChronicleLead(world)).toBeUndefined();
  });

  it('deduplicates exact facts and rejects future or contradictory detail without hiding other independent events', () => {
    const {world,events} = story();
    world.events.push(structuredClone(events[0]));
    const future = {...events[0],id:'future-story',tick:world.tick+1};
    const sealed = {...events[0],id:'evt-sealed-dispatch-private-version'};
    world.events.push(future,sealed);
    expect(publicChronicleSceneEvents(world).filter(({id})=>id===events[0].id)).toHaveLength(1);
    expect(projectChronicleLead(world)?.eventIds).toHaveLength(3);
    world.events.push({...events[1],description:'同一凭据不相容，不允许拼成场景。'});
    expect(publicChronicleSceneEvents(world).map(({id})=>id)).toEqual(
      expect.arrayContaining([events[0].id,events[2].id]));
    const actualIds = publicChronicleSceneEvents(world).map(({id})=>id);
    for (const hidden of [events[1].id,future.id,sealed.id]) expect(actualIds).not.toContain(hidden);
    expect(projectChronicleLead(world)).toBeUndefined();
  });
});
