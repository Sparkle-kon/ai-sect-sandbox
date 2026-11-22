import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {App} from '../src/App';
import {AgentInspector} from '../src/components/AgentInspector';
import {ChronicleFeed} from '../src/components/ChronicleFeed';
import {CockpitStoryStage,projectCockpitStoryStage} from '../src/components/CockpitStoryStage';
import {CockpitTimeControls} from '../src/components/CockpitTimeControls';
import {CockpitModeSwitch} from '../src/components/PanoramicCockpitView';
import {PanoramicCockpit} from '../src/components/PanoramicCockpit';
import {RelationshipGraph} from '../src/components/RelationshipGraph';
import {WorldMapCanvas} from '../src/components/WorldMapCanvas';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {createInitialWorld} from '../src/data/initialWorld';
import {publicChronicleSceneEvents} from '../src/engine/chronicleLead';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {encodeWorldSave} from '../src/engine/storageEngine';
import {projectStoryHomepage} from '../src/engine/storyHomepage';
import {advanceWorldTick,executeGodIntervention} from '../src/engine/worldEngine';
import type {WorldState} from '../src/types/world';

const noop=()=>undefined;
const privateCanary='此传音只准该修士本人知道';

function visibleCockpit(world:WorldState,selectedId:string){
  const selected=world.cultivators.find(actor=>actor.id===selectedId);
  return renderToStaticMarkup(<PanoramicCockpit
    map={<WorldMapCanvas world={world} selectedCultivatorId={selectedId} onSelectCultivator={noop} compact />}
    timeControls={<CockpitTimeControls date={world} historical={false} running={false} busy={false}
      onStep={noop} onToggleAutoplay={noop} onReturnLive={noop} onOpenTimeline={noop} />}
    stage={<CockpitStoryStage world={world}/>}
    inspector={<AgentInspector world={world} cultivator={selected} onSelectCultivator={noop} workspaceSection="mind" />}
    relationships={<RelationshipGraph world={world} selectedCultivatorId={selectedId} onSelectCultivator={noop} />}
    chronicle={<ChronicleFeed events={publicChronicleSceneEvents(world)} />} />);
}

describe('panoramic cockpit integration',()=>{
  it('keeps the ordinary mobile opening story-only and the existing map workspace contract',()=>{
    const first=renderToStaticMarkup(<App />);
    expect(first.match(/<button\b/g)).toHaveLength(2);
    expect(first).toContain('data-story-home');
    expect(first).toMatch(/>看下个月<\/button>/u);
    expect(first).toMatch(/>\s*走进故事\s*<\/button>/u);
    for(const name of ['今月戏台','九州山河','因果关系','实时纪事','单步推演'])expect(first).not.toContain(name);
    const oldMap=renderToStaticMarkup(<App initialWorkspace="map" />);
    expect(oldMap.match(/role="tab"/g)).toHaveLength(5);
    expect(oldMap).toMatch(/tab-map[^>]*role="tab" aria-selected="true"/u);
    expect(oldMap).toContain('aria-label="当前修士"');
    expect(oldMap).not.toContain('戏剧舞台');
    expect(oldMap).not.toContain('data-panoramic-cockpit');
  });


  it('opts into a single desktop cockpit with a reversible control, and preserves the story on the other presentation',()=>{
    const story=renderToStaticMarkup(<App />), cockpit=renderToStaticMarkup(<App initialCockpit />);
    expect(cockpit).toMatch(/<main\b[^>]*data-panoramic-cockpit="true"[^>]*data-cockpit-tick="1"/u);
    expect(cockpit).toMatch(/<button[^>]*>故事书卷<\/button>/u);
    expect(cockpit).not.toContain('data-story-home');
    expect(cockpit).not.toContain('role="tab"');
    for(const label of ['九州山河','戏剧舞台','今月戏台','修士识海','因果关系','实时纪事','推演一月','时间线与快进']){
      expect(cockpit).toContain(label);
    }
    const chosen=projectStoryHomepage(createInitialWorld());
    expect(chosen.scene?.title).toBeDefined();
    expect(cockpit).toContain(chosen.scene!.title);
    expect(story).toContain(chosen.scene!.title);
    expect(cockpit).toContain(`仙历 ${chosen.calendar.year}年${chosen.calendar.month}月`);
    expect(renderToStaticMarkup(<CockpitModeSwitch active={false} onSwitch={noop}/>)).toBe('');
    expect(renderToStaticMarkup(<CockpitModeSwitch active disabled onSwitch={noop}/>))
      .toMatch(/<button[^>]+disabled=""[^>]*>故事书卷<\/button>/u);
  });

  it('renders the same actual public story, date, map scope and canon selected person for real utility and accepted model JSON outputs',async()=>{
    const base=executeGodIntervention(createInitialWorld(30301),{
      type:'WHISPER_MIND',targetCultivatorId:'npc-6',whisperText:privateCanary,
    });
    const baseRaw=encodeWorldSave(base),chosenId='npc-1';
    const selected=base.cultivators.find(actor=>actor.id===chosenId)!;
    const utility=advanceWorldTick(base,undefined,undefined,'utility');
    const fetch=vi.fn(async()=>new Response(JSON.stringify({
      choices:[{message:{content:JSON.stringify({chosenAction:'SOCIALIZE',targetCultivatorId:'elder-taixu-1',
        innerMonologue:'去问在太虚同地的老友。'})}}],
    })));
    vi.stubGlobal('fetch',fetch);
    try{
      const decision=await requestCultivatorLLMDecision(selected,base,{
        enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture-only',model:'fixture',
      },base.tick+1);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(decision).toMatchObject({chosenAction:'SOCIALIZE',targetCultivatorId:'elder-taixu-1'});
      if(!decision)throw Error('Model output must be parsed, not silently substituted');
      const model=advanceWorldTick(base,{[chosenId]:decision},undefined,'deferred',undefined,{modelActors:new Set([chosenId])});
      expect(model.events.some(event=>event.tick===model.tick&&event.actorIds[0]===chosenId&&event.actorIds[1]==='elder-taixu-1')).toBe(true);
      for(const state of [utility,model]){
        const raw=encodeWorldSave(state),person=state.cultivators.find(actor=>actor.id===chosenId)!;
        const map=createTerrainMapView(state,person,true),home=projectStoryHomepage(state),stage=projectCockpitStoryStage(state);
        expect(stage.calendar).toEqual(home.calendar);
        expect(stage.lead).toEqual(home.lead);
        expect(stage.scene).toEqual(home.scene);
        expect(map.liveActors.some(actor=>actor.id===chosenId)).toBe(true);
        const markup=visibleCockpit(state,chosenId);
        for(const label of ['全息大盘','九州山河','时间推演','今月戏台','本月波澜','修士识海','因果关系','实时纪事'])expect(markup).toContain(label);
        expect(markup).toContain(person.name);
        expect(markup).not.toContain(privateCanary);
        expect(markup).toContain(`仙历 ${state.year}年${state.month}月`);
        if(home.scene)expect(markup).toContain(home.scene.title);
        expect(encodeWorldSave(state)).toBe(raw);
      }
      expect(encodeWorldSave(base)).toBe(baseRaw);
    }finally{vi.unstubAllGlobals();}
  });
});
