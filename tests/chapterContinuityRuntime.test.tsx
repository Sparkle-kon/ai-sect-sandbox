import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChronicleLibraryPanel } from '../src/components/ChronicleLibraryPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { settleChronicleOnline } from '../src/engine/chronicleRuntime';
import { availableChronicleChapter, projectChronicleReading, resolveChronicleChapter } from '../src/engine/novelGenerator';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { ChronicleChapter, LLMConfig, WorldState } from '../src/types/world';
import { freightMonth, freightShipment, nativeFreightShipment } from './marketFreightNativeFixture';

const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture-key',model:'fixture-model'};
const priorEvent='evt-12-elder-tianji-1-social';
let month24:WorldState|undefined;

function closingMonth():WorldState{
  if(!month24){
    let world=createInitialWorld(1);
    while(world.tick<24)world=advanceWorldTick(world);
    month24=world;
  }
  return structuredClone(month24);
}
function read(world:WorldState, chapter:ChronicleChapter){
  return projectChronicleReading(chapter,undefined,true,world);
}

afterEach(()=>vi.unstubAllGlobals());

describe('serialized public continuity in both world runtimes and the reader',()=>{
  it('uses a real prior quiet scene, preserves original chapter anchors, and places the callback before the prose',()=>{
    const world=advanceWorldTick(closingMonth());
    const [chapter,previous]=world.chronicleArchive.chapters;
    expect(previous.anchors.at(-1)?.id).toBe(priorEvent);
    const reading=read(world,chapter);
    const opening=reading.continuity?.opening;
    expect(opening).toMatchObject({chapterId:previous.id,eventId:priorEvent,text:expect.stringMatching(/蒋观星.*苏清寒/u)});
    expect(chapter.body.startsWith(opening?.text??'missing')).toBe(true);
    expect(chapter.anchors.some(({id})=>id===priorEvent)).toBe(false);
    expect(reading.sections.some(({eventId})=>eventId===priorEvent)).toBe(false);
    expect(read(world,previous).continuity?.opening).toBeUndefined();
    const html=renderToStaticMarkup(<ChronicleLibraryPanel world={world}/>);
    const chapterHeadings=[...html.matchAll(/<h4[^>]*>([^<]*)<\/h4>/gu)].map(match=>match[1]);
    expect(chapterHeadings.filter(title=>title===reading.title)).toHaveLength(1);
    const location=html.indexOf('data-chronicle-continuity="opening"');
    expect(location).toBeGreaterThan(0);
    expect(html.indexOf('data-chronicle-beat=',location)).toBeGreaterThan(location);
    expect(html).toContain(opening?.text);
    const copy=decodeEraWorldSave(encodeEraWorldSave(world));
    expect(read(copy,copy.chronicleArchive.chapters[0]).continuity).toEqual(reading.continuity);
  });

  it('renders a real unresolved native cargo at the end of a chapter, even after the cargo later settles',()=>{
    const {world,shipment}=nativeFreightShipment();
    const plan=availableChronicleChapter(world,true);
    if(!plan)throw Error('Missing native chapter plan');
    const chapter=resolveChronicleChapter(world,plan);
    if(!chapter)throw Error('Expected the exact native plan to seal');
    const text='这卷停笔时，商队已经启程，货还没有到埠。';
    const id=`evt-${shipment.departedTick}-market-${shipment.id}`;
    expect(read(world,chapter).continuity?.closing).toEqual({eventId:id,text});
    expect(chapter.body.endsWith(text)).toBe(true);
    const html=renderToStaticMarkup(<ChronicleLibraryPanel world={world}/>);
    expect(html.lastIndexOf('data-chronicle-beat=')).toBeLessThan(html.indexOf('data-chronicle-continuity="closing"'));
    expect(html).toContain(text);
    let later=world;
    for(let i=0;i<10&&freightShipment(later).status==='in_transit';i++)later=freightMonth(later);
    expect(freightShipment(later).settledTick).toBeGreaterThan(chapter.endTick);
    expect(read(later,chapter).continuity?.closing).toEqual({eventId:id,text});
  });

  it('offers exactly the grounded carryover to JSON mode without changing anchor validation or accepting model fiction as evidence',async()=>{
    const world=advanceWorldTick(closingMonth(),undefined,undefined,'deferred');
    const mock=vi.fn(async (_url:string,init:RequestInit)=>{
      const request=JSON.parse(String(init.body)) as {messages:{content:string}[]};
      const payload=JSON.parse(request.messages[1].content) as {
        anchors:{id:string}[];
        continuity?:{opening?:{eventId:string;chapterId:string;text:string}};
      };
      expect(request.messages[0].content).toContain('不猜结果或时间');
      expect(payload.continuity?.opening).toMatchObject({eventId:priorEvent,chapterId:'chapter-1-12'});
      expect(payload.anchors.some(({id})=>id===priorEvent)).toBe(false);
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
        title:'小山外',body:'昨日又有一支籍籍无名的仙军开寨。',anchorIds:payload.anchors.map(({id})=>id),
      })}}]}));
    });
    vi.stubGlobal('fetch',mock);
    await settleChronicleOnline(world,config);
    expect(mock).toHaveBeenCalledTimes(1);
    const chapter=world.chronicleArchive.chapters[0];
    expect(chapter.source).toBe('llm');
    expect(read(world,chapter).continuity?.opening?.eventId).toBe(priorEvent);
    expect(JSON.stringify(read(world,chapter))).not.toContain('籍籍无名的仙军');
    expect(renderToStaticMarkup(<ChronicleLibraryPanel world={world}/>)).not.toContain('籍籍无名的仙军');
  });
});
