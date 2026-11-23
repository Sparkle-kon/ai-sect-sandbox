import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {CultivatorPortrait} from '../src/components/CultivatorPortrait';
import {PortraitHairBack,PortraitHairFront} from '../src/components/cultivatorPortraitArtwork';
import {projectCultivatorPortrait,projectMapCultivatorPortrait} from '../src/components/cultivatorPortraitModel';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {createInitialWorld} from '../src/data/initialWorld';
import {activeAvatar} from '../src/engine/avatarEngine';
import {activeHeartDemon,isHeartDemonGuided,releaseGuidedHeartDemon} from '../src/engine/heartDemonEngine';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {Cultivator,LLMDecisionPayload,WorldState} from '../src/types/world';
import {actualDestinyOrdinary,destinyActor} from './destinyTraitNativeFixture';
import {dialogueProofBase} from './fixtures/publicDialogueFixture';
import {actualNativeHeartFrame,trialActor} from './heartDemonNativeFixture';

const body=(world:WorldState,id='npc-1')=>world.cultivators.find(row=>row.id===id)!;
const render=(portrait:NonNullable<ReturnType<typeof projectCultivatorPortrait>>)=>renderToStaticMarkup(
  <CultivatorPortrait portrait={portrait} presentation="stage"/>,
);
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'依真实近况休息。'};
function idle(world:WorldState){return Object.fromEntries(world.cultivators.map(row=>[row.id,rest]));}
const localPortrait=(world:WorldState,actor:Cultivator,observer=actor)=>
  projectMapCultivatorPortrait(world,createTerrainMapView(world,observer,true),actor,{contextual:true});
const config={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture-only',model:'fixture'};
async function promptFor(world:WorldState,actor:Cultivator,reply:LLMDecisionPayload){
  llmScheduler.resetTickBudget();
  const mocked=vi.fn(async(_url:RequestInfo|URL,_options?:RequestInit)=>new Response(JSON.stringify({
    choices:[{message:{content:JSON.stringify(reply)}}],
  })));
  vi.stubGlobal('fetch',mocked);
  try{
    const decision=await requestCultivatorLLMDecision(actor,world,config,world.tick+1);
    expect(mocked).toHaveBeenCalledTimes(1);
    return {payload:String(mocked.mock.calls[0]?.[1]?.body),decision};
  }finally{vi.unstubAllGlobals();llmScheduler.resetTickBudget();}
}

describe('native layered portrait scope and expression',()=>{
  it('keeps simultaneous private heart, public and old illustrations separate for the exact same person',async()=>{
    const {frame,trial}=actualNativeHeartFrame();
    const actor=trialActor(frame);
    const authentic=activeHeartDemon(frame,actor)!;
    expect(activeAvatar(frame)).toBeUndefined();
    expect(isHeartDemonGuided(frame,actor,authentic)).toBe(true);
    const before=encodeEraWorldSave(frame);
    const currentPrivate=projectCultivatorPortrait(frame,actor,{viewer:actor,allowPersonal:true})!;
    const forPublic=projectCultivatorPortrait(frame,actor)!;
    const historical=projectCultivatorPortrait(frame,actor,{viewer:actor,allowPersonal:true,historical:true})!;
    const outsider=body(frame,'npc-3');
    const unauthorized=projectCultivatorPortrait(frame,actor,{viewer:outsider,allowPersonal:true})!;
    const counterfeit=projectCultivatorPortrait(frame,actor,{viewer:{...actor},allowPersonal:true})!;
    expect(currentPrivate.expression).toBe('demon');
    expect(forPublic.expression??'calm').toBe('calm');
    expect(historical.expression??'calm').toBe('calm');
    expect(unauthorized.expression??'calm').toBe('calm');
    expect(counterfeit.expression??'calm').toBe('calm');
    expect(localPortrait(frame,actor)?.expression).not.toBe('demon');
    expect([forPublic,historical,unauthorized,counterfeit].map(row=>row.face))
      .toEqual(Array.from({length:4},()=>currentPrivate.face));
    expect(render(currentPrivate)).not.toBe(render(forPublic));
    const together=renderToStaticMarkup(<main>
      <section data-view="private"><CultivatorPortrait portrait={currentPrivate} presentation="stage"/></section>
      <section data-view="public"><CultivatorPortrait portrait={forPublic} presentation="stage"/></section>
      <section data-view="historical"><CultivatorPortrait portrait={historical} presentation="stage"/></section>
    </main>);
    expect(together.match(/<svg\b/g)).toHaveLength(3);
    expect(together).toContain(`<section data-view="private">${render(currentPrivate)}</section>`);
    expect(together).toContain(`<section data-view="public">${render(forPublic)}</section>`);
    expect(together).toContain(`<section data-view="historical">${render(historical)}</section>`);
    expect(render(currentPrivate)).toContain('data-portrait-expression="demon"');
    expect(render(forPublic)).toContain('data-portrait-expression="calm"');
    expect(render(historical)).not.toContain('data-portrait-expression="demon"');
    const released=releaseGuidedHeartDemon(frame,actor.id,trial.id);
    expect(released).not.toBe(frame);
    const now=body(released,actor.id);
    expect(isHeartDemonGuided(released,now,activeHeartDemon(released,now)!)).toBe(false);
    expect(projectCultivatorPortrait(released,now,{viewer:now,allowPersonal:true})?.expression).not.toBe('demon');
    expect(render(projectCultivatorPortrait(released,now)!)).toBe(render(forPublic));
    expect(localPortrait(released,now)).toEqual(localPortrait(frame,actor));
    const beforePrompt=await promptFor(frame,outsider,rest);
    const afterPrompt=await promptFor(released,body(released,outsider.id),rest);
    expect(beforePrompt.payload).toBe(afterPrompt.payload);
    for(const token of ['hairStyle','accessoryStyle','portrait-expression','"expression":"demon"',authentic.id])
      expect(beforePrompt.payload).not.toContain(token);
    expect(encodeEraWorldSave(frame)).toBe(before);
  });

  it('shares exactly one fighting expression across the same confirmed native Utility and Cognitive contest',async()=>{
    const {world:start,actorId,firstId}=dialogueProofBase();
    const choice:LLMDecisionPayload={chosenAction:'DUEL',targetCultivatorId:firstId,
      innerMonologue:'我的内心不应着色他人的肖像。',spokenLine:'此处作证。'};
    const {decision}=await promptFor(start,body(start,actorId),choice);
    expect(decision).toMatchObject({chosenAction:'DUEL',targetCultivatorId:firstId});
    if(!decision)throw new Error('Native model must validate the exact physically present target');
    const trial=(pick:LLMDecisionPayload,modelActors?:ReadonlySet<string>)=>
      advanceWorldTick(start,{...idle(start),[actorId]:pick},()=>.5,modelActors?'deferred':'utility',undefined,{modelActors});
    const utility=trial(choice),cognitive=trial(decision,new Set([actorId]));
    const facts=(world:WorldState)=>world.events.find(row=>row.id===`evt-${world.tick}-${actorId}-duel`)!;
    for(const world of [utility,cognitive])expect(facts(world))
      .toMatchObject({category:'combat',actorIds:[actorId,firstId],locationId:'loc-market'});
    const viewer=body(utility,actorId),model=body(cognitive,actorId);
    for(const id of [actorId,firstId]){
      const a=body(utility,id),b=body(cognitive,id);
      const first=projectCultivatorPortrait(utility,a,{viewer,publicEventId:facts(utility).id})!;
      const second=projectCultivatorPortrait(cognitive,b,{viewer:model,publicEventId:facts(cognitive).id})!;
      expect(first.expression).toBe('fight');
      expect(second).toEqual(first);
      expect(localPortrait(utility,a,viewer)?.expression).toBe('fight');
      expect(render(second)).toBe(render(first));
      expect(render(first)).toContain('data-portrait-expression="fight"');
      expect(render(first)).not.toContain(choice.innerMonologue);
      const scopedEvent={...facts(utility),witnessScope:'participants' as const};
      const denied={...utility,events:utility.events.map(row=>row.id===scopedEvent.id?scopedEvent:row)};
      expect(projectCultivatorPortrait(denied,a,{viewer,publicEventId:scopedEvent.id})?.expression).not.toBe('fight');
    }
  });

  it('shows the genuine breakthrough and native injury but not a false old triumph or another plane',()=>{
    const {initial,advanced}=actualDestinyOrdinary();
    const original=destinyActor(initial),subject=destinyActor(advanced);
    const event=advanced.events.find(row=>row.tick===advanced.tick&&row.category==='breakthrough'&&row.actorIds.includes(subject.id))!;
    expect(event).toMatchObject({locationId:subject.locationId});
    const calm=projectCultivatorPortrait(initial,original)!;
    const joy=projectCultivatorPortrait(advanced,subject,{viewer:subject,publicEventId:event.id})!;
    expect(joy.expression).toBe('joy');
    expect(render(joy)).toContain('data-portrait-expression="joy"');
    expect(joy.face).toEqual(calm.face);
    const past=advanceWorldTick(advanced,idle(advanced),()=>.99);
    expect(projectCultivatorPortrait(past,body(past),{viewer:body(past),publicEventId:event.id})?.expression).not.toBe('joy');

    const source=createInitialWorld(1);
    const threatened=body(source),site=source.locations.find(row=>row.id===threatened.locationId)!;
    let hurt=source;
    for(let i=0;i<3;i++)hurt=applyMapBrush(hurt,'meteor',[site]);
    const harmed=body(hurt,threatened.id);
    expect(harmed.alive&&harmed.hp/harmed.maxHp<.45).toBe(true);
    expect(hurt.events.some(row=>row.damage?.some(({cultivatorId,amount})=>cultivatorId===harmed.id&&amount>0))).toBe(true);
    const wounded=localPortrait(hurt,harmed)!;
    expect(wounded.expression).toBe('wounded');
    expect(render(wounded)).toContain('data-portrait-expression="wounded"');
    expect(wounded.face).toEqual(projectCultivatorPortrait(source,threatened)?.face);
    expect(localPortrait(hurt,harmed,body(hurt,'npc-3'))).toBeUndefined();
    const bytes=encodeEraWorldSave(hurt);
    const restored=decodeEraWorldSave(bytes);
    expect(encodeEraWorldSave(restored)).toBe(bytes);
    expect(localPortrait(restored,body(restored))).toEqual(wounded);
  });

  it('changes the locale only after the same person really travels and the same calendar naturally changes season',()=>{
    const world=createInitialWorld(1);
    const actor=body(world);
    const first=localPortrait(world,actor)!;
    expect(first.locale).toEqual({theme:'sword_peak',season:'winter'});
    const arrived=advanceWorldTick(world,{...idle(world),[actor.id]:{chosenAction:'EXPLORE',
      targetLocationId:'loc-market',innerMonologue:'到坊市亲眼看灯。'}},()=>.99);
    const next=body(arrived,actor.id);
    expect(next.locationId).toBe('loc-market');
    expect(arrived.mapPresentation?.trails.some(row=>row.cultivatorId===actor.id&&row.toLocationId===next.locationId)).toBe(true);
    const market=localPortrait(arrived,next)!;
    expect(market.locale).toEqual({theme:'market',season:'winter'});
    expect(market.face).toEqual(first.face);
    const spring=advanceWorldTick(arrived,idle(arrived),()=>.99);
    const inSpring=localPortrait(spring,body(spring,actor.id))!;
    expect(inSpring.locale).toEqual({theme:'market',season:'spring'});
    expect(inSpring.hairStyle).toBe(first.hairStyle);
    expect(render(inSpring)).not.toBe(render(first));
    expect(projectCultivatorPortrait(spring,body(spring,actor.id),{historical:true})?.locale).toBeUndefined();
  });

  it('uses all twelve stable actual seeded hairstyle identities independent of names, render order, or concurrent mounts',()=>{
    const samples=new Map<number,NonNullable<ReturnType<typeof projectCultivatorPortrait>>>();
    for(let seed=1;seed<=24&&samples.size<12;seed++){
      const world=createInitialWorld(seed);
      const before=JSON.stringify(world.random);
      const portraits=world.cultivators.flatMap(actor=>{
        const portrait=projectCultivatorPortrait(world,actor);
        return portrait?[{actor,portrait}]:[];
      });
      const renamed=structuredClone(world);
      renamed.cultivators.reverse();
      for(const actor of renamed.cultivators)actor.name='同名试人';
      for(const {actor,portrait} of portraits){
        const again=projectCultivatorPortrait(renamed,body(renamed,actor.id))!;
        expect(again.face).toEqual(portrait.face);
        expect(again.hairStyle).toBe(portrait.hairStyle);
        if(portrait.hairStyle!==undefined)samples.set(portrait.hairStyle,portrait);
      }
      expect(JSON.stringify(world.random)).toBe(before);
    }
    expect([...samples.keys()].sort((a,b)=>a-b)).toEqual(Array.from({length:12},(_,i)=>i));
    const rendered=[...samples.values()].map(render);
    const hairPath=(portrait:NonNullable<ReturnType<typeof projectCultivatorPortrait>>)=>
      Array.from(renderToStaticMarkup(<svg><PortraitHairBack portrait={portrait}/><PortraitHairFront portrait={portrait}/></svg>)
        .matchAll(/<path d="([^"]+)"/g),match=>match[1]).join('|');
    const shapes=[...samples.values()].map(hairPath);
    expect(shapes.every(Boolean)).toBe(true);
    expect(new Set(shapes).size).toBe(12);
    for(const html of rendered){
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('focusable="false"');
      expect(html).not.toContain('同名试人');
    }
  });
});
