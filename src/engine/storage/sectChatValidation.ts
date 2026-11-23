import { findSectComedyTemplate } from '../../data/sectComedy';
import { SECT_CHAT_MONTH_LIMIT, SECT_CHAT_POST_LIMIT, SECT_CHAT_ROOMS, SECT_CHAT_VARIANTS,
  isSectChatModelText, sameSectChatReplyContext, sectChatPostId, type SectChatPost, type SectChatState } from '../../types/sectChat';
import { starterSectIdentity, type SectManagementState } from '../../types/sectManagement';
import { SECT_RECURRING_OUTCOMES, sectRecurringEventId, sectRecurringIdentity } from '../../types/sectRecurring';
import type { ChronicleAnchor, Cultivator, WorldState } from '../../types/world';
import { isChronicleStoryFact } from '../chronicleLead';
import { arr, fail as rejectShape, id, one, optional, structure, tick, type Validator } from './primitives';

const greetingShape=structure({kind:one('room_greeting'),kindOfGreeting:one('own','market','jiuzhou')});
const publicShape=structure({kind:one('public_event'),eventId:id,eventTick:tick,knowledge:one('witness','rumor')});
const comicShape=structure({kind:one('comic'),templateId:id});
const recurringShape=structure({kind:one('recurring'),role:one('wang','rival','ancestor','host'),outcome:one(...SECT_RECURRING_OUTCOMES)});
const shapes={room_greeting:greetingShape,public_event:publicShape,comic:comicShape,recurring:recurringShape};
const source:Validator=(value,path)=>{
  if(!value||typeof value!=='object'||!('kind' in value)||typeof value.kind!=='string'||!Object.hasOwn(shapes,value.kind))
    return rejectShape(path);
  return shapes[value.kind as keyof typeof shapes](value,path);
};
const postBase={
  id,roomId:one(...SECT_CHAT_ROOMS),senderId:id,tick,about:source,
  variant:one(...SECT_CHAT_VARIANTS),audience:optional(arr(2,id)),
};
const templatePost=structure({...postBase,source:one('template')});
const modelText:Validator=(value,path)=>{if(!isSectChatModelText(value))rejectShape(path);};
const modelPost=structure({...postBase,source:one('llm'),text:modelText,replyTo:optional(id)});
const post:Validator=(value,path)=>{
  if(!value||typeof value!=='object'||!('source' in value))return rejectShape(path);
  return (value.source==='llm'?modelPost:templatePost)(value,path);
};
export const sectChatShape=structure({months:arr(SECT_CHAT_MONTH_LIMIT,structure({tick,posts:arr(SECT_CHAT_POST_LIMIT,post)}))});
const validRecurringOutcomes={
  wang:['debt_notice','market_remark'],rival:['comparison'],ancestor:['ancestor_remark'],host:['host_cue','public_news'],
} satisfies Record<'wang'|'rival'|'ancestor'|'host', readonly string[]>;
const eligibleDatedRumor=(actor:Cultivator,eventId:string,eventTick:number,postTick:number,kind:'witness'|'rumor',title:string|undefined,known:ReadonlySet<string>)=>
  actor.rumors.some(rumor=>rumor.originTick===eventTick&&rumor.learnedTick===postTick&&
    rumor.witnessScope===undefined&&rumor.confidence>=25&&rumor.confidence<=100&&
    rumor.originEventId===eventId&&rumor.id===`rumor-${eventId}`&&(title===undefined||rumor.subject===title)&&
    (kind==='witness'?eventTick===postTick&&rumor.provenance==='witness'&&rumor.hops===0&&
      rumor.originSourceCultivatorId===actor.id&&rumor.sourceCultivatorId===undefined:
      (rumor.provenance==='conversation'||rumor.provenance==='flying_sword')&&postTick>eventTick&&
      Number.isSafeInteger(rumor.hops)&&rumor.hops>=1&&rumor.hops<=4&&rumor.sourceCultivatorId!==undefined&&
      known.has(rumor.sourceCultivatorId)&&rumor.sourceCultivatorId!==actor.id&&
      rumor.originSourceCultivatorId!==undefined&&known.has(rumor.originSourceCultivatorId)&&rumor.originSourceCultivatorId!==actor.id));
const withinHotTail=(world:WorldState,date:number)=>world.events.length<120||world.events.some(row=>row.tick<date);
function archivedSources(world:WorldState,id:string,at:number):ChronicleAnchor[]{
  return [...world.chronicleArchive.anchors.filter(anchor=>anchor.id===id),
    ...[...world.chronicleArchive.chapters,...world.coldHistory.chapters]
      .filter(chapter=>chapter.startTick<=at&&chapter.endTick>=at)
      .flatMap(chapter=>chapter.anchors.filter(anchor=>anchor.id===id))];
}

const isMajorChatEvent=(category:ChronicleAnchor['category'])=>
  category==='breakthrough'||category==='combat'||category==='death'||category==='heavenly';
function supportsPublic(world:WorldState,entry:SectChatPost,actor:Cultivator,management:SectManagementState,
  known:ReadonlySet<string>,repeat:boolean):boolean {
  const about=entry.about;
  if(about.kind!=='public_event'||entry.roomId==='leaders')return false;
  const {eventId,eventTick,knowledge}=about;
  const sectSuffix=`-${management.sectId}-`;
  if(eventTick>entry.tick||eventTick<management.foundedTick||(knowledge==='witness')!==(eventTick===entry.tick)||
      !eventId.startsWith('evt-')||
      eventId.includes(sectSuffix)&&/-(?:comic|pair-drama|guest-(?:wang|cat|rival|ancestor|host))$/u.test(eventId))
    return false;
  const live=world.events.filter(event=>event.id===eventId),history=archivedSources(world,eventId,eventTick);
  const retained=[...live,...history];
  if(live.length>1||retained.some(event=>event.tick!==eventTick||!isChronicleStoryFact(event,entry.tick))||
      live.length===0&&history.length===0&&withinHotTail(world,eventTick))return false;
  if(repeat&&(entry.roomId!=='jiuzhou'||retained.some(event=>!isMajorChatEvent(event.category))))return false;
  if(retained.some(event=>event.category!==retained[0].category||event.locationId!==retained[0].locationId)||
      retained.length&&entry.roomId==='market'&&!world.locations.some(site=>
        site.id===retained[0].locationId&&site.type==='market'&&site.expeditionOmenId===undefined))return false;
  const packet=eligibleDatedRumor(actor,eventId,eventTick,entry.tick,knowledge,live[0]?.title,known);
  if(packet||knowledge==='witness'&&retained.length>0&&retained.every(event=>event.actorIds.includes(actor.id)))return true;
  // Native witness and relay packets share the bounded rumor mailbox. A later turn can evict
  // either; keep the old transcript as history without giving it authority to navigate or cite a title.
  return entry.tick<world.tick;
}

export function validateSectChat(world:WorldState,management:SectManagementState,chat:SectChatState,fail:(field:string)=>never):void {
  const newest=chat.months.at(-1);
  if(!newest)return fail('sectManagement.chat.clock');
  const people=new Map(world.cultivators.map(actor=>[actor.id,actor]));
  const roles=sectRecurringIdentity(management.sectId,starterSectIdentity(world.random.seed,management.starterId,management.draw).creditorId);
  const known=new Set(people.keys());
  let last=management.foundedTick;
  for(const month of chat.months){
    if(month.tick<=last||month.tick>(management.growth?.failure?.tick??world.tick)||
        newest.tick-month.tick>=SECT_CHAT_MONTH_LIMIT||!month.posts.length)return fail('sectManagement.chat.clock');
    last=month.tick;
    let ordinal=-1;
    const sources=new Set<string>(),publicSources=new Set<string>(),previousPosts=new Map<string,SectChatPost>();
    for(const entry of month.posts){
      const sender=people.get(entry.senderId);
      const index=Array.from({length:SECT_CHAT_POST_LIMIT},(_,i)=>i)
        .find(i=>entry.id===sectChatPostId(management.sectId,month.tick,i));
      if(!sender||index===undefined||index<=ordinal||entry.tick!==month.tick)return fail('sectManagement.chat.identity');
      ordinal=index;
      const privateRoom=entry.roomId==='own'||entry.roomId==='leaders';
      if(privateRoom?
          entry.audience?.length!==2||entry.audience[0]!==entry.senderId||entry.audience[1]!==management.leaderId||
          entry.senderId===management.leaderId:
          entry.audience!==undefined)return fail('sectManagement.chat.audience');

      if(entry.source==='llm'){
        if(privateRoom)return fail('sectManagement.chat.audience');
        if(entry.replyTo!==undefined){
          const target=previousPosts.get(entry.replyTo);
          if(!target||!sameSectChatReplyContext(entry,target))return fail('sectManagement.chat.replyTo');
        }
      }
      previousPosts.set(entry.id,entry);
      const about=entry.about;
      const sourceKey=JSON.stringify([about.kind,about.kind==='public_event'?[about.eventId,entry.senderId]:
        about.kind==='recurring'?about.role:about.kind==='room_greeting'?[about.kindOfGreeting,
          privateRoom?null:entry.senderId]:null]);
      if(sources.has(sourceKey))return fail('sectManagement.chat.source');
      sources.add(sourceKey);
      if(about.kind==='room_greeting'){
        if(entry.roomId!==about.kindOfGreeting||
            entry.roomId==='own'&&!management.foundingDiscipleIds.includes(entry.senderId))
          return fail('sectManagement.chat.source');
      }else if(about.kind==='public_event'){
        if(!supportsPublic(world,entry,sender,management,known,publicSources.has(about.eventId)))
          return fail('sectManagement.chat.source');
        publicSources.add(about.eventId);
      }else if(about.kind==='comic'){
        const markerId=`evt-${entry.tick}-${management.sectId}-comic`;
        const marker=world.events.filter(event=>event.id===markerId);
        const moments=management.comedy?.moments??[];
        const moment=moments.find(row=>row.tick===entry.tick);
        if(entry.roomId!=='own'||findSectComedyTemplate(about.templateId)?.chatHook?.group!=='own'||
            moment&&(moment.speakerId!==entry.senderId||moment.templateId!==about.templateId)||
            !moment&&(entry.tick===world.tick||moments.length&&entry.tick>=moments[0].tick)||
            marker.length>1||!marker.length&&withinHotTail(world,entry.tick)||
            marker.some(event=>event.tick!==entry.tick||event.category!=='diplomacy'||event.witnessScope!=='participants'||
                event.locationId!==undefined||event.dialogue!==undefined||event.actorIds.length!==1||event.actorIds[0]!==entry.senderId))
          return fail('sectManagement.chat.source');
      }else{
        const encounters=management.recurring?.encounters??[];
        const recurring=encounters.find(row=>row.tick===entry.tick&&row.role===about.role);
        const markers=world.events.filter(event=>event.id===sectRecurringEventId(entry.tick,management.sectId,about.role));
        const outcomes:readonly string[]=validRecurringOutcomes[about.role];
        if(entry.roomId!=='leaders'||!outcomes.includes(about.outcome)||
            entry.senderId!==roles[about.role]||
            recurring&&(recurring.entityId!==entry.senderId||recurring.outcome!==about.outcome)||
            !recurring&&(entry.tick===world.tick||encounters.length&&entry.tick>encounters[0].tick)||markers.length>1||
            !markers.length&&withinHotTail(world,entry.tick)||
            markers.some(event=>event.tick!==entry.tick||event.category!=='diplomacy'||event.witnessScope!=='participants'||
              event.locationId!==undefined||event.dialogue!==undefined||event.actorIds.length!==2||
              event.actorIds[0]!==entry.senderId||event.actorIds[1]!==management.leaderId))
          return fail('sectManagement.chat.source');
      }
    }
  }
}
