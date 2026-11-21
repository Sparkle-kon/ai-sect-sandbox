import {afterEach, describe, expect, it, vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {publicChronicleChapters} from '../src/engine/coldHistoryEngine';
import {settleChronicleOffline, settleChronicleOnline} from '../src/engine/chronicleRuntime';
import {archiveChronicleEvents, projectChronicleReading, stampedChronicleLead} from '../src/engine/novelGenerator';
import {projectChronicleLead} from '../src/engine/chronicleLead';
import {createProtagonistSuccessionState, projectProtagonistSuccession} from '../src/engine/protagonistSuccession';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {Cultivator, LLMConfig, LLMDecisionPayload, WorldEvent, WorldState} from '../src/types/world';

const rests = (world: WorldState): Record<string, LLMDecisionPayload> =>
  Object.fromEntries(world.cultivators.map(({id})=>[id,{chosenAction:'REST',innerMonologue:'闭关'}]));
const clock = (world:WorldState, tick:number) => {
  world.tick=tick; world.year=1+Math.floor((tick-1)/12); world.month=1+(tick-1)%12;
};
/** Test-only fixture of archived canonical shapes, not a claim these published story scenes were naturally generated. */
function scene(world:WorldState, actor:Cultivator, tick:number, category:WorldEvent['category'], tag:string):WorldEvent {
  return {id:'fixture-arc-'+tag+'-'+tick, tick, year:1+Math.floor((tick-1)/12), month:1+(tick-1)%12,
    title:actor.name+'立于碑前·'+tag,description:actor.name+'亲见碑纹，遂停步细察。',category,
    actorIds:[actor.id],locationId:world.locations[0].id};
}
function publishFixture(world:WorldState, events:WorldEvent[]) {
  archiveChronicleEvents(world,events);
  world.events=[...events,...world.events].slice(0,120);
}
function evidence(world:WorldState, actor:Cultivator, dates:[number,number,number], tag:string) {
  publishFixture(world,[scene(world,actor,dates[0],'combat',tag),scene(world,actor,dates[1],'diplomacy',tag),
    scene(world,actor,dates[2],'breakthrough',tag)]);
}
function firstChapter() {
  const world=createInitialWorld(193);
  clock(world,12);
  evidence(world,world.cultivators[0],[2,4,8],'前卷');
  return advanceWorldTick(world,rests(world));
}
function mechanics(world:WorldState) {
  const rest=structuredClone(world) as Partial<WorldState>;
  delete rest.protagonistSuccession;
  delete rest.chronicleArchive;
  delete rest.coldHistory;
  return rest;
}
afterEach(()=>vi.unstubAllGlobals());

describe('world-stage chronology and stable chapter archival across an earned succession',()=>{
  it('seals actual terminal events only on the next closed date, then projects the preceding role before the successor',()=>{
    const earlier=firstChapter();
    const first=earlier.cultivators[0], second=earlier.cultivators[1];
    expect(projectProtagonistSuccession(earlier).active?.actorId).toBe(first.id);
    // The actual duel engine reports both names and the actorIds order is challenger, defender.
    clock(earlier,24);
    first.locationId=second.locationId='loc-market';
    first.combatPower=1;
    first.hp=1;
    second.combatPower=50000;
    evidence(earlier,second,[16,19,22],'后卷');
    publishFixture(earlier,[scene(earlier,first,18,'combat','复见'),scene(earlier,first,20,'diplomacy','复见')]);
    const orders={...rests(earlier),[second.id]:{chosenAction:'DUEL',targetCultivatorId:first.id,
      innerMonologue:'两人确在同处。'} satisfies LLMDecisionPayload};
    const fell=advanceWorldTick(earlier,orders,()=>.9);
    const death=fell.events.find(event=>event.category==='death'&&event.tick===fell.tick&&event.actorIds.includes(first.id));
    expect(death).toMatchObject({duelWinnerId:second.id,actorIds:[second.id,first.id]});
    expect(fell.cultivators.find(({id})=>id===first.id)?.alive).toBe(false);
    expect(projectProtagonistSuccession(fell,24).active?.actorId).toBe(first.id);
    const after=advanceWorldTick(fell,rests(fell));
    const reading=projectProtagonistSuccession(after);
    expect(reading.active?.actorId).toBe(second.id);
    expect(reading.archived[0]).toMatchObject({actorId:first.id,endedTick:fell.tick,closeReason:'public_death',death:{eventId:death!.id}});
    const historical=projectProtagonistSuccession(after,24);
    expect(historical.active?.actorId).toBe(first.id);
    expect(historical.active).not.toHaveProperty('death');
    expect(historical.archived).toHaveLength(0);
    expect(JSON.stringify(historical)).not.toContain(second.id);
  });

  it('keeps already-authored hot/cold bytes and gameplay/RNG identical while a new lead qualifies',()=>{
    const world=firstChapter(), predecessor=world.cultivators[0], successor=world.cultivators[1];
    for(const boundary of [25,37,49,61,73,85]){
      clock(world,boundary);
      publishFixture(world,[scene(world,predecessor,boundary-1,'diplomacy','中卷')]);
      settleChronicleOffline(world);
    }
    expect(world.coldHistory.chapters.length).toBeGreaterThan(0);
    expect(world.chronicleArchive.chapters.length).toBeGreaterThan(0);
    const old=publicChronicleChapters(world).map(chapter=>({id:chapter.id,bytes:JSON.stringify(chapter),
      reading:projectChronicleReading(chapter,stampedChronicleLead(chapter))}));

    clock(world,96);
    evidence(world,successor,[91,94,96],'新卷');
    const otherwise = structuredClone(world);
    otherwise.protagonistSuccession=createProtagonistSuccessionState();
    const ordinary=advanceWorldTick(world,rests(world));
    const neutral=advanceWorldTick(otherwise,rests(otherwise));
    expect(mechanics(ordinary)).toEqual(mechanics(neutral));
    expect(ordinary.random).toEqual(neutral.random);
    expect(projectProtagonistSuccession(ordinary).active?.actorId).toBe(successor.id);
    expect(ordinary.chronicleArchive.chapters[0]).toMatchObject({endTick:96,
      storyFocal:{kind:'lead',actorId:successor.id,eventIds:expect.arrayContaining(['fixture-arc-新卷-96'])}});
    const chapters=new Map(publicChronicleChapters(ordinary).map(chapter=>[chapter.id,chapter]));
    for(const before of old){
      const copied=chapters.get(before.id)!;
      expect(JSON.stringify(copied)).toBe(before.bytes);
      expect(projectChronicleReading(copied,stampedChronicleLead(copied))).toEqual(before.reading);
    }
  });

  it('uses the exact already-closed chapter lead in one optional fake-provider request, never any future or private names',async()=>{
    const config: LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'mock-model'};
    const world=createInitialWorld(120), first=world.cultivators[0], unclosed=world.cultivators[1];
    clock(world,12);
    evidence(world,first,[2,4,8],'可见');
    const incoming=advanceWorldTick(world,rests(world),undefined,'deferred');
    publishFixture(incoming,[scene(incoming,unclosed,incoming.tick,'combat','未来窗口')]);
    const privateScene=scene(incoming,unclosed,11,'intrigue','未公开');
    incoming.events.unshift({...privateScene,witnessScope:'participants'});
    const fetchMock=vi.fn(async(_url:string,init:RequestInit)=>{
      const dto=JSON.parse(String(init.body));
      const payload=JSON.parse(dto.messages[1].content);
      expect(payload.lead).toMatchObject({actorId:first.id});
      expect(payload.anchors.map((entry:WorldEvent)=>entry.id)).not.toContain(privateScene.id);
      expect(payload.anchors.every((entry:WorldEvent)=>entry.tick<=12)).toBe(true);
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
        title:'碑前',body:'一人立于碑前，既见碑纹，遂停步细察。',
        anchorIds:payload.anchors.map((entry:WorldEvent)=>entry.id),
      })}}]}));
    });
    vi.stubGlobal('fetch',fetchMock);
    await settleChronicleOnline(incoming,config);
    await settleChronicleOnline(incoming,config);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(incoming.chronicleArchive.chapters[0]).toMatchObject({source:'llm',endTick:12});
  });
});

describe('immutable earned chapter viewpoint',()=>{
  it('never assigns a previously earned view from a current actor name or one surviving proof',()=>{
    const world=firstChapter();
    const book=world.chronicleArchive.chapters[0];
    const reader=stampedChronicleLead(book);
    expect(reader?.actorId).toBe(world.cultivators[0].id);
    const proofIds=reader!.eventIds;
    expect(proofIds.length).toBeGreaterThanOrEqual(2);
    const originalName=world.cultivators[0].name;
    world.cultivators[0].name='后来的别名';
    expect(stampedChronicleLead(book)?.name).toBe(originalName);
    const visible=projectChronicleReading(book,reader);
    expect(visible.sections.map(({eventId})=>eventId)).toEqual(book.anchors.map(({id})=>id));

    const incomplete={...book,anchors:book.anchors.filter(({id})=>!proofIds.slice(1).includes(id))};
    expect(stampedChronicleLead(incomplete)).toBeUndefined();
    const ensemble={...book,storyFocal:{kind:'ensemble' as const}};
    expect(stampedChronicleLead(ensemble)).toBeUndefined();
  });

  it('writes an explicit ensemble instead of using the old heuristic when three scenes occurred on only two dates',()=>{
    const world=createInitialWorld(741);
    const actor=world.cultivators[0];
    clock(world,12);
    publishFixture(world,[scene(world,actor,2,'combat','同日甲'),scene(world,actor,2,'diplomacy','同日乙'),
      scene(world,actor,4,'breakthrough','又一日')]);
    const next=advanceWorldTick(world,rests(world));
    const book=next.chronicleArchive.chapters[0];
    expect(projectChronicleLead(next,book.anchors,12)?.actorId).toBe(actor.id);
    expect(book.storyFocal).toEqual({kind:'ensemble'});
    expect(stampedChronicleLead(book)).toBeUndefined();
  });
});
