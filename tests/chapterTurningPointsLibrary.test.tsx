import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ChronicleLibraryPanel} from '../src/components/ChronicleLibraryPanel';
import {projectChapterTurningPoints} from '../src/engine/chronicleTurningPoints';
import {projectChronicleReading} from '../src/engine/novelGenerator';
import type {WorldState} from '../src/types/world';
import {marketTurningChapter, publishTurningFacts, sealTurningChapter, turningPerson} from './fixtures/chapterTurningPointsFixture';

afterEach(()=>vi.unstubAllGlobals());
const library=(world:WorldState, viewerId?:string)=>
  renderToStaticMarkup(<ChronicleLibraryPanel world={world} cultivator={viewerId?turningPerson(world,viewerId):undefined} />);
const arcLabel='有据转折';

const renderedText=(text:string)=>renderToStaticMarkup(<span>{text}</span>).slice(6,-7);
function regularScenes(html:string){
  const archive=html.match(/<article aria-label="章节正文"[^>]*>([\s\S]*?)<\/article>/)?.[1]??'';
  return [...archive.matchAll(/<div[^>]*data-chronicle-beat="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g)]
    .map(([,kind,body])=>({kind,prose:[...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(match=>match[1]),
      title:body.match(/<h5[^>]*>([^<]+)<\/h5>/)?.[1]}));
}
const expectedBeats=(chapter:Parameters<typeof projectChronicleReading>[0])=>
  projectChronicleReading(chapter,undefined,true).beats.map(({kind,paragraphs,title})=>({kind,
    prose:paragraphs.map(renderedText),title:title===undefined?undefined:renderedText(title)}));

describe('the existing Library reads only the exact scoped chapter turning points',()=>{
  it('adds only one optional fold for the eligible viewer, preserving the ordinary scenes and their order for everyone',()=>{
    const f=marketTurningChapter(),{world,chapter,sourceIds,viewerId,outsiderId}=f;
    const original=JSON.stringify(world);
    const net=vi.fn(()=>{throw Error('Read only must not make a model request');});
    vi.stubGlobal('fetch',net);
    const local=library(world,viewerId), remote=library(world,outsiderId), unknown=library(world);
    expect(local.match(/>有据转折<\/summary>/g)).toHaveLength(1);
    expect(local).toMatch(/<details class="[^"]+"><summary class="[^"]+">有据转折/);
    expect(local).toContain('aria-label="本章可核验的故事转折"');
    expect(local).toContain('实录所证的后果：货物已在本地交割');
    expect(remote).not.toContain(arcLabel);
    expect(unknown).not.toContain(arcLabel);
    const regular=projectChronicleReading(chapter);
    expect(regular.sections.map(row=>row.eventId)).toEqual(chapter.anchors.map(row=>row.id));
    const beats=expectedBeats(chapter);
    expect(beats.length).toBeGreaterThan(0);
    expect(regularScenes(local)).toEqual(beats);
    expect(regularScenes(remote)).toEqual(beats);
    expect(regularScenes(unknown)).toEqual(beats);
    const projection=projectChapterTurningPoints(world,chapter.id,viewerId);
    const [arc]=projection.arcs;
    expect(arc.consequenceEventId).toBe(sourceIds.terminal);
    expect(projection.separateEventIds).toContain(sourceIds.isolated);
    expect(arc.scenes.map(row=>row.eventId)).not.toContain(sourceIds.isolated);
    expect(local).toContain(regular.title);
    expect(net).not.toHaveBeenCalled();
    expect(JSON.stringify(world)).toBe(original);
  });

  it('retains ordinary chapters if a real link is no longer retained, and will not load another chapter’s arc by resemblance',()=>{
    const f=marketTurningChapter(),{world,chapter,viewerId,sourceIds}=f;
    const oldChapter=JSON.stringify(chapter);
    const unlinked=structuredClone(world);
    unlinked.chronicleCausality.nodes=unlinked.chronicleCausality.nodes.filter(row=>row.eventId!==sourceIds.sell);
    expect(library(unlinked,viewerId)).not.toContain(arcLabel);
    expect(regularScenes(library(unlinked,viewerId))).toEqual(expectedBeats(chapter));
    expect(JSON.stringify(unlinked.chronicleArchive.chapters[0])).toBe(oldChapter);

    const next=structuredClone(world);
    next.tick+=12;
    next.year+=1;
    const latest=world.events.find(row=>row.id===sourceIds.isolated)!;
    publishTurningFacts(next,[{...latest,tick:next.tick,year:next.year,id:'unrelated-resemblance-at-new-tick'}]);
    const current=sealTurningChapter(next);
    expect(current.id).not.toBe(chapter.id);
    expect(projectChapterTurningPoints(next,chapter.id,viewerId).arcs).toHaveLength(1);
    expect(projectChapterTurningPoints(next,current.id,viewerId).arcs).toEqual([]);
    const html=library(next,viewerId);
    expect(html).not.toContain(arcLabel);
    expect(regularScenes(html)).toEqual(expectedBeats(current));
    expect(JSON.stringify(next.chronicleArchive.chapters.find(row=>row.id===chapter.id))).toBe(oldChapter);
  });

  it('can read the exact cold anchor while native proofs are still retained, without replacing any hot or cold chapter bytes',()=>{
    const f=marketTurningChapter(),{world,chapter,viewerId,sourceIds}=f;
    const old=JSON.stringify(chapter);
    const scene=world.events.find(row=>row.id===sourceIds.isolated)!;
    // Canonical sealing and compaction, not a second serialized copy of an archive record.
    for(let index=1;index<=6;index++){
      world.tick+=12;
      world.year++;
      publishTurningFacts(world,[{...scene,tick:world.tick,year:world.year,id:'independent-chapter-'+index}]);
      sealTurningChapter(world);
    }
    const cold=world.coldHistory.chapters.find(row=>row.id===chapter.id);
    expect(JSON.stringify(cold)).toBe(old);
    expect(world.chronicleArchive.chapters.some(row=>row.id===chapter.id)).toBe(false);
    expect(Object.isFrozen(cold)).toBe(true);
    // Simulate expiry of the raw/short archive layers, retaining genuine trade ledger and causal records.
    world.events=world.events.filter(row=>row.tick>chapter.endTick);
    world.chronicleArchive.anchors=world.chronicleArchive.anchors.filter(row=>row.tick>chapter.endTick);
    const snapshot=JSON.stringify(world);
    expect(library(world,viewerId)).toContain('远纪档案');
    expect(library(world,viewerId)).not.toContain(arcLabel); // the old shelf starts closed; nothing is implicitly resumed.
    expect(projectChapterTurningPoints(world,chapter.id,viewerId).arcs[0]?.consequenceEventId).toBe(sourceIds.terminal);
    expect(projectChapterTurningPoints(world,chapter.id,viewerId,chapter.endTick-1).arcs).toEqual([]);
    expect(JSON.stringify(world)).toBe(snapshot);
  });
});
