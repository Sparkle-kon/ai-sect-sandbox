import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {AgentInspector} from '../src/components/AgentInspector';
import {canReadOwnPersona,personaDossierMemories,PersonaDossierRead} from '../src/components/personaDossierRead';
import {createInitialWorld} from '../src/data/initialWorld';
import {possessAvatar} from '../src/engine/avatarEngine';
import type {MemoryEntry} from '../src/types/world';

function fixture(){
  const world=createInitialWorld(725),actor=world.cultivators[0];
  actor.personality='苟道';
  actor.innerMonologue='绝不公开的真实心声。';
  actor.secretGoal='不能外传的真实目标。';
  const memory=(id:string,category:MemoryEntry['category'],content:string):MemoryEntry=>
    ({id,tick:world.tick,category,content,importance:10,emotionalValence:1,decayRate:.01});
  actor.memories=[memory('ordinary','social','可读的旧日役记。'),memory('whisper','whisper','私下收到的这一句。')];
  actor.coreMemories=[memory('kept','whisper','原先封存的私语。')];
  actor.reflections=[
    {id:'reflection-private',tick:world.tick,kind:'obsession',theme:'community',intensity:8,statement:'复述不该外传的词。',sourceMemoryIds:['whisper'],source:'llm'},
    {id:'reflection-public',tick:world.tick,kind:'belief',theme:'community',intensity:7,statement:'旧日役记所留的反思。',sourceMemoryIds:['ordinary'],source:'utility'},
  ];
  return {world,actor};
}
describe('exact live owner scope for persona passages',()=>{
  it('shows an explicitly authored fallback rather than the selected NPC’s raw voice or goal',()=>{
    const {world,actor}=fixture();
    const read=(live:boolean)=>renderToStaticMarkup(<PersonaDossierRead world={world} actor={actor} live={live}/>);
    const publicOnly=read(true);
    expect(publicOnly).toContain('人物演绎 · 并非亲知');
    expect(publicOnly).not.toContain(actor.innerMonologue);
    expect(publicOnly).not.toContain(actor.secretGoal);
    expect(possessAvatar(world,actor.id)).toBe(true);
    expect(read(true)).toContain('仅本人可见 · 角色心声');
    expect(read(true)).toContain(actor.innerMonologue);
    expect(read(true)).toContain(actor.secretGoal);
    expect(read(false)).not.toContain(actor.innerMonologue);
    expect(canReadOwnPersona(world,{...actor},true)).toBe(false);
  });
  it('does not echo private whispers through either memory bank or derived reflections and retains other role notes',()=>{
    const {world,actor}=fixture();
    const preview=renderToStaticMarkup(<AgentInspector world={world} cultivator={actor} onSelectCultivator={vi.fn()} workspaceSection="mind"/>);
    expect(preview).toContain('可读的旧日役记');
    expect(preview).toContain('旧日役记所留的反思');
    for(const blocked of ['私下收到','原先封存','复述不该外传',actor.innerMonologue,actor.secretGoal])
      expect(preview).not.toContain(blocked);
    expect(personaDossierMemories(actor,false).coreMemories).toEqual([]);
    expect(possessAvatar(world,actor.id)).toBe(true);
    const own=renderToStaticMarkup(<AgentInspector world={world} cultivator={actor} onSelectCultivator={vi.fn()} workspaceSection="mind"
      allowPersonalThought/>);
    expect(own).toContain('私下收到的这一句');
    expect(own).toContain('原先封存的私语');
    expect(own).toContain('复述不该外传');
  });
});
