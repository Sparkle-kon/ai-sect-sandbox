import {describe,expect,it} from 'vitest';
import {projectMapSidebarDossier} from '../src/components/mapSidebarDossierModel';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {createInitialWorld} from '../src/data/initialWorld';
import {possessAvatar} from '../src/engine/avatarEngine';
import {DESTINY_TRAIT_CATALOG} from '../src/engine/destinyTraitCatalog';
import {earnedProtagonistStory,storyPerson} from './fixtures/protagonistSuccessionFixture';
import {actualDestinyTrial,destinyActor,destinyMonth} from './destinyTraitNativeFixture';
import {actualAwakenedSwordIntent,intentActor} from './swordIntentNativeFixture';

describe('map sidebar dossier from real visible scene and actor',()=>{
  it('does not confuse an arbitrary selection with a lead and discloses raw thought only to the exact live host',()=>{
    const world=createInitialWorld(77),viewer=world.cultivators[0],other=world.cultivators[1];
    viewer.innerMonologue='只在本处稍候。其他句子不要上屏。';
    viewer.secretGoal='机密志向不能入图';
    other.innerMonologue='异人密语不能入图。';
    const visible=createTerrainMapView(world,viewer,false);
    expect(projectMapSidebarDossier(world,viewer,visible,true).actor?.monologue).toBeUndefined();
    expect(possessAvatar(world,viewer.id)).toBe(true);
    const stateBefore=JSON.stringify(world);
    const read=projectMapSidebarDossier(world,viewer,visible,true);
    expect(read).toMatchObject({actor:{name:viewer.name,monologue:'只在本处稍候。'},qi:viewer.qiProgress,
      sectName:world.sects.find(sect=>sect.id===viewer.sectId)?.name,site:{target:{id:viewer.locationId}}});
    expect(read.actions).toEqual([
      {action:'lightning',target:{kind:'actor',id:viewer.id}},
      {action:'whisper',target:{kind:'actor',id:viewer.id}},
      {action:'treasure',target:{kind:'site',id:viewer.locationId}},
    ]);
    expect(JSON.stringify(read)).not.toMatch(/其他句子|机密志向|异人密语/);
    expect(projectMapSidebarDossier(world,viewer,visible,false).actor).not.toHaveProperty('monologue');
    expect(projectMapSidebarDossier(world,{...viewer},visible,true)).toEqual({destiny:[],actions:[]});
    expect(JSON.stringify(world)).toBe(stateBefore);
  });

  it('uses one genuinely earned public lead while the player reads a different real character',()=>{
    const f=earnedProtagonistStory();
    const selected=storyPerson(f.world,f.witnessId),lead=storyPerson(f.world,f.leadId);
    const view=createTerrainMapView(f.world,selected,true);
    expect(selected.name).not.toBe(lead.name);
    const read=projectMapSidebarDossier(f.world,selected,view,true);
    expect(read).toMatchObject({actor:{target:{id:selected.id}},leadName:lead.name});
    const missing=structuredClone(f.world);
    const source=missing.protagonistSuccession.arcs[0].opening[0];
    const original=missing.chronicleArchive.anchors.find(row=>row.id===source.eventId)!;
    missing.events=[{...original,witnessScope:'participants'},...missing.events];
    expect(projectMapSidebarDossier(missing,undefined,createTerrainMapView(missing,undefined,false),false))
      .not.toHaveProperty('leadName');
  });

  it('suppresses an old address and site action during a currently projected travel checkpoint',()=>{
    const world=createInitialWorld(89),viewer=world.cultivators[0];
    const view=createTerrainMapView(world,viewer,false);
    view.trailPositions.set(viewer.id,{x:441,y:309}); // UI projection fixture: native checkpoint, not old address.
    const read=projectMapSidebarDossier(world,viewer,view,false);
    expect(read.actor?.target.id).toBe(viewer.id);
    expect(read.site).toBeUndefined();
    expect(read.actions.every(({target})=>target.kind==='actor')).toBe(true);
    viewer.positionPlane='upper';
    expect(projectMapSidebarDossier(world,viewer,createTerrainMapView(world,viewer,true),true)).toEqual({destiny:[],actions:[]});
  });

  it('shows native awakened traits and earned Dao mastery, but never pending offers or private readiness',()=>{
    const {passed}=actualDestinyTrial();
    const hidden=destinyActor(passed);
    expect(hidden.destinyTraits?.pending).toBeDefined();
    expect(projectMapSidebarDossier(passed,hidden,createTerrainMapView(passed,hidden,false),false).destiny).toEqual([]);
    const advanced=destinyMonth(passed),actor=destinyActor(advanced),earned=actor.destinyTraits?.earned?.[0];
    expect(earned).toBeDefined();
    expect(projectMapSidebarDossier(advanced,actor,createTerrainMapView(advanced,actor,false),false).destiny)
      .toEqual([DESTINY_TRAIT_CATALOG[earned!.traitId].name]);
    const {ready}=actualAwakenedSwordIntent();
    const master=intentActor(ready);
    expect(master.daoPath?.ready).toBeDefined();
    const read=projectMapSidebarDossier(ready,master,createTerrainMapView(ready,master,false),false);
    expect(read.dao).toEqual({name:'剑道',rank:'初窥'});
    expect(read.artifact?.name).toBe(master.artifacts.find(item=>item.boundTo===master.id)?.name);
    expect(read.dao).not.toHaveProperty('ready');
  });
});
