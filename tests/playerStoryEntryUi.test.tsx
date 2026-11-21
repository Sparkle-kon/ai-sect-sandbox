import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PlayerStoryEntry } from '../src/components/PlayerStoryEntry';
import type { StoryPlayerRole } from '../src/components/storyPlayerController';
import { StoryFirstHome } from '../src/components/StoryFirstHome';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { projectStoryHomepage } from '../src/engine/storyHomepage';

const never=()=>{throw new Error('rendering must not enter, order or advance');};
const controls={onBack:never,onTools:never,onFollow:never,onEnter:never,onOrder:never};
const show=(role:StoryPlayerRole)=>renderToStaticMarkup(<PlayerStoryEntry role={role} revision={{}} {...controls}/>);
const home=vi.fn(()=>undefined);

describe('player-facing story flow and native choices',()=>{
  it('keeps only Continue and More while showing what happened, whose story, and how the player starts',()=>{
    const world=createInitialWorld(), view=projectStoryHomepage(world);
    const html=renderToStaticMarkup(<StoryFirstHome scene={view.scene} leadName={view.lead?.name} onContinue={home} onMore={home}/>);
    expect(html.match(/<button\b/g)).toHaveLength(2);
    expect(html).toMatch(/>继续<\/button>/);
    expect(html).toMatch(/>\s*更多\s*<\/button>/);
    expect(html).toContain('陨仙墟异动');
    expect(html).toContain('宗、血月魔宗、丹霞谷和天机阁的修士纷纷动身');
    expect(html).toContain('主角未定');
    expect(html).toContain('你在旁观');
    expect(html).toContain('看下个月 · 每次只过一月');
    expect(html).not.toMatch(/模拟器|<select|自动推演|查看地图、纪事与存档/);
    expect(home).not.toHaveBeenCalled();
  });

  it('distinguishes a protagonist earned by real turns, unrelated current story, and the player’s different body',()=>{
    let world=createInitialWorld();
    for(let n=0;n<5;n++)world=advanceWorldTick(world);
    const view=projectStoryHomepage(world);
    expect(view.lead?.name).toBe('叶连翘');
    expect(view.scene?.title).toContain('韩立风');
    expect(view.scene?.followsLead).toBe(false);
    const html=renderToStaticMarkup(<StoryFirstHome scene={view.scene} leadName={view.lead?.name} playerName="苏清寒" onContinue={never} onMore={never}/>);
    expect(html).toContain('主角：叶连翘');
    expect(html).toContain('这一幕说的是别人');
    expect(html).toMatch(/你正在引导：<strong[^>]*>苏清寒<\/strong>/);
    expect(html.match(/<button\b/g)).toHaveLength(2);
  });

  it('makes actual viable entrance explicit, unavailable entry read-only, and advanced tools secondary',()=>{
    const noLead=show({kind:'ensemble'});
    expect(noLead).toContain('主角未定');
    expect(noLead).not.toMatch(/确认入世|跟随主角的见闻|下月调息|下月修炼/);
    const ready=show({kind:'observer',name:'叶连翘',canEnter:true});
    expect(ready).toContain('以叶连翘入世');
    expect(ready).toContain('从旁观切换为入世');
    expect(ready).not.toContain('确认入世');
    expect(ready.indexOf('以叶连翘入世')).toBeLessThan(ready.indexOf('查看地图、纪事与存档'));
    const unavailable=show({kind:'observer',name:'叶连翘',canEnter:false,unavailable:'已有行动待办。'});
    expect(unavailable).toContain('已有行动待办。');
    expect(unavailable).toContain('跟随主角的见闻');
    expect(unavailable).toContain('只读，不改变世界');
    expect(unavailable).not.toContain('以叶连翘入世');
  });

  it('only after actual entry offers the two native actions, then switches to a proved pending receipt',()=>{
    const ready=show({kind:'playing',name:'苏清寒',isLead:false,canOrder:true});
    expect(ready).toContain('入世人物：苏清寒');
    expect(ready).not.toContain('主角：苏清寒');
    expect(ready).toContain('下月调息');
    expect(ready).toContain('下月修炼');
    expect(ready).toContain('排入一项用 5 神识');
    const queued=show({kind:'playing',name:'叶连翘',isLead:true,canOrder:false,queued:'CULTIVATE'});
    expect(queued).toContain('已安排下个月修炼');
    expect(queued).toContain('继续');
    expect(queued).not.toMatch(/>下月调息<|>下月修炼<|已执行/);
  });
});
