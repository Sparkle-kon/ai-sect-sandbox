import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {ChronicleFeed} from '../src/components/ChronicleFeed';
import {ChronicleLibraryPanel} from '../src/components/ChronicleLibraryPanel';
import {createInitialWorld} from '../src/data/initialWorld';
import {publicChronicleSceneEvents} from '../src/engine/chronicleLead';
import {canShowOriginalChronicleManuscript, publicChronicleExcerpt} from '../src/engine/chroniclePublicProse';
import {applyDialogueLanguage} from '../src/engine/dialogueEngine';
import {availableChronicleChapter, resolveChronicleChapter} from '../src/engine/novelGenerator';
import {createPublicDialogueResolver} from '../src/engine/publicDialogueProvenance';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload, WorldState} from '../src/types/world';

const acts = (world:WorldState) => Object.fromEntries(world.cultivators.map(({id})=>[id,
  {chosenAction:'REST',innerMonologue:'先守此处。'} satisfies LLMDecisionPayload]));
const opening='这一句是实录见证的原开头。';
const renderFeed=(world:WorldState)=>renderToStaticMarkup(<ChronicleFeed events={publicChronicleSceneEvents(world)}
  resolvePublicDialogue={createPublicDialogueResolver(world).event} />);
const library=(world:WorldState)=>renderToStaticMarkup(<ChronicleLibraryPanel world={world} cultivator={world.cultivators[0]} />);

function base(){
  const world=createInitialWorld(901);
  const [actor,firstNear,secondNear]=world.cultivators;
  actor.name='温知礼';
  firstNear.name='温知理';
  secondNear.name='温知理'; // Ambiguous labels must never join distinct actor IDs across branches.
  for(const person of [actor,firstNear,secondNear]){
    person.locationId='loc-market';
    person.hp=person.maxHp=500;
    person.combatPower=100;
    person.spiritRoot='木';
    person.artifacts=[];
  }
  return world;
}
function issue(world:WorldState,chosenAction:'DUEL'|'SOCIALIZE',targetCultivatorId:string,spokenLine=opening){
  const actor=world.cultivators[0];
  return advanceWorldTick(world,{...acts(world),[actor.id]:{chosenAction,targetCultivatorId,spokenLine,
    innerMonologue:'只用真实对象。'}},()=>.12);
}
function writeChapter(world:WorldState){
  const plan=availableChronicleChapter(world,true);
  if(!plan)throw Error('expected native archive plan');
  const chapter=resolveChronicleChapter(world,plan);
  if(!chapter)throw Error('expected native archive seal');
  return chapter;
}

describe('only retained public attributed dialogue becomes a reading',()=>{
  it('keeps the exact native closing, distinguishes compatible live and archived wording, and never joins same-name branch actors',()=>{
    const parent=base(), [actor,n1,n2]=parent.cultivators;
    const left=issue(parent,'DUEL',n1.id),right=issue(parent,'DUEL',n2.id);
    const original=left.events.find(row=>row.tick===left.tick&&row.category==='combat'&&row.actorIds[0]===actor.id)!;
    const sameId=right.events.find(row=>row.id===original.id)!;
    const language=['留在直播纪事的改写甲。','留在直播纪事的改写乙。'];
    left.events=applyDialogueLanguage(left.events,[original.id],{exchanges:[{id:original.id,lines:language}]});
    const chapter=writeChapter(left);
    const before=JSON.stringify(left);
    const a=createPublicDialogueResolver(left), b=createPublicDialogueResolver(right);
    expect(a.event(original.id)).toMatchObject({status:'verified',source:'llm',alternateVersion:true,turns:[
      {speakerId:actor.id,text:language[0]},
      {speakerId:n1.id,speakerName:n1.name,text:language[1]},
      original.dialogue!.turns[2],
    ]});
    expect(a.chapter(chapter.id,original.id)).toMatchObject({status:'fragment',source:'utility',alternateVersion:true,turns:[
      {speakerId:actor.id,text:opening},{speakerId:n1.id,speakerName:n1.name},original.dialogue!.turns[2],
    ]});
    expect(b.event(sameId.id)).toMatchObject({status:'verified',turns:[{speakerId:actor.id},{speakerId:n2.id},{speakerId:actor.id}]});
    expect(b.chapter(chapter.id,original.id)).toBeUndefined();
    expect(createPublicDialogueResolver(left,original.tick-1).event(original.id)).toBeUndefined();
    expect(createPublicDialogueResolver(left,original.tick-1).chapter(chapter.id,original.id)).toBeUndefined();
    const exactPhrase=actor.name+'：「'+opening+'」';
    expect(canShowOriginalChronicleManuscript('旧稿留存。\n'+exactPhrase,[a.chapter(chapter.id,original.id)])).toBe(true);
    expect(canShowOriginalChronicleManuscript('错归近名。\n'+n1.name+'：「'+opening+'」',[a.chapter(chapter.id,original.id)])).toBe(false);
    expect(canShowOriginalChronicleManuscript('不交叉使用另一层措辞。\n'+actor.name+'：「'+language[0]+'」',
      [a.chapter(chapter.id,original.id)])).toBe(false);
    const truncated=structuredClone(left);
    truncated.events=truncated.events.filter(({id})=>id!==original.id);
    const saved=createPublicDialogueResolver(truncated);
    expect(saved.event(original.id)).toBeUndefined();
    expect(saved.chapter(chapter.id,original.id)).toMatchObject({status:'fragment',source:'utility',turns:[
      {speakerId:actor.id,text:opening},{speakerId:n1.id},original.dialogue!.turns[2],
    ]});
    const liveMarkup=renderFeed(left), archiveMarkup=library(left);
    expect(liveMarkup).toContain('查看对话 · 已核验');
    expect(liveMarkup).toContain(language[0]);
    expect(liveMarkup).not.toContain(opening);
    expect(archiveMarkup).toContain('查看对话 · 仅存片段');
    expect(archiveMarkup).toContain(opening);
    expect(archiveMarkup).not.toContain(language[0]);
    expect(JSON.stringify(left)).toBe(before);
  });

  it('withholds ghost words on exact-name conflicts, unauthorized speakers and private live copies without erasing the source bytes',()=>{
    const starting=base(), [actor,target,outsider]=starting.cultivators;
    const native=issue(starting,'DUEL',target.id);
    const fact=native.events.find(row=>row.dialogue?.kind==='combat'&&row.actorIds[0]===actor.id)!;
    const chapter=writeChapter(native);
    const wrong='绝不能从这条矛盾来源引语';
    const fake=structuredClone(native);
    const live=fake.events.find(row=>row.id===fact.id)!;
    live.dialogue!.turns[0].speakerName=outsider.name; // exact spelling names a different ID.
    live.dialogue!.turns[0].text=wrong;
    const resolution=createPublicDialogueResolver(fake);
    expect(resolution.event(fact.id)?.status).toMatch(/^(?:unresolved|conflict)$/);
    expect(resolution.chapter(chapter.id,fact.id)?.status).toMatch(/^(?:unresolved|conflict)$/);
    expect(renderFeed(fake)).not.toContain(wrong);
    expect(library(fake)).not.toContain(opening);
    const lone=structuredClone(fake);
    lone.chronicleArchive.chapters=[];
    lone.chronicleArchive.anchors=lone.chronicleArchive.anchors.filter(({id})=>id!==fact.id);
    expect(createPublicDialogueResolver(lone).event(fact.id)).toMatchObject({status:'unresolved'});
    expect(renderFeed(lone)).not.toContain(wrong);
    const invalidSpeaker=structuredClone(lone);
    const misattributed=invalidSpeaker.events.find(({id})=>id===fact.id)!.dialogue!.turns[0];
    misattributed.speakerId=outsider.id; // canonical spelling still doesn't make this third actor a witness.
    expect(createPublicDialogueResolver(invalidSpeaker).event(fact.id)).toMatchObject({status:'unresolved'});

    const mixed=structuredClone(native);
    mixed.events.push({...mixed.events.find(row=>row.id===fact.id)!,witnessScope:'participants',title:wrong});
    const privateProof=createPublicDialogueResolver(mixed);
    expect(privateProof.event(fact.id)).toBeUndefined();
    expect(privateProof.chapter(chapter.id,fact.id)).toBeUndefined();
    expect(renderFeed(mixed)).not.toContain(wrong);
    expect(library(mixed)).not.toContain(opening);
    expect(JSON.stringify(mixed.chronicleArchive.chapters[0])).toBe(JSON.stringify(chapter));
  });

  it('keeps real untyped SOCIALIZE action in the story, but never promotes its attributed-looking raw line into Feed or Library proof',()=>{
    const starting=base(), [actor,target]=starting.cultivators;
    const phrase='这串无归属的字不能写成真对白。';
    const world=issue(starting,'SOCIALIZE',target.id,phrase);
    const event=world.events.find(row=>row.description.includes(phrase))!;
    expect(event.title).toContain(actor.name);
    expect(event.dialogue).toBeUndefined();
    expect(createPublicDialogueResolver(world).event(event.id)).toBeUndefined();
    const book=writeChapter(world);
    // Mimic previously saved old prose, not newly manufactured speech in the current runtime.
    book.body='旧稿曾写某人说道：“'+phrase+'”';
    const archived=JSON.stringify(book);
    expect(canShowOriginalChronicleManuscript(book.body,[])).toBe(false);
    expect(publicChronicleExcerpt(event.description)).toContain('畅谈天地法则');
    expect(publicChronicleExcerpt(event.description)).not.toContain(phrase);
    const feed=renderFeed(world), story=library(world);
    expect(feed).toContain('坐而论道');
    expect(story).toContain('论道');
    expect(feed).not.toContain(phrase);
    expect(story).not.toContain(phrase);
    // Read-only display sanitization must not erase legacy words from the save itself.
    expect(JSON.stringify(world.chronicleArchive.chapters[0])).toBe(archived);
    expect(world.events.find(({id})=>id===event.id)?.description).toContain(phrase);
  });
});
