import {describe,expect,it} from 'vitest';
import {createPublicDialogueResolver} from '../src/engine/publicDialogueProvenance';
import {applyDialogueLanguage} from '../src/engine/dialogueEngine';
import {createTimeline,forkTimeline,readTimelineHead} from '../src/engine/timelineEngine';
import {dialoguePerson,dialogueProofBase,playPublicDialogueProof,publicDialogueProofFixture} from './fixtures/publicDialogueFixture';

describe('exact public dialogue words and stable speaker evidence',()=>{
  it('keeps the original stored names and roles, then suppresses an unprovable current registry mismatch',()=>{
    const f=publicDialogueProofFixture(),{world,event,chapter}=f;
    const real=event.dialogue!.turns.map(turn=>({...turn}));
    const proof=createPublicDialogueResolver(world);
    const current=proof.event(event.id),reserved=proof.chapter(chapter.id,event.id);
    expect(current).toMatchObject({status:'verified',eventId:event.id,tick:event.tick,surface:'event',source:'utility',
      turns:real.map((turn,index)=>({ordinal:index+1,...turn}))});
    expect(reserved).toMatchObject({status:'verified',eventId:event.id,surface:'chapter',source:'utility'});
    dialoguePerson(world,f.actorId).name='改名后';
    expect(createPublicDialogueResolver(world).event(event.id)).toEqual({status:'unresolved',eventId:event.id,tick:event.tick,surface:'event'});
    expect(JSON.stringify(current)).not.toContain('未公开想法');
    expect(event.dialogue!.turns).toEqual(real);
  });

  it('retains exact old clipped labels and text as fragments without borrowing the rest from the live event',()=>{
    const f=publicDialogueProofFixture(true),{world,event,chapter}=f;
    const anchor=chapter.anchors.find(row=>row.id===event.id)!;
    const original=event.dialogue!.turns.at(-1)!,retained=anchor.dialogue!.turns.at(-1)!;
    expect(original.text.length).toBeGreaterThan(140);
    expect(retained.text).toBe(original.text.slice(0,140));
    expect(retained.speakerName).toBe(original.speakerName.slice(0,45));
    let provenance=createPublicDialogueResolver(world);
    expect(provenance.event(event.id)).toMatchObject({status:'verified'});
    expect(provenance.chapter(chapter.id,event.id)).toMatchObject({status:'fragment',turns:anchor.dialogue!.turns.map((turn,index)=>
      ({ordinal:index+1,...turn}))});
    world.events=world.events.filter(row=>row.id!==event.id);
    provenance=createPublicDialogueResolver(world);
    expect(provenance.event(event.id)).toBeUndefined();
    const older=provenance.chapter(chapter.id,event.id);
    expect(older).toMatchObject({status:'fragment'});
    expect(JSON.stringify(older)).not.toContain(original.text);
    expect(provenance.chapter('future-or-other-branch',event.id)).toBeUndefined();
  });

  it('uses distinct literal retained versions after the actual optional language enhancement, without merging them',()=>{
    const f=publicDialogueProofFixture(),{world,event,chapter}=f;
    const archived=chapter.anchors.find(row=>row.id===event.id)!.dialogue!;
    const literal=['只谈已经记下的事。','我也不补未见之词。'];
    world.events=applyDialogueLanguage(world.events,[event.id],{exchanges:[{id:event.id,lines:literal}]});
    const proof=createPublicDialogueResolver(world);
    const current=proof.event(event.id),old=proof.chapter(chapter.id,event.id);
    expect(current).toMatchObject({status:'verified',source:'llm',alternateVersion:true,turns:[
      {text:literal[0],speakerId:archived.turns[0].speakerId}, {text:literal[1],speakerId:archived.turns[1].speakerId},
      {text:archived.turns[2].text,speakerId:archived.turns[2].speakerId},
    ]});
    expect(old).toMatchObject({status:'fragment',source:'utility',alternateVersion:true,turns:archived.turns.map((turn,index)=>
      ({ordinal:index+1,...turn}))});
    expect(JSON.stringify(old)).not.toContain(literal[0]);
    const raw=world.events.find(row=>row.id===event.id)!;
    raw.dialogue!.turns.at(-1)!.text='从未留存的假结尾';
    expect(createPublicDialogueResolver(world).event(event.id)).toEqual({status:'conflict',eventId:event.id,tick:event.tick,surface:'event'});
  });

  it('suppresses conflicting same-source language, switched speaker IDs, and an unresolved nonmember without disclosing words',()=>{
    const f=publicDialogueProofFixture(),{world,event,chapter}=f;
    const wrongText=structuredClone(world);
    wrongText.events.find(row=>row.id===event.id)!.dialogue!.turns[0].text='假词绝不能流出';
    expect(createPublicDialogueResolver(wrongText).event(event.id)).toEqual({status:'conflict',eventId:event.id,tick:event.tick,surface:'event'});
    expect(createPublicDialogueResolver(wrongText).chapter(chapter.id,event.id)).toEqual({
      status:'conflict',eventId:event.id,tick:event.tick,surface:'chapter',
    });
    const misattributed=structuredClone(world);
    misattributed.events.find(row=>row.id===event.id)!.dialogue!.turns[0].speakerId=f.firstId;
    expect(createPublicDialogueResolver(misattributed).event(event.id)?.status).toBe('conflict');
    const wrongLabel=structuredClone(world);
    wrongLabel.chronicleArchive.anchors=wrongLabel.chronicleArchive.anchors.filter(row=>row.id!==event.id);
    wrongLabel.chronicleArchive.chapters=[];
    const active=wrongLabel.events.find(row=>row.id===event.id)!;
    active.dialogue!.turns[1].speakerName=dialoguePerson(wrongLabel,f.secondId).name;
    expect(createPublicDialogueResolver(wrongLabel).event(event.id)).toEqual({status:'unresolved',eventId:event.id,tick:event.tick,surface:'event'});
    const unresolved=structuredClone(world);
    unresolved.events.find(row=>row.id===event.id)!.dialogue!.turns[0].speakerId=f.secondId;
    expect(createPublicDialogueResolver(unresolved).event(event.id)).toEqual({status:'unresolved',eventId:event.id,tick:event.tick,surface:'event'});
  });

  it('refuses a current private original, stale historical view or alternate near-name branch source',()=>{
    const seed=dialogueProofBase();
    const branch=forkTimeline(createTimeline(seed.world),seed.world.tick,{
      type:'WHISPER_MIND',targetCultivatorId:seed.secondId,whisperText:'私下支线内容不得泄露。',
    });
    const main=playPublicDialogueProof(readTimelineHead(branch,'main')!,seed.actorId,seed.firstId);
    const alternate=playPublicDialogueProof(readTimelineHead(branch)!,seed.actorId,seed.secondId);
    expect(main.event.id).toBe(alternate.event.id);
    expect(createPublicDialogueResolver(main.world).event(main.event.id)).toMatchObject({turns:[
      {speakerId:seed.actorId},{speakerId:seed.firstId,speakerName:'林岚生'},{speakerId:seed.actorId},
    ]});
    expect(createPublicDialogueResolver(alternate.world).event(alternate.event.id)).toMatchObject({turns:[
      {speakerId:seed.actorId},{speakerId:seed.secondId,speakerName:'林岚青'},{speakerId:seed.actorId},
    ]});
    expect(createPublicDialogueResolver(alternate.world,alternate.event.tick-1).chapter(alternate.chapter.id,alternate.event.id)).toBeUndefined();
    const madePrivate=structuredClone(alternate.world);
    madePrivate.events.find(row=>row.id===alternate.event.id)!.witnessScope='participants';
    const blocked=createPublicDialogueResolver(madePrivate);
    expect(blocked.event(alternate.event.id)).toBeUndefined();
    expect(blocked.chapter(alternate.chapter.id,alternate.event.id)).toBeUndefined();
  });
});
