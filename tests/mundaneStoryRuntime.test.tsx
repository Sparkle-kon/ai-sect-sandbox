import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChronicleLibraryPanel } from '../src/components/ChronicleLibraryPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { settleChronicleOnline } from '../src/engine/chronicleRuntime';
import { writeMundaneLifeProse } from '../src/engine/mundaneLifeProse';
import { projectChronicleReading } from '../src/engine/novelGenerator';
import { buildSerializedChapterPacing, type PacedChronicleScene } from '../src/engine/serializedChapterPacing';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig, WorldState } from '../src/types/world';

const birthId='evt-settlement-13-growth-village-loc-market-births';
const herbId='evt-18-npc-5-alchemy';
const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture-key',model:'fixture-model'};
let month24:WorldState|undefined;
function undecidedChapter():WorldState{
  if(!month24){
    let world=createInitialWorld(1);
    while(world.tick<24)world=advanceWorldTick(world);
    month24=world;
  }
  return structuredClone(month24);
}
afterEach(()=>vi.unstubAllGlobals());

describe('public mundane serial narration',()=>{
  it('renders genuine village births and herb gathering as quiet novel prose without losing receipt wording or sources',()=>{
    const world=advanceWorldTick(undecidedChapter()),chapter=world.chronicleArchive.chapters[0];
    const birth=chapter.anchors.find(row=>row.id===birthId),herb=chapter.anchors.find(row=>row.id===herbId);
    if(!birth||!herb)throw Error('Expected real seeded annual births and herb activity');
    const birthText=writeMundaneLifeProse(birth),herbText=writeMundaneLifeProse(herb);
    expect(birthText).toMatch(/万仙坊市.*(?:3|三)/u);
    expect(herbText).toMatch(/药玄真君.*采得[一两]株/u);
    const reading=projectChronicleReading(chapter,undefined,true,world);
    for(const [id,prose] of [[birthId,birthText],[herbId,herbText]] as const){
      const beat=reading.beats.find(row=>row.eventIds.includes(id));
      expect(beat?.kind).not.toBe('focal');
      expect(beat?.paragraphs.join('')).toContain(prose);
      expect(chapter.body).toContain(prose);
    }
    const quiet=reading.beats.filter(beat=>beat.kind!=='focal').flatMap(beat=>beat.paragraphs).join('');
    expect(quiet).not.toMatch(/未成年坊籍|成年前不计入招募|深山细雨|雨打竹窗/u);
    expect(quiet).toMatch(/时序入(?:夏|秋|冬)/u);
    const snapshot=JSON.stringify(world.chronicleArchive.chapters);
    const html=renderToStaticMarkup(<ChronicleLibraryPanel world={world}/>);
    expect(html).toContain(birthText);
    expect(html).toContain('成年前不计入招募人选');
    expect(JSON.stringify(world.chronicleArchive.chapters)).toBe(snapshot);
  });

  it('sends the exact safe mundane rendering as optional JSON support without changing proof indices',async()=>{
    const world=advanceWorldTick(undecidedChapter(),undefined,undefined,'deferred');
    const mock=vi.fn(async (_url:string,init:RequestInit)=>{
      const request=JSON.parse(String(init.body)) as {messages:{content:string}[]};
      const payload=JSON.parse(request.messages[1].content) as {anchors:{id:string;mundane?:string}[]};
      const birth=world.chronicleArchive.anchors.find(row=>row.id===birthId);
      if(!birth)throw Error('Missing recorded public births');
      expect(payload.anchors.find(row=>row.id===birthId)?.mundane).toBe(writeMundaneLifeProse(birth));
      expect(request.messages[0].content).toContain('不能推出当时风雨或私下行动');
      expect(payload.anchors.find(row=>row.id===birthId)?.mundane).not.toContain('不计入招募人选');
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
        title:'时序流转',body:'仍是村中岁月。',anchorIds:payload.anchors.map(({id})=>id),
      })}}]}));
    });
    vi.stubGlobal('fetch',mock);
    await settleChronicleOnline(world,config);
    expect(mock).toHaveBeenCalledTimes(1);
    const chapter=world.chronicleArchive.chapters[0];
    const factual=projectChronicleReading(chapter,undefined,true,world);
    expect(chapter.source).toBe('llm');
    expect(factual.beats.flatMap(beat=>beat.paragraphs).join('')).toContain('万仙坊市');
  });

  it('does not call a forged month jump a new season or attribute any weather to recorded changing months',()=>{
    const world=advanceWorldTick(undecidedChapter()),first=world.chronicleArchive.chapters[0].anchors[0];
    const section={title:'山门小记',paragraph:'两人到山门相会。'};
    const one:PacedChronicleScene={anchor:{...first,id:'ordinary-one',tick:1,year:1001,month:3},section};
    const two:PacedChronicleScene={anchor:{...first,id:'ordinary-two',tick:2,year:1001,month:4},section};
    const copy=(right:PacedChronicleScene)=>buildSerializedChapterPacing([one,right]).flatMap(row=>row.paragraphs).join('');
    expect(copy(two)).toContain('时序入夏。');
    expect(copy({...two,anchor:{...two.anchor,month:7}})).not.toContain('时序入秋');
    expect(copy(two)).not.toMatch(/山雨|雷声|烈日|凉风/u);
  });
});
