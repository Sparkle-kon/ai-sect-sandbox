import {sectPlayerFactCopy} from '../data/sectPlayerFactCopy';
import {isSectChallengeCut,matchSectChallengeResult} from './sectChallengeProof';
import {CHALLENGE_RESULT_VOICES,LABELS,GREETINGS,COMIC_NEUTRAL,WITNESS_VOICES,RUMOR_VOICES,GRAVE_VOICES,type Greeting} from '../data/sectChatVoices';
import {SECT_COMEDY_TEMPLATES} from '../data/sectComedy';
import {SECT_RECURRING_VOICES} from '../data/sectComedy/recurring';
import {SECT_CHAT_MONTH_LIMIT,SECT_CHAT_POST_LIMIT,SECT_CHAT_ROOMS,SECT_CHAT_VARIANTS,isSectChatModelText,sameSectChatReplyContext,sectChatPostId,
  type SectChatPost,type SectChatRoomId,type SectChatSource,type SectChatVariant} from '../types/sectChat';
import {starterSectIdentity} from '../types/sectManagement';
import {sectRecurringEventId,sectRecurringIdentity,type SectRecurringRole} from '../types/sectRecurring';
import type {Cultivator,WorldEvent,WorldState} from '../types/world';
import {isChronicleStoryFact} from './chronicleLead';
import {isSectActive} from './sectActivity';
import {projectSectComicMoment,sectComicEventId} from './sectComedy';
import {onLowerPlane} from './upperPassageIsolation';
import {sameGeneratedWorld} from './worldIdentity';
import {projectSectAliasRivalReply} from './sectPlayerChatMemory';


const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const living=(actor:Cultivator)=>actor.alive&&actor.hp>0&&onLowerPlane(actor);
function uniqueIndex<T>(rows:readonly T[],key:(row:T)=>string):ReadonlyMap<string,T>{
  const index=new Map<string,T>(),duplicate=new Set<string>();
  for(const row of rows){
    const id=key(row);
    if(index.has(id)){index.delete(id);duplicate.add(id);}
    else if(!duplicate.has(id))index.set(id,row);
  }
  return index;
}
const byId=<T extends {id:string}>(rows:readonly T[])=>uniqueIndex(rows,row=>row.id);
const isPublic=(event:WorldEvent,tick:number)=>event.id.startsWith('evt-')&&event.witnessScope===undefined&&isChronicleStoryFact(event,tick);
const sameEvent=(saved:WorldEvent|undefined,event:WorldEvent):boolean=>saved===event||!!saved&&saved.tick===event.tick&&
  saved.title===event.title&&saved.locationId===event.locationId&&saved.category===event.category&&
  saved.witnessScope===event.witnessScope&&saved.actorIds.length===event.actorIds.length&&
  event.actorIds.every((id,index)=>saved.actorIds[index]===id);
const isMarket=(world:WorldState,siteId:string|undefined)=>siteId!==undefined&&
  world.locations.some(site=>site.id===siteId&&site.type==='market'&&site.expeditionOmenId===undefined);
const chatActor=(actor:Cultivator|undefined):actor is Cultivator=>!!actor&&living(actor);
const escapeTitle=(title:string)=>[...title.replace(/[\r\n\t]/gu,' ').trim()].slice(0,60).join('');
function variant(world:WorldState,key:string):SectChatVariant{
  let hash=(world.random.seed^world.tick)>>>0;
  for(const character of key)hash=Math.imul(hash^character.charCodeAt(0),16777619)>>>0;
  return SECT_CHAT_VARIANTS[hash%SECT_CHAT_VARIANTS.length];
}

type PublicSource=Extract<SectChatSource,{kind:'public_event'}>;
interface PublicCandidate {readonly actor:Cultivator;readonly event:WorldEvent;readonly knowledge:PublicSource['knowledge']}
function knownPublicEvent(actor:Cultivator,event:WorldEvent,learnedNow:number,known:ReadonlyMap<string,Cultivator>):PublicSource['knowledge']|undefined{
  if(event.tick===learnedNow&&event.actorIds.includes(actor.id))return 'witness';
  for(const rumor of actor.rumors){
    if(rumor.id!==`rumor-${event.id}`||rumor.originEventId!==event.id||rumor.originTick!==event.tick||
      rumor.subject!==event.title||rumor.witnessScope!==undefined||rumor.learnedTick!==learnedNow||rumor.learnedTick<rumor.originTick||
      rumor.confidence<25||rumor.confidence>100)continue;
    if(rumor.provenance==='witness'&&rumor.hops===0&&rumor.learnedTick===rumor.originTick&&
      rumor.originSourceCultivatorId===actor.id&&rumor.sourceCultivatorId===undefined)return 'witness';
    if((rumor.provenance==='conversation'||rumor.provenance==='flying_sword')&&Number.isSafeInteger(rumor.hops)&&
      rumor.hops>=1&&rumor.hops<=4&&rumor.learnedTick>rumor.originTick&&rumor.sourceCultivatorId&&
      rumor.sourceCultivatorId!==actor.id&&known.has(rumor.sourceCultivatorId)&&rumor.originSourceCultivatorId&&
      rumor.originSourceCultivatorId!==actor.id&&known.has(rumor.originSourceCultivatorId))return 'rumor';
  }
}

function exactPrivateMarker(events:ReadonlyMap<string,WorldEvent>,id:string,tick:number,actorIds:readonly string[]){
  const event=events.get(id);
  return !!event&&event.tick===tick&&event.category==='diplomacy'&&event.witnessScope==='participants'&&
    event.actorIds.length===actorIds.length&&actorIds.every((actorId,index)=>event.actorIds[index]===actorId)&&
    event.locationId===undefined&&event.dialogue===undefined;
}

const templates=byId(SECT_COMEDY_TEMPLATES);
const recurringRoles=['wang','rival','ancestor','host'] as const satisfies readonly Exclude<SectRecurringRole,'cat'>[];
const managedContext=(world:WorldState)=>{
  const managed=world.sectManagement;
  if(!managed)return;
  const actors=byId(world.cultivators),leader=actors.get(managed.leaderId),sect=byId(world.sects).get(managed.sectId);
  if(!isSectActive(sect)||!chatActor(leader)||leader.sectId!==sect.id||sect.leaderId!==leader.id)return;
  return {managed,actors,leader,sect};
};

type Draft=Omit<Extract<SectChatPost,{source:'template'}>,'id'|'tick'|'source'|'variant'>;
const BASE_POST_LIMIT=8;
const MAJOR_POST_LIMIT=4;
const publicRoom=(room:SectChatRoomId)=>room==='jiuzhou'||room==='market';
const major=(event:WorldEvent,tick:number)=>event.tick===tick&&
  (event.category==='breakthrough'||event.category==='combat'||event.category==='heavenly'||event.category==='death');
const audience=(senderId:string,leaderId:string):Draft['audience']=>[senderId,leaderId];
function publicDraft(candidate:PublicCandidate,roomId:Exclude<SectChatRoomId,'leaders'>,leaderId:string):Draft{
  const {event,actor,knowledge}=candidate;
  return {roomId,senderId:actor.id,about:{kind:'public_event',eventId:event.id,eventTick:event.tick,knowledge},
    ...(roomId==='own'?{audience:audience(actor.id,leaderId)}:{})};
}
function recurringIdentity(world:WorldState){
  const managed=world.sectManagement;
  if(managed)return sectRecurringIdentity(managed.sectId,starterSectIdentity(world.random.seed,managed.starterId,managed.draw).creditorId);
}

export function settleSectChatMonth(world:WorldState,prevWorld:WorldState,completedPublicEvents:readonly WorldEvent[]):void{
  const context=managedContext(world);
  if(!context||context.managed.growth?.failure||world.tick!==prevWorld.tick+1||!sameGeneratedWorld(world,prevWorld)||
    context.managed.chat?.months.some(row=>row.tick>=world.tick))return;
  const {actors,leader,managed}=context;
  const retained=byId(world.events);
  const thisMonth=byId(completedPublicEvents.filter(event=>event.tick===world.tick));
  // An event must exist in the completed native batch for this month. Older retained facts are
  // eligible only when a character actually learned a matching relay this month.
  const publicEvents=[...[...thisMonth.values()].filter(event=>sameEvent(retained.get(event.id),event)),
    ...[...retained.values()].filter(event=>event.tick<world.tick)]
    .filter(event=>event.tick>managed.foundedTick&&isPublic(event,world.tick)&&
      (!isSectChallengeCut(event)||matchSectChallengeResult(world,event)));
  const candidates:PublicCandidate[]=[];
  const alive=[...actors.values()].filter(living).sort((a,b)=>cmp(a.id,b.id));
  const liveDisciple=(actor:Cultivator)=>actor.sectId===managed.sectId&&actor.id!==leader.id&&actor.sectRank!=='掌门';
  const bySource=byId(publicEvents);
  // Walk actual participants and each actor's bounded knowledge packets; do not multiply the
  // roster by the event stream or infer old witnesses from a current map position.
  const offered=new Set<string>();
  const offer=(actor:Cultivator,event:WorldEvent)=>{
    const key=JSON.stringify([actor.id,event.id]);
    if(offered.has(key))return;
    const knowledge=knownPublicEvent(actor,event,world.tick,actors);
    if(!knowledge)return;
    offered.add(key);
    candidates.push({actor,event,knowledge});
  };
  for(const event of publicEvents){
    if(event.tick!==world.tick)continue;
    for(const id of event.actorIds){
      const actor=actors.get(id);
      if(chatActor(actor))offer(actor,event);
    }
  }
  for(const actor of alive)for(const row of actor.rumors){
    if(row.learnedTick!==world.tick||!row.originEventId)continue;
    const event=bySource.get(row.originEventId);
    if(event)offer(actor,event);
  }
  const recurring=recurringIdentity(world);
  const currentChallenges=new Set(publicEvents.filter(event=>event.tick===world.tick&&isSectChallengeCut(event)).map(event=>event.id));
  const score=(candidate:PublicCandidate)=>Number(currentChallenges.has(candidate.event.id))*64+Number(candidate.knowledge==='rumor')*16+
    Number(candidate.knowledge==='rumor'&&candidate.actor.id===recurring?.rival)*8+
    Number(candidate.event.actorIds.includes(candidate.actor.id))*8+
    Number(candidate.event.category==='breakthrough'||candidate.event.category==='combat')*4+
    Number(candidate.event.tick===world.tick)*2;
  candidates.sort((a,b)=>score(b)-score(a)||cmp(a.event.id,b.event.id)||cmp(a.actor.id,b.actor.id));
  const drafts:Draft[]=[];
  const used=new Set<string>();
  const pick=(room:Exclude<SectChatRoomId,'leaders'>,predicate:(candidate:PublicCandidate)=>boolean)=>{
    const match=candidates.find(candidate=>!used.has(candidate.event.id)&&!major(candidate.event,world.tick)&&predicate(candidate));
    if(!match)return;
    used.add(match.event.id);
    drafts.push(publicDraft(match,room,leader.id));
  };
  const comedy=managed.comedy?.moments.find(row=>row.tick===world.tick);
  const comicSpeaker=comedy&&actors.get(comedy.speakerId);
  if(comedy&&chatActor(comicSpeaker)&&liveDisciple(comicSpeaker)&&
    exactPrivateMarker(retained,sectComicEventId(world.tick,managed.sectId),world.tick,[comicSpeaker.id])){
    const rumor=projectSectComicMoment(world,comedy)?.rumorHook;
    const room=rumor?.group??(templates.get(comedy.templateId)?.chatHook?.group==='own'?'own':undefined);
    if(room&&room!=='leaders')drafts.push({roomId:room,senderId:comicSpeaker.id,
      about:{kind:'comic',templateId:comedy.templateId,...(rumor?{rumor:1 as const}:{})},
      ...(room==='own'?{audience:audience(comicSpeaker.id,leader.id)}:{})});
  }
  if(recurring)for(const role of recurringRoles){
    const note=managed.recurring?.encounters.find(row=>row.tick===world.tick&&row.role===role&&row.entityId===recurring[role]);
    const actor=note&&actors.get(note.entityId);
    if(!note||!chatActor(actor)||actor.id===leader.id||!SECT_RECURRING_VOICES[note.outcome].length||
      !exactPrivateMarker(retained,sectRecurringEventId(world.tick,managed.sectId,role),world.tick,[actor.id,leader.id]))continue;
    drafts.push({roomId:'leaders',senderId:actor.id,about:{kind:'recurring',role,outcome:note.outcome},
      audience:audience(actor.id,leader.id)});
  }
  pick('market',row=>isMarket(world,row.event.locationId)&&(isMarket(world,row.actor.locationId)||
    row.event.tick===world.tick&&row.event.actorIds.includes(row.actor.id)));
  if(!drafts.some(row=>row.roomId==='own'))pick('own',row=>liveDisciple(row.actor));
  pick('jiuzhou',()=>true);
  const greet=(room:Greeting,speakers:readonly Cultivator[])=>{
    const actor=speakers[(world.tick+variant(world,room))%speakers.length];
    if(actor&&!drafts.some(post=>post.roomId===room))drafts.push({roomId:room,senderId:actor.id,
      about:{kind:'room_greeting',kindOfGreeting:room},...(room==='own'?{audience:audience(actor.id,leader.id)}:{})});
  };
  greet('own',alive.filter(actor=>liveDisciple(actor)&&managed.foundingDiscipleIds.includes(actor.id)));
  greet('jiuzhou',alive.filter(actor=>actor.id!==leader.id));
  greet('market',alive.filter(actor=>isMarket(world,actor.locationId)));
  pick('jiuzhou',row=>row.knowledge==='rumor');
  // Preserve the established first voices. If the quieter rooms used fewer than three
  // public seats, choose another evidenced source first, then neutral distinct speakers.
  const publicCount=()=>drafts.filter(post=>publicRoom(post.roomId)).length;
  while(publicCount()<3){
    const length=drafts.length;
    pick('jiuzhou',()=>true);
    if(drafts.length===length)break;
  }
  const greetingActors=new Set(drafts.filter(post=>post.about.kind==='room_greeting').map(post=>post.senderId));
  for(const actor of [...alive.slice(world.tick%alive.length),...alive.slice(0,world.tick%alive.length)]){
    if(publicCount()>=3)break;
    if(actor.id===leader.id||greetingActors.has(actor.id))continue;
    greetingActors.add(actor.id);
    drafts.push({roomId:'jiuzhou',senderId:actor.id,about:{kind:'room_greeting',kindOfGreeting:'jiuzhou'}});
  }
  const basePublic=drafts.filter(post=>publicRoom(post.roomId)).length;
  let privateSeats=Math.max(0,BASE_POST_LIMIT-Math.min(3,basePublic));
  const base=drafts.filter(post=>{
    if(publicRoom(post.roomId))return true;
    if(privateSeats<=0)return false;
    privateSeats--;
    return true;
  }).slice(0,BASE_POST_LIMIT);
  // A major event is a deterministic extra thread. Prefer broad coverage before
  // another participant's take, and only reuse an event for a different proven speaker.
  const extra:Draft[]=[],seenMajor=new Set<string>();
  const majorCandidates=candidates.filter(row=>major(row.event,world.tick));
  for(const firstOfEvent of [true,false]){
    for(const row of majorCandidates){
      if(extra.length>=MAJOR_POST_LIMIT)break;
      const {id}=row.event;
      if(firstOfEvent?seenMajor.has(id):extra.some(post=>post.senderId===row.actor.id&&
          post.about.kind==='public_event'&&post.about.eventId===id))continue;
      seenMajor.add(id);
      extra.push(publicDraft(row,'jiuzhou',leader.id));
    }
  }
  if(!base.length&&!extra.length)return;
  const posts=[...base,...extra].slice(0,SECT_CHAT_POST_LIMIT).map((row,index):SectChatPost=>{
    const id=sectChatPostId(managed.sectId,world.tick,index);
    return {...row,id,tick:world.tick,source:'template',variant:variant(world,id)};
  });
  managed.chat={months:[...(managed.chat?.months??[]).filter(month=>world.tick-month.tick<SECT_CHAT_MONTH_LIMIT),
    {tick:world.tick,posts}].slice(-SECT_CHAT_MONTH_LIMIT)};
}

export interface SectChatMessageView {
  readonly id:string;
  readonly tick:number;
  readonly senderId:string;
  readonly name:string;
  readonly text:string;
  readonly about:SectChatSource['kind'];
  readonly sourceEventId?:string;
  readonly source?:'template'|'llm';
  readonly replyTo?:string;
}
export interface SectChatRoomView {
  readonly id:SectChatRoomId;
  readonly label:string;
  readonly posts:readonly SectChatMessageView[];
}

function provesChatEvent(world:WorldState,post:SectChatPost,actor:Cultivator,event:WorldEvent,
    actors:ReadonlyMap<string,Cultivator>):boolean{
  const {roomId,about}=post;
  return about.kind==='public_event'&&isPublic(event,world.tick)&&event.id===about.eventId&&event.tick===about.eventTick&&
    (roomId!=='market'||isMarket(world,event.locationId)&&(post.tick!==world.tick||isMarket(world,actor.locationId)||
      event.tick===post.tick&&event.actorIds.includes(actor.id)))&&
    knownPublicEvent(actor,event,post.tick,actors)===about.knowledge;
}

/** Structured, evidenced public references only; no authored or model prose is inspected. */
export function quotePublicSectChatEvents(world:WorldState,from:number,through:number){
  const managed=world.sectManagement;
  if(!managed)return [];
  const actors=byId(world.cultivators),events=byId(world.events);
  const months=uniqueIndex(managed.chat?.months??[],row=>String(row.tick));
  const result:{event:WorldEvent;post:SectChatPost}[]=[];
  for(const month of months.values()){
    if(!Number.isSafeInteger(month.tick)||month.tick<=managed.foundedTick||month.tick<from||
      month.tick>through||month.tick>world.tick)continue;
    for(const post of byId(month.posts).values()){
      const {roomId,about}=post;
      if(post.tick!==month.tick||post.audience!==undefined||!publicRoom(roomId)||
        !SECT_CHAT_VARIANTS.includes(post.variant)||!Array.from({length:SECT_CHAT_POST_LIMIT},(_,index)=>
          sectChatPostId(managed.sectId,month.tick,index)).includes(post.id)||
        about.kind!=='public_event'||about.eventTick<=managed.foundedTick||about.eventTick>post.tick)continue;
      const event=events.get(about.eventId),actor=actors.get(post.senderId);
      if(actor&&actor.id!==managed.leaderId&&event&&provesChatEvent(world,post,actor,event,actors)&&
        (!isSectChallengeCut(event)||matchSectChallengeResult(world,event)))result.push({event,post});
    }
  }
  return result;
}

export function projectSectChat(world:WorldState):readonly SectChatRoomView[]{
  const context=managedContext(world);
  if(!context)return SECT_CHAT_ROOMS.map(id=>({id,label:LABELS[id],posts:[]}));
  const {managed,leader,actors}=context,events=byId(world.events);
  const recurring=recurringIdentity(world);
  const output=new Map<SectChatRoomId,SectChatMessageView[]>();
  const currentOwn=(actor:Cultivator)=>actor.id!==leader.id&&actor.sectId===managed.sectId;
  for(const month of managed.chat?.months??[]){
    if(month.tick>world.tick)continue;
    for(const post of month.posts){
      const actor=actors.get(post.senderId);
      if(!actor||post.tick!==month.tick||!SECT_CHAT_VARIANTS.includes(post.variant))continue;
      const {roomId,about}=post,scoped=roomId==='own'||roomId==='leaders';
      if(scoped?(actor.id===leader.id||post.audience?.length!==2||post.audience[0]!==actor.id||post.audience[1]!==leader.id):
        post.audience!==undefined)continue;
      if(roomId==='own'&&post.tick===world.tick&&!currentOwn(actor))continue;
      let text:string|undefined,sourceEventId:string|undefined,settledChallenge=false;
      switch(about.kind){
        case 'room_greeting':
          if(roomId===about.kindOfGreeting&&(roomId!=='own'||managed.foundingDiscipleIds.includes(actor.id)))text=GREETINGS[about.kindOfGreeting][post.variant];
          break;
        case 'comic':{
          if(roomId==='leaders')break;
          const template=templates.get(about.templateId);
          const beat=managed.comedy?.moments.find(row=>row.tick===post.tick&&row.templateId===about.templateId&&row.speakerId===actor.id);
          if(!beat||
            !exactPrivateMarker(events,sectComicEventId(post.tick,managed.sectId),post.tick,[actor.id]))break;
          if(about.rumor){
            const voice=projectSectComicMoment(world,beat)?.rumorHook;
            if(voice?.group===roomId)text=voice.line;
            break;
          }
          if(roomId!=='own'||template?.chatHook?.group!=='own')break;
          // Only independent ambient quips may reuse original hook text. Work-hook variants never
          // repeat the job, result, private site or any person mentioned in the original aside.
          text=template.match.phase==='ambient'&&!/[{}]/.test(template.chatHook.line)?template.chatHook.line:COMIC_NEUTRAL[post.variant];
          break;
        }
        case 'recurring':{
          if(roomId!=='leaders'||recurring?.[about.role]!==actor.id||
            !managed.recurring?.encounters.some(row=>row.tick===post.tick&&row.entityId===actor.id&&row.role===about.role&&row.outcome===about.outcome)||
            !exactPrivateMarker(events,sectRecurringEventId(post.tick,managed.sectId,about.role),post.tick,[actor.id,leader.id]))break;
          const lines=SECT_RECURRING_VOICES[about.outcome];
          text=(about.role==='rival'?projectSectAliasRivalReply(world,actor,post.tick):undefined)??lines[post.variant%lines.length];
          break;
        }
        case 'public_event':{
          if(roomId==='leaders'||about.eventTick>post.tick||about.eventTick<=managed.foundedTick)break;
          const event=events.get(about.eventId);
          if(!event){
            if(!world.events.some(row=>row.id===about.eventId)&&post.tick<world.tick)text='这条旧讯已收卷。';
            break;
          }
          if(!isPublic(event,world.tick)||event.tick!==about.eventTick||
            roomId==='market'&&(!isMarket(world,event.locationId)||post.tick===world.tick&&!isMarket(world,actor.locationId)&&
              (event.tick!==post.tick||!event.actorIds.includes(actor.id))))break;
          if(!provesChatEvent(world,post,actor,event,actors)){
            if(post.tick<world.tick)text='这条旧讯已收卷。';
            break;
          }
          if(isSectChallengeCut(event)){
            const challenge=matchSectChallengeResult(world,event);
            const winner=challenge?actors.get(challenge.winnerId):undefined;
            if(!winner){
              if(post.tick<world.tick)text='这条旧讯已收卷。';
              break;
            }
            text=CHALLENGE_RESULT_VOICES[about.knowledge][post.variant].replace('{winner}',()=>escapeTitle(winner.name));
            sourceEventId=event.id;settledChallenge=true;
            break;
          }
          const line=event.category==='death'?GRAVE_VOICES[about.knowledge]:
            (about.knowledge==='witness'?WITNESS_VOICES:RUMOR_VOICES)[post.variant];
          text=line.replace('{title}',()=>escapeTitle(sectPlayerFactCopy(event.title)));
          sourceEventId=event.id;
          break;
        }
      }
      if(!text)continue;
      const existing=output.get(roomId);
      const model=post.source==='llm'&&!settledChallenge&&!scoped&&isSectChatModelText(post.text)&&
        (about.kind==='room_greeting'&&living(actor)||about.kind==='public_event'&&sourceEventId!==undefined);
      const target=model&&post.replyTo?month.posts.find(row=>row.id===post.replyTo):undefined;
      const replyTo=target&&sameSectChatReplyContext(post,target)&&existing?.some(row=>row.id===target.id&&
        row.tick===post.tick&&(about.kind==='room_greeting'||row.sourceEventId===sourceEventId))?target.id:undefined;
      const row:SectChatMessageView={id:post.id,tick:post.tick,senderId:actor.id,name:actor.name,
        text:model?post.text:text,about:about.kind,source:model?'llm':'template',...(sourceEventId?{sourceEventId}:{}),...(replyTo?{replyTo}:{})};
      if(existing)existing.push(row);
      else output.set(roomId,[row]);
    }
  }
  return SECT_CHAT_ROOMS.map(id=>({id,label:id==='own'?`${context.sect.name}内部群`:LABELS[id],posts:output.get(id)??[]}));
}
