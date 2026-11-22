import type { ChronicleAnchor } from '../types/world';
import { chapterFocalScore, chapterFocalThreadKey } from './chapterFocalScene';
import type { ChronicleLead } from './chronicleLead';
import type { FocalLayer } from './focalLayerEvidence';

export interface ChronicleReadingBeat {
  readonly kind:'opening'|'transition'|'focal'|'closing';
  readonly paragraphs:readonly string[];
  readonly eventIds:readonly string[];
  readonly paragraphEventIds:readonly (readonly string[])[];
  readonly title?:string;
}
export interface PacedChronicleScene {
  readonly anchor:ChronicleAnchor;
  readonly section:{readonly title:string;readonly paragraph:string};
  readonly quietParagraph?:string;
}

const CONTEXT_PERCENT=70;
const FOCAL_LIMIT=2;
const CONTEXT_PARAGRAPH_TARGET=150;
const FOCAL_SOFT_LIMIT=270;
const codepoints=(value:string)=>Array.from(value).length;

function sentences(value:string):string[]{
  return (value.match(/[^。！？!?…\n]+[。！？!?…]*|[…]+/gu)??[]).map(piece=>piece.trim())
    .filter(piece=>/[^。！？!?…]/u.test(piece))
    .map(piece=>/[。！？!?…]$/u.test(piece)?piece:piece.replace(/[，、：:；]$/u,'')+'。');
}
function contextCopy(value:string):string {
  // Ordinary months carry one or two complete factual sentences, not a string of shouted headings.
  const parts=sentences(value).slice(0,2);
  const limited=parts.length===2&&codepoints(parts.join(''))>118?parts.slice(0,1):parts;
  return limited.join('').replace(/[！!]+/gu,'。');
}
function focalCopy(value:string,budget:number):string {
  const parts=sentences(value);
  if(!parts.length)return '';
  const full=parts.join('');
  if(codepoints(full)<=budget||parts.length===1)return full;
  // Keep a complete attested outcome, never truncate in the middle of the subject, number or consequence.
  const last=parts[parts.length-1];
  const firstAndLast=parts[0]+last;
  return codepoints(firstAndLast)<=budget?firstAndLast:last;
}
const seasons=['春','夏','秋','冬'] as const;
function calendarMonth(anchor:ChronicleAnchor):number|undefined {
  const {year,month}=anchor;
  return Number.isSafeInteger(year)&&year>=1&&year<1_000_000&&Number.isSafeInteger(month)&&month>=1&&month<=12
    ? year*12+month-1 : undefined;
}
function changedSeason(previous:ChronicleAnchor,current:ChronicleAnchor,paragraph:string):string {
  const before=calendarMonth(previous),now=calendarMonth(current);
  if(before===undefined||now===undefined||now<=before||now-before!==current.tick-previous.tick)return '';
  const oldSeason=seasons[Math.floor((previous.month-1)/3)],season=seasons[Math.floor((current.month-1)/3)];
  if(oldSeason===season||!recordedSeason(current,paragraph))return '';
  return `时序入${season}。`;
}
function recordedSeason(anchor:ChronicleAnchor,firstParagraph:string):string {
  // Uses only the published source month (same season cycle as the world, not today's weather).
  const index=Number.isSafeInteger(anchor.month)&&anchor.month>=1&&anchor.month<=12?Math.floor((anchor.month-1)/3):-1;
  if(index<0)return '';
  const season=seasons[index];
  const alreadyNamed=new RegExp(`^(?:(?:开|入|初|暮|深|仲|孟|季)${season}(?:[，。]|$)|(?:那年|是年|当年|这年|时在|时值|时逢)?(?:初|暮|深|仲|孟|季)?${season}(?:天|日|月|间|季|初|末|已))`,'u');
  return alreadyNamed.test(firstParagraph)?'':`时在${season}月。`;
}
function leadBacks(anchor:ChronicleAnchor,lead:ChronicleLead|undefined):boolean {
  return !!lead&&anchor.tick>=lead.firstTick&&anchor.tick<=lead.lastTick&&lead.eventIds.includes(anchor.id)&&
    anchor.actorIds.includes(lead.actorId);
}

function withinFocalBudget(layers:readonly FocalLayer[],budget:number):readonly FocalLayer[] {
  const total=(rows:readonly FocalLayer[])=>rows.reduce((sum,row)=>sum+codepoints(row.text),0);
  if(total(layers)<=budget)return layers;
  // A long introduction may be skipped, not the attested resolution that made this event the chapter's focal scene.
  const body=layers.filter(row=>row.role!=='approach');
  return body.length&&total(body)<=budget?body:[];
}

/** Editorial presentation only. Sources are already scoped; this never writes new facts or stored chapter fields. */
export function buildSerializedChapterPacing(scenes:readonly PacedChronicleScene[],lead?:ChronicleLead,
  readFocal?: (anchor:ChronicleAnchor)=>readonly FocalLayer[]):ChronicleReadingBeat[]{
  const ordered=scenes.map(({anchor,section,quietParagraph},original)=>({
    anchor,section,original,quiet:contextCopy(quietParagraph||section.paragraph||section.title),score:chapterFocalScore(anchor),
  })).filter(row=>!!row.quiet).sort((a,b)=>a.anchor.tick-b.anchor.tick||a.original-b.original);
  if(!ordered.length)return [];
  const ranked=ordered.filter(row=>row.score>0).sort((a,b)=>b.score-a.score||
    Number(leadBacks(b.anchor,lead))-Number(leadBacks(a.anchor,lead))||a.original-b.original);
  const selected=new Set<string>();
  const primary=ranked[0];
  if(primary){
    selected.add(primary.anchor.id);
    const thread=chapterFocalThreadKey(primary.anchor);
    const second=ranked.find(row=>row.anchor.id!==primary.anchor.id&&row.anchor.tick!==primary.anchor.tick&&
      row.score>=primary.score*.78&&chapterFocalThreadKey(row.anchor)!==thread);
    // The second peak belongs only to a separately attested turn with sufficient breathing room.
    if(FOCAL_LIMIT>1&&second&&ordered.filter(row=>row!==primary&&row!==second&&row.score===0).length>=3)
      selected.add(second.anchor.id);
  }

  const firstFocal=ordered.findIndex(row=>selected.has(row.anchor.id));
  const lastFocal=ordered.reduce((last,row,index)=>selected.has(row.anchor.id)?index:last,-1);
  const firstTransition=firstFocal<0?1:Math.min(1,firstFocal);
  const opening=firstTransition>0?recordedSeason(ordered[0].anchor,ordered[0].quiet):'';
  const quietBudget=codepoints(opening)+ordered.reduce((total,row)=>total+(selected.has(row.anchor.id)?0:codepoints(row.quiet)),0);
  const perFocal=selected.size?Math.min(FOCAL_SOFT_LIMIT,Math.floor(quietBudget*(100-CONTEXT_PERCENT)/CONTEXT_PERCENT/selected.size)):0;
  type MutableBeat={kind:ChronicleReadingBeat['kind'];paragraphs:string[];eventIds:string[];paragraphEventIds:string[][];title?:string};
  const beats:MutableBeat[]=[];
  for(let index=0;index<ordered.length;index++){
    const row=ordered[index];
    if(selected.has(row.anchor.id)){
      const title=row.section.title;
      const budget=quietBudget?Math.max(0,perFocal-codepoints(title)):FOCAL_SOFT_LIMIT;
      const layers=withinFocalBudget(readFocal?.(row.anchor)??[],budget);
      const paragraph=focalCopy(row.section.paragraph||title,budget);
      beats.push({kind:'focal',title,eventIds:[row.anchor.id],
        paragraphs:layers.length?layers.map(detail=>detail.text):[paragraph||row.quiet],
        paragraphEventIds:layers.length?layers.map(detail=>[...detail.eventIds]):[[row.anchor.id]]});
      continue;
    }
    const kind=index<firstTransition?'opening':lastFocal>=0&&index>lastFocal||lastFocal<0&&index===ordered.length-1?'closing':'transition';
    let beat=beats.at(-1);
    if(beat?.kind!==kind){
      beat={kind,paragraphs:[],eventIds:[],paragraphEventIds:[]};
      beats.push(beat);
    }
    const season=index===0?(kind==='opening'?opening:''):changedSeason(ordered[index-1].anchor,row.anchor,row.quiet);
    const next=season+row.quiet;
    const previous=beat.paragraphs.at(-1);
    if(previous&&codepoints(previous+next)<=CONTEXT_PARAGRAPH_TARGET){
      beat.paragraphs[beat.paragraphs.length-1]=previous+next;
      beat.paragraphEventIds[beat.paragraphEventIds.length-1].push(row.anchor.id);
    }else{
      beat.paragraphs.push(next);
      beat.paragraphEventIds.push([row.anchor.id]);
    }
    beat.eventIds.push(row.anchor.id);
  }
  return beats;
}
