import {describe,expect,it,vi} from 'vitest';
import {applyScopedMapEntityIntervention,type MapEntityPopoverBinding,type MapEntityPopoverWriteContext}
  from '../src/components/mapEntityPopoverWrite';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {createInitialWorld} from '../src/data/initialWorld';
import {publicChronicleSceneEvents} from '../src/engine/chronicleLead';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {encodeWorldSave} from '../src/engine/storageEngine';
import {projectStoryHomepage} from '../src/engine/storyHomepage';
import {createTimeline,forkTimeline,readTimelineHead,recordTimelineWorld} from '../src/engine/timelineEngine';
import {advanceWorldTick,executeGodIntervention} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const viewerId='npc-1',targetId='elder-taixu-1',siteId='loc-taixu';
const secret='一叶眉间落在此身，旁人听不得';
const actor=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const scope=(world:WorldState)=>`genesis-1:main:${world.tick}:live`;
const context=(world:WorldState):MapEntityPopoverWriteContext=>({world,scopeKey:scope(world),revision:4,viewerId,canWrite:true});
const makeBinding=(world:WorldState,target:MapEntityPopoverBinding['target']):MapEntityPopoverBinding=>
  ({world,scopeKey:scope(world),revision:4,viewerId,fog:false,target});
const actorTarget={kind:'actor',id:targetId} as const;
const siteTarget={kind:'site',id:siteId} as const;
const raw=(world:WorldState)=>encodeWorldSave(world);

describe('same-frame map entity intervention through the normal world engine',()=>{
  it('applies only the clicked native actor or site and preserves exact public and private event rules',()=>{
    const world=createInitialWorld(1,'spirit-bloom'),snapshot=raw(world);
    const view=createTerrainMapView(world,actor(world,viewerId),true);
    expect(view.liveActors.some(row=>row.id===targetId)).toBe(true);
    expect(view.isCurrentLocation(siteId)).toBe(true);
    const live=context(world),site=makeBinding(world,siteTarget),person=makeBinding(world,actorTarget);
    const struck=applyScopedMapEntityIntervention(live,person,'lightning');
    expect(raw(struck)).toBe(raw(executeGodIntervention(world,{type:'TRIBULATION_STRIKE',targetCultivatorId:targetId})));
    expect(struck.tick).toBe(world.tick);
    expect(struck.interventionSequence).toBe(world.interventionSequence+1);
    expect(actor(struck,targetId).hp).toBeLessThan(actor(world,targetId).hp);
    expect(actor(struck,viewerId).hp).toBe(actor(world,viewerId).hp);
    expect(struck.events[0]).toMatchObject({actorIds:[targetId],locationId:siteId,tick:world.tick});

    const blessed=applyScopedMapEntityIntervention(live,site,'treasure');
    expect(raw(blessed)).toBe(raw(executeGodIntervention(world,{type:'SPAWN_TREASURE',targetLocationId:siteId})));
    expect(blessed.locations.map(({id,spiritQi})=>[id,spiritQi])).toEqual(world.locations.map(({id,spiritQi})=>
      [id,id===siteId?Math.min(spiritQi+20,150):spiritQi]));
    expect(blessed.events[0].locationId).toBe(siteId);
    expect(publicChronicleSceneEvents(blessed).some(row=>row.id===blessed.events[0].id)).toBe(true);

    const whispered=applyScopedMapEntityIntervention(live,person,'whisper',secret);
    expect(raw(whispered)).toBe(raw(executeGodIntervention(world,{type:'WHISPER_MIND',targetCultivatorId:targetId,whisperText:secret})));
    expect(whispered.events[0]).toMatchObject({actorIds:[targetId],witnessScope:'participants'});
    expect(actor(whispered,targetId).secretGoal).toBe(secret);
    for(const other of whispered.cultivators.filter(row=>row.id!==targetId)){
      expect(other.secretGoal).toBe(actor(world,other.id).secretGoal);
      expect(JSON.stringify(other.memories)).not.toContain(secret);
    }
    expect(JSON.stringify(publicChronicleSceneEvents(whispered))).not.toContain(secret);
    expect(projectStoryHomepage(whispered)).toEqual(projectStoryHomepage(world));
    expect(raw(world)).toBe(snapshot);
  });

  it('rejects fog writes, disabled historical and busy contexts, wrong command kinds, and absent targets with no default fallback',()=>{
    const world=createInitialWorld(1,'spirit-bloom'),live=context(world);
    const before=raw(world);
    const selection=makeBinding(world,actorTarget),site=makeBinding(world,siteTarget);
    const fogView=createTerrainMapView(world,actor(world,viewerId),true);
    expect(fogView.isCurrentLocation('loc-market-east')).toBe(false);
    expect(fogView.liveActors.some(row=>row.id==='npc-6')).toBe(false);
    expect(applyScopedMapEntityIntervention(live,{...selection,fog:true},'lightning')).toBe(world);
    expect(applyScopedMapEntityIntervention(live,{...site,fog:true,target:{kind:'site',id:'loc-market-east'}},'treasure')).toBe(world);
    expect(applyScopedMapEntityIntervention(live,{...selection,fog:true,target:{kind:'actor',id:'npc-6'}},'whisper',secret)).toBe(world);
    const history={...live,scopeKey:'genesis-1:main:1:history',canWrite:false};
    expect(applyScopedMapEntityIntervention(history,{...selection,scopeKey:history.scopeKey},'lightning')).toBe(world);
    expect(applyScopedMapEntityIntervention({...live,canWrite:false},site,'treasure')).toBe(world);
    expect(applyScopedMapEntityIntervention(live,selection,'treasure')).toBe(world);
    expect(applyScopedMapEntityIntervention(live,site,'lightning')).toBe(world);
    expect(applyScopedMapEntityIntervention(live,selection,'whisper','   ')).toBe(world);
    expect(applyScopedMapEntityIntervention(live,{...site,target:{kind:'site',id:'missing-site'}},'treasure')).toBe(world);
    expect(applyScopedMapEntityIntervention(live,{...selection,target:{kind:'actor',id:'missing-person'}},'lightning')).toBe(world);
    const invalidViewer={...live,viewerId:'gone'};
    expect(applyScopedMapEntityIntervention(invalidViewer,{...selection,viewerId:'gone'},'lightning')).toBe(world);
    expect(raw(world)).toBe(before);
  });

  it('does not let old same-tick copies, branch cursors, scope revisions, or another viewer write',()=>{
    const origin=createInitialWorld(1,'spirit-bloom'),timeline=createTimeline(origin);
    const selection=makeBinding(origin,actorTarget),live=context(origin);
    const fork=forkTimeline(timeline,origin.tick,{type:'WHISPER_MIND',targetCultivatorId:viewerId,
      whisperText:'真正的旁支，仍为同月。'},'同月');
    const sibling=readTimelineHead(fork);
    if(!sibling)throw Error('Expected a genuine same-age sibling');
    expect(sibling.tick).toBe(origin.tick);
    const before=raw(sibling);
    expect(applyScopedMapEntityIntervention({...live,world:sibling},selection,'lightning')).toBe(sibling);
    const copied=structuredClone(origin);
    expect(raw(copied)).toBe(raw(origin));
    expect(applyScopedMapEntityIntervention({...live,world:copied},selection,'lightning')).toBe(copied);
    expect(applyScopedMapEntityIntervention({...live,scopeKey:'genesis-1:branch-1:1:live'},selection,'lightning')).toBe(origin);
    expect(applyScopedMapEntityIntervention({...live,revision:live.revision+1},selection,'lightning')).toBe(origin);
    expect(applyScopedMapEntityIntervention({...live,viewerId:targetId},selection,'lightning')).toBe(origin);
    const actual=applyScopedMapEntityIntervention(live,selection,'lightning');
    const changed=recordTimelineWorld(timeline,actual);
    expect(changed).not.toBe(timeline);
    expect(changed.activeBranchId).toBe('main');
    expect(readTimelineHead(changed)?.events[0].id).toBe(actual.events[0].id);
    expect(readTimelineHead(timeline)?.events.some(row=>row.id===actual.events[0].id)).toBe(false);
    expect(raw(sibling)).toBe(before);
  });

  it('rechecks the canonical world returned by both ordinary Utility and accepted cognitive JSON without replaying either one',async()=>{
    const first=createInitialWorld(1,'spirit-bloom');
    const old=makeBinding(first,actorTarget);
    const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'在各自实地等候。'};
    const choices=Object.fromEntries(first.cultivators.map(row=>[row.id,rest]));
    const utility=advanceWorldTick(first,choices,undefined,'utility');
    const fetch=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
      chosenAction:'SOCIALIZE',targetCultivatorId:targetId,innerMonologue:'去见已在本地的顾行舟。',
    })}}]})));
    vi.stubGlobal('fetch',fetch);
    try{
      const decision=await requestCultivatorLLMDecision(actor(first,viewerId),first,{
        enabled:true,model:'fixture',apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture-only',
      },first.tick+1);
      if(!decision)throw Error('Actual model parsing is required');
      expect(decision).toMatchObject({chosenAction:'SOCIALIZE',targetCultivatorId:targetId});
      const model=advanceWorldTick(first,{...choices,[viewerId]:decision},undefined,'deferred',undefined,
        {modelActors:new Set([viewerId])});
      expect(model.events.some(row=>row.tick===model.tick&&row.actorIds[0]===viewerId&&row.actorIds[1]===targetId)).toBe(true);
      for(const world of [utility,model]){
        const before=raw(world);
        expect(applyScopedMapEntityIntervention(context(world),old,'whisper',secret)).toBe(world);
        const revised=applyScopedMapEntityIntervention(context(world),makeBinding(world,actorTarget),'whisper',secret);
        expect(revised.tick).toBe(world.tick);
        expect(projectStoryHomepage(revised)).toEqual(projectStoryHomepage(world));
        expect(actor(revised,targetId).secretGoal).toBe(secret);
        expect(raw(world)).toBe(before);
      }
    }finally{vi.unstubAllGlobals();}
  });
});
