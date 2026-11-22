import { describe,expect,it } from 'vitest';
import { projectScopedCausalChronicle,projectScopedPersonalChronicle,projectScopedPublicChronicle } from '../src/components/scopedChronicleRead';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload,WorldState } from '../src/types/world';

const id='elder-danxia-1', peer='elder-danxia-2';
const originalOf=(world:WorldState)=>world.cultivators.find(row=>row.id===id)!;
function frame(){
  const initial=createInitialWorld(106,'spirit-bloom');
  const wait:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'等自己的回合。'};
  const speak:LLMDecisionPayload={chosenAction:'SOCIALIZE',targetCultivatorId:peer,innerMonologue:'留在本人心里。',spokenLine:'一壶茶，两把椅。'};
  const world=advanceWorldTick(initial,Object.fromEntries(initial.cultivators.map(row=>[row.id,row.id===id?speak:wait])),()=>.99,'utility');
  const event=world.events.find(row=>row.id===`evt-${world.tick}-${id}-social`);
  if(!event)throw Error('Expected actual local conversation');
  return {initial,world,event};
}

describe('one scoped chronicle edge for public, actual body and causality reads',()=>{
  it('reads the live public fact while matching only the canonical branch body to the actual witnessed scene',()=>{
    const {initial,world,event}=frame(), actor=originalOf(world);
    const before=JSON.stringify(world);
    expect(projectScopedPublicChronicle(world).events).toContain(event);
    expect(projectScopedPersonalChronicle(world,actor,event.id)?.scenes.map(row=>row.eventId)).toEqual([event.id]);
    expect(projectScopedPersonalChronicle(world,originalOf(initial),event.id)).toBeUndefined();
    expect(projectScopedPersonalChronicle(world,structuredClone(actor),event.id)).toBeUndefined();
    const duplicate={...world,cultivators:[...world.cultivators,structuredClone(actor)]};
    expect(projectScopedPersonalChronicle(duplicate,actor,event.id)).toBeUndefined();
    expect(JSON.stringify(world)).toBe(before);
  });

  it('does not let a sibling private replacement acquire public, personal or causal visibility',()=>{
    const {world,event}=frame();
    const sibling=structuredClone(world);
    sibling.events.unshift({...event,witnessScope:'participants',title:'尚未公开的异卷密话',description:'只写给本分支的私语。'});
    const publicSide=projectScopedPublicChronicle(sibling);
    expect(publicSide.events.some(row=>row.id===event.id)).toBe(false);
    expect(publicSide.dialogue.event(event.id)).toBeUndefined();
    expect(projectScopedPersonalChronicle(sibling,originalOf(world),event.id)).toBeUndefined();
    expect(JSON.stringify(projectScopedCausalChronicle(sibling,null).get(event.id)??{})).not.toContain('本分支的私语');
    expect(projectScopedPublicChronicle(world).events).toContain(event);
  });
});
