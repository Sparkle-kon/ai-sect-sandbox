import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChronicleLibraryPanel } from '../src/components/ChronicleLibraryPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { settleChronicleOnline } from '../src/engine/chronicleRuntime';
import { projectChronicleReading } from '../src/engine/novelGenerator';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { ChronicleChapter, LLMConfig, WorldState } from '../src/types/world';

const earlier='evt-17-elder-danxia-2-duel',resolved='evt-21-elder-danxia-2-kill';
const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture-key',model:'fixture-model'};
let month24:WorldState|undefined;
function pending():WorldState{
  if(!month24){
    let world=createInitialWorld(1);
    while(world.tick<24)world=advanceWorldTick(world);
    month24=world;
  }
  return structuredClone(month24);
}
const read=(world:WorldState,chapter:ChronicleChapter=world.chronicleArchive.chapters[0])=>
  projectChronicleReading(chapter,undefined,true,world);
afterEach(()=>vi.unstubAllGlobals());

describe('layered focal scenes with ordered original sources',()=>{
  it('renders the real two meetings as one layered focal, preserves scope and leaves at least seven tenths quiet',()=>{
    const world=advanceWorldTick(pending()),chapter=world.chronicleArchive.chapters[0];
    const reading=read(world),focal=reading.beats.filter(beat=>beat.kind==='focal');
    expect(focal.map(beat=>beat.eventIds)).toEqual([[resolved]]);
    const layer=focal[0];
    expect(layer.paragraphs.length).toBeGreaterThanOrEqual(2);
    expect(layer.paragraphEventIds).toHaveLength(layer.paragraphs.length);
    expect(layer.paragraphEventIds.flat()).toEqual(expect.arrayContaining([earlier,resolved]));
    expect(layer.paragraphs.join('')).toMatch(/叶连翘.*幽姬/u);
    expect(layer.paragraphs.join('')).not.toMatch(/落雨|山风|怒火中烧|第九重|遗言/u);
    const chars=(value:string)=>Array.from(value).length;
    const total=reading.beats.reduce((sum,beat)=>sum+chars([beat.title,...beat.paragraphs].join('')),0);
    const hot=chars([layer.title,...layer.paragraphs].join(''));
    expect((total-hot)/total).toBeGreaterThanOrEqual(.7);
    expect(chapter.body).toContain(layer.paragraphs[0]);
    expect(reading.sections.map(scene=>scene.eventId)).toEqual(chapter.anchors.map(anchor=>anchor.id));
    const html=renderToStaticMarkup(<ChronicleLibraryPanel world={world}/>);
    expect(html).toContain(layer.paragraphs[0]);
    expect(html.match(/data-chronicle-beat="focal"/gu)).toHaveLength(1);
  });

  it('preserves a short canonical scene when current original evidence is missing or disputed',()=>{
    const world=advanceWorldTick(pending()),chapter=world.chronicleArchive.chapters[0];
    const baseline=projectChronicleReading(chapter,undefined,true);
    const raw=world.events.find(event=>event.id===resolved);
    if(!raw)throw Error('Missing genuine fight original');
    world.events.unshift({...raw,witnessScope:'participants',description:'假阵后不到阴雨的另结局。'});
    const disputed=read(world,chapter);
    expect(disputed.beats.find(beat=>beat.kind==='focal')).toEqual(baseline.beats.find(beat=>beat.kind==='focal'));
    expect(disputed.beats.flatMap(beat=>beat.paragraphs).join('')).not.toContain('另结局');
  });

  it('gives cognitive JSON the same verified layered guidance and preserves existing anchor list',async()=>{
    const world=advanceWorldTick(pending(),undefined,undefined,'deferred');
    const mock=vi.fn(async (_url:string,init:RequestInit)=>{
      const request=JSON.parse(String(init.body)) as {messages:{content:string}[]};
      const payload=JSON.parse(request.messages[1].content) as {
        anchors:{id:string}[];focalDetails?:{text:string;eventIds:string[]}[];
      };
      expect(request.messages[0].content).toContain('不补造招式或景物');
      const ids=payload.anchors.map(row=>row.id);
      expect(payload.focalDetails?.length).toBeGreaterThanOrEqual(2);
      expect(payload.focalDetails?.flatMap(row=>row.eventIds)).toEqual(expect.arrayContaining([earlier,resolved]));
      expect(payload.focalDetails?.every(row=>row.eventIds.every(id=>ids.includes(id)))).toBe(true);
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
        title:'重到丹霞',body:'两人又见于丹霞灵谷。',anchorIds:ids,
      })}}]}));
    });
    vi.stubGlobal('fetch',mock);
    await settleChronicleOnline(world,config);
    expect(mock).toHaveBeenCalledTimes(1);
    expect(world.chronicleArchive.chapters[0].source).toBe('llm');
    expect(read(world).beats.find(beat=>beat.kind==='focal')?.paragraphs.length).toBeGreaterThanOrEqual(2);
  });
});
