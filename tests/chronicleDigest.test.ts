import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { projectChronicleDigest } from '../src/engine/chronicleDigest';
import { archiveChronicleEvents, availableChronicleChapter, resolveChronicleChapter } from '../src/engine/novelGenerator';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';

function storyFixture() {
  const world = createInitialWorld(4068);
  const [actor,viewer] = world.cultivators;
  world.events = [];
  world.chronicleArchive.anchors = [];
  world.tick = 5;
  actor.qiProgress = 100;
  actor.realmStage = 1;
  const result = applyCultivatorBrainDecision(world,actor,{chosenAction:'BREAKTHROUGH',innerMonologue:'渐见玄关'},()=>0)!;
  expect(result).toBeDefined();
  world.events.push(result);
  archiveChronicleEvents(world,[result]);
  world.tick = 7;
  const chapter = resolveChronicleChapter(world,availableChronicleChapter(world,true)!)!;
  expect(chapter.anchors).toHaveLength(1);
  return {world,viewer,chapter,result};
}

describe('on-demand chronology topic reading',()=>{
  it('reuses an exact chapter fact without changing the branch or treating old prose as proof',()=>{
    const {world,viewer,chapter,result}=storyFixture();
    chapter.body = '未经证实的旧稿，不能拿来作摘要凭证。';
    const before = JSON.stringify(world);
    const scenes = projectChronicleDigest(world,viewer.id,'chapters');
    expect(scenes).toMatchObject([{id:result.id,topic:'chapters',group:'破境与机缘',tick:result.tick,
      proof:{sourceId:result.id,label:'本章所附公开实录'}}]);
    expect(JSON.stringify(scenes)).not.toContain(chapter.body);
    expect(JSON.stringify(world)).toBe(before);
  });

  it('needs the exact historical snapshot and public original; a private superseding copy is not filled from the archive',()=>{
    const {world,viewer,result}=storyFixture();
    expect(projectChronicleDigest(world,viewer.id,'chapters','retained',world.tick-1)).toEqual([]);
    expect(projectChronicleDigest(world,'unknown-observer','chapters','retained')).toEqual([]);
    expect(projectChronicleDigest(world,viewer.id,'chapters','retained')).toHaveLength(1);
    const other=structuredClone(world);
    other.events.push({...result,witnessScope:'participants',description:'私密替件哨兵'});
    expect(projectChronicleDigest(other,viewer.id,'chapters','retained')).toEqual([]);
    expect(projectChronicleDigest(world,viewer.id,'chapters','retained')).toHaveLength(1);
    world.tick += 20;
    expect(projectChronicleDigest(world,viewer.id,'chapters','near')).toEqual([]);
    expect(projectChronicleDigest(world,viewer.id,'chapters','long')).toHaveLength(1);
  });
});
