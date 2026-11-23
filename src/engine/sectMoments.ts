import type {Cultivator,WorldEvent,WorldState} from '../types/world';
import {SECT_MOMENT_LINES} from '../data/sectMomentLines';
import {
  SECT_MOMENTS_BLOCK_LIMIT,SECT_MOMENTS_COMMENT_LIMIT,SECT_MOMENTS_MONTH_LIMIT,
  SECT_MOMENTS_MONTHLY_LIMIT,SECT_MOMENTS_REACTION_LIMIT,isSectMomentComment,sectMomentPostId,
  type SectMomentCommand,type SectMomentKind,type SectMomentPost,type SectMomentSource,type SectMomentVariant,
} from '../types/sectMoments';
import {collectSectMomentSources,knowsSectMoment,resolveSectMomentSource} from './sectMomentSources';
import {sameGeneratedWorld} from './worldIdentity';
import {onLowerPlane} from './upperPassageIsolation';
import {isSectActive} from './sectActivity';
export {knowsSectMoment} from './sectMomentSources';

const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const variants=[0,1,2,3] as const;
function hash(seed:number,key:string):number{
  let value=seed>>>0;
  for(let index=0;index<key.length;index++)value=Math.imul(value^key.charCodeAt(index),16777619)>>>0;
  return value;
}
const variant=(seed:number,key:string):SectMomentVariant=>variants[hash(seed,key)%variants.length];

function uniqueActors(world:WorldState):ReadonlyMap<string,Cultivator>{
  const actors=new Map<string,Cultivator>(),duplicates=new Set<string>();
  for(const actor of world.cultivators){
    if(actors.has(actor.id)){actors.delete(actor.id);duplicates.add(actor.id);}
    else if(!duplicates.has(actor.id))actors.set(actor.id,actor);
  }
  return actors;
}

function momentContext(world:WorldState){
  const managed=world.sectManagement;
  if(!managed||managed.growth?.failure)return;
  const actors=uniqueActors(world),leader=actors.get(managed.leaderId);
  const sects=world.sects.filter(sect=>sect.id===managed.sectId);
  const sect=sects.length===1?sects[0]:undefined;
  if(!isSectActive(sect)||!leader?.alive||leader.hp<=0||!onLowerPlane(leader)||
    leader.sectId!==sect.id||sect.leaderId!==leader.id)return;
  return {managed,actors,leader};
}

export function settleSectMomentsMonth(world:WorldState,previous:WorldState,events:readonly WorldEvent[]):void{
  const context=momentContext(world);
  if(!context||world.tick!==previous.tick+1||!sameGeneratedWorld(world,previous)||
    previous.sectManagement?.sectId!==context.managed.sectId||world.tick<=context.managed.foundedTick)return;
  const {managed,leader,actors}=context,old=managed.moments;
  if(old?.posts.some(post=>post.tick>=world.tick))return;
  const minimum=world.tick-SECT_MOMENTS_MONTH_LIMIT+1;
  const keep=(old?.posts??[]).filter(post=>post.tick>=minimum);
  const accepted: SectMomentSource[]=[];
  const selectedKinds=new Set<SectMomentKind>(),selectedSources=new Set<string>();
  const sources=collectSectMomentSources(world,previous,events);
  for(const distinctKinds of [true,false]){
    for(const source of sources){
      if(accepted.length>=SECT_MOMENTS_MONTHLY_LIMIT)break;
      if(selectedSources.has(source.sourceEventId)||distinctKinds&&selectedKinds.has(source.kind)||
        !actors.has(source.authorId)||source.audience&&!source.audience.includes(leader.id))continue;
      const native=resolveSectMomentSource(world,source);
      if(!native)continue;
      selectedKinds.add(source.kind);selectedSources.add(source.sourceEventId);accepted.push(source);
    }
  }
  const newPosts=accepted.map((source,index):SectMomentPost=>{
    const id=sectMomentPostId(world.tick,index),native=resolveSectMomentSource(world,source);
    const present=native?[...actors.values()].filter(actor=>
      actor.id!==leader.id&&actor.alive&&actor.hp>0&&onLowerPlane(actor)&&knowsSectMoment(actor,source,native)):[];
    const rank=(actor:Cultivator)=>hash(world.random.seed,`${source.sourceEventId}:react:${actor.id}`);
    present.sort((a,b)=>rank(a)-rank(b)||compare(a.id,b.id));
    const reactions=present.slice(0,SECT_MOMENTS_REACTION_LIMIT).map((actor,reactionIndex)=>({
      actorId:actor.id,liked:reactionIndex===0||rank(actor)%3!==0,
      ...(reactionIndex===0||reactionIndex===1&&rank(actor)%2===0?
        {commentVariant:variant(world.random.seed,`${id}:comment:${actor.id}`)}:{}),
    })).filter(reaction=>reaction.liked||reaction.commentVariant!==undefined).sort((a,b)=>compare(a.actorId,b.actorId));
    return {...source,id,variant:variant(world.random.seed,`${id}:${source.sourceEventId}`),reactions};
  });
  if(old||newPosts.length)managed.moments={...old,posts:[...keep,...newPosts]};
}

export interface SectMomentView {
  readonly post:SectMomentPost;
  readonly authorName:string;
  readonly caption:string;
  readonly likes:number;
  readonly comments:readonly {authorId:string;name:string;text:string}[];
}
export function projectSectMoments(world:WorldState):{
  readonly posts:readonly SectMomentView[];
  readonly blockedAuthors:readonly {id:string;name:string}[];
}{
  const context=momentContext(world),state=context?.managed.moments;
  if(!context||!state)return {posts:[],blockedAuthors:[]};
  const {actors,leader}=context,blocked=new Set(state.blockedAuthorIds);
  const blockedAuthors=[...blocked].flatMap(id=>{
    const actor=actors.get(id);
    return actor&&id!==leader.id?[{id,name:actor.name}]:[];
  });
  const posts=state.posts.slice().reverse().flatMap((post):SectMomentView[]=>{
    if(post.tick>world.tick||post.tick<world.tick-SECT_MOMENTS_MONTH_LIMIT+1||blocked.has(post.authorId))return [];
    const author=actors.get(post.authorId),native=resolveSectMomentSource(world,post);
    if(!author||post.audience&&(!native||!post.audience.includes(leader.id))||
      !native&&post.tick===world.tick)return [];
    const comments:SectMomentView['comments'][number][]=[];
    let likes=Number(post.playerLiked===true);
    for(const reaction of post.reactions){
      const reader=actors.get(reaction.actorId);
      if(!reader||blocked.has(reader.id)||reader.id===leader.id||reader.id===post.authorId||
        post.audience&&!post.audience.includes(reader.id)||native&&post.tick===world.tick&&!knowsSectMoment(reader,post,native))continue;
      if(reaction.liked)likes++;
      if(reaction.commentVariant!==undefined)comments.push({
        authorId:reader.id,name:reader.name,text:SECT_MOMENT_LINES[post.kind].replies[reaction.commentVariant],
      });
    }
    for(const text of post.playerComments??[])comments.push({authorId:leader.id,name:leader.name,text});
    return [{post,authorName:author.name,caption:native?SECT_MOMENT_LINES[post.kind].captions[post.variant]:'如今只余这页旧记。',
      likes,comments}];
  });
  return {posts,blockedAuthors};
}

/** World changes are limited to the moments ledger; no job, body, relationship or resource changes. */
export function applySectMomentCommand(world:WorldState,command:SectMomentCommand):boolean{
  const context=momentContext(world),state=context?.managed.moments;
  if(!context||!state)return false;
  const {managed,leader}=context,view=projectSectMoments(world);
  if(command.kind==='block'){
    const current=state.blockedAuthorIds??[];
    if(command.authorId===leader.id||current.length>=SECT_MOMENTS_BLOCK_LIMIT||current.includes(command.authorId)||
      !view.posts.some(row=>row.post.authorId===command.authorId))return false;
    managed.moments={...state,blockedAuthorIds:[...current,command.authorId].sort(compare)};
    return true;
  }
  if(command.kind==='unblock'){
    if(!view.blockedAuthors.some(actor=>actor.id===command.authorId))return false;
    const next=(state.blockedAuthorIds??[]).filter(id=>id!==command.authorId);
    const {blockedAuthorIds:_,...rest}=state;
    managed.moments={...rest,...(next.length?{blockedAuthorIds:next}:{})};
    return true;
  }
  if(command.kind!=='like'&&command.kind!=='comment')return false;
  const current=view.posts.find(row=>row.post.id===command.postId)?.post;
  if(!current)return false;
  let next:SectMomentPost;
  if(command.kind==='like'){
    const {playerLiked,...rest}=current;
    next=playerLiked?rest:{...current,playerLiked:true};
  }else{
    if(typeof command.text!=='string')return false;
    const text=command.text.trim();
    const comments=current.playerComments??[];
    if(!isSectMomentComment(text)||comments.length>=SECT_MOMENTS_COMMENT_LIMIT)return false;
    next={...current,playerComments:[...comments,text]};
  }
  managed.moments={...state,posts:state.posts.map(post=>post===current?next:post)};
  return true;
}
