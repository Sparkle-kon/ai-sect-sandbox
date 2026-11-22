import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {CockpitStoryStage,projectCockpitStoryStage} from '../src/components/CockpitStoryStage';
import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {WorldEvent} from '../src/types/world';

describe('panoramic xianxia story stage',()=>{
  it('shows the native opening instead of inventing or presetting a lead',()=>{
    const world=createInitialWorld(1872),frozen=JSON.stringify(world);
    const html=renderToStaticMarkup(<CockpitStoryStage world={world}/>);
    expect(html).toContain('今月戏台');
    expect(html).toContain('主角未定');
    expect(html).toContain('陨仙墟异动');
    expect(html).toContain('墟中灵气骤盛');
    expect(html).not.toContain('<button');
    expect(JSON.stringify(world)).toBe(frozen);
  });
  it('shows a protagonist earned in four actual seeded months, without changing with a different current fact',()=>{
    let world=createInitialWorld();
    for(let month=0;month<4;month++)world=advanceWorldTick(world);
    const view=projectCockpitStoryStage(world);
    expect(view.lead?.name).toBe('叶连翘');
    expect(view.scene).toMatchObject({earlier:false,followsLead:true});
    expect(renderToStaticMarkup(<CockpitStoryStage world={world}/>)).toContain('主角：叶连翘');
    const later=renderToStaticMarkup(<CockpitStoryStage world={advanceWorldTick(world)}/>);
    expect(later).toContain('主角：叶连翘');
    expect(later).toContain('这一幕另有人登场，主线并未换人');
  });
  it('links only current unique public facts, without exposing identity, private text, duplicate rows or unsupported quotation',()=>{
    const world=createInitialWorld(18);
    const make=(id:string,title:string,category:WorldEvent['category'],fields:Partial<WorldEvent>={}):WorldEvent=>
      ({id,title,description:`${title}留下了有据的一幕。`,category,actorIds:[],year:world.year,month:world.month,tick:world.tick,...fields});
    world.events=[
      make('opaque-current-conflict','剑修交手','combat'),
      make('opaque-current-encounter','两人渡口相逢','diplomacy',{description:'二人来到渡口。修士说道：“无据的话”。'}),
      make('opaque-private','私下签字','death',{witnessScope:'participants'}),
      make('opaque-future','未到的下月','death',{tick:world.tick+1}),
      make('opaque-wrong-calendar','错月的神迹','death',{month:world.month===12?11:world.month+1}),
      make('opaque-dup','相冲第一条','death'),
      make('opaque-dup','相冲第二条','death'),
    ];
    const view=projectCockpitStoryStage(world),onFocus=vi.fn();
    expect(view.scene?.eventId).toBe('opaque-current-conflict');
    expect(view.focus.map(row=>row.eventId)).toEqual(['opaque-current-encounter']);
    const html=renderToStaticMarkup(<CockpitStoryStage world={world} onFocus={onFocus}/>);
    expect(html).toContain('读本月一幕：剑修交手');
    expect(html).toContain('读本月波澜：两人渡口相逢');
    expect(html).toContain('min-h-11');
    for(const denied of ['opaque-','私下签字','未到的下月','错月的神迹','相冲第一条','相冲第二条','无据的话'])expect(html).not.toContain(denied);
    expect(onFocus).not.toHaveBeenCalled();
  });
  it('labels a quiet month as earlier and never makes older facts actionable',()=>{
    const world=createInitialWorld(18);
    world.tick++;
    const html=renderToStaticMarkup(<CockpitStoryStage world={world} onFocus={vi.fn()}/>);
    expect(html).toContain('本月暂无新见闻 · 上一幕');
    expect(html).toContain('陨仙墟异动');
    expect(html).not.toContain('<button');
  });
});
