import type {ChronicleAnchor,ChronicleChapter,WorldEvent,WorldState} from '../types/world';
import {deriveChapterEndHook} from './chapterEndHooks';
import {isChronicleStoryFact} from './chronicleLead';
import {publicChronicleExcerpt,writePublicChronicleScene} from './chroniclePublicProse';

export interface ChapterContinuity {readonly text:string;readonly eventId:string;readonly chapterId:string}
type ChapterCut=Pick<ChronicleChapter,'id'|'chapterNumber'|'startTick'|'endTick'|'anchors'>;
type PreviousHook=(world:WorldState,chapter:ChronicleChapter)=>{text:string;eventId:string}|undefined;
type Fact=ChronicleAnchor|WorldEvent;
type Proof='retained'|'missing'|'disputed';

const numeric=(value:number):boolean=>Number.isSafeInteger(value)&&value>0;
const cut=(value:string,max:number):string=>value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu,'').trim().slice(0,max);
const chronological=(a:ChronicleAnchor,b:ChronicleAnchor)=>a.tick-b.tick;
const realActors=(anchor:ChronicleAnchor,known:ReadonlySet<string>)=>anchor.actorIds.length<=12&&
  new Set(anchor.actorIds).size===anchor.actorIds.length&&anchor.actorIds.every(id=>known.has(id));
function factSignature(fact:Fact,known:ReadonlySet<string>):string {
  const actors=[...new Set(fact.actorIds.filter(id=>known.has(id)))].slice(0,12);
  const speech=fact.dialogue?.turns.filter(row=>actors.includes(row.speakerId)).slice(0,4)
    .map(row=>[row.speakerId,cut(row.speakerName,45),cut(row.text,140)]);
  return JSON.stringify([fact.tick,fact.year,fact.month,fact.category,cut(fact.title,80),cut(fact.description,220),
    fact.locationId??null,actors,speech?.length?[fact.dialogue?.kind,fact.dialogue?.source,speech]:null]);
}
function publicAt(anchor:Fact,from:number,through:number):boolean {
  return numeric(anchor.year)&&numeric(anchor.month)&&anchor.month<=12&&anchor.tick>=from&&
    isChronicleStoryFact(anchor,through);
}
function soundChapter(chapter:ChapterCut,world:WorldState):boolean {
  return !!chapter.id&&numeric(chapter.chapterNumber)&&numeric(chapter.startTick)&&numeric(chapter.endTick)&&
    chapter.startTick<=chapter.endTick&&chapter.endTick<=world.tick&&chapter.anchors.length>0&&chapter.anchors.length<=18&&
    new Set(chapter.anchors.map(row=>row.id)).size===chapter.anchors.length;
}
function sameChapter(a:ChapterCut,b:ChapterCut):boolean {
  return a.id===b.id&&a.chapterNumber===b.chapterNumber&&a.startTick===b.startTick&&a.endTick===b.endTick;
}
function matchesAnchors(subset:ChapterCut,retained:ChapterCut,known:ReadonlySet<string>):boolean {
  const claims=new Map(retained.anchors.map(anchor=>[anchor.id,anchor]));
  return subset.anchors.every(anchor=>{
    const saved=claims.get(anchor.id);
    return !!saved&&realActors(anchor,known)&&realActors(saved,known)&&publicAt(anchor,subset.startTick,subset.endTick)&&publicAt(saved,subset.startTick,subset.endTick)&&
      factSignature(anchor,known)===factSignature(saved,known);
  });
}

const person=String.raw`([^\n\r，。！？：；【】]{1,54}?)`;
const place=String.raw`([^】\n\r]{1,100})`;
const socialTitle=new RegExp(String.raw`^${person}与${person}坐而论道$`,'u');
const socialBody=new RegExp(String.raw`^${person}与${person}于【${place}】畅谈天地法则(?:[，。]|$)`,'u');
const quietHerbs=new RegExp(String.raw`^${person}在${place}采得[1-9]\d*株[^，。]{1,18}，灵草存量随之减少。$`,'u');
const quietTravel=new RegExp(String.raw`^${person}御剑抵达【${place}】，在古迹残垣间寻得 [1-9]\d* 枚上品灵石。$`,'u');

function completeLine(text:string):string|undefined {
  const line=text.replace(/[\p{Cc}\p{Cf}]/gu,' ').replace(/\s+/gu,' ').trim().match(/^([^。！？!?]+[。！？!?]?)/u)?.[1]?.trim();
  if(!line||Array.from(line).length>132)return undefined;
  return line.replace(/[。！？!?，、：:；]+$/u,'')+'。';
}

/** Ancient chapter anchors without independent hot proof can only carry narrowly known quiet outputs. */
function quietNativeLine(anchor:ChronicleAnchor):string|undefined {
  const site=anchor.locationId;
  const [actor,peer]=anchor.actorIds;
  if(!site||!actor)return undefined;
  const start=`evt-${anchor.tick}-${actor}-`;
  const publicText=publicChronicleExcerpt(anchor.description);
  if(anchor.actorIds.length===2&&actor!==peer&&anchor.id===start+'social'&&anchor.category==='diplomacy'){
    const heading=socialTitle.exec(anchor.title),original=socialBody.exec(publicText);
    if(heading&&original&&heading[1]===original[1]&&heading[2]===original[2]&&original[1]!==original[2])
      return `${original[1]}与${original[2]}在${original[3]}坐下论道。`;
  }
  if(anchor.actorIds.length===1&&anchor.category==='breakthrough'){
    const herb=anchor.id===start+'alchemy'?quietHerbs.exec(publicText):null;
    if(herb&&anchor.title===`${herb[1]}采集灵草`)return completeLine(publicText);
    const travel=anchor.id===start+'explore'?quietTravel.exec(publicText):null;
    if(travel&&anchor.title===`${travel[1]}游历${travel[2]}获机缘`)return completeLine(publicText);
  }
  if(anchor.actorIds.length===2&&actor!==peer&&anchor.category==='diplomacy'){
    const marketId=new RegExp(`^evt-${anchor.tick}-market-(?:fill-|caravan-)[1-9]\\d*$`,'u');
    if(marketId.test(anchor.id)){
      if(anchor.title==='坊市当场结算'&&/^([1-9]\d*)份[^，。]{1,68}成交，每份[1-9]\d*灵石，货款当场交割。$/u.test(publicText))
        return completeLine(publicText);
      const departure=anchor.title==='跨坊商队启程'&&
        /^[1-9]\d*份[^，。由]{1,36}由([^，。]{1,80})运往([^，。]{1,80})，预计[1-9]\d*回合。货款待到货结算。$/u.exec(publicText);
      if(departure)return `商队由${departure[1]}往${departure[2]}启程。`;
      if(anchor.title==='商队到货结算'&&/^买方收货[1-9]\d*份，卖方收到[1-9]\d*灵石。$/u.test(publicText))
        return completeLine(writePublicChronicleScene(anchor).paragraph);
    }
  }
  return undefined;
}
function unresolvedPastLine(anchor:ChronicleAnchor):string|undefined {
  if(anchor.category!=='diplomacy')return undefined;
  const prefix=`evt-${anchor.tick}-`;
  if(anchor.title==='跨坊商队启程'&&new RegExp(`^${prefix}market-caravan-[1-9]\\d*$`,'u').test(anchor.id))
    return '商队已经启程；那时货还没到埠。';
  if(anchor.title==='宗门集结攻山'&&anchor.id.startsWith(prefix+'dip-')&&anchor.id.endsWith('-launch_siege'))
    return '出征已经定下；那时人马还没到山门。';
  if(anchor.title==='联军抵达山门'&&anchor.id.startsWith(prefix+'dip-siege-'))
    return '人马已到山门外；那时还未开阵。';
  return undefined;
}
const narrated=(anchor:ChronicleAnchor)=>completeLine(publicChronicleExcerpt(writePublicChronicleScene(anchor).paragraph));
const season=(month:number)=>['春','夏','秋','冬'][Math.floor((month-1)/3)];
const connected=(a:ChronicleAnchor,b:ChronicleAnchor)=>
  !!a.locationId&&a.locationId===b.locationId||a.actorIds.some(id=>b.actorIds.includes(id));

/**
 * Opens from one publicly supported adjacent predecessor in this exact world. No current actor
 * position, future resolution, archived free prose, or unproved text returned by the hook is read.
 */
export function deriveChapterOpening(world:WorldState,chapter:ChapterCut,previousHook?:PreviousHook):ChapterContinuity|undefined {
  if(!soundChapter(chapter,world)||chapter.chapterNumber<=1)return undefined;
  const hot=world.chronicleArchive.chapters;
  const cold=world.coldHistory?.chapters??[];
  const shelf=[...hot,...cold],known=new Set(world.cultivators.map(row=>row.id));
  const previousRows=shelf.filter(row=>row.chapterNumber===chapter.chapterNumber-1);
  const previous=previousRows.length===1?previousRows[0]:undefined;
  if(!previous||!soundChapter(previous,world)||previous.endTick!==chapter.startTick-1||
    shelf.filter(row=>row.id===previous.id).length!==1||previous.id===chapter.id)return undefined;
  const matches=shelf.filter(row=>row.id===chapter.id||row.chapterNumber===chapter.chapterNumber);
  const stored=matches.length===1?matches[0]:undefined;
  if(matches.length>1||stored&&(!sameChapter(chapter,stored)||!soundChapter(stored,world)||!matchesAnchors(chapter,stored,known)))
    return undefined;
  if(!stored&&(chapter.id!==`chapter-${chapter.startTick}-${chapter.endTick}`||
    chapter.endTick!==world.tick&&chapter.endTick!==world.tick-1||
    shelf.some(row=>row.chapterNumber>=chapter.chapterNumber||row.endTick>=chapter.startTick)))return undefined;
  if(shelf.some(row=>row!==previous&&row!==stored&&row.startTick<=chapter.endTick&&row.endTick>=previous.startTick))return undefined;

  const interest=new Set([...chapter.anchors,...previous.anchors].map(row=>row.id));
  const sources=new Map<string,Fact[]>();
  for(const fact of [...world.events,...world.chronicleArchive.anchors])if(interest.has(fact.id)){
    const existing=sources.get(fact.id);
    if(existing)existing.push(fact);else sources.set(fact.id,[fact]);
  }
  const proof=(anchor:ChronicleAnchor,from:number,through:number):Proof=>{
    if(!publicAt(anchor,from,through)||!realActors(anchor,known))return 'disputed';
    const originals=sources.get(anchor.id)??[];
    if(!originals.length)return 'missing';
    const signature=factSignature(anchor,known);
    return originals.every(row=>publicAt(row,from,through)&&factSignature(row,known)===signature)?'retained':'disputed';
  };
  // Respect the same public boundary as the library; an inaccessible preceding book cannot be an opening citation.
  if(previous.anchors.some(anchor=>!publicAt(anchor,previous.startTick,previous.endTick)||
      (sources.get(anchor.id)??[]).some(row=>!publicAt(row,previous.startTick,previous.endTick))))return undefined;
  const current=chapter.anchors.filter(anchor=>{
    const result=proof(anchor,chapter.startTick,chapter.endTick);
    return result==='retained'||!!stored&&result==='missing';
  }).slice().sort(chronological);
  if(!current.length||!stored&&current.length!==chapter.anchors.length)return undefined;
  const opening=current.filter(anchor=>anchor.tick<=current[0].tick+1);
  const hasColdProof=cold.includes(previous);
  const anchors=previous.anchors.flatMap(anchor=>{
    const result=proof(anchor,previous.startTick,previous.endTick);
    const quiet=quietNativeLine(anchor);
    if(result==='disputed'||result==='missing'&&(!hasColdProof||!quiet))return [];
    const text=quiet??narrated(anchor);
    return text?[{anchor,text}]:[];
  });
  const requested=previousHook?.(world,previous)?.eventId;
  const selection=requested?anchors.find(row=>row.anchor.id===requested):undefined;
  if(selection){
    const carry=unresolvedPastLine(selection.anchor);
    const nativeCarry=carry&&(previousHook===deriveChapterEndHook||deriveChapterEndHook(world,previous)?.eventId===requested);
    return {chapterId:previous.id,eventId:selection.anchor.id,text:`上回，${nativeCarry?carry:selection.text}`};
  }

  const tail=anchors.filter(row=>row.anchor.tick>=previous.endTick-2).reverse().sort((a,b)=>b.anchor.tick-a.anchor.tick);
  const related=tail.find(row=>opening.some(anchor=>connected(row.anchor,anchor)));
  if(related)return {chapterId:previous.id,eventId:related.anchor.id,text:`上回，${related.text}`};
  const newest=tail[0],thisSeason=season(current[0].month);
  if(!newest||!thisSeason||season(newest.anchor.month)===thisSeason)return undefined;
  return {chapterId:previous.id,eventId:newest.anchor.id,text:`上回，${newest.text}这一回，记事已到${thisSeason}月。`};
}
