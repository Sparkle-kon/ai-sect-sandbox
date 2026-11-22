import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { publicChronicleChapters } from '../src/engine/coldHistoryEngine';
import { availableChronicleChapter,projectChronicleReading,stampedChronicleLead } from '../src/engine/novelGenerator';
import { decodeEraWorldSave,encodeEraWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { ChronicleChapter,LLMDecisionPayload,WorldState } from '../src/types/world';

let chaptersWorld:WorldState|undefined;
function completedNativeChapters():WorldState{
  if(chaptersWorld)return structuredClone(chaptersWorld);
  let world=createInitialWorld(1);
  while(world.tick<25)world=advanceWorldTick(world);
  chaptersWorld=world;
  return structuredClone(world);
}
function nativeChapter(world=completedNativeChapters(),closing=24):ChronicleChapter{
  const chapter=publicChronicleChapters(world).find(row=>row.endTick===closing);
  if(!chapter)throw Error('Expected an actual yearly authored archive');
  return chapter;
}
const settledDuel='evt-21-elder-danxia-2-kill',earlierDuel='evt-17-elder-danxia-2-duel';
const read=(chapter:ChronicleChapter)=>projectChronicleReading(chapter,stampedChronicleLead(chapter),true);
const length=(value:string)=>Array.from(value).length;

describe('bounded native serial chapter pacing',()=>{
  it('folds a genuine seed-one year into quiet chronological beats and one independently proved climax',()=>{
    const chapter=nativeChapter(),before=JSON.stringify(chapter);
    expect(read(nativeChapter(undefined,12)).beats[0].paragraphs[0]).toMatch(/^那年春天/);
    expect(chapter.anchors.map(({id})=>id)).toEqual(expect.arrayContaining([settledDuel,earlierDuel]));
    const reading=read(chapter);
    expect(reading.sections.map(({eventId})=>eventId)).toEqual(chapter.anchors.map(({id})=>id));
    expect(reading.beats.flatMap(row=>row.eventIds)).toEqual(chapter.anchors.map(({id})=>id));
    expect(reading.beats.map(row=>row.kind)).toEqual(['opening','transition','focal','closing']);
    expect(reading.beats.filter(row=>row.kind==='focal')).toEqual([
      expect.objectContaining({eventIds:[settledDuel],title:expect.stringContaining('幽姬')}),
    ]);
    expect(reading.beats.find(row=>row.eventIds.includes(earlierDuel))?.kind).toBe('transition');
    const ordinary=reading.beats.filter(row=>row.kind!=='focal');
    expect(ordinary.every(row=>row.title===undefined)).toBe(true);
    expect(ordinary.some(row=>row.paragraphs.length<row.eventIds.length)).toBe(true);
    const narration=ordinary.flatMap(row=>row.paragraphs).join('');
    expect(narration).toContain('采得2株玄土根');
    expect(narration).toContain('坊市');
    const focal=reading.beats.filter(row=>row.kind==='focal').map(row=>[row.title,...row.paragraphs].join('')).join('');
    expect(length(narration)/(length(focal)+length(narration))).toBeGreaterThanOrEqual(.7);
    expect(JSON.stringify(chapter)).toBe(before);
    expect(chapter.body).toContain(reading.beats[0].paragraphs[0]);
    expect(chapter.body).not.toContain(`\n${reading.sections.find(row=>row.eventId===earlierDuel)?.title}\n`);
  });

  it('uses the same default factual beats for Utility or a legacy model manuscript, including after strict save and raw prose changes',()=>{
    const world=completedNativeChapters(),chapter=nativeChapter(world);
    const canonical=read(chapter);
    const proseWithoutEvidence='云忽然横开，门外出现一支从未有人见过的仙军，夺走旧山门。';
    const legacy:ChronicleChapter={...chapter,title:'旧稿中的另一个故事名',source:'llm',body:proseWithoutEvidence};
    expect(read(legacy)).toEqual(canonical);
    expect(JSON.stringify(read(legacy))).not.toContain(proseWithoutEvidence);
    const encoded=encodeEraWorldSave(world),rehydrated=decodeEraWorldSave(encoded);
    expect(encodeEraWorldSave(rehydrated)).toBe(encoded);
    expect(read(nativeChapter(rehydrated))).toEqual(canonical);
    expect(legacy.body).toBe(proseWithoutEvidence);
  });

  it('lets factual thin chapters stay thin instead of inventing an opening, outcome, or second focal point',()=>{
    const chapter=nativeChapter();
    const lone=chapter.anchors.find(row=>row.id===settledDuel)!;
    expect(read({...chapter,anchors:[lone]}).beats).toEqual([
      expect.objectContaining({kind:'focal',eventIds:[lone.id],title:expect.any(String)}),
    ]);
    const herbs=chapter.anchors.find(row=>row.id==='evt-20-elder-blood-2-alchemy')!;
    const two=read({...chapter,anchors:[herbs]});
    expect(two.beats).toEqual([expect.objectContaining({kind:'opening',eventIds:[herbs.id]})]);
    expect(two.beats[0].title).toBeUndefined();
    expect(two.beats[0].paragraphs[0]).toContain('殷晚池在血月魔渊采得2株玄土根');
    const earlier=chapter.anchors.find(row=>row.id===earlierDuel)!;
    expect(read({...chapter,anchors:[earlier,lone]}).beats.filter(row=>row.kind==='focal').map(row=>row.eventIds)).toEqual([[lone.id]]);
  });

  it('allows two comparable independent native turns when there is room to breathe',()=>{
    let world=createInitialWorld(1);
    const orders=(actorId:string,targetId:string,chosenAction:'DUEL'|'SOCIALIZE')=>advanceWorldTick(world,
      Object.fromEntries(world.cultivators.map(row=>[row.id,row.id===actorId?
        {chosenAction,targetCultivatorId:targetId,innerMonologue:'眼下确是同处。'}:
        {chosenAction:'REST',innerMonologue:'依旧静候。'}] satisfies [string,LLMDecisionPayload])),()=>.12);
    world=orders('npc-1','elder-taixu-1','DUEL');
    expect(world.events[0]).toMatchObject({id:'evt-2-npc-1-duel',category:'combat'});
    world=orders('elder-danxia-1','elder-danxia-2','SOCIALIZE');
    world=orders('npc-3','elder-blood-1','DUEL');
    expect(world.events.some(row=>row.id==='evt-4-npc-3-duel'&&row.category==='combat')).toBe(true);
    world=orders('elder-tianji-1','elder-tianji-2','SOCIALIZE');
    const plan=availableChronicleChapter(world,true)!;
    const chapter:ChronicleChapter={...plan,body:'',source:'utility'};
    const focus=read(chapter).beats.filter(row=>row.kind==='focal');
    expect(focus.map(row=>row.eventIds)).toEqual([['evt-2-npc-1-duel'],['evt-4-npc-3-duel']]);
  });

  it('withholds duplicate, private or future conflicting facts rather than giving their material to a beat',()=>{
    const chapter=nativeChapter(),focal=chapter.anchors.find(anchor=>anchor.id===settledDuel)!;
    const marked=read({
      ...chapter,anchors:[...chapter.anchors,{...focal,description:'另一份未经证明的战果。'},
        {...focal,id:'future-claim',tick:chapter.endTick+1,title:'尚未发生的未来字样'},
        {...focal,id:'participant-claim',title:'当事人才知道的秘密',witnessScope:'participants'} as typeof focal],
    });
    expect(marked.sections.some(row=>row.eventId===settledDuel)).toBe(false);
    expect(JSON.stringify(marked.beats)).not.toMatch(/另一份未经证明的战果|尚未发生的未来字样|当事人才知道的秘密/);

    let unclosed=createInitialWorld(1);
    while(unclosed.tick<24)unclosed=advanceWorldTick(unclosed);
    const raw=unclosed.events.find(row=>row.id===settledDuel)!;
    expect(raw).toBeDefined();
    expect(availableChronicleChapter(unclosed)?.anchors.some(row=>row.id===settledDuel)).toBe(true);
    unclosed.events.unshift({...raw,description:'矛盾的当月声称。'});
    expect(availableChronicleChapter(unclosed)?.anchors.some(row=>row.id===settledDuel)).toBe(false);
  });
});
