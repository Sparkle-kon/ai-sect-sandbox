import {sectPlayerFactCopy} from '../data/sectPlayerFactCopy';
import {
  SECT_PLAYER_CHAT_IDENTITIES, SECT_PLAYER_CHAT_IDENTITY_LABELS, SECT_PLAYER_CHAT_MONTH_LIMIT, SECT_PLAYER_CHAT_POST_LIMIT,
  SECT_PLAYER_CHAT_PRESETS, SECT_PLAYER_CHAT_ROOMS, isSectPlayerChatText, sectPlayerChatExposureRoll, sectPlayerChatPostId,
  type SectPlayerChatDraft,type SectPlayerChatIdentity,type SectPlayerChatIntent,type SectPlayerChatMonth,
  type SectPlayerChatPost,type SectPlayerChatPreset,type SectPlayerChatRoom,type SectPlayerChatState,
} from '../types/sectPlayerChat';
import {starterSectIdentity} from '../types/sectManagement';
import {sectRecurringEventId,sectRecurringIdentity} from '../types/sectRecurring';
import type {Cultivator,Rumor,Sect,WorldEvent,WorldState} from '../types/world';
import {cloneWorldWithColdHistory} from './coldHistoryEngine';
import {isChronicleStoryFact} from './chronicleLead';
import {adjustSectAffinity,sectRelation} from './diplomacyEngine';
import {isGrandSiegeFighterPresent} from './grandSiegePresence';
import {availableMarketActions,MARKET_GOODS,resolveMarketAction} from './marketEngine';
import {recordAuxiliaryActionEvent} from './recordAuxiliaryActionEvent';
import {flowActor,flowSect,recordResourceFlow} from './resourceFlowEngine';
import {onLowerPlane} from './upperPassageIsolation';
import {isSectActive} from './sectActivity';
import {knownMapLocations} from './terrainEngine';
import {activeBellWatchForActor} from './bellWatchPresence';
import {rememberSectAliasExposure} from './sectPlayerChatMemory';
import {projectSectChat} from './sectChat';

const PRESETS:Readonly<Record<SectPlayerChatPreset,{readonly label:string;readonly speech:string}>>={
  hype:{label:'替弟子出头',speech:'且论眼前之事，莫拿我门下弟子取笑。'},
  beg:{label:'哭穷',speech:'山门的风不花钱，修门的木头却要。各位若肯搭把手，本门记着。'},
  provoke:{label:'放狠话',speech:'贵宗若真有话，且堂堂正正说来。我们山门还立着。'},
  debunk:{label:'辟谣',speech:'这则传言且慢传抄。话经几次转手，便不一定还是原话。'},
  recruit_ad:{label:'打广告招新',speech:'本门愿收有心修行的道友。山门不大，肯来问路的，总有一盏茶。'},
};
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const live=(actor:Cultivator|undefined):actor is Cultivator=>!!actor&&actor.alive&&actor.hp>0&&onLowerPlane(actor);
const unique=<T extends {id:string}>(items:readonly T[],id:string):T|undefined=>{
  const rows=items.filter(row=>row.id===id);
  return rows.length===1?rows[0]:undefined;
};
const clip=(text:string,max=60)=>[...text.trim()].slice(0,max).join('');
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const DONATION=2;

export interface SectPlayerChatOption {
  readonly id:string;
  readonly label:string;
  readonly targetLabel?:string;
  readonly effect:string;
  readonly intent:SectPlayerChatIntent;
  readonly preset?:SectPlayerChatPreset;
}
export interface SectPlayerChatPrepared extends SectPlayerChatPost {
  readonly effect:string;
  readonly text:string;
}

function authority(world:WorldState){
  const managed=world.sectManagement;
  if(!managed||managed.growth?.failure)return;
  const leader=unique(world.cultivators,managed.leaderId),sect=unique(world.sects,managed.sectId);
  if(!isSectActive(sect)||!live(leader)||leader.id!==sect.leaderId||leader.sectId!==sect.id||leader.sectRank!=='掌门')return;
  return {leader,sect,managed};
}
const admitted=(room:SectPlayerChatRoom,identity:SectPlayerChatIdentity)=>
  SECT_PLAYER_CHAT_ROOMS.includes(room)&&SECT_PLAYER_CHAT_IDENTITIES.includes(identity)&&(room==='jiuzhou'||identity==='leader');
const currentMonth=(world:WorldState)=>world.sectManagement?.playerChat?.months.find(row=>row.tick===world.tick);
const atSite=(world:WorldState,actor:Cultivator,siteId:string)=>
  isGrandSiegeFighterPresent(world,actor,siteId)&&!activeBellWatchForActor(world,actor);
function sameForge(a:Rumor,b:Rumor):boolean{
  return a.id===b.id&&a.originTick===b.originTick&&a.originSourceCultivatorId===b.originSourceCultivatorId&&
    a.locationId===b.locationId&&a.subject===b.subject&&a.originEventId===undefined&&a.witnessScope===undefined;
}
function forged(world:WorldState,row:Rumor):boolean{
  const original=row.originSourceCultivatorId&&unique(world.cultivators,row.originSourceCultivatorId);
  if(!original||!row.id.startsWith(`rumor-forged-${row.originTick}-${original.id}-`)||row.originEventId!==undefined||
      row.witnessScope!==undefined||row.originTick>world.tick||world.tick-row.originTick>24||
      row.learnedTick>world.tick||row.learnedTick<row.originTick||!row.locationId||
      !world.locations.some(site=>site.id===row.locationId&&site.expeditionOmenId===undefined)||row.confidence<=25)return false;
  return original.rumors.some(origin=>sameForge(origin,row)&&origin.provenance==='fabricated'&&origin.hops===0&&
    origin.learnedTick===origin.originTick);
}
function knownPublicSource(world:WorldState,leader:Cultivator,id:string):WorldEvent|undefined{
  const source=unique(world.events,id);
  if(!source||source.tick>world.tick||world.tick-source.tick>12||!isChronicleStoryFact(source,world.tick))return;
  if(source.actorIds.includes(leader.id)||leader.rumors.some(row=>row.id===`rumor-${source.id}`&&row.originEventId===source.id&&
      row.originTick===source.tick&&row.learnedTick>=source.tick&&row.learnedTick<=world.tick&&row.witnessScope===undefined&&
      row.provenance!=='fabricated'&&row.subject===source.title))return source;
}
function admittedDonors(world:WorldState,leader:Cultivator,sect:Sect){
  if(sect.spiritStones>20||!atSite(world,leader,leader.locationId))return [];
  return world.cultivators.filter(actor=>actor.id!==leader.id&&actor.sectId!==sect.id&&live(actor)&&
    actor.age>=18&&Number.isFinite(actor.spiritStones)&&actor.spiritStones>=20&&
    unique(world.cultivators,actor.id)===actor&&atSite(world,actor,leader.locationId)&&
    world.relationships.some(edge=>((edge.fromId===leader.id&&edge.toId===actor.id)||(edge.fromId===actor.id&&edge.toId===leader.id))&&
      edge.type!=='血仇'&&edge.affinity>=25))
    .sort((a,b)=>compare(a.id,b.id)).slice(0,3);
}
function foreignNeighbors(world:WorldState,leader:Cultivator,sect:Sect){
  const sites=new Set(knownMapLocations(world,leader).map(site=>site.id));
  const managed=world.sectManagement;
  const recurring=managed&&sectRecurringIdentity(sect.id,starterSectIdentity(world.random.seed,managed.starterId,managed.draw).creditorId);
  return world.sects.filter(other=>{
    const rival=other.leaderId?unique(world.cultivators,other.leaderId):undefined;
    return other.id!==sect.id&&isSectActive(other)&&unique(world.sects,other.id)===other&&live(rival)&&rival.sectId===other.id&&
      (sites.has(other.headquartersId)||sectRelation(world,sect.id,other.id)!==undefined||recurring?.rivalSectId===other.id);
  }).sort((a,b)=>Number(b.id===recurring?.rivalSectId)-Number(a.id===recurring?.rivalSectId)||compare(a.id,b.id)).slice(0,4);
}
const quietOption:SectPlayerChatOption={id:'chat',label:'只传话',effect:'只发这一句话，不改公库、名声或外事。',intent:{kind:'chat'}};
const quick=(preset:SectPlayerChatPreset,intent:SectPlayerChatIntent,effect:string,targetId?:string,targetLabel?:string):SectPlayerChatOption=>
  ({id:targetId?`${preset}:${targetId}`:preset,label:PRESETS[preset].label,preset,intent,effect,...(targetLabel?{targetLabel}:{})});

export function quoteSectPlayerChatOptions(world:WorldState,roomId:SectPlayerChatRoom,identity:SectPlayerChatIdentity):readonly SectPlayerChatOption[]{
  const context=authority(world),month=currentMonth(world);
  if(!context||!admitted(roomId,identity)||(month?.usedSlots??0)>=SECT_PLAYER_CHAT_POST_LIMIT)return [];
  const {leader,sect,managed}=context,used=new Set(month?.usedEffects??[]);
  const options:SectPlayerChatOption[]=[quietOption];
  if(roomId==='own'){
    options.push(quick('hype',{kind:'chat'},'只给同门留一句话，不改江湖名声。'));
    return options;
  }
  if(!used.has('hype')){
    const people=new Set(world.cultivators.filter(actor=>actor.sectId===sect.id&&actor.id!==leader.id&&live(actor)).map(actor=>actor.id));
    if(people.size&&sect.reputation<100){
      const source=world.events.find(event=>event.actorIds.some(id=>people.has(id))&&knownPublicSource(world,leader,event.id));
      const intent:SectPlayerChatIntent=source?{kind:'hype',eventId:source.id}:{kind:'hype'};
      options.push(quick('hype',intent,'为本门说句公道话，宗门名声 +1。',source?.id,source&&clip(sectPlayerFactCopy(source.title))));
    }
  }
  if(!used.has('beg')){
    const donors=admittedDonors(world,leader,sect);
    if(donors.length)for(const donor of donors)options.push(quick('beg',{kind:'beg',donorId:donor.id},
      '这位在场旧识愿赠 2 灵石，钱从对方手中入本门公库。',donor.id,donor.name));
    else options.push(quick('beg',{kind:'beg'},'眼下没有愿出钱的在场旧识；只把求助的话传出去。'));
  }
  if(!used.has('provoke'))for(const target of foreignNeighbors(world,leader,sect)){
    const affinity=sectRelation(world,sect.id,target.id)?.affinity??0;
    if(affinity>-100)options.push(quick('provoke',{kind:'provoke',targetSectId:target.id},
      `两宗交情 ${-Math.min(6,100+affinity)}；对方照旧自行决定是否回应，不会立刻开战。`,target.id,target.name));
  }
  if(!used.has('debunk'))for(const rumor of leader.rumors.filter(row=>forged(world,row))
    .sort((a,b)=>compare(a.id,b.id)).slice(0,3)){
    options.push(quick('debunk',{kind:'debunk',rumorId:rumor.id},
      '让已经听过此传言的道友少信几分，别的消息不受影响。',rumor.id,clip(rumor.subject,48)));
  }
  if(!used.has('recruit_ad')&&(managed.playerChat?.recruitAd?.targetTick??-1)<=world.tick){
    options.push(quick('recruit_ad',{kind:'recruit_ad'},'下月拜访凡村时，掌门招新会得到一次助力；入门仍须本人自愿。'));
  }
  if(!used.has('sell')&&identity==='leader'&&atSite(world,leader,leader.locationId)){
    for(const ask of availableMarketActions(leader,world)){
      if(ask.action!=='PLACE_MARKET_SELL')continue;
      options.push({id:`sell:${ask.marketGood}`,label:'挂出坊市卖单',targetLabel:MARKET_GOODS[ask.marketGood].label,
        intent:{kind:'sell',good:ask.marketGood},
        effect:`把 1 份${MARKET_GOODS[ask.marketGood].label}交给坊市挂售，限价 ${ask.marketLimitPrice} 灵石；尚未成交。`});
    }
  }
  return options;
}

export function prepareSectPlayerChat(world:WorldState,draft:SectPlayerChatDraft,chosen?:string):SectPlayerChatPrepared|undefined{
  if(!draft||!draft.body||!admitted(draft.roomId,draft.identity))return;
  const options=quoteSectPlayerChatOptions(world,draft.roomId,draft.identity);
  let offer:SectPlayerChatOption|undefined,text:string,body:SectPlayerChatDraft['body'];
  if(draft.body.kind==='quick'){
    const {preset,optionId}=draft.body;
    if(!SECT_PLAYER_CHAT_PRESETS.includes(preset)||chosen!==undefined&&optionId!==undefined&&chosen!==optionId)return;
    const selected=chosen??optionId;
    const matches=options.filter(candidate=>candidate.preset===preset&&(selected===undefined||selected===candidate.id));
    offer=matches.length===1?matches[0]:undefined;
    if(!offer)return;
    text=PRESETS[preset].speech;
    body={kind:'quick',preset,optionId:offer.id};
  }else if(draft.body.kind==='free'){
    if(!isSectPlayerChatText(draft.body.text))return;
    // Only an explicitly chosen canonical option can turn already reviewed prose into a rule intent.
    offer=options.find(candidate=>candidate.id===(chosen??'chat'));
    if(!offer)return;
    text=draft.body.text;
    body={kind:'free',text};
  }else return;
  return {id:sectPlayerChatPostId(world.tick,currentMonth(world)?.usedSlots??0),tick:world.tick,
    roomId:draft.roomId,identity:draft.identity,body,intent:offer.intent,
    effect:offer.targetLabel?`目标「${offer.targetLabel}」：${offer.effect}`:offer.effect,text};
}

function actualRecognizer(world:WorldState,leader:Cultivator,sect:Sect):Cultivator|undefined{
  const managed=world.sectManagement;
  if(!managed)return;
  const ids=sectRecurringIdentity(sect.id,starterSectIdentity(world.random.seed,managed.starterId,managed.draw).creditorId);
  const zhao=unique(world.cultivators,ids.rival),rival=unique(world.sects,ids.rivalSectId);
  if(!live(zhao)||!isSectActive(rival)||zhao.sectId!==rival.id||rival.leaderId!==zhao.id||!atSite(world,zhao,zhao.locationId))return;
  const roomSpeaker=projectSectChat(world).find(room=>room.id==='jiuzhou')?.posts.some(post=>
    post.tick===world.tick&&post.senderId===zhao.id);
  const comparison=managed.recurring?.encounters.some(row=>{
    if(row.role!=='rival'||row.outcome!=='comparison'||row.entityId!==zhao.id||row.tick>world.tick)return false;
    const event=unique(world.events,sectRecurringEventId(row.tick,sect.id,'rival'));
    return event?.tick===row.tick&&event.witnessScope==='participants'&&event.actorIds.length===2&&
      event.actorIds[0]===zhao.id&&event.actorIds[1]===leader.id;
  });
  return roomSpeaker||comparison?zhao:undefined;
}

export function applySectPlayerChat(world:WorldState,draft:SectPlayerChatDraft,chosen?:string):WorldState{
  const prepared=prepareSectPlayerChat(world,draft,chosen);
  if(!prepared)return world;
  const next=cloneWorldWithColdHistory(world),context=authority(next);
  if(!context)return world;
  const {leader,sect,managed}=context;
  const {id,tick,roomId,identity,body,intent}=prepared;
  const old=managed.playerChat;
  let recruitAd=old?.recruitAd;
  switch(intent.kind){
    case 'chat':break;
    case 'hype':sect.reputation=clamp(sect.reputation+1,-100,100);break;
    case 'provoke':adjustSectAffinity(next,sect.id,intent.targetSectId,-6);break;
    case 'debunk':{
      const target=leader.rumors.find(row=>row.id===intent.rumorId&&forged(next,row));
      if(!target)return world;
      for(const holder of next.cultivators){
        if(!live(holder))continue;
        holder.rumors=holder.rumors.map(packet=>{
          if(!sameForge(packet,target)||packet.confidence<=25||packet.learnedTick>tick||packet.learnedTick<packet.originTick)return packet;
          const confidence=Math.max(25,packet.confidence-15);
          return {...packet,confidence,...(confidence<45?{lead:false}:{})};
        });
      }
      break;
    }
    case 'beg':{
      if(!intent.donorId)break;
      const source=admittedDonors(next,leader,sect).find(actor=>actor.id===intent.donorId);
      if(!source)return world;
      source.spiritStones-=DONATION;
      sect.spiritStones+=DONATION;
      const eventId=`evt-${id}-beg`,actorIds=[leader.id,source.id];
      recordResourceFlow(next,{kind:'transfer',from:flowActor(source.id),to:flowSect(sect.id),mechanism:'sect_economy',
        refId:eventId,reason:'player_chat_aid',good:'stone',amount:DONATION,visibility:{kind:'participants',actorIds}});
      recordAuxiliaryActionEvent(next,{id:eventId,tick,year:next.year,month:next.month,title:'一笔应急相助',
        description:`${source.name}自愿赠给${sect.name} 2 灵石，已经收入公库。`,category:'diplomacy',actorIds,
        locationId:leader.locationId,witnessScope:'participants'});
      break;
    }
    case 'recruit_ad':recruitAd={postedTick:tick,targetTick:tick+1};break;
    case 'sell':{
      const order=availableMarketActions(leader,next).find(item=>item.action==='PLACE_MARKET_SELL'&&item.marketGood===intent.good);
      if(!order||order.action!=='PLACE_MARKET_SELL')return world;
      const receipt=resolveMarketAction(next,leader,{chosenAction:order.action,marketGood:order.marketGood,
        marketQuantity:order.marketQuantity,marketLimitPrice:order.marketLimitPrice,innerMonologue:'按坊市规矩挂出售单。'});
      if(!receipt)return world;
      recordAuxiliaryActionEvent(next,receipt);
      break;
    }
  }
  const aliases={...old?.aliases};
  if(identity!=='leader'){
    const history=aliases[identity],count=(history?.posts??0)+1;
    let exposure=history?.exposure;
    const recognizer=!exposure&&count>=3&&(count>=5||sectPlayerChatExposureRoll(next.random.seed,tick,identity,currentMonth(next)?.usedSlots??0)===0)?
      actualRecognizer(next,leader,sect):undefined;
    if(recognizer){
      sect.reputation=clamp(sect.reputation-2,-100,100);
      const memoryId=rememberSectAliasExposure(recognizer,tick,identity);
      exposure={tick,recognizerId:recognizer.id,postId:id,...(memoryId?{memoryId}:{})};
    }
    aliases[identity]={posts:count,...(exposure?{exposure}:{})};
  }
  const month=currentMonth(next);
  const post:SectPlayerChatPost={id,tick,roomId,identity,body,intent};
  const recorded:SectPlayerChatMonth={tick,usedSlots:(month?.usedSlots??0)+1,
    usedEffects:[...(month?.usedEffects??[]),...(intent.kind==='chat'?[]:[intent.kind])],posts:[...(month?.posts??[]),post]};
  const state:SectPlayerChatState={months:[...(old?.months??[]).filter(row=>row.tick<tick&&tick-row.tick<SECT_PLAYER_CHAT_MONTH_LIMIT),recorded],
    aliases,...(recruitAd?{recruitAd}:{})};
  managed.playerChat=state;
  return next;
}

export interface SectPlayerChatMessage {
  readonly id:string;readonly tick:number;readonly roomId:SectPlayerChatRoom;readonly identity:SectPlayerChatIdentity;
  readonly name:string;readonly text:string;readonly exposed:boolean;readonly sourceEventId?:string;
}

export function projectSectPlayerChat(world:WorldState):readonly SectPlayerChatMessage[]{
  const context=authority(world);
  if(!context)return [];
  const {managed,leader}=context;
  const state=managed.playerChat;
  return (state?.months??[]).flatMap(month=>month.tick>world.tick?[]:month.posts.flatMap(post=>{
    if(post.tick!==month.tick||!admitted(post.roomId,post.identity))return [];
    const text=post.body.kind==='quick'?PRESETS[post.body.preset]?.speech:post.body.text;
    if(!isSectPlayerChatText(text))return [];
    const exposure=post.identity!=='leader'?state?.aliases[post.identity]?.exposure:undefined;
    const exposed=!!exposure&&exposure.tick<=world.tick;
    const name=post.identity==='leader'?leader.name:`${SECT_PLAYER_CHAT_IDENTITY_LABELS[post.identity]}${exposed?'（掌门）':''}`;
    const sourceEventId=post.roomId==='jiuzhou'&&post.intent.kind==='hype'&&post.intent.eventId&&
      knownPublicSource(world,leader,post.intent.eventId)?post.intent.eventId:undefined;
    return [{id:post.id,tick:post.tick,roomId:post.roomId,identity:post.identity,name,text,exposed,
      ...(sourceEventId?{sourceEventId}:{})}];
  }));
}
