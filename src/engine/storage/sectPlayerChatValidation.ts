import {sectAliasExposureMemoryText} from '../../data/sectPlayerChatLines';
import type {SectManagementState} from '../../types/sectManagement';
import {starterSectIdentity} from '../../types/sectManagement';
import {isSectPlayerChatText,SECT_PLAYER_CHAT_ALIASES,SECT_PLAYER_CHAT_IDENTITIES,SECT_PLAYER_CHAT_MONTH_LIMIT,
  SECT_PLAYER_CHAT_POST_LIMIT,SECT_PLAYER_CHAT_PRESETS,SECT_PLAYER_CHAT_ROOMS,sectPlayerChatExposureRoll,sectPlayerChatPostId,
  type SectPlayerChatAlias,type SectPlayerChatIntent,type SectPlayerChatPost,type SectPlayerChatState} from '../../types/sectPlayerChat';
import {sectRecurringEventId,sectRecurringIdentity} from '../../types/sectRecurring';
import type {WorldState} from '../../types/world';
import {isChronicleStoryFact} from '../chronicleLead';
import {arr,fail as rejectShape,id,num,one,optional,structure,tick,type Validator} from './primitives';

const good=one('jade_leaf','earth_root','star_bloom','shadow_moss','foundation','golden','barrier','heart_poison');
const effectKinds=[...SECT_PLAYER_CHAT_PRESETS,'sell'] as const;
const intents={
  chat:structure({kind:one('chat')}),
  hype:structure({kind:one('hype'),eventId:optional(id)}),
  beg:structure({kind:one('beg'),donorId:optional(id)}),
  provoke:structure({kind:one('provoke'),targetSectId:id}),
  debunk:structure({kind:one('debunk'),rumorId:id}),
  recruit_ad:structure({kind:one('recruit_ad')}),
  sell:structure({kind:one('sell'),good}),
} satisfies Record<SectPlayerChatIntent['kind'],Validator>;
const text:Validator=(value,path)=>{if(!isSectPlayerChatText(value))rejectShape(path);};
const bodies={quick:structure({kind:one('quick'),preset:one(...SECT_PLAYER_CHAT_PRESETS),optionId:optional(id)}),
  free:structure({kind:one('free'),text})};
function discriminated<T extends Record<string,Validator>>(shapes:T):Validator{
  return (value,path)=>{
    if(!value||typeof value!=='object'||!('kind' in value)||typeof value.kind!=='string'||!Object.hasOwn(shapes,value.kind))
      return rejectShape(path);
    return shapes[value.kind as keyof T](value,path);
  };
}
const post=structure({
  id,tick,roomId:one(...SECT_PLAYER_CHAT_ROOMS),identity:one(...SECT_PLAYER_CHAT_IDENTITIES),
  body:discriminated(bodies),intent:discriminated(intents),
});
const exposure=structure({tick,recognizerId:id,postId:id,memoryId:optional(id)});
const alias=structure({posts:num(1,300_000_000,true),exposure:optional(exposure)});
const aliases=structure({passing_senior:optional(alias),heaven_alt:optional(alias),helpful_adept:optional(alias)});
export const sectPlayerChatShape=structure({
  months:arr(SECT_PLAYER_CHAT_MONTH_LIMIT,structure({
    tick,usedSlots:num(1,SECT_PLAYER_CHAT_POST_LIMIT,true),usedEffects:arr(SECT_PLAYER_CHAT_POST_LIMIT,one(...effectKinds)),
    posts:arr(SECT_PLAYER_CHAT_POST_LIMIT,post),
  })),
  aliases,recruitAd:optional(structure({postedTick:tick,targetTick:tick})),
});

function postSlot(eventId:string,date:number):number{
  for(let index=0;index<SECT_PLAYER_CHAT_POST_LIMIT;index++)if(eventId===sectPlayerChatPostId(date,index))return index;
  return -1;
}
function matchesQuickSelection(entry:SectPlayerChatPost):boolean{
  const {body,intent}=entry;
  if(entry.roomId==='own'&&intent.kind!=='chat')return false;
  if(body.kind==='free')return true;
  if(intent.kind==='chat')return entry.roomId==='own'&&body.preset==='hype'&&(body.optionId===undefined||body.optionId==='hype');
  if(body.preset!==intent.kind)return false;
  const target=intent.kind==='hype'?intent.eventId:intent.kind==='beg'?intent.donorId:
    intent.kind==='provoke'?intent.targetSectId:intent.kind==='debunk'?intent.rumorId:undefined;
  return body.optionId===undefined||body.optionId===(target?`${body.preset}:${target}`:body.preset);
}

function anchoredIntent(world:WorldState,management:SectManagementState,entry:SectPlayerChatPost):boolean{
  const {intent}=entry;
  const leader=world.cultivators.find(actor=>actor.id===management.leaderId);
  switch(intent.kind){
    case 'chat':case 'recruit_ad':return true;
    case 'sell':return entry.identity==='leader'&&(entry.tick<world.tick||world.markets.orders.some(order=>
      order.placedTick===entry.tick&&order.side==='sell'&&order.actorId===management.leaderId&&order.good===intent.good&&order.quantity===1));
    case 'hype':{
      if(!intent.eventId)return true;
      const eventId=intent.eventId;
      if(!eventId.startsWith('evt-')||eventId.includes(`-${management.sectId}-`)&&
        /-(?:comic|pair-drama|guest-(?:wang|cat|rival|ancestor|host))$/u.test(eventId))return false;
      const matching=world.events.filter(event=>event.id===eventId);
      return matching.length<=1&&matching.every(event=>isChronicleStoryFact(event,entry.tick)&&entry.tick-event.tick<=12)&&
        (entry.tick<world.tick||matching.length===1&&(matching[0].actorIds.includes(management.leaderId)||
          leader?.rumors.some(rumor=>rumor.id===`rumor-${eventId}`&&rumor.originEventId===eventId&&
            rumor.originTick===matching[0].tick&&rumor.learnedTick>=rumor.originTick&&rumor.learnedTick<=entry.tick&&
            rumor.witnessScope===undefined&&rumor.provenance!=='fabricated'&&rumor.subject===matching[0].title))===true);
    }
    case 'provoke':return intent.targetSectId!==management.sectId&&world.sects.some(sect=>sect.id===intent.targetSectId);
    case 'debunk':{
      if(!intent.rumorId.startsWith('rumor-forged-'))return false;
      const rumor=leader?.rumors.find(packet=>packet.id===intent.rumorId);
      return rumor?rumor.witnessScope===undefined&&rumor.originEventId===undefined&&rumor.learnedTick<=entry.tick&&
        rumor.learnedTick>=rumor.originTick&&entry.tick-rumor.originTick<=24&&!!rumor.originSourceCultivatorId&&
        rumor.id.startsWith(`rumor-forged-${rumor.originTick}-${rumor.originSourceCultivatorId}-`):
        entry.tick<world.tick;
    }
    case 'beg':{
      if(intent.donorId===undefined)return true;
      if(intent.donorId===management.leaderId||!world.cultivators.some(actor=>actor.id===intent.donorId))return false;
      const receiptId=`evt-${entry.id}-beg`;
      const receipt=world.events.filter(event=>event.id===receiptId);
      const flowMonth=world.resourceFlow.months.find(book=>book.tick===entry.tick);
      const transfers=flowMonth?.entries.filter(flow=>flow.refId===receiptId)??[];
      if(transfers.length>1||!transfers.length&&(flowMonth?flowMonth.totalEntries===flowMonth.entries.length:entry.tick===world.tick)||
          transfers.some(flow=>flow.tick!==entry.tick||flow.kind!=='transfer'||flow.reason!=='player_chat_aid'||
            flow.mechanism!=='sect_economy'||flow.good!=='stone'||flow.amount!==2||flow.from.kind!=='actor'||
            flow.from.id!==intent.donorId||flow.to.kind!=='sect'||flow.to.id!==management.sectId||
            flow.visibility.kind!=='participants'||flow.visibility.actorIds.length!==2||
            flow.visibility.actorIds[0]!==management.leaderId||flow.visibility.actorIds[1]!==intent.donorId))return false;
      const calendar=world.year*12+world.month-(world.tick-entry.tick);
      return receipt.length<=1&&(receipt.length>0||world.events.length>=120&&!world.events.some(event=>event.tick<entry.tick))&&
        receipt.every(event=>event.tick===entry.tick&&event.year*12+event.month===calendar&&
        event.category==='diplomacy'&&event.witnessScope==='participants'&&event.actorIds.length===2&&
        event.actorIds[0]===management.leaderId&&event.actorIds[1]===intent.donorId&&
        !!event.locationId&&world.locations.some(site=>site.id===event.locationId&&site.expeditionOmenId===undefined));
    }
  }
}

export function validateSectPlayerChat(world:WorldState,management:SectManagementState,state:SectPlayerChatState,
  fail:(field:string)=>never):void{
  const newest=state.months.at(-1),oldest=state.months[0],latest=management.growth?.failure?.tick??world.tick;
  if(!newest||!oldest)return fail('sectManagement.playerChat.clock');
  let previous=management.foundedTick-1;
  const visibleAliasPosts=new Map<SectPlayerChatAlias,SectPlayerChatPost[]>();
  for(const month of state.months){
    if(month.tick<=previous||month.tick>latest||newest.tick-month.tick>=SECT_PLAYER_CHAT_MONTH_LIMIT)
      return fail('sectManagement.playerChat.clock');
    previous=month.tick;
    if(month.posts.length>month.usedSlots||month.usedEffects.length>month.usedSlots||
        new Set(month.usedEffects).size!==month.usedEffects.length)
      return fail('sectManagement.playerChat.limit');
    const retainedEffects=new Set<typeof month.usedEffects[number]>();
    let lastSlot=-1,lastEffect=-1;
    for(const entry of month.posts){
      const slot=postSlot(entry.id,month.tick);
      if(entry.tick!==month.tick||slot<=lastSlot||slot>=month.usedSlots||
        entry.roomId==='own'&&entry.identity!=='leader')
        return fail('sectManagement.playerChat.post');
      lastSlot=slot;
      if(entry.identity!=='leader'){
        const list=visibleAliasPosts.get(entry.identity)??[];
        list.push(entry);
        visibleAliasPosts.set(entry.identity,list);
      }
      if(entry.intent.kind!=='chat'){
        const effectIndex=month.usedEffects.indexOf(entry.intent.kind);
        if(effectIndex<=lastEffect||retainedEffects.has(entry.intent.kind))return fail('sectManagement.playerChat.limit');
        lastEffect=effectIndex;
        retainedEffects.add(entry.intent.kind);
      }
      if(!matchesQuickSelection(entry)||!anchoredIntent(world,management,entry))return fail('sectManagement.playerChat.intent');
    }
    // Redacted posts may leave empty slots, but may not grant an extra action on the same date.
    if(month.usedEffects.length-retainedEffects.size>month.usedSlots-month.posts.length)
      return fail('sectManagement.playerChat.limit');
  }

  const recognizer=sectRecurringIdentity(management.sectId,
    starterSectIdentity(world.random.seed,management.starterId,management.draw).creditorId).rival;
  const foundRecognizer=world.cultivators.find(actor=>actor.id===recognizer);
  let totalAliasPosts=0;
  for(const identity of SECT_PLAYER_CHAT_ALIASES){
    const ledger=state.aliases[identity],visible=visibleAliasPosts.get(identity)??[];
    if(!ledger){
      if(visible.length)return fail('sectManagement.playerChat.alias');
      continue;
    }
    totalAliasPosts+=ledger.posts;
    if(visible.length>ledger.posts)return fail('sectManagement.playerChat.alias');
    const exposed=ledger.exposure;
    if(!exposed)continue;
    const slot=postSlot(exposed.postId,exposed.tick),month=state.months.find(row=>row.tick===exposed.tick);
    const kept=month?.posts.find(entry=>entry.id===exposed.postId);
    const memories=exposed.memoryId===undefined||!foundRecognizer?[]:
      [...foundRecognizer.memories,...foundRecognizer.coreMemories].filter(memory=>memory.id===exposed.memoryId);
    const laterPosts=visible.filter(entry=>entry.tick>exposed.tick||
      entry.tick===exposed.tick&&postSlot(entry.id,entry.tick)>slot).length;
    const countAtExposure=ledger.posts-laterPosts;
    const roomWitness=management.chat?.months.some(row=>row.tick===exposed.tick&&row.posts.some(post=>
      post.roomId==='jiuzhou'&&post.senderId===recognizer&&post.audience===undefined));
    const signedComparison=management.recurring?.encounters.some(row=>row.role==='rival'&&row.outcome==='comparison'&&
      row.entityId===recognizer&&row.tick<=exposed.tick&&world.events.some(event=>
        event.id===sectRecurringEventId(row.tick,management.sectId,'rival')&&event.tick===row.tick&&
        event.witnessScope==='participants'&&event.actorIds.length===2&&event.actorIds[0]===recognizer&&
        event.actorIds[1]===management.leaderId));
    if(exposed.tick===world.tick&&!roomWitness&&!signedComparison||countAtExposure<3||countAtExposure<5&&sectPlayerChatExposureRoll(world.random.seed,exposed.tick,identity,slot)!==0||
        exposed.tick<management.foundedTick||exposed.tick>latest||exposed.tick>newest.tick||
        slot<0||exposed.recognizerId!==recognizer||!foundRecognizer||
        exposed.tick>=oldest.tick&&(!month||!kept||kept.identity!==identity||kept.roomId!=='jiuzhou')||
        exposed.memoryId!==undefined&&(!exposed.memoryId.startsWith(`mem-${exposed.tick}-${recognizer}-`)||
          exposed.tick===world.tick&&memories.length!==1||memories.length>1||
          memories.some(memory=>memory.tick!==exposed.tick||memory.category!=='social'||
            memory.content!==sectAliasExposureMemoryText(identity))))
      return fail('sectManagement.playerChat.exposure');
  }
  if(totalAliasPosts>(newest.tick-management.foundedTick+1)*SECT_PLAYER_CHAT_POST_LIMIT||
      oldest.tick===management.foundedTick&&totalAliasPosts>state.months.reduce((sum,month)=>sum+month.usedSlots,0))
    return fail('sectManagement.playerChat.alias');
  const ad=state.recruitAd,origin=ad&&state.months.find(row=>row.tick===ad.postedTick);
  if(ad&&(ad.targetTick!==ad.postedTick+1||ad.postedTick>world.tick||ad.targetTick<world.tick||
      !origin?.usedEffects.includes('recruit_ad')))return fail('sectManagement.playerChat.recruitAd');
}
