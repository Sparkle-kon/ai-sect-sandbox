import type {SectManagementState} from '../../types/sectManagement';
import {
  SECT_LIVE_CAST_LIMIT,SECT_LIVE_GIFT_COST,SECT_LIVE_GIFT_REPUTATION,SECT_LIVE_KINDS,SECT_LIVE_MONTH_LIMIT,
  SECT_LIVE_MONTHLY_LIMIT,SECT_LIVE_PLAYER_LINE_LIMIT,SECT_LIVE_VARIANTS,SECT_LIVE_WITNESS_LIMIT,
  isSectLiveText,sectLiveShowId,type SectLiveShow,type SectLiveState,
} from '../../types/sectLive';
import type {WorldEvent,WorldState} from '../../types/world';
import {isChronicleStoryFact} from '../chronicleLead';
import {RESOURCE_FLOW_MONTH_LIMIT} from '../resourceFlowEngine';
import {isSectLiveSourceId,knowsSectLiveSource,matchesSectLiveEvent} from '../sectLiveSources';
import {arr,fail as rejectShape,id,num,one,optional,structure,tick,type Validator} from './primitives';

const text:Validator=(value,path)=>{if(!isSectLiveText(value))rejectShape(path);};
const show=structure({
  id,tick,kind:one(...SECT_LIVE_KINDS),sourceEventId:id,siteId:id,castIds:arr(SECT_LIVE_CAST_LIMIT,id),
  bout:optional(structure({occasionId:id,round:num(1,32,true),bout:num(0,64,true)})),
  danmaku:arr(SECT_LIVE_WITNESS_LIMIT,structure({actorId:id,variant:one(...SECT_LIVE_VARIANTS)})),
  playerLines:optional(arr(SECT_LIVE_PLAYER_LINE_LIMIT,text)),
  gift:optional(structure({tick,leaderId:id,sectId:id,cost:one(SECT_LIVE_GIFT_COST),reputation:one(SECT_LIVE_GIFT_REPUTATION)})),
});
export const sectLiveShape=structure({shows:arr(SECT_LIVE_MONTH_LIMIT*SECT_LIVE_MONTHLY_LIMIT,show)});

const hotTailComplete=(world:WorldState,date:number)=>world.events.length<120||world.events.some(row=>row.tick<date);

function supportsShow(world:WorldState,entry:SectLiveShow):{live?:WorldEvent}|undefined{
  if(!isSectLiveSourceId(entry))return;
  const live=world.events.filter(event=>event.id===entry.sourceEventId);
  if(live.length>1||live.some(event=>event.tick!==entry.tick||event.locationId!==entry.siteId||
    event.witnessScope!==undefined||!isChronicleStoryFact(event,entry.tick)))return;
  // Old arena/furnace performance may have fallen out of its typed institution's history.
  // Retain the bounded archive row but not authority to reopen or reconstruct its scene.
  if(entry.tick===world.tick)return live[0]&&matchesSectLiveEvent(world,entry,live[0])?{live:live[0]}:undefined;
  if(live[0]&&matchesSectLiveEvent(world,entry,live[0]))return {live:live[0]};
  const anchors=[...world.chronicleArchive.anchors,
    ...[...world.chronicleArchive.chapters,...world.coldHistory.chapters]
      .filter(chapter=>chapter.startTick<=entry.tick&&chapter.endTick>=entry.tick).flatMap(chapter=>chapter.anchors)]
    .filter(event=>event.id===entry.sourceEventId);
  if(anchors.some(event=>event.tick!==entry.tick||event.locationId!==entry.siteId||!isChronicleStoryFact(event,entry.tick)))return;
  if(!live.length&&!anchors.length&&hotTailComplete(world,entry.tick))return;
  return {};
}

export function validateSectLive(world:WorldState,management:SectManagementState,state:SectLiveState|undefined,fail:(field:string)=>never):void{
  const rows=state?.shows??[];
  const newest=rows.at(-1)?.tick??world.tick;
  const people=new Map(world.cultivators.map(actor=>[actor.id,actor]));
  const sites=new Map(world.locations.map(site=>[site.id,site]));
  const seen=new Set<string>(),gifts=new Map<string,SectLiveShow>();
  let date=management.foundedTick,ordinal=-1;
  for(const entry of rows){
    const site=sites.get(entry.siteId);
    if(entry.tick<=management.foundedTick||entry.tick<date||entry.tick>(management.growth?.failure?.tick??world.tick)||
      newest-entry.tick>=SECT_LIVE_MONTH_LIMIT||!site||site.type==='secret_realm'||site.expeditionOmenId!==undefined||
      seen.has(entry.sourceEventId)||new Set(entry.castIds).size!==entry.castIds.length||
      entry.castIds.some(id=>!people.has(id))||entry.kind!=='tournament'&&entry.bout!==undefined)
      return fail('sectManagement.live.identity');
    if(entry.tick!==date){date=entry.tick;ordinal=-1;}
    const index=Array.from({length:SECT_LIVE_MONTHLY_LIMIT},(_,index)=>index).find(index=>entry.id===sectLiveShowId(entry.tick,index));
    if(index===undefined||index<=ordinal)return fail('sectManagement.live.identity');
    ordinal=index;seen.add(entry.sourceEventId);
    const source=supportsShow(world,entry);
    if(!source)return fail('sectManagement.live.source');
    if(entry.playerLines?.length===0)return fail('sectManagement.live.playerLines');
    const speakers=new Set<string>();
    for(const {actorId} of entry.danmaku){
      const actor=people.get(actorId);
      if(!actor||actorId===management.leaderId||speakers.has(actorId)||
        source.live&&entry.tick===world.tick&&!knowsSectLiveSource(actor,entry,source.live))
        return fail('sectManagement.live.danmaku');
      speakers.add(actorId);
    }
    const gift=entry.gift;
    if(gift!==undefined){
      if(gift.tick!==entry.tick||gift.leaderId!==management.leaderId||gift.sectId!==management.sectId)
        return fail('sectManagement.live.gift');
      gifts.set(entry.id,entry);
    }
  }
  const backed=new Set<string>();
  for(const book of world.resourceFlow.months){
    for(const flow of book.entries){
      if(flow.reason!=='livestream_tip')continue;
      const entry=gifts.get(flow.refId);
      if(!entry||backed.has(flow.refId)||flow.tick!==entry.tick||book.tick!==entry.tick||
        flow.kind!=='consumption'||flow.mechanism!=='sect_economy'||flow.good!=='stone'||
        flow.amount!==SECT_LIVE_GIFT_COST||flow.from.kind!=='sect'||flow.from.id!==management.sectId||
        flow.visibility.kind!=='participants'||flow.visibility.actorIds.length!==1||
        flow.visibility.actorIds[0]!==management.leaderId)return fail('sectManagement.live.giftFlow');
      backed.add(flow.refId);
    }
  }
  for(const [showId,entry] of gifts){
    if(backed.has(showId))continue;
    const book=world.resourceFlow.months.find(month=>month.tick===entry.tick);
    if(entry.tick===world.tick||entry.tick>world.tick-RESOURCE_FLOW_MONTH_LIMIT&&
      (!book||book.totalEntries===book.entries.length))return fail('sectManagement.live.giftFlow');
  }
}
