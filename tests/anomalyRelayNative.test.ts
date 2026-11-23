import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {projectAnomalyRelay} from '../src/engine/anomalyRelay';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {visibleAnomalyRelayMarks} from '../src/components/anomalyRelayMapView';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const eventId='evt-36-beast-tide-beast-loc-blood';
const actor=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const read=(world:WorldState,id:string)=>projectAnomalyRelay(world,actor(world,id));
function run(mode:'utility'|'deferred'){
  const frames=new Map<number,WorldState>();
  let world=createInitialWorld(1,'spirit-bloom');
  for(let tick=2;tick<=48;tick++){
    const moving=tick===35?'npc-2':tick===37?'npc-3':tick===46?'npc-1':undefined;
    const choices:Record<string,LLMDecisionPayload>=Object.fromEntries(world.cultivators.map(row=>[row.id,row.id===moving?
      {chosenAction:'EXPLORE',targetLocationId:'loc-market',innerMonologue:'到坊市。'}:
      {chosenAction:'REST',innerMonologue:'静坐。'}]));
    world=advanceWorldTick(world,choices,()=>.99,mode);
    if([36,37,45,48].includes(tick))frames.set(tick,world);
  }
  return frames;
}
describe('actual native anomaly news',()=>{
  it('keeps the real firsthand, personal encounter and delivered flying-sword places, not future or stronger replacement packets',()=>{
    const actual=run('utility'),deferred=run('deferred');
    const first=actual.get(36)!,second=actual.get(37)!,third=actual.get(45)!,upgraded=actual.get(48)!;
    expect(first.events.some(event=>event.id===eventId)).toBe(true);
    expect(read(first,'npc-3')).toMatchObject({complete:false,scenes:[{siteId:'loc-blood',tick:36,channel:'witness'}]});
    expect(read(second,'npc-2')).toMatchObject({complete:false,scenes:[
      {siteId:'loc-blood',tick:36,channel:'witness'},{siteId:'loc-market',tick:37,channel:'conversation'},
    ]});
    const full=read(third,'npc-1');
    expect(full).toMatchObject({complete:true,scenes:[
      {siteId:'loc-blood',tick:36,channel:'witness'},{siteId:'loc-market',tick:37,channel:'conversation'},
      {siteId:'loc-taixu',tick:45,channel:'flying_sword'},
    ]});
    expect(read(third,'npc-8')).toBeUndefined();
    expect(actor(upgraded,'npc-1').locationId).toBe('loc-market');
    expect(actor(upgraded,'npc-1').rumors.find(row=>row.originEventId===eventId)).toMatchObject({learnedTick:48,confidence:84,provenance:'conversation'});
    expect(read(upgraded,'npc-1')).toEqual(full);
    expect(read(deferred.get(48)!,'npc-1')).toEqual(full);
    expect(read(decodeEraWorldSave(encodeEraWorldSave(upgraded)),'npc-1')).toEqual(full);
    const marks=(world:WorldState,id:string)=>
      [...visibleAnomalyRelayMarks(world,createTerrainMapView(world,actor(world,id),false),actor(world,id)).keys()];
    expect(marks(first,'npc-3')).toEqual(['loc-blood']);
    expect(marks(third,'npc-1')).toEqual(['loc-blood','loc-market','loc-taixu']);
    expect(marks(third,'npc-8')).toEqual([]);
    const viewer=actor(third,'npc-1'),view=createTerrainMapView(third,viewer,false);
    expect(visibleAnomalyRelayMarks(third,view).size).toBe(0);
    expect(visibleAnomalyRelayMarks(third,view,{...viewer}).size).toBe(0);
    const disputed=structuredClone(third);
    disputed.events.push({...disputed.events.find(event=>event.id===eventId)!,witnessScope:'participants'});
    expect(read(disputed,'npc-1')).toBeUndefined();
    expect(()=>decodeEraWorldSave(encodeEraWorldSave(disputed))).toThrow(/anomalyRelays\.origin/);
  });
});
