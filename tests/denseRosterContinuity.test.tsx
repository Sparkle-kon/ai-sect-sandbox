import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {ActorRoster} from '../src/components/ActorRoster';
import {ACTOR_PAGE_SIZE,createActorRosterIndex,pageActorRoster,partitionActorRosterPage,rosterActorDisambiguator,selectActorRoster}
  from '../src/components/actorRosterIndex';
import {projectRosterFocalId,projectRosterStoryRead,readSelectedRosterScene,resolveRosterStoryRead} from '../src/components/rosterStoryRead';
import {createTimeline,forkTimeline,readTimelineHead,readTimelineSnapshot,recordTimelineWorld,selectTimelineBranch} from '../src/engine/timelineEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {createInitialWorld} from '../src/data/initialWorld';
import type {Cultivator,LLMDecisionPayload,WorldState} from '../src/types/world';

const STRESS_ACTORS=1307;
/** Fixed 1,307 rows for UI stress only. The native population growth proof is a separate fixture. */
function denseSyntheticRoster(){
  const world=createInitialWorld(613,'spirit-bloom'),reference=world.cultivators[0];
  for(let i=world.cultivators.length;i<STRESS_ACTORS;i++){
    const copy=structuredClone(reference);
    const living=i%5!==0;
    const row:Cultivator={...copy,id:'synthetic-roster-'+i,name:'名册压力'+String(i).padStart(4,'0'),
      alive:living,hp:living?reference.hp:0,artifacts:[],memories:[],rumors:[]};
    world.cultivators.push(row);
  }
  const focal=world.cultivators.at(-1)!,sameName=world.cultivators[700],selected=world.cultivators[1305];
  focal.name='同名修士 · 甲';sameName.name=focal.name;
  expect(focal.alive).toBe(true);
  expect(selected.alive).toBe(false);
  return {world,focal,sameName,selected};
}

describe('large synthetic roster stress (not a claim about native population or physical handset)',()=>{
  it('partitions every canonical identity exactly once per scope without conflating requested page size with population',()=>{
    const {world,focal,sameName}=denseSyntheticRoster(),index=createActorRosterIndex(world);
    const originals=world.cultivators.map(actor=>actor.id);
    expect(originals).toHaveLength(STRESS_ACTORS);
    for(const filter of ['all','living','fallen'] as const){
      const identities=world.cultivators.filter(a=>filter==='all'||a.alive===(filter==='living')).map(a=>a.id);
      const selection=selectActorRoster(index,'',filter);
      const first=pageActorRoster(selection,-400),last=pageActorRoster(selection,Number.MAX_SAFE_INTEGER);
      expect(first).toMatchObject({page:0,pages:Math.ceil(identities.length/ACTOR_PAGE_SIZE),total:identities.length});
      const pages=Array.from({length:first.pages},(_,number)=>pageActorRoster(selection,number));
      expect(pages.every(({actors})=>actors.length<=ACTOR_PAGE_SIZE)).toBe(true);
      expect(last.page).toBe(first.pages-1);
      expect(last.actors).toEqual(pages.at(-1)!.actors);
      const visited=pages.flatMap(({actors})=>actors.map(actor=>actor.id));
      expect(new Set(visited).size).toBe(identities.length);
      expect(visited).toEqual(identities);
    }
    const matched=pageActorRoster(selectActorRoster(index,'  同名修士  ','all'),888);
    expect(matched).toMatchObject({page:0,pages:1,total:2});
    expect(matched.actors).toEqual([sameName,focal]);
    expect(rosterActorDisambiguator(index,sameName)).not.toBe(rosterActorDisambiguator(index,focal));
    expect(world.cultivators.map(actor=>actor.id)).toEqual(originals);
  });

  it('keeps only the exact selected and authorized focal accessible without modifying search/page membership',()=>{
    const {world,focal,sameName,selected}=denseSyntheticRoster(),index=createActorRosterIndex(world);
    const mismatch=pageActorRoster(selectActorRoster(index,'不存在的匹配','living'),163);
    expect(mismatch).toEqual({page:0,pages:1,total:0,actors:[]});
    const pinned=partitionActorRosterPage(index,mismatch.actors,selected,focal.id);
    expect(pinned.rows).toEqual([]);
    expect(pinned.pinned).toEqual(expect.arrayContaining([
      {actor:focal,selected:false,focal:true},{actor:selected,selected:true,focal:false},
    ]));
    expect(pinned.pinned).toHaveLength(2);
    const matching=pageActorRoster(selectActorRoster(index,'同名修士','all'),0);
    const partition=partitionActorRosterPage(index,matching.actors,focal,focal.id);
    expect(partition.rows).toEqual([sameName]);
    expect(partition.pinned).toEqual([{actor:focal,selected:true,focal:true}]);
    expect(matching.total).toBe(2);
    const branch=createInitialWorld(252,'classic'),otherIndex=createActorRosterIndex(branch);
    const branchPage=pageActorRoster(selectActorRoster(otherIndex,'','all'),0);
    expect(partitionActorRosterPage(otherIndex,branchPage.actors,selected,focal.id).pinned).toEqual([]);
    expect(partitionActorRosterPage(index,[],structuredClone(selected),undefined).pinned).toEqual([]);
  });

  it('SSR retains bounded controls plus a direct focal scene and 44px minimum classes without exposing roster tail IDs',()=>{
    const {world,focal,selected}=denseSyntheticRoster();
    const scene={actorId:focal.id,eventId:'ui-only-scene',title:'验收用 · 焦点一幕'};
    const outline=renderToStaticMarkup(<ActorRoster world={world} selected={selected} focalId={focal.id} scopeKey="ssr-current-branch"
      onSelect={()=>undefined} scene={scene} onReadScene={()=>undefined} />);
    expect(outline).toContain('修士名册 · 1307 位');
    expect(outline).toContain('匹配 1307 位');
    expect(outline).toContain(focal.name);
    expect(outline).toContain(selected.name);
    expect(outline).toContain('读主角的这一幕');
    expect(outline).toContain(scene.title);
    expect(outline).not.toContain(world.cultivators[900].name);
    expect(outline).not.toContain(focal.id);
    expect(outline).not.toContain(selected.id);
    const controls=[...outline.matchAll(/<(?:button|input|select|summary)\b[^>]*>/gu)].map(entry=>entry[0]);
    expect(controls.length).toBeLessThanOrEqual(ACTOR_PAGE_SIZE+8);
    expect(controls.every(tag=>tag.includes('min-h-11'))).toBe(true);
    const noScene=renderToStaticMarkup(<ActorRoster world={world} focalId={focal.id}
      onSelect={()=>undefined} scene={{...scene,actorId:selected.id}} onReadScene={()=>undefined} />);
    expect(noScene).not.toContain('读主角的这一幕');
  });
});

const original='elder-danxia-1',partner='elder-danxia-2',otherLocal='npc-5',namesake='npc-8';
const actorAt=(world:WorldState,id:string)=>world.cultivators.find(actor=>actor.id===id)!;
function ordinarySocialMonth(world:WorldState,target=partner){
  const idle:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'只按真实月历静候。'};
  const speak:LLMDecisionPayload={chosenAction:'SOCIALIZE',targetCultivatorId:target,innerMonologue:'心思不由群像旁读。',
    spokenLine:'一壶茶，两把椅。'};
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(({id})=>[id,id===original?speak:idle])),()=>.99,
    'utility',undefined,{captureTrace:false,capturePresentation:false});
}

describe('actual generated identities and witnessed native scene allowlist',()=>{
  it('pins an earned native protagonist and opens only the chosen recent scene even when another exists',()=>{
    const seed=createInitialWorld(106,'spirit-bloom');
    const travel=(world:WorldState,targetLocationId:string)=>{
      const person=actorAt(world,original);
      expect(knownMapLocations(world,person).map(site=>site.id)).toContain(targetLocationId);
      const rested:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'原地歇息。'};
      const move:LLMDecisionPayload={chosenAction:'EXPLORE',innerMonologue:'实际出门。',targetLocationId};
      const orders=Object.fromEntries(world.cultivators.map(({id})=>[id,id===original?move:rested]));
      const next=advanceWorldTick(world,orders,()=>.01,'utility',undefined,{captureTrace:false,capturePresentation:false});
      expect(actorAt(next,original).locationId).toBe(targetLocationId);
      expect(next.events.find(row=>row.id==='evt-'+next.tick+'-'+original+'-explore')?.category).toBe('breakthrough');
      return next;
    };
    const home=actorAt(seed,original).locationId;
    expect(projectRosterFocalId(seed)).toBeUndefined();
    const away=travel(seed,'loc-market'),returned=travel(away,home);
    const earned=ordinarySocialMonth(ordinarySocialMonth(returned));
    const focalId=projectRosterFocalId(earned);
    expect(focalId).toBe(original);
    const mobile='main:people',stamp=projectRosterStoryRead(earned,mobile,focalId)!;
    expect(stamp).toBeDefined();
    const visual=renderToStaticMarkup(<ActorRoster world={earned} focalId={focalId} onSelect={()=>undefined}
      scene={stamp.scene} onReadScene={()=>undefined} scopeKey={mobile} />);
    expect(visual).toContain('读主角的这一幕');
    expect(visual).toContain('坐而论道');
    const subsequent=ordinarySocialMonth(earned);
    const newest=projectRosterStoryRead(subsequent,mobile,focalId)!;
    expect(newest.scene.eventId).not.toBe(stamp.scene.eventId);
    expect(readSelectedRosterScene(subsequent,original,stamp.scene.eventId)?.scenes.map(scene=>scene.eventId)).toEqual([stamp.scene.eventId]);
    // Controlled retention-loss negative: no substituting the newer native scene for the one actually requested.
    subsequent.events=subsequent.events.filter(event=>event.id!==stamp.scene.eventId);
    expect(readSelectedRosterScene(subsequent,original,stamp.scene.eventId)?.scenes).toEqual([]);
    expect(projectRosterStoryRead(subsequent,mobile,focalId)?.scene.eventId).toBe(newest.scene.eventId);
  });

  it('reads exactly the witnessed native scene in the same branch/snapshot, never a later or foreign same-event scene',()=>{
    const seed=createInitialWorld(106,'spirit-bloom'),timeline=createTimeline(seed);
    const mainWorld=ordinarySocialMonth(seed),mainTimeline=recordTimelineWorld(timeline,mainWorld);
    const head=readTimelineHead(mainTimeline)!;
    const past=readTimelineSnapshot(mainTimeline,seed.tick)!;
    const eventId='evt-'+head.tick+'-'+original+'-social',token=projectRosterStoryRead(head,'main:live',original);
    expect(head.events.find(row=>row.id===eventId)?.actorIds).toEqual([original,partner]);
    expect(token?.scene).toMatchObject({actorId:original,eventId});
    const read=resolveRosterStoryRead(head,'main:live',token!);
    expect(read?.actorId).toBe(original);
    expect(read?.scenes).toHaveLength(1);
    expect(read?.scenes[0]).toMatchObject({eventId,title:'坐而论道'});
    expect(JSON.stringify(read)).not.toContain('心思不由群像旁读。');
    expect(JSON.stringify(read)).not.toContain('一壶茶，两把椅。');
    expect(projectRosterStoryRead(past,'main:historical',original)).toBeUndefined();
    expect(resolveRosterStoryRead(past,'main:historical',token!)).toBeUndefined();
    expect(resolveRosterStoryRead(head,'main:historical',token!)).toBeUndefined(); // same native date, different surface scope
    expect(resolveRosterStoryRead(structuredClone(head),'main:live',token!)).toBeUndefined(); // no object identity replay
    expect(resolveRosterStoryRead(ordinarySocialMonth(head),'main:live',token!)).toBeUndefined(); // stale even with old source retained

    const fork=forkTimeline(mainTimeline,seed.tick,{type:'WHISPER_MIND',targetCultivatorId:original,whisperText:'分岔时静候。'},'异支');
    const forkId=fork.activeBranchId;
    const alternate=recordTimelineWorld(fork,ordinarySocialMonth(readTimelineHead(fork)!,otherLocal));
    const other=readTimelineHead(alternate)!;
    expect(other.tick).toBe(head.tick);
    expect(other.events.find(row=>row.id===eventId)?.actorIds).toEqual([original,otherLocal]);
    expect(projectRosterStoryRead(other,forkId+':live',original)?.scene.eventId).toBe(eventId);
    expect(resolveRosterStoryRead(other,forkId+':live',token!)).toBeUndefined();
    expect(resolveRosterStoryRead(other,'main:live',token!)).toBeUndefined();
    expect(readTimelineHead(selectTimelineBranch(alternate,'main'))!.events.find(row=>row.id===eventId)?.actorIds).toEqual([original,partner]);
  });

  it('does not substitute an actual but unwitnessing same-name actor, a look-alike source, or duplicate proof',()=>{
    const base=createInitialWorld(106,'spirit-bloom');
    // Only display text changes in this explicitly controlled identity-negative fixture.
    actorAt(base,namesake).name=actorAt(base,original).name;
    expect(actorAt(base,namesake).locationId).not.toBe(actorAt(base,original).locationId);
    const world=ordinarySocialMonth(base),scope='same-name-control';
    expect(actorAt(world,namesake).name).toBe(actorAt(world,original).name);
    const stamp=projectRosterStoryRead(world,scope,original)!;
    expect(stamp).toBeDefined();
    expect(projectRosterStoryRead(world,scope,namesake)).toBeUndefined();
    expect(resolveRosterStoryRead(world,scope,{...stamp,scene:{...stamp.scene,actorId:namesake}})).toBeUndefined();
    expect(resolveRosterStoryRead(world,scope,{...stamp,scene:{...stamp.scene,title:'换一段标题'}})).toBeUndefined();
    const duplicateIdentity=structuredClone(world);
    duplicateIdentity.cultivators.push(structuredClone(actorAt(duplicateIdentity,original)));
    expect(projectRosterStoryRead(duplicateIdentity,scope,original)).toBeUndefined();
    const duplicate=structuredClone(world);
    duplicate.events.push(structuredClone(duplicate.events.find(row=>row.id===stamp.scene.eventId)!));
    expect(projectRosterStoryRead(duplicate,scope,original)).toBeUndefined();
    const duplicatedWitness=structuredClone(world);
    duplicatedWitness.witnessedPersonalStory.scenes.push(structuredClone(duplicatedWitness.witnessedPersonalStory.scenes[0]));
    expect(projectRosterStoryRead(duplicatedWitness,scope,original)).toBeUndefined();
    const archivedOnly=structuredClone(world);
    archivedOnly.events=archivedOnly.events.filter(row=>row.id!==stamp.scene.eventId);
    expect(archivedOnly.witnessedPersonalStory.scenes.some(row=>row.eventId===stamp.scene.eventId)).toBe(true);
    expect(projectRosterStoryRead(archivedOnly,scope,original)).toBeUndefined();
    const future=structuredClone(world);
    future.tick=base.tick;
    expect(projectRosterStoryRead(future,scope,original)).toBeUndefined();
    const dead=structuredClone(world);
    Object.assign(actorAt(dead,original),{alive:false,hp:0});
    expect(projectRosterStoryRead(dead,scope,original)).toBeUndefined();
  });
});
