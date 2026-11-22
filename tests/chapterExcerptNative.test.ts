import {describe,expect,it} from 'vitest';
import {confirmChapterExcerpt,prepareChapterExcerpt,projectChapterExcerpt} from '../src/components/chapterExcerptModel';
import {canFocusChronicleSite} from '../src/engine/chronicleFocusEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {createTimeline,forkTimeline,readTimelineHead} from '../src/engine/timelineEngine';
import {dialogueProofBase,playPublicDialogueProof,publicDialogueProofFixture} from './fixtures/publicDialogueFixture';

const mainScope='world-native-7331/main';
const bodyCanary='未曾公开的章回腹稿只在这里';
const chapterLabelCanary='朱鸾最初布局支系';
const branchLabelCanary='秋水影本勿入摘录';
const privateCanary='这道只有本人知道的临渊传音';
function requireValue<T>(value:T|undefined|null,message:string):T{
  if(value===undefined||value===null)throw Error(message);
  return value;
}
const outputText=(value:unknown)=>typeof value==='string'?value:JSON.stringify(value)??'';
const selected=(world:ReturnType<typeof publicDialogueProofFixture>['world'],chapterId:string,eventId:string,viewerId?:string)=>{
  const projection=requireValue(projectChapterExcerpt(world,chapterId,mainScope,viewerId),'Missing retained chapter');
  const row=requireValue(projection.rows.find(row=>row.id===eventId),'Missing selected true public scene');
  const draft=requireValue(prepareChapterExcerpt(projection,[eventId]),'Missing prepared selection');
  return {projection,row,draft};
};
const branchFixture=()=>{
  const seed=dialogueProofBase();
  const fork=forkTimeline(createTimeline(seed.world),seed.world.tick,{
    type:'WHISPER_MIND',targetCultivatorId:seed.secondId,whisperText:privateCanary,
  },branchLabelCanary);
  const main=playPublicDialogueProof(requireValue(readTimelineHead(fork,'main'),'Missing original'),seed.actorId,seed.firstId);
  const sibling=playPublicDialogueProof(requireValue(readTimelineHead(fork),'Missing sibling'),seed.actorId,seed.secondId);
  const privateScene=requireValue(sibling.world.events.find(event=>event.witnessScope==='participants'&&event.description.includes(privateCanary)),
    'Missing actual private event');
  return {seed,main,sibling,privateScene,fork};
};

describe('native public chapter excerpt',()=>{
  it('exports only selected literal clipped archive words, never the chapter body, original title, or the restored tail',()=>{
    const {world,event,chapter,actorId}=publicDialogueProofFixture(true);
    const anchor=requireValue(chapter.anchors.find(row=>row.id===event.id),'Missing native archive');
    const liveTurn=requireValue(event.dialogue?.turns.at(-1),'Missing original line');
    const archiveTurn=requireValue(anchor.dialogue?.turns.at(-1),'Missing archived line');
    expect(liveTurn.text.length).toBeGreaterThan(140);
    expect(archiveTurn.text).toBe(liveTurn.text.slice(0,140));
    expect(archiveTurn.speakerName).toBe(liveTurn.speakerName.slice(0,45));
    // Detached leak sentinels only in archive display prose, never among the authentic source anchors.
    chapter.title=chapterLabelCanary;
    chapter.body=bodyCanary;
    const original=JSON.stringify(world.chronicleArchive);
    const {projection,row,draft}=selected(world,chapter.id,event.id,actorId);
    const output=requireValue(confirmChapterExcerpt(world,chapter.id,mainScope,actorId,draft),'Confirm exact selected chapter');
    const contents=outputText(output.text);
    expect(output.filename).toMatch(/\.txt$/u);
    expect(contents).toContain(row.title);
    expect(contents).toContain(archiveTurn.text);
    expect(contents).not.toContain(liveTurn.text);
    expect(contents).toContain(archiveTurn.speakerName+'：「'+archiveTurn.text+'」');
    expect(contents).not.toContain(liveTurn.speakerName+'：「');
    for(const sentinel of [bodyCanary,chapterLabelCanary,privateCanary,'未公开想法',mainScope,event.id,chapter.id,actorId]){
      expect(contents).not.toContain(sentinel);
      expect(output.filename).not.toContain(sentinel);
    }
    for(const other of projection.rows.filter(row=>row.id!==event.id)){
      if(other.text&&!row.text.includes(other.text))expect(contents).not.toContain(other.text);
    }
    expect(JSON.stringify(world.chronicleArchive)).toBe(original);
  });

  it('keeps same-date near-name native siblings disjoint even when given the same nominal scope and event id',()=>{
    const {seed,main,sibling,privateScene,fork}=branchFixture();
    expect(main.event.id).toBe(sibling.event.id);
    expect(main.chapter.id).toBe(sibling.chapter.id);
    expect(main.event.tick).toBe(sibling.event.tick);
    expect(fork.branches.find(row=>row.id===fork.activeBranchId)?.label).toBe(branchLabelCanary);
    expect(sibling.chapter.anchors.some(row=>row.id===privateScene.id)).toBe(false);
    const {draft}=selected(main.world,main.chapter.id,main.event.id,seed.actorId);
    expect(confirmChapterExcerpt(sibling.world,sibling.chapter.id,mainScope,seed.actorId,draft)).toBeUndefined();
    expect(confirmChapterExcerpt(main.world,main.chapter.id,'other-nominal-scope',seed.actorId,draft)).toBeUndefined();
    const scope=`world-native-7331/${fork.activeBranchId}/${branchLabelCanary}`;
    const projection=requireValue(projectChapterExcerpt(sibling.world,sibling.chapter.id,scope,seed.actorId),'Missing sibling retained chapter');
    expect(projection.rows.some(row=>row.id===privateScene.id)).toBe(false);
    expect(prepareChapterExcerpt(projection,[sibling.event.id,privateScene.id])).toBeUndefined();
    const siblingDraft=requireValue(prepareChapterExcerpt(projection,[sibling.event.id]),'Missing own branch draft');
    const left=requireValue(confirmChapterExcerpt(main.world,main.chapter.id,mainScope,seed.actorId,draft),'Main lost untouched proof');
    const right=requireValue(confirmChapterExcerpt(sibling.world,sibling.chapter.id,scope,seed.actorId,siblingDraft),'Sibling lost untouched proof');
    expect(left.text).toContain('林岚生');
    expect(left.text).not.toContain('林岚青');
    expect(right.text).toContain('林岚青');
    expect(right.text).not.toContain('林岚生');
    for(const sentinel of [privateScene.id,privateCanary,branchLabelCanary,scope])expect(outputText(right)).not.toContain(sentinel);
  });

  it('withholds current invisible citation labels and refuses changed, private, duplicate or missing selected source at confirmation',()=>{
    const {world,event,chapter,actorId}=publicDialogueProofFixture();
    const {row,draft}=selected(world,chapter.id,event.id,actorId);
    const market=requireValue(world.locations.find(site=>site.id===event.locationId),'Missing actual event site');
    const farViewer=requireValue(world.cultivators.find(actor=>actor.alive&&actor.hp>0&&!canFocusChronicleSite(world,market.id,actor.id)),
      'Missing legitimate remote reader');
    expect(canFocusChronicleSite(world,market.id,actorId)).toBe(true);
    expect(row.citation).toContain(`仙历${event.year}年${event.month}月 · 原始公开事件：`);
    // A public source remains readable, but the geographic citation comes from current independent sight.
    const remote=projectChapterExcerpt(world,chapter.id,mainScope,farViewer.id)?.rows.find(row=>row.id===event.id);
    expect(row.citation).toContain(market.name);
    expect(remote?.citation).toBe(row.citation.slice(0,-(` · ${market.name}`).length));
    expect(outputText(remote?.citation)).not.toContain(market.name);
    expect(outputText(row.citation)).not.toContain(market.id);
    expect(confirmChapterExcerpt(world,chapter.id,mainScope,farViewer.id,draft)).toBeUndefined();
    const original=JSON.stringify(world.chronicleArchive);
    for(const update of [
      (changed:typeof world)=>{requireValue(changed.events.find(row=>row.id===event.id),'Missing source').description+='异本已动';},
      (changed:typeof world)=>{requireValue(changed.events.find(row=>row.id===event.id),'Missing source').witnessScope='participants';},
      (changed:typeof world)=>{changed.events.push(structuredClone(event));},
      (changed:typeof world)=>{changed.events=changed.events.filter(row=>row.id!==event.id);},
    ]){
      const changed=structuredClone(world);update(changed);
      expect(confirmChapterExcerpt(changed,chapter.id,mainScope,actorId,draft)).toBeUndefined();
      const after=projectChapterExcerpt(changed,chapter.id,mainScope,actorId);
      expect(after?.excludedCount).toBeGreaterThan(0);
      expect(after?.rows.some(row=>row.id===event.id)).toBe(false);
      expect(JSON.stringify(changed.chronicleArchive)).toBe(original);
    }
    const restated=structuredClone(world);
    const exactLine=requireValue(restated.events.find(row=>row.id===event.id)?.dialogue?.turns[0],'Missing words');
    exactLine.text+='异本改了话';
    expect(confirmChapterExcerpt(restated,chapter.id,mainScope,actorId,draft)).toBeUndefined();
    const reprojection=projectChapterExcerpt(restated,chapter.id,mainScope,actorId);
    expect(reprojection?.rows.find(row=>row.id===event.id)?.text).not.toContain('异本改了话');
    expect(JSON.stringify(world.chronicleArchive)).toBe(original);
  });

  it('loses selection when the ordinary native simulation ages the original out of the hot event feed',()=>{
    const {world,event,chapter,actorId}=publicDialogueProofFixture();
    const archive=JSON.stringify(chapter);
    const {draft}=selected(world,chapter.id,event.id,actorId);
    let next=world;
    for(let i=0;i<48&&next.events.some(row=>row.id===event.id);i++){
      next=advanceWorldTick(next,undefined,undefined,'utility',undefined,{captureTrace:false,capturePresentation:false});
    }
    expect(next.tick).toBeGreaterThan(world.tick);
    expect(next.events.some(row=>row.id===event.id)).toBe(false);
    const retained=[...next.chronicleArchive.chapters,...next.coldHistory.chapters].find(row=>row.id===chapter.id);
    expect(JSON.stringify(retained)).toBe(archive);
    expect(retained?.anchors.some(row=>row.id===event.id)).toBe(true);
    const projection=projectChapterExcerpt(next,chapter.id,mainScope,actorId);
    expect(projection?.excludedCount).toBeGreaterThan(0);
    expect(projection?.rows.some(row=>row.id===event.id)).toBe(false);
    expect(confirmChapterExcerpt(next,chapter.id,mainScope,actorId,draft)).toBeUndefined();
    expect(world.events.some(row=>row.id===event.id)).toBe(true);
    expect(JSON.stringify(chapter)).toBe(archive);
  });
});
