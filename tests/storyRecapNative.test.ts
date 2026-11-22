import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {projectChronicleReading} from '../src/engine/novelGenerator';
import {projectStoryRecap} from '../src/engine/storyRecap';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {marketTurningChapter, turningPerson} from './fixtures/chapterTurningPointsFixture';
import type {WorldState} from '../src/types/world';

const outcome='evt-21-elder-danxia-2-kill';
let frame25:WorldState|undefined;
function realChapter(){
  if(!frame25){
    let world=createInitialWorld(1);
    while(world.tick<25)world=advanceWorldTick(world);
    frame25=world;
  }
  return structuredClone(frame25);
}

describe('scoped short recap of already serialized story turning points',()=>{
  it('reads an actual original focal outcome and ties the row to the real reader paragraph, not saved model prose',()=>{
    const world=realChapter();
    const chapter=world.chronicleArchive.chapters[0];
    const before=JSON.stringify(world);
    const result=projectStoryRecap(world,world.cultivators[0],chapter.id);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({eventId:outcome,chapterId:chapter.id,tick:21,source:'original'});
    const focal=projectChronicleReading(chapter,undefined,true,world).beats.find(beat=>beat.kind==='focal')!;
    const selected=focal.paragraphEventIds.findIndex(ids=>JSON.stringify(ids)===JSON.stringify(result.rows[0].paragraphEventIds));
    expect(selected).toBeGreaterThanOrEqual(0);
    expect(result.rows[0].paragraph).toContain('叶连翘');
    expect(JSON.stringify(world)).toBe(before);
    expect(projectStoryRecap(world,{...world.cultivators[0]},chapter.id).rows).toEqual([]);
    const manuscript=structuredClone(world);
    manuscript.chronicleArchive.chapters[0].body='无据蒙文，不能作为短篇原文。';
    expect(projectStoryRecap(manuscript,undefined,chapter.id)).toEqual(result);
  });

  it('fails closed on exact conflicting/private sources, duplicate chapters and unavailable branch destinations',()=>{
    const world=realChapter(),chapter=world.chronicleArchive.chapters[0];
    const duplicate=structuredClone(world);
    duplicate.chronicleArchive.chapters.push(structuredClone(chapter));
    expect(projectStoryRecap(duplicate,undefined,chapter.id).rows).toHaveLength(0);
    const original=world.events.find(event=>event.id===outcome)!;
    const privateSibling={...world,events:[...world.events,{...original,witnessScope:'participants' as const}]};
    expect(projectStoryRecap(privateSibling,undefined,chapter.id).rows).toHaveLength(0);
    const conflicting={...world,events:world.events.map(event=>event===original?{...event,description:'另写战果'}:event)};
    expect(projectStoryRecap(conflicting,undefined,chapter.id).rows).toHaveLength(0);
    expect(projectStoryRecap(world,undefined,'chapter-other-branch').rows).toHaveLength(0);
  });

  it('reads the exact naturally cold chapter without re-creating missing typed details',()=>{
    let world=realChapter();
    const chapterId=world.chronicleArchive.chapters[0].id;
    const expected=projectStoryRecap(world,undefined,chapterId).rows[0];
    while(world.tick<=97&&!world.coldHistory.chapters.some(chapter=>chapter.id===chapterId))world=advanceWorldTick(world);
    const cold=world.coldHistory.chapters.find(chapter=>chapter.id===chapterId);
    expect(cold).toBeDefined();
    expect(world.events.some(event=>event.id===outcome)).toBe(false);
    expect(world.chronicleArchive.anchors.some(anchor=>anchor.id===outcome)).toBe(false);
    const recap=projectStoryRecap(world,undefined,chapterId);
    expect(recap.rows).toHaveLength(1);
    expect(recap.rows[0]).toMatchObject({eventId:outcome,chapterId,source:'archived',paragraphEventIds:[outcome]});
    expect(recap.rows[0].paragraph).not.toBe(expected.paragraph);
    expect(projectStoryRecap(world).rows.length).toBeLessThanOrEqual(3);
  });

  it('only includes an actual scoped market turning receipt, never a merely similar trade headline',()=>{
    const {world,chapter,viewerId,sourceIds}=marketTurningChapter();
    const recap=projectStoryRecap(world,turningPerson(world,viewerId),chapter.id);
    expect(recap.rows).toContainEqual(expect.objectContaining({eventId:sourceIds.terminal,chapterId:chapter.id}));
    expect(recap.rows.some(row=>row.eventId===sourceIds.isolated)).toBe(false);
    const changed=structuredClone(world);
    changed.chronicleCausality.nodes.find(row=>row.eventId===sourceIds.terminal)!.predecessors=[];
    expect(projectStoryRecap(changed,turningPerson(changed,viewerId),chapter.id).rows.some(row=>row.eventId===sourceIds.terminal)).toBe(false);
  });
});
