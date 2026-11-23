import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {projectCultivatorPortrait} from '../src/components/cultivatorPortraitModel';
import {projectSceneStage} from '../src/components/sceneStageModel';
import {createInitialWorld} from '../src/data/initialWorld';
import {projectStoryHomepage} from '../src/engine/storyHomepage';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {availableRelocationActions,resolveRelocationAction} from '../src/engine/relocationEngine';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldEvent,WorldState} from '../src/types/world';

const actorId='elder-danxia-2';
const nativeMonth=()=>{
  let world=createInitialWorld();
  for(let i=0;i<4;i++)world=advanceWorldTick(world);
  const cover=projectStoryHomepage(world);
  const event=world.events.find(row=>row.id===cover.scene?.eventId);
  if(!event) throw new Error('Expected the public seeded Danxia herb harvest');
  return {world,cover,event};
};

const neutral=(world:WorldState,eventId:string,viewer?:WorldState['cultivators'][number])=>{
  const frame=projectSceneStage(world,{eventId,viewer,leadId:actorId});
  expect(frame.siteName).toBeUndefined();
  expect(frame.cast).toEqual([]);
  expect(frame.portrait).toBeUndefined();
};

describe('illustrated stage uses the native proven scene',()=>{
  it('illustrates the exact native Danxia harvest and earned lead without saving appearance or copying unrelated people',()=>{
    const {world,cover,event}=nativeMonth();
    const before=JSON.stringify(world);
    expect(event).toMatchObject({id:'evt-5-elder-danxia-2-alchemy',locationId:'loc-danxia',tick:world.tick});
    expect(cover.lead?.id).toBe(actorId);
    const subject=world.cultivators.find(row=>row.id===actorId)!;
    const stage=projectSceneStage(world,{eventId:event.id,leadId:cover.lead?.id});
    expect(stage.siteName).toBe(world.locations.find(row=>row.id===event.locationId)?.name);
    expect(stage.cast).toContainEqual(expect.objectContaining({
      id:actorId,pose:'labor',
      appearance:{...projectCultivatorPortrait(world,subject),locale:{theme:'pill_valley',season:'spring'}},
    }));
    expect(stage.portrait).toMatchObject({id:actorId,name:subject.name,realm:subject.realm});
    expect(stage.cast.every(({id})=>world.cultivators.some(row=>row.id===id&&row.alive&&row.hp>0&&row.locationId===event.locationId))).toBe(true);
    expect(projectSceneStage(world,{eventId:event.id,leadId:actorId})).toEqual(stage);
    expect(JSON.stringify(world)).toBe(before);
  });

  it('draws the same current local result for exact ordinary action and validated model-tagged execution',async()=>{
    let start=createInitialWorld();
    for(let i=0;i<3;i++)start=advanceWorldTick(start);
    const source=JSON.stringify(start);
    const choice:LLMDecisionPayload={chosenAction:'GATHER_HERBS',targetHerbId:'earth_root',innerMonologue:'测试不得公开的思量'};
    const decisions={[actorId]:choice};
    const utility=advanceWorldTick(start,decisions);
    llmScheduler.resetTickBudget();
    const provider=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(choice)}}]})));
    vi.stubGlobal('fetch',provider);
    let model:LLMDecisionPayload|undefined;
    try{
      model=await requestCultivatorLLMDecision(start.cultivators.find(row=>row.id===actorId)!,start,
        {enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture-only',model:'fixture'},start.tick+1);
      expect(provider).toHaveBeenCalledTimes(1);
      expect(model).toMatchObject(choice);
    }finally{vi.unstubAllGlobals();llmScheduler.resetTickBudget();}
    if(!model)throw new Error('Cognitive parser did not return the exact ordinary gather action');
    const cognitive=advanceWorldTick(start,{[actorId]:model},undefined,'deferred',undefined,{modelActors:new Set([actorId])});
    const find=(world:WorldState)=>world.events.find(({id})=>id==='evt-5-elder-danxia-2-alchemy');
    expect(find(utility)).toMatchObject({locationId:'loc-danxia',actorIds:[actorId]});
    expect(find(cognitive)).toMatchObject({locationId:'loc-danxia',actorIds:[actorId]});
    const options={eventId:find(utility)?.id,leadId:actorId};
    const stage=projectSceneStage(utility,options);
    expect(stage).toEqual(projectSceneStage(cognitive,options));
    expect(JSON.stringify(stage)).not.toContain(choice.innerMonologue);
    expect(JSON.stringify(start)).toBe(source);
  });

  it('fails closed for unknown, duplicate, private, impossible-date and off-plane scenes even with a known lead',()=>{
    const {world,event}=nativeMonth();
    neutral(world,'forged-opaque-event');
    const variants: WorldEvent[]=[
      {...event,id:'private-stage-event',witnessScope:'participants'},
      {...event,id:'wrong-month-stage-event',month:event.month===12?11:event.month+1},
      {...event,id:'future-stage-event',tick:event.tick+1},
      {...event,id:'upper-stage-event',locationId:'upper-impossible-site'},
      {...event,id:'secret-stage-event',locationId:'loc-secret-1'},
    ];
    const next={...world,events:[...world.events,...variants,{...event}]};
    for(const id of [...variants.map(row=>row.id),event.id])neutral(next,id);
  });

  it('does not mistake old or unseen terrain for a current witnessed cast or force an opening protagonist',()=>{
    const opening=createInitialWorld(1872);
    const initial=projectStoryHomepage(opening);
    expect(initial.lead).toBeUndefined();
    const openingFrame=projectSceneStage(opening,{eventId:initial.scene?.eventId});
    expect(openingFrame).toMatchObject({establishing:true,siteId:'loc-taixu',season:'spring',
      cast:[{id:'npc-1'}],portrait:{id:'npc-1'}});
    const original=opening.events.find(row=>row.id===initial.scene?.eventId)!;
    const altered={...opening,events:opening.events.map(row=>row===original?{...row,title:'冒充的开场'}:row)};
    neutral(altered,original.id);
    const remote=opening.cultivators.find(row=>row.id==='npc-6')!;
    neutral(opening,original.id,remote);
    expect(projectSceneStage(opening,{eventId:original.id,historical:true})).toMatchObject({historical:true,cast:[]});

    const {world,event}=nativeMonth();
    const away=world.cultivators.find(row=>row.id==='npc-3')!;
    expect(away.locationId).not.toBe(event.locationId);
    neutral(world,event.id,away);
    const lower=world.cultivators.find(row=>row.id===actorId)!;
    expect(projectSceneStage(world,{historical:true,viewer:lower,localSceneActor:lower}).siteId).toBeUndefined();
    neutral(world,event.id,{...lower,positionPlane:'immortal'});
    const historical=projectSceneStage(world,{eventId:event.id,leadId:actorId,historical:true});
    expect(historical).toMatchObject({historical:true,cast:[]});
    expect(historical.portrait).toBeUndefined();
    expect(projectSceneStage(world,{leadId:actorId,historical:true})).toMatchObject({historical:true,cast:[]});
  });

  it('never draws an actual departing convoy at its stale formally recorded origin',()=>{
    // Damaged array / known destination are declared portable preconditions; voting, payment and departure are native.
    const start=createInitialWorld(51);
    start.tick=8;
    start.month=8;
    const sect=start.sects[0];
    const origin=start.locations.find(row=>row.id===sect.headquartersId)!;
    const destination=start.locations.find(row=>row.id==='loc-vein-north')!;
    const leader=start.cultivators.find(row=>row.id===sect.leaderId)!;
    const tile=terrainTileAt(start,destination.x,destination.y)!;
    delete destination.ownerSectId;
    delete tile.ownerSectId;
    leader.exploredTileIds.push(tile.id);
    leader.qiProgress=20;
    for(const actor of start.cultivators.filter(row=>row.sectId===sect.id)){
      actor.locationId=origin.id;
      actor.hp=actor.maxHp;
    }
    sect.facilities.defense_array=2;
    sect.arrayMaxHp=400;
    sect.arrayHp=0;
    origin.herbs.earth_root=Math.max(2,origin.herbs.earth_root);
    const rest=(world:WorldState):Record<string,LLMDecisionPayload>=>Object.fromEntries(
      world.cultivators.map(row=>[row.id,{chosenAction:'REST',innerMonologue:'等待实际迁宗'}]));
    const opening=advanceWorldTick(start,{...rest(start),[leader.id]:{chosenAction:'RELOCATE',
      relocationMove:'propose',targetLocationId:destination.id,innerMonologue:'申请迁宗'}},()=>.99);
    const vote=opening.relocations.plans[0];
    expect(vote.status).toBe('voting');
    for(const id of vote.voterIds.filter(id=>id!==leader.id)){
      const voter=opening.cultivators.find(row=>row.id===id)!;
      const accept=availableRelocationActions(voter,opening).find(row=>row.relocationMove==='approve')!;
      expect(resolveRelocationAction(opening,voter,{...accept,chosenAction:'RELOCATE',innerMonologue:'同意迁宗'})).not.toBeNull();
    }
    const leaving=advanceWorldTick(opening,rest(opening),()=>.99);
    const convoy=leaving.relocations.plans[0];
    const event=leaving.events.find(row=>row.id===`evt-${leaving.tick}-${convoy.id}-departed`)!;
    expect(convoy).toMatchObject({status:'in_transit',spent:true,garrisonIds:expect.arrayContaining([leader.id])});
    expect(event).toMatchObject({locationId:origin.id,actorIds:convoy.garrisonIds});
    expect(leaving.cultivators.find(row=>row.id===leader.id)?.locationId).toBe(origin.id);
    const stage=projectSceneStage(leaving,{eventId:event.id});
    expect(stage).toMatchObject({theme:'sword_peak',siteName:origin.name,cast:[]});
    expect(stage.portrait).toBeUndefined();
  });

  it('keeps native reading and primary controls as ordinary semantic SSR, with or without illustration',async()=>{
    const [{CockpitStoryStage},{StoryFirstHome}]=await Promise.all([
      import('../src/components/CockpitStoryStage'),import('../src/components/StoryFirstHome'),
    ]);
    const {world,cover}=nativeMonth();
    const noop=vi.fn();
    const cockpit=renderToStaticMarkup(<CockpitStoryStage world={world} onFocus={noop}/>);
    expect(cockpit).toContain('读本月一幕：叶连翘采集灵草');
    expect(cockpit).toContain('主角：叶连翘');
    expect(cockpit).toContain('data-scene-stage');
    expect(cockpit).toContain('data-stage-portrait');
    const home=renderToStaticMarkup(<StoryFirstHome scene={cover.scene} leadName={cover.lead?.name}
      stageWorld={world} leadId={cover.lead?.id} onMore={noop} onContinue={noop}/>);
    expect(home.match(/<article\b/g)).toHaveLength(1);
    expect(home).toContain('aria-label="当前故事"');
    expect(home).toContain('叶连翘采集灵草');
    expect(home).toContain('走进故事');
    expect(home).toContain('看下个月');
    expect(home).toContain('每次只过一月');
    expect(home).toContain('data-scene-stage');
    expect(home).toContain('data-stage-portrait');
    expect(home).toMatch(/<canvas[^>]+aria-hidden="true"/);
    const plain=renderToStaticMarkup(<StoryFirstHome scene={cover.scene} onMore={noop} onContinue={noop}/>);
    expect(plain).toContain('叶连翘采集灵草');
    expect(plain).toContain('看下个月');
    expect(plain).not.toContain('data-scene-stage');
    expect(noop).not.toHaveBeenCalled();
  });
});
