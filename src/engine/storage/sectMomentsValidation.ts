import type {SectManagementState} from '../../types/sectManagement';
import {
  SECT_MOMENT_KINDS,SECT_MOMENT_VARIANTS,SECT_MOMENTS_BLOCK_LIMIT,SECT_MOMENTS_COMMENT_LIMIT,
  SECT_MOMENTS_MONTH_LIMIT,SECT_MOMENTS_MONTHLY_LIMIT,SECT_MOMENTS_REACTION_LIMIT,
  isSectMomentComment,sectMomentPostId,type SectMomentPost,type SectMomentsState,
} from '../../types/sectMoments';
import type {WorldEvent,WorldState} from '../../types/world';
import {isSectMomentSourceId,knowsSectMoment,matchesSectMomentEvent} from '../sectMomentSources';
import {arr,bool,fail as rejectShape,id,one,optional,structure,tick,type Validator} from './primitives';

const comment:Validator=(value,path)=>{if(!isSectMomentComment(value))rejectShape(path);};
const yes:Validator=(value,path)=>{if(value!==true)rejectShape(path);};
const variant=one(...SECT_MOMENT_VARIANTS);
// One cook, plus up to eight people seated at a kitchen meal.
const post=structure({
  id,tick,kind:one(...SECT_MOMENT_KINDS),authorId:id,sourceEventId:id,siteId:id,audience:optional(arr(9,id)),variant,
  reactions:arr(SECT_MOMENTS_REACTION_LIMIT,structure({actorId:id,liked:bool,commentVariant:optional(variant)})),
  playerLiked:optional(yes),playerComments:optional(arr(SECT_MOMENTS_COMMENT_LIMIT,comment)),
});
export const sectMomentsShape=structure({
  posts:arr(SECT_MOMENTS_MONTH_LIMIT*SECT_MOMENTS_MONTHLY_LIMIT,post),
  blockedAuthorIds:optional(arr(SECT_MOMENTS_BLOCK_LIMIT,id)),
});

const withinHotTail=(world:WorldState,date:number)=>world.events.length<120||world.events.some(row=>row.tick<date);

function supportsMomentSource(world:WorldState,entry:SectMomentPost):{live:WorldEvent|undefined}|undefined{
  if(!isSectMomentSourceId(entry))return;
  const live=world.events.filter(event=>event.id===entry.sourceEventId);
  if(live.length>1||live.some(event=>!matchesSectMomentEvent(world,entry,event)))return;
  const hotAndCold=[...world.chronicleArchive.chapters,...world.coldHistory.chapters];
  const archived=[...world.chronicleArchive.anchors.filter(event=>event.id===entry.sourceEventId),
    ...hotAndCold.filter(chapter=>chapter.startTick<=entry.tick&&chapter.endTick>=entry.tick)
      .flatMap(chapter=>chapter.anchors.filter(event=>event.id===entry.sourceEventId))];
  // Participant-only sources are never public chronicle facts, even if imported from a legacy save.
  if(archived.some(event=>!matchesSectMomentEvent(world,entry,event)))return;
  if(!live.length&&!archived.length&&(entry.tick===world.tick||withinHotTail(world,entry.tick)))return;
  // Older rows may stay as a neutral transcript after their source ages out; projection is stricter.
  return {live:live[0]};
}

export function validateSectMoments(world:WorldState,management:SectManagementState,state:SectMomentsState,fail:(field:string)=>never):void{
  const people=new Map(world.cultivators.map(actor=>[actor.id,actor]));
  const blocked=state.blockedAuthorIds??[];
  if(blocked.some((id,index)=>id===management.leaderId||!people.has(id)||index>0&&blocked[index-1]>=id))
    return fail('sectManagement.moments.blockedAuthorIds');

  const sources=new Set<string>(),newest=state.posts.at(-1)?.tick??world.tick;
  let date=management.foundedTick,ordinal=-1;
  for(const entry of state.posts){
    if(entry.tick<=management.foundedTick||entry.tick<date||entry.tick>(management.growth?.failure?.tick??world.tick)||
      newest-entry.tick>=SECT_MOMENTS_MONTH_LIMIT||!people.has(entry.authorId)||
      world.locations.filter(site=>site.id===entry.siteId&&site.expeditionOmenId===undefined&&site.type!=='secret_realm').length!==1||
      sources.has(entry.sourceEventId))return fail('sectManagement.moments.identity');
    if(entry.tick!==date){date=entry.tick;ordinal=-1;}
    const index=Array.from({length:SECT_MOMENTS_MONTHLY_LIMIT},(_,value)=>value).find(value=>entry.id===sectMomentPostId(entry.tick,value));
    if(index===undefined||index<=ordinal)return fail('sectManagement.moments.identity');
    ordinal=index;
    sources.add(entry.sourceEventId);
    const audience=entry.audience;
    if(entry.kind==='food'?
      !audience||audience.length<2||entry.siteId!==management.homeSiteId||entry.authorId===management.leaderId||
        !audience.includes(entry.authorId)||!audience.includes(management.leaderId)||
        audience.some((id,index)=>!people.has(id)||index>0&&audience[index-1]>=id):
      audience!==undefined)return fail('sectManagement.moments.audience');
    const source=supportsMomentSource(world,entry);
    if(!source)return fail('sectManagement.moments.source');
    if(entry.playerComments?.length===0)return fail('sectManagement.moments.playerComments');
    const seen=new Set<string>();
    for(const reaction of entry.reactions){
      const actor=people.get(reaction.actorId);
      if(!actor||reaction.actorId===management.leaderId||reaction.actorId===entry.authorId||
        seen.has(reaction.actorId)||!reaction.liked&&reaction.commentVariant===undefined||
        (audience?!audience.includes(reaction.actorId):
          source.live&&entry.tick===world.tick&&!knowsSectMoment(actor,entry,source.live)))
        return fail('sectManagement.moments.reactions');
      seen.add(reaction.actorId);
    }
  }
}
