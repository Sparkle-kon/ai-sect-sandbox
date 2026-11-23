import {describe,expect,it,vi} from 'vitest';
import {createStoryletRegistry,type StoryletDefinition,type StoryletHandlers,type StoryletSchema} from '../src/engine/storyletEngine';

interface Traveler {id:string;awake:boolean}
interface Context {readonly site:string;readonly hero:Traveler;readonly peers:readonly Traveler[]}
interface Schema extends StoryletSchema {
  Id:'crossing'|'shelter'|'well';
  Context:Context;
  Actor:Traveler;
  Role:'leader'|'witness';
  Scene:{title:string;notes:readonly string[]};
  Choice:'help'|'leave';
  ChoiceMeta:{label:string};
  Condition:{kind:'at';site:string}|{kind:'awake'};
  Binder:{kind:'hero'}|{kind:'peer'};
  Effect:{kind:'change';stoneDelta:number}|{kind:'none'};
  EffectContext:{limit:number};
  Result:{readonly stones:number};
}
const make=(id:Schema['Id'],site:string,base:number,witness=true):StoryletDefinition<Schema>=>({
  id,scene:{title:id,notes:[site]},conditions:[{kind:'at',site},{kind:'awake'}],
  roles:[{id:'leader',binder:{kind:'hero'}},...(witness?[{id:'witness',binder:{kind:'peer'}}] as const:[])],
  choices:[
    {id:'help',meta:{label:'Give help'},effect:{kind:'change',stoneDelta:base}},
    {id:'leave',meta:{label:'Leave'},effect:{kind:'none'}},
  ],
});
const ctx=():Context=>({site:'river',hero:{id:'a',awake:true},peers:[{id:'b',awake:true}]});
function adapters(){
  const change=vi.fn<StoryletHandlers<Schema>['effects']['change']>((condition,context)=>
    ({stones:Math.min(context.limit,condition.stoneDelta)}));
  const none=vi.fn<StoryletHandlers<Schema>['effects']['none']>(()=>({stones:0}));
  const handlers:StoryletHandlers<Schema>={
    conditions:{at:(instruction,context)=>instruction.site===context.site,awake:(_,context)=>context.hero.awake},
    roles:{hero:(_,context)=>[context.hero],peer:(_,context)=>context.peers.filter(actor=>actor.awake)},
    effects:{change,none},
  };
  return {handlers,change,none};
}

describe('typed declarative storylet engine',()=>{
  it('admits deterministically in authored order, and adding a third data record needs no new engine handler',()=>{
    const {handlers,change,none}=adapters(),input=ctx();
    const adapter=createStoryletRegistry<Schema>([make('crossing','river',7),make('shelter','river',4)],handlers);
    expect(adapter.select(input)?.definition.id).toBe('crossing');
    expect(adapter.admit('shelter',input)?.definition.id).toBe('shelter');
    expect(adapter.admit('well',{...input,site:'spring'})).toBeUndefined();
    expect(change).not.toHaveBeenCalled();
    expect(none).not.toHaveBeenCalled();

    const registry=createStoryletRegistry<Schema>([...adapter.definitions,make('well','spring',9,false)],handlers);
    const sameHero={...input,site:'spring'};
    const before=structuredClone(sameHero);
    expect(registry.select(sameHero)?.definition.id).toBe('well');
    expect(registry.definition('well')?.choices.map(choice=>choice.id)).toEqual(['help','leave']);
    const accepted=registry.resolve('well','help',sameHero,{limit:5});
    expect(accepted?.result).toEqual({stones:5});
    expect(accepted?.roles.leader).toBe(input.hero);
    expect(accepted?.roles.witness).toBeUndefined();
    expect(sameHero).toEqual(before);
    expect(change).toHaveBeenCalledOnce();
    expect(none).not.toHaveBeenCalled();
    expect(Object.isFrozen(input.hero)).toBe(false);
    expect(Object.isFrozen(accepted)).toBe(true);
    expect(Object.isFrozen(accepted?.roles)).toBe(true);
    expect(Object.isFrozen(accepted?.result)).toBe(true);
  });

  it('never executes forged choices, stale conditions, absent/ambiguous witnesses or one actor for two canonical roles',()=>{
    const {handlers,change}=adapters(),world=ctx(),payment={limit:10};
    const registry=createStoryletRegistry<Schema>([make('crossing','river',7)],handlers);
    expect(registry.resolve('crossing','other' as Schema['Choice'],world,payment)).toBeUndefined();
    expect(registry.resolve('shelter','help',world,payment)).toBeUndefined();
    for(const context of [
      {...world,site:'elsewhere'}, {...world,hero:{...world.hero,awake:false}},
      {...world,peers:[]},{...world,peers:[...world.peers,{id:'c',awake:true}]},
      {...world,peers:[world.hero]},
    ]){
      expect(registry.select(context)).toBeUndefined();
      expect(registry.resolve('crossing','help',context,payment)).toBeUndefined();
    }
    expect(change).not.toHaveBeenCalled();
    expect(registry.previewEffect('crossing','help',payment)).toEqual({stones:7});
    expect(change).toHaveBeenCalledOnce(); // The codec can check nominal arithmetic without authorizing a live choice.
  });

  it('snapshots nested authored values and rejects duplicate identifiers, unknown code and exotic objects',()=>{
    const {handlers,change}=adapters(),input=make('crossing','river',7);
    const registry=createStoryletRegistry<Schema>([input],handlers);
    expect(Object.isFrozen(registry.definitions)).toBe(true);
    const stored=registry.definition('crossing')!;
    expect(Object.isFrozen(stored.scene.notes)).toBe(true);
    expect(Object.isFrozen(stored.choices[0].effect)).toBe(true);
    Object.assign(input.scene,{title:'tamper'});
    Object.assign(input.choices[0].effect,{stoneDelta:1000});
    expect(stored.scene.title).toBe('crossing');
    expect(registry.previewEffect('crossing','help',{limit:10})).toEqual({stones:7});
    for(const bad of [
      [input,input],
      [{...input,roles:[...input.roles,input.roles[0]]}],
      [{...input,choices:[...input.choices,input.choices[0]]}],
      [{...input,conditions:[{kind:'arbitrary'}]}],
      [{...input,roles:[{id:'leader',binder:{kind:'arbitrary'}}]}],
      [{...input,choices:[{...input.choices[0],effect:{kind:'arbitrary'}}]}],
      [{...input,scene:{title:'code',notes:[()=>{}]}}],
      [{...input,scene:Object.assign(Object.create({magic:true}) as object,input.scene)}],
    ]){
      expect(()=>createStoryletRegistry<Schema>(bad as readonly StoryletDefinition<Schema>[],handlers)).toThrow(TypeError);
    }
    const read=vi.fn(()=>input.scene.title);
    const access=Object.defineProperty({title:'',notes:[]},'title',{enumerable:true,get:read});
    expect(()=>createStoryletRegistry<Schema>([{...input,scene:access}],handlers)).toThrow(TypeError);
    expect(read).not.toHaveBeenCalled();
    expect(change).toHaveBeenCalledOnce();
  });
});
