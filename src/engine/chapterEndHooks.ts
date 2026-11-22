import type {ChronicleAnchor,ChronicleChapter,MarketShipment,SectSiege,WorldState} from '../types/world';
import {isChronicleStoryFact} from './chronicleLead';
import {isScopedExpeditionGate} from './expeditionOmenTerms';

export interface ChapterEndHook {readonly text:string;readonly eventId:string}
type ChapterSource=Pick<ChronicleChapter,'startTick'|'endTick'|'anchors'>;
type Candidate=ChapterEndHook&{tick:number};

const tickValid=(tick:number)=>Number.isSafeInteger(tick)&&tick>=1;
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
function uniquely<T>(rows:readonly T[]):T|undefined{return rows.length===1?rows[0]:undefined;}
function sameIds(a:readonly string[],b:readonly string[]):boolean{
  return a.length===b.length&&a.every((id,i)=>id===b[i]);
}
function clean(value:string,limit:number){
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,limit);
}
function samePublicSource(a:ChronicleAnchor,b:ChronicleAnchor):boolean{
  return a.id===b.id&&a.tick===b.tick&&a.year===b.year&&a.month===b.month&&a.category===b.category&&
    a.locationId===b.locationId&&sameIds(a.actorIds,b.actorIds.slice(0,12))&&
    clean(a.title,80)===clean(b.title,80)&&clean(a.description,220)===clean(b.description,220);
}

/** Require the sampled chapter anchor and at least one independent retained public original. */
function sourceResolver(world:WorldState,chapter:ChapterSource){
  const collect=<T extends ChronicleAnchor>(rows:readonly T[], exactIds?:ReadonlySet<string>)=>{
    const index=new Map<string,T[]>();
    for(const row of rows){
      if(exactIds&&!exactIds.has(row.id))continue;
      const list=index.get(row.id);
      if(list)list.push(row);else index.set(row.id,[row]);
    }
    return index;
  };
  const sampled=collect(chapter.anchors),wanted=new Set(sampled.keys());
  const hot=collect(world.events,wanted),archive=collect(world.chronicleArchive.anchors,wanted);
  return (id:string):ChronicleAnchor|undefined=>{
    const anchor=uniquely(sampled.get(id)??[]);
    const live=hot.get(id)??[],filed=archive.get(id)??[];
    if(!anchor||!tickValid(anchor.tick)||anchor.tick<chapter.startTick||anchor.tick>chapter.endTick||
      !isChronicleStoryFact(anchor,chapter.endTick)||live.length>1||filed.length>1||live.length+filed.length===0||
      [...live,...filed].some(row=>!isChronicleStoryFact(row,chapter.endTick)||!samePublicSource(anchor,row)))return undefined;
    return anchor;
  };
}
type ResolveSource=ReturnType<typeof sourceResolver>;

function liveMarketHook(world:WorldState,shipment:MarketShipment,end:number,source:ResolveSource):Candidate|undefined{
  const {id,sequence,buyerId,sellerId,originId,destinationId,departedTick,arrivalTick,status,settledTick}=shipment;
  if(!Number.isSafeInteger(sequence)||sequence<1||id!==`caravan-${sequence}`||buyerId===sellerId||originId===destinationId||
    !tickValid(departedTick)||departedTick>end||!tickValid(arrivalTick)||arrivalTick<=end||arrivalTick<departedTick+2||arrivalTick>departedTick+6)return undefined;
  const departure=source(`evt-${departedTick}-market-${id}`);
  if(!departure||departure.tick!==departedTick||departure.locationId!==originId||departure.category!=='diplomacy'||
    departure.title!=='跨坊商队启程'||!sameIds(departure.actorIds,[buyerId,sellerId]))return undefined;
  const ports=[originId,destinationId].map(id=>uniquely(world.locations.filter(site=>site.id===id)));
  if(ports.some(site=>!site||site.type!=='market'||isScopedExpeditionGate(site)))return undefined;
  const receipts=world.markets.receipts.filter(row=>row.shipmentId===id);
  if(status==='in_transit'){
    // A terminal receipt or closed date contradicts a purported in-transit row.
    if(settledTick!==undefined||receipts.length)return undefined;
  }else{
    if(settledTick===undefined||!tickValid(settledTick)||settledTick<=end||settledTick>world.tick)return undefined;
    const actual=uniquely(receipts);
    if(!actual||actual.tick!==settledTick||actual.status!==status||actual.buyerId!==buyerId||actual.sellerId!==sellerId||
      actual.originId!==originId||actual.destinationId!==destinationId||actual.good!==shipment.good||
      actual.quantity!==shipment.quantity||actual.unitPrice!==shipment.unitPrice)return undefined;
  }
  return {eventId:departure.id,tick:departure.tick,text:'这卷停笔时，商队已经启程，货还没有到埠。'};
}

function marchingHook(world:WorldState,siege:SectSiege,end:number,source:ResolveSource):Candidate|undefined{
  const {id,theatre,startedTick,destinationId,attackerSectId,defenderSectId,status,participantIds}=siege;
  if(!theatre||!tickValid(startedTick)||startedTick>end||theatre.openedTick!==startedTick||
    id!==`siege-${startedTick}-${attackerSectId}-${defenderSectId}`||attackerSectId===defenderSectId||
    theatre.sourceLaunchId!==`evt-${startedTick}-dip-${attackerSectId}-${defenderSectId}-launch_siege`||
    participantIds.length<2||theatre.rounds.some(row=>row.tick<=end)||theatre.terminal&&theatre.terminal.tick<=end)return undefined;
  const launched=source(theatre.sourceLaunchId);
  if(!launched||launched.tick!==startedTick||launched.category!=='diplomacy'||launched.title!=='宗门集结攻山'||
    !launched.locationId||!launched.actorIds.length||launched.actorIds.some(id=>!participantIds.includes(id)))return undefined;
  const venue=uniquely(world.locations.filter(row=>row.id===destinationId));
  if(!venue||isScopedExpeditionGate(venue))return undefined;
  const waiting={eventId:launched.id,tick:launched.tick,text:'出征已经定下。写到这儿，人马还没到山门。'};
  const arrival=theatre.arrivedTick;
  if(arrival!==undefined){
    if(!tickValid(arrival)||arrival<=startedTick||arrival>world.tick)return undefined;
    if(arrival>end)return waiting;
    const reached=source(`evt-${arrival}-dip-${id}`);
    if(!reached||reached.tick!==arrival||reached.category!=='diplomacy'||reached.title!=='联军抵达山门'||
      reached.locationId!==destinationId||!reached.actorIds.length||reached.actorIds.some(id=>!participantIds.includes(id)))return undefined;
    // A current known open campaign or the dated subsequent native round/terminal confirms the cutoff.
    if(!(status==='sieging'&&!theatre.terminal||theatre.rounds.some(row=>row.tick>end&&row.tick<=world.tick)||
      theatre.terminal&&theatre.terminal.tick>end&&theatre.terminal.tick<=world.tick))return undefined;
    return {eventId:reached.id,tick:reached.tick,text:'人马到了山门外。这一卷还没写到开阵。'};
  }
  if(!(status==='marching'&&!theatre.terminal||theatre.terminal&&theatre.terminal.tick>end&&theatre.terminal.tick<=world.tick))return undefined;
  return waiting;
}

/** A plain closing line only where a real public unresolved thread is still provable at this chapter's cutoff. */
export function deriveChapterEndHook(world:WorldState,chapter:ChapterSource):ChapterEndHook|undefined{
  const {startTick,endTick}=chapter;
  if(!tickValid(startTick)||!tickValid(endTick)||startTick>endTick||endTick>world.tick||!chapter.anchors.length)return undefined;
  const source=sourceResolver(world,chapter);
  const ids=new Map<string,number>();
  for(const row of [...world.markets.shipments,...world.sieges])ids.set(row.id,(ids.get(row.id)??0)+1);
  const candidates=[
    ...world.markets.shipments.flatMap(row=>ids.get(row.id)===1?liveMarketHook(world,row,endTick,source)??[]:[]),
    ...world.sieges.flatMap(row=>ids.get(row.id)===1?marchingHook(world,row,endTick,source)??[]:[]),
  ];
  const chosen=candidates.sort((a,b)=>b.tick-a.tick||compare(a.eventId,b.eventId))[0];
  return chosen?{eventId:chosen.eventId,text:chosen.text}:undefined;
}
