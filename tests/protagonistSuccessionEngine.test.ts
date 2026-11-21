import {describe,expect,it} from 'vitest';
import {advanceProtagonistSuccession,projectEarnedChronicleLead,projectProtagonistSuccession,PROTAGONIST_SUSTAIN_WINDOW}
  from '../src/engine/protagonistSuccession';
import {publicChronicleChapters} from '../src/engine/coldHistoryEngine';
import {createTimeline,forkTimeline,readTimelineHead} from '../src/engine/timelineEngine';
import {earnedProtagonistStory,fallenProtagonistStory,giveEarnedStoryScenes,protagonistStoryWorld,readyProtagonistSuccessor,
  storyPayload,storyPerson,storyTurn} from './fixtures/protagonistSuccessionFixture';

describe('protagonist continuity earned from independently archived public scenes',()=>{
  it('does not appoint a title or same name; only the exact actor with three real public scenes on distinct closed turns earns focus',()=>{
    const f=protagonistStoryWorld();
    let world=storyTurn(f.world,{[f.leadId]:storyPayload('BREAKTHROUGH')});
    world=storyTurn(world,{[f.leadId]:storyPayload('SOCIALIZE',{targetCultivatorId:f.witnessId})});
    expect(projectProtagonistSuccession(world).active).toBeUndefined();
    world=storyTurn(world,{[f.leadId]:storyPayload('BREAKTHROUGH')});
    expect(projectProtagonistSuccession(world).active).toBeUndefined();
    const threeDates=world.tick;
    world=storyTurn(world,{},.99);
    const view=projectProtagonistSuccession(world);
    expect(view.active).toMatchObject({actorId:f.leadId,openedTick:threeDates,predecessorArcId:undefined});
    expect(storyPerson(world,f.successorId).name).toBe(view.active?.name);
    expect(view.active?.evidence.map(row=>row.tick)).toEqual([threeDates-2,threeDates-1,threeDates]);
    expect(new Set(view.active?.evidence.map(row=>row.category))).toEqual(new Set(['breakthrough','diplomacy']));
    expect(view.archived).toEqual([]);
    expect(Object.keys(world.protagonistSuccession.arcs[0].opening[0]).sort()).toEqual(['attribution','category','eventId','tick']);
    expect(projectProtagonistSuccession(world,threeDates-1).active).toBeUndefined();
  });

  it('keeps earned lead across an independently qualified contender until true public death; freezes exactly earlier chapter bytes',()=>{
    const f=readyProtagonistSuccessor();
    // Seal a turn containing the other person's genuine third past scene.
    const standing=storyTurn(f.world,{},.99);
    expect(projectProtagonistSuccession(standing).active?.actorId).toBe(f.leadId);
    const chapters=publicChronicleChapters(standing).map(row=>[row.id,JSON.stringify(row)] as const);
    expect(chapters.length).toBeGreaterThan(0);
    const fallen=fallenProtagonistStory();
    expect(projectProtagonistSuccession(fallen.beforeArchive).active?.actorId).toBe(fallen.leadId);
    const report=projectProtagonistSuccession(fallen.world);
    expect(report.active?.actorId).toBe(fallen.successorId);
    expect(report.archived[0]).toMatchObject({actorId:fallen.leadId,endedTick:fallen.deathTick,closeReason:'public_death',
      death:{eventId:fallen.deathId,category:'death',tick:fallen.deathTick}});
    expect(report.active?.predecessorArcId).toBe(report.archived[0].id);
    const parentProofs=new Set(report.archived[0].evidence.map(row=>row.eventId));
    expect(report.active?.evidence.every(row=>!parentProofs.has(row.eventId))).toBe(true);
    expect(projectProtagonistSuccession(fallen.world,fallen.deathTick-1).active?.actorId).toBe(fallen.leadId);
    const immutable=new Map(publicChronicleChapters(fallen.world).map(row=>[row.id,JSON.stringify(row)]));
    for(const [id,chapter] of chapters)expect(immutable.get(id)).toBe(chapter);
    const source=fallen.world.chronicleArchive.anchors;
    expect(projectEarnedChronicleLead(fallen.world,source,fallen.deathTick-1)?.actorId).toBe(fallen.leadId);
    const earned=projectEarnedChronicleLead(fallen.world,source,fallen.deathTick);
    expect(earned).toMatchObject({actorId:fallen.successorId,arcId:report.active?.id});
    expect(projectEarnedChronicleLead(fallen.world,source.filter(row=>row.id===earned?.eventIds[0]),fallen.deathTick)).toBeUndefined();
  });

  it('recognizes the exact typed public duel victim even when that named lead is not the first listed actor',()=>{
    const f=earnedProtagonistStory();
    const defender=storyPerson(f.world,f.leadId),challenger=storyPerson(f.world,f.successorId);
    defender.locationId='loc-vein-north';challenger.locationId=defender.locationId;
    defender.combatPower=1;defender.hp=1;
    challenger.combatPower=200000;challenger.hp=challenger.maxHp;
    const fatal=storyTurn(f.world,{[challenger.id]:storyPayload('DUEL',{targetCultivatorId:defender.id})},.05);
    const proof=fatal.events.find(row=>row.tick===fatal.tick&&row.category==='death'&&row.duelWinnerId===challenger.id);
    expect(proof?.actorIds).toEqual([challenger.id,defender.id]);
    expect(storyPerson(fatal,defender.id).alive).toBe(false);
    expect(projectProtagonistSuccession(fatal).active?.actorId).toBe(defender.id);
    const archive=storyTurn(fatal,{},.99);
    const closed=projectProtagonistSuccession(archive).archived[0];
    expect(closed).toMatchObject({actorId:defender.id,closeReason:'public_death',death:{eventId:proof?.id,
      attribution:'named_participant',tick:fatal.tick}});
    const corrupt=structuredClone(archive),native=corrupt.events.find(row=>row.id===proof?.id)!;
    native.duelWinnerId=defender.id;
    expect(projectProtagonistSuccession(corrupt).archived[0]).toMatchObject({closeReason:'evidence_lost'});
    expect(projectProtagonistSuccession(corrupt).archived[0].death).toBeUndefined();
  });

  it('goes back to an ensemble after sustained absence and refuses to recycle old scenes as a new appointment',()=>{
    const f=earnedProtagonistStory();
    let {world}=f;
    for(let i=0;i<PROTAGONIST_SUSTAIN_WINDOW+2;i++)world=storyTurn(world,{},.99);
    const report=projectProtagonistSuccession(world);
    expect(report.active).toBeUndefined();
    expect(report.archived[0]).toMatchObject({actorId:f.leadId,closeReason:'receded'});
    expect(world.protagonistSuccession.arcs).toHaveLength(1);
    const passed=giveEarnedStoryScenes(world,f.leadId,f.witnessId);
    expect(projectProtagonistSuccession(storyTurn(passed,{},.99)).active?.actorId).toBe(f.leadId);
  });

  it('suppresses private/conflicting retained copies immediately and only closes the past arc neutrally once the newer turn is truly sealed',()=>{
    const f=earnedProtagonistStory();
    const conflicting=structuredClone(f.world);
    const proof=conflicting.protagonistSuccession.arcs[0].opening[0];
    const native=conflicting.chronicleArchive.anchors.find(row=>row.id===proof.eventId)!;
    conflicting.events=[{...native,witnessScope:'participants',title:'未授权原文'},...conflicting.events];
    const filtered=projectProtagonistSuccession(conflicting);
    expect(filtered.active).toBeUndefined();
    expect(JSON.stringify(filtered)).not.toContain('未授权原文');
    const next=storyTurn(conflicting,{},.99);
    expect(projectProtagonistSuccession(next).archived[0]).toMatchObject({closeReason:'evidence_lost'});
    expect(projectProtagonistSuccession(f.world).active?.actorId).toBe(f.leadId);

    const privateFall=structuredClone(f.world);
    const person=storyPerson(privateFall,f.leadId);
    person.alive=false;person.hp=0; // Absence without a public native scene is not public cause evidence.
    const neutral=storyTurn(privateFall,{},.99);
    const old=projectProtagonistSuccession(neutral).archived[0];
    expect(old?.closeReason).toBe('evidence_lost');
    expect(old?.death).toBeUndefined();
  });

  it('never mutates the canonical world outside its branch-local ledger and rejects wrong-date prior context',()=>{
    const f=earnedProtagonistStory();
    const archive=f.world.chronicleArchive;
    const alternate=forkTimeline(createTimeline(f.world),f.world.tick,
      {type:'WHISPER_MIND',targetCultivatorId:f.successorId,whisperText:'支线不能复制主线正文。'});
    const prior=readTimelineHead(alternate)!;
    const next=structuredClone(prior);
    next.tick++;
    const expected=structuredClone(next);
    advanceProtagonistSuccession(next,prior);
    expect(next.chronicleArchive).toEqual(archive);
    expect({...next,protagonistSuccession:expected.protagonistSuccession}).toEqual(expected);
    const already=structuredClone(next);
    advanceProtagonistSuccession(next,prior);
    expect(next).toEqual(already);
    advanceProtagonistSuccession(next,readTimelineHead(alternate,'main'));
    expect(next).toEqual(already);
  });
});
