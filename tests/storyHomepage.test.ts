import {describe,expect,it} from 'vitest';
import {projectStoryHomepage} from '../src/engine/storyHomepage';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {earnedProtagonistStory,storyPerson} from './fixtures/protagonistSuccessionFixture';
import {createInitialWorld} from '../src/data/initialWorld';
import {publicDialogueProofFixture} from './fixtures/publicDialogueFixture';
import {playWitnessedPersonalScene,witnessedPersonalStoryFixture} from './fixtures/witnessedPersonalStoryFixture';

describe('compact exact native story homepage',()=>{
  it('introduces a fresh world using the existing factual opening scene and world calendar only',()=>{
    const world=createInitialWorld(1872),before=JSON.stringify(world);
    const cover=projectStoryHomepage(world);
    expect(cover.calendar).toEqual({year:world.year,month:world.month,tick:world.tick});
    expect(cover.scene).toMatchObject({title:'陨仙墟异动',paragraph:expect.stringContaining('墟中灵气骤盛'),earlier:false});
    expect(cover.lead).toBeUndefined();
    expect(JSON.stringify(world)).toBe(before);
  });

  it('presents the actual native current scene in fiction, not its dialogue, other date, or private competing entries',()=>{
    const {world,event}=publicDialogueProofFixture();
    const past={...event,id:'prior-scene',tick:event.tick-1,title:'旧章不顶替今天'};
    const hidden={...event,id:'private-scene',witnessScope:'participants' as const,title:'私人内容禁止显示'};
    const wrongMonth={...event,id:'foreign-calendar',month:event.month+1,title:'不同月份不算今日'};
    world.events.push(past,hidden,wrongMonth);
    const cover=projectStoryHomepage(world);
    expect(cover.scene?.eventId).toBe(event.id);
    const text=JSON.stringify(cover);
    expect(text).not.toContain(event.dialogue!.turns[0].text);
    for(const excluded of [past.title,hidden.title,wrongMonth.title])expect(text).not.toContain(excluded);
    expect(cover.scene?.earlier).toBe(false);
  });

  it('uses the ordinary seeded Utility step and never offers an earlier scene as the current one',()=>{
    const initial=createInitialWorld(1872);
    let next=advanceWorldTick(initial),again=advanceWorldTick(structuredClone(initial));
    for(let count=0;count<6&&projectStoryHomepage(next).scene?.earlier!==false;count++){
      next=advanceWorldTick(next);
      again=advanceWorldTick(again);
    }
    const cover=projectStoryHomepage(next);
    expect(cover).toEqual(projectStoryHomepage(again));
    expect(cover.calendar.tick).toBeGreaterThan(initial.tick);
    expect(cover.scene?.earlier).toBe(false);
    expect(next.events.find(row=>row.id===cover.scene?.eventId)?.tick).toBe(next.tick);
    expect(cover.scene?.eventId).not.toBe('evt-init-1');
  });

  it('explicitly labels quiet-turn context as earlier and does not keep a stale last scene forever',()=>{
    const world=createInitialWorld(1872);
    world.tick+=1;
    expect(projectStoryHomepage(world).scene).toMatchObject({title:'陨仙墟异动',earlier:true});
    world.tick+=6;
    expect(projectStoryHomepage(world).scene).toBeUndefined();
  });

  it('introduces the default world’s own lead only after four canonical player-paced turns',()=>{
    let world=createInitialWorld();
    const openingTick=world.tick;
    for(let i=0;i<4;i++){
      expect(world.tick).toBe(openingTick+i);
      expect(projectStoryHomepage(world).lead).toBeUndefined();
      world=advanceWorldTick(world);
    }
    const cover=projectStoryHomepage(world);
    expect(world.tick).toBe(openingTick+4);
    // The ordinary-choice rules evolve who earns the seat; there is still no preset protagonist.
    expect(cover.lead).toEqual({name:'叶连翘'});
    expect(cover.scene).toMatchObject({earlier:false,eventId:'evt-5-elder-danxia-2-alchemy',title:'叶连翘采集灵草'});
  });

  it('shows a previously earned active character, not a provisional scorer or dead name',()=>{
    const {world,leadId}=earnedProtagonistStory();
    expect(projectStoryHomepage(world).lead).toEqual({name:storyPerson(world,leadId).name});
    storyPerson(world,leadId).alive=false;
    expect(projectStoryHomepage(world).lead).toBeUndefined();
  });

  it('strips unstructured speech and suppresses exact conflicting scene IDs rather than choosing a neighbor',()=>{
    const f=witnessedPersonalStoryFixture(),{world,event}=playWitnessedPersonalScene(f.world,f.actorId,f.firstId);
    expect(JSON.stringify(projectStoryHomepage(world))).not.toContain('记在原事件但不加入亲历视角');
    world.events=world.events.filter(row=>row.tick!==world.tick||row.id===event.id);
    world.events.push({...event,description:'不能合并的重复原始事件'});
    expect(projectStoryHomepage(world).scene?.eventId).not.toBe(event.id);
  });
});
