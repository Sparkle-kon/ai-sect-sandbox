import {describe,expect,it} from 'vitest';
import {
  confirmChapterExcerpt,prepareChapterExcerpt,projectChapterExcerpt,
} from '../src/components/chapterExcerptModel';
import {marketClosureReason,resolveMarketAction} from '../src/engine/marketEngine';
import type {ChronicleAnchor,WorldEvent} from '../src/types/world';
import {marketTurningChapter,publishTurningFacts,sealTurningChapter,turningPerson} from './fixtures/chapterTurningPointsFixture';

const scope='DISTINCT_PRIVATE_BRANCH_SENTINEL';
const read=(f:ReturnType<typeof marketTurningChapter>, key=scope, viewer=f.viewerId)=>
  projectChapterExcerpt(f.world,f.chapter.id,key,viewer);
const fixture=()=>{
  const f=marketTurningChapter();
  const original=f.world.events.find(({id})=>id===f.sourceIds.terminal)!;
  const anchor=f.chapter.anchors.find(({id})=>id===original.id)!;
  expect(original).toBeDefined();
  expect(anchor).toBeDefined();
  return {...f,original,anchor};
};
type Fixture=ReturnType<typeof fixture>;
/** Deliberately corrupt a source and all its documentary copies for privacy filter tests.
 * A raw/archival disagreement alone would not actually exercise the separate privacy gate. */
function alterSource(f:Fixture,raw:Partial<WorldEvent>,archive:Partial<ChronicleAnchor>){
  const id=f.original.id;
  Object.assign(f.original,raw);
  for(const row of [...f.chapter.anchors,...f.world.chronicleArchive.anchors]){
    if(row.id===id)Object.assign(row,archive);
  }
}
function preview(f:Fixture,ids=[f.original.id]){
  const projected=read(f);
  expect(projected).toBeDefined();
  if(!projected)throw Error('Missing exact excerpt projection');
  return prepareChapterExcerpt(projected,ids);
}

describe('private-free chapter excerpt evidence boundaries',()=>{
  it('builds a plain-text file only from hand-selected original facts, never chapter body, biography, branch or state',()=>{
    const f=fixture();
    f.chapter.body='CHAPTER_BODY_PRIVATE_SENTINEL';
    f.chapter.title='ARCHIVE_MARKETING_TITLE_SENTINEL';
    const witness=turningPerson(f.world,f.viewerId);
    witness.innerMonologue='PRIVATE_ACTOR_MIND_SENTINEL';
    f.chapter.biographies.push({actorId:witness.id,name:'UNRELATED_BIO_NAME_SENTINEL',realm:witness.realm,anchorIds:[]});
    f.world.events.unshift({...f.original,id:'evt-unselected-private-looking-content',title:'UNRELATED_RAW_EVENT_SENTINEL'});
    const before=JSON.stringify(f.world);
    const draft=preview(f);
    expect(draft).toBeDefined();
    const file=draft&&confirmChapterExcerpt(f.world,f.chapter.id,scope,f.viewerId,draft);
    expect(file).toEqual({filename:'天道纪事选页.txt',text:draft?.text});
    expect(file?.text).toContain('原始公开事件');
    expect(file?.text).toContain(f.original.title);
    for(const not of [scope, f.chapter.id, f.original.id, f.original.locationId!, witness.id, 'CHAPTER_BODY_PRIVATE_SENTINEL',
      'ARCHIVE_MARKETING_TITLE_SENTINEL','PRIVATE_ACTOR_MIND_SENTINEL','UNRELATED_BIO_NAME_SENTINEL','UNRELATED_RAW_EVENT_SENTINEL']){
      expect(file?.text).not.toContain(not);
    }
    expect(Object.keys(file!)).toEqual(['filename','text']);
    expect(JSON.stringify(f.world)).toBe(before);
  });

  it('rejects duplicate selected chapter IDs even when an identical copy is marked cold; a lone cold copy still needs raw source',()=>{
    const hot=fixture();
    hot.world.chronicleArchive.chapters.push(structuredClone(hot.chapter));
    expect(read(hot)).toBeUndefined();

    const cross=fixture();
    cross.world.coldHistory={chapters:[structuredClone(cross.chapter)],droppedChapters:0};
    expect(read(cross)).toBeUndefined();
    cross.world.chronicleArchive.chapters=[];
    expect(read(cross)?.rows.some(({id})=>id===cross.original.id)).toBe(true);
    const excluded=read(cross)!.excludedCount;
    cross.world.events=cross.world.events.filter(({id})=>id!==cross.original.id);
    expect(read(cross)?.rows.some(({id})=>id===cross.original.id)).toBe(false);
    expect(read(cross)?.excludedCount).toBe(excluded+1);
  });

  it.each(['same','contradictory','private'] as const)('never cites ambiguous duplicate raw proof (%s)',kind=>{
    const f=fixture();
    const baseline=read(f)!;
    const originalCount=baseline.rows.length;
    expect(originalCount).toBeGreaterThan(1);
    const other=structuredClone(f.original);
    if(kind==='contradictory')other.description='CONTRADICTORY_SECRET_SENTINEL';
    if(kind==='private'){
      other.witnessScope='participants';
      other.title='PRIVATE_DUPLICATE_SENTINEL';
    }
    f.world.events.push(other);
    const projection=read(f);
    expect(projection?.rows.some(({id})=>id===f.original.id)).toBe(false);
    expect(projection?.excludedCount).toBe(baseline.excludedCount+1);
    expect(projection?.rows.length).toBe(originalCount!-1);
    expect(JSON.stringify(projection)).not.toContain('SENTINEL');
  });

  it('excludes archive-only claims, and an explicitly participant-only source even for an actual witness',()=>{
    const f=fixture();
    expect(f.original.actorIds).toContain(f.viewerId);
    const baseline=read(f)!;
    const marker='PARTICIPANT_ONLY_SENTINEL';
    f.original.witnessScope='participants';
    alterSource(f,{description:marker},{description:marker});
    const hidden=read(f);
    expect(hidden?.rows.some(({id})=>id===f.original.id)).toBe(false);
    expect(hidden?.excludedCount).toBe(baseline.excludedCount+1);
    expect(hidden?.rows.length).toBe(baseline.rows.length-1);
    expect(JSON.stringify(hidden)).not.toContain(marker);
    f.world.events=f.world.events.filter(({id})=>id!==f.original.id);
    expect(read(f)).toEqual(hidden); // exact cause not exposed through count/metadata
  });

  it('does not resurrect an anchor ambiguity even when raw proof is unique and independently public',()=>{
    const f=fixture();
    const baseline=read(f)!;
    f.chapter.anchors.push({...f.anchor,description:'ANCHOR_CONFLICT_SENTINEL'});
    const result=read(f);
    expect(result?.rows.some(({id})=>id===f.original.id)).toBe(false);
    expect(result?.excludedCount).toBe(baseline.excludedCount+2);
    expect(JSON.stringify(result)).not.toContain('ANCHOR_CONFLICT_SENTINEL');
  });

  it.each([
    '请跟随 https://attest.example/hidden',
    '直抵 loc-internal-138。',
    '另附 branch-private-timeline。',
    '转至 //elsewhere.example/archive',
    '改读 file:///tmp/secret',
    '改读 hidden-source.xyz/path',
    '改读 192.0.2.1/private',
    '改读 ｈｔｔｐｓ：／／attest．example／private',
    '改读 h\u202Ettps://attest.example/hidden',
    '隐去但不能拼接 ht\u0000tps://attest.example/hidden',
  ])('withholds unsafe text even when raw and stored copies agree (%s)',value=>{
    const f=fixture();
    const baseline=read(f)!;
    alterSource(f,{description:value},{description:value.replace(/[\u0000-\u0008]/g,'')});
    const result=read(f);
    expect(result?.rows.some(({id})=>id===f.original.id)).toBe(false);
    expect(result?.excludedCount).toBe(baseline.excludedCount+1);
    expect(JSON.stringify(result)).not.toContain('attest.example');
  });

  it.each(['https://unsafe-origin.example/archive','evt-origin\u202Econtrol','evt-test\nextra-entry'])(
    'rejects an inherently unsafe origin identifier instead of returning it as a selectable row (%s)',id=>{
      const f=fixture();
      const baseline=read(f)!;
      alterSource(f,{id},{id});
      const result=read(f);
      expect(result?.rows.some(row=>row.id===id)).toBe(false);
      expect(result?.excludedCount).toBe(baseline.excludedCount+1);
    },
  );

  it('normalizes invisible control fragments without allowing a multiline fake citation',()=>{
    const f=fixture();
    const description='炉火渐歇。\u0085\u2028\u202E众人各散。';
    alterSource(f,{description},{description});
    const draft=preview(f);
    expect(draft).toBeDefined();
    expect(draft?.text).not.toMatch(/[\u0085\u2028\u202E]/u);
    expect(draft?.text.match(/原始公开事件/g)).toHaveLength(1);
    expect(draft?.text).toContain('众人各散。');
  });

  it.each(['unregistered','restricted'] as const)('never publishes the named origin of a %s site even when copies agree',kind=>{
    const f=fixture();
    const site=f.world.locations.find(site=>site.id===f.original.locationId)!;
    const name='未公告地点的正式秘名';
    const id=kind==='restricted'?site.id:'loc-no-such-source-site';
    if(kind==='restricted'){site.type='secret_realm';site.name=name;}
    const description=`他记住了${name}。`;
    alterSource(f,{locationId:id,description},{locationId:id,description});
    const result=read(f);
    expect(result?.rows.some(row=>row.id===f.original.id)).toBe(false);
    expect(JSON.stringify(result)).not.toContain(name);
    expect(JSON.stringify(result)).not.toContain(id);
  });

  it('previews canonical chronological order regardless of click order and rejects duplicate or absent selections',()=>{
    const f=fixture();
    // Controlled date driver, but both events and the second chapter seal use native producers.
    for(let elapsed=0;elapsed<4;elapsed++){
      f.world.tick++;
      if(++f.world.month>12){f.world.month=1;f.world.year++;}
      if(!marketClosureReason(f.world,f.west))break;
    }
    const later=resolveMarketAction(f.world,turningPerson(f.world,f.viewerId),{
      chosenAction:'PLACE_MARKET_BUY',marketGood:'foundation',marketQuantity:1,
      marketLimitPrice:30,innerMonologue:'这是后来的另一笔本地订单。',
    });
    expect(later).toBeDefined();
    if(!later)throw Error('Expected true later order');
    publishTurningFacts(f.world,[later]);
    f.world.chronicleArchive.chapters=[];
    const chapter=sealTurningChapter(f.world);
    chapter.anchors.reverse(); // Stress reader order, not either producer/date.
    const projection=read({...f,chapter})!;
    const chosen=[later.id,f.original.id];
    expect(projection.rows.filter(({id})=>chosen.includes(id)).map(({id})=>id)).toEqual([...chosen].reverse());
    const draft=prepareChapterExcerpt(projection,chosen);
    expect(draft?.text).toBe(prepareChapterExcerpt(projection,[...chosen].reverse())?.text);
    expect(prepareChapterExcerpt(projection,[chosen[0],chosen[0]])).toBeUndefined();
    expect(prepareChapterExcerpt(projection,[chosen[0],'evt-missing-selection'])).toBeUndefined();
    expect(prepareChapterExcerpt(projection,[])).toBeUndefined();
    expect(prepareChapterExcerpt(structuredClone(projection),chosen)).toBeUndefined();
  });

  it('revalidates selected raw proof, viewer, branch, month and authentic preview before confirming',()=>{
    const f=fixture();
    const draft=preview(f)!;
    expect(draft).toBeDefined();
    const confirm=(world=f.world,chapter=f.chapter.id,key=scope,viewer=f.viewerId,d=draft)=>
      confirmChapterExcerpt(world,chapter,key,viewer,d);
    expect(confirm(structuredClone(f.world))?.text).toBe(draft.text);
    expect(confirm(f.world,'chapter-unrelated')).toBeUndefined();
    expect(confirm(f.world,f.chapter.id,'sibling-preview')).toBeUndefined();
    expect(confirm(f.world,f.chapter.id,scope,f.outsiderId)).toBeUndefined();
    expect(confirm(f.world,f.chapter.id,scope,f.viewerId,structuredClone(draft))).toBeUndefined();
    const clock=structuredClone(f.world);
    clock.tick++;
    expect(confirm(clock)).toBeUndefined();
    const moved=structuredClone(f.world);
    turningPerson(moved,f.viewerId).locationId=turningPerson(moved,f.outsiderId).locationId;
    expect(confirm(moved)).toBeUndefined();
    const changed=structuredClone(f.world);
    changed.events.find(({id})=>id===f.original.id)!.description='实际来源已被更换。';
    expect(confirm(changed)).toBeUndefined();
    const removed=structuredClone(f.world);
    removed.events=removed.events.filter(({id})=>id!==f.original.id);
    expect(confirm(removed)).toBeUndefined();
  });
});
