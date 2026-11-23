import {SECT_LIVE_LINES} from '../data/sectLiveLines';
import {
  SECT_LIVE_GIFT_COST,SECT_LIVE_GIFT_REPUTATION,SECT_LIVE_MONTH_LIMIT,SECT_LIVE_MONTHLY_LIMIT,
  SECT_LIVE_PLAYER_LINE_LIMIT,SECT_LIVE_WITNESS_LIMIT,SECT_LIVE_VARIANTS,sectLiveShowId,isSectLiveText,
  type SectLiveCommand,type SectLiveKind,type SectLiveShow,type SectLiveSource,
} from '../types/sectLive';
import type {Cultivator,WorldEvent,WorldState} from '../types/world';
import {flowSect,recordResourceFlow} from './resourceFlowEngine';
import {isSectActive} from './sectActivity';
import {collectSectLiveSources,knowsSectLiveSource,resolveSectLiveSource} from './sectLiveSources';
import {onLowerPlane} from './upperPassageIsolation';
import {sameGeneratedWorld} from './worldIdentity';

function cast(world:WorldState):Map<string,Cultivator>{
  const byId=new Map<string,Cultivator>(),duplicates=new Set<string>();
  for(const actor of world.cultivators){
    if(byId.has(actor.id)){byId.delete(actor.id);duplicates.add(actor.id);}
    else if(!duplicates.has(actor.id))byId.set(actor.id,actor);
  }
  return byId;
}
function authority(world:WorldState){
  const managed=world.sectManagement;
  if(!managed||managed.growth?.failure)return;
  const actors=cast(world),leader=actors.get(managed.leaderId);
  const matches=world.sects.filter(sect=>sect.id===managed.sectId),sect=matches.length===1?matches[0]:undefined;
  if(!isSectActive(sect)||!leader?.alive||leader.hp<=0||!onLowerPlane(leader)||leader.sectRank!=='掌门'||
    leader.sectId!==sect.id||sect.leaderId!==leader.id)return;
  return {actors,leader,managed,sect};
}
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
function hash(seed:number,key:string):number{
  let value=seed>>>0;
  for(let index=0;index<key.length;index++)value=Math.imul(value^key.charCodeAt(index),16777619)>>>0;
  return value;
}

export function settleSectLiveMonth(world:WorldState,previous:WorldState,events:readonly WorldEvent[]):void{
  const context=authority(world);
  if(!context||world.tick!==previous.tick+1||world.tick<=context.managed.foundedTick||
    previous.sectManagement?.sectId!==context.managed.sectId||!sameGeneratedWorld(world,previous))return;
  const {actors,leader,managed}=context,old=managed.live;
  if(old?.shows.some(show=>show.tick>=world.tick))return;
  const older=(old?.shows??[]).filter(show=>show.tick>world.tick-SECT_LIVE_MONTH_LIMIT);
  const eligible=collectSectLiveSources(world,previous,events);
  const selected:{source:SectLiveSource;event:WorldEvent}[]=[];
  const seenSources=new Set<string>(),seenKinds=new Set<SectLiveKind>();
  for(const distinct of [true,false])for(const source of eligible){
    if(selected.length>=SECT_LIVE_MONTHLY_LIMIT)break;
    if(seenSources.has(source.sourceEventId)||distinct&&seenKinds.has(source.kind))continue;
    const event=resolveSectLiveSource(world,source);
    if(!event)continue;
    selected.push({source,event});seenSources.add(event.id);seenKinds.add(source.kind);
  }
  const newer=selected.map(({source,event},index):SectLiveShow=>{
    const id=sectLiveShowId(world.tick,index);
    const viewers=[...actors.values()].filter(actor=>actor.id!==leader.id&&actor.alive&&actor.hp>0&&onLowerPlane(actor)&&
      knowsSectLiveSource(actor,source,event));
    const rank=(actor:Cultivator)=>hash(world.random.seed,`${event.id}:${actor.id}`);
    viewers.sort((a,b)=>rank(a)-rank(b)||compare(a.id,b.id));
    const danmaku=viewers.slice(0,SECT_LIVE_WITNESS_LIMIT).map((actor,slot)=>({actorId:actor.id,
      variant:SECT_LIVE_VARIANTS[(rank(actor)+slot)%SECT_LIVE_VARIANTS.length]}));
    return {...source,id,danmaku};
  });
  if(old||newer.length)managed.live={shows:[...older,...newer]};
}

function tipAvailable(show:SectLiveShow,sect:{spiritStones:number;reputation:number}):boolean{
  return !show.gift&&Number.isFinite(sect.spiritStones)&&sect.spiritStones>=SECT_LIVE_GIFT_COST&&
    Number.isFinite(sect.reputation)&&sect.reputation+SECT_LIVE_GIFT_REPUTATION<=100;
}

export interface SectLiveView {
  readonly show:SectLiveShow;
  readonly title:string;
  readonly lines:readonly {id:string;name:string;text:string;player:boolean}[];
  readonly live:boolean;
  readonly giftCost?:typeof SECT_LIVE_GIFT_COST;
}
export function projectSectLive(world:WorldState):{readonly shows:readonly SectLiveView[];readonly treasury?:number}{
  const context=authority(world);
  if(!context)return {shows:[]};
  const {actors,sect,leader,managed}=context;
  const shows=(managed.live?.shows??[]).slice().reverse().flatMap((show):SectLiveView[]=>{
    if(show.tick>world.tick||world.tick-show.tick>=SECT_LIVE_MONTH_LIMIT)return [];
    const event=resolveSectLiveSource(world,show);
    if(!event&&show.tick===world.tick)return [];
    const live=!!event&&show.tick===world.tick;
    const policy=SECT_LIVE_LINES[show.kind];
    const lines: SectLiveView['lines'][number][]=show.danmaku.flatMap((line,index)=>{
      const speaker=actors.get(line.actorId);
      if(!speaker||speaker.id===leader.id||live&&event&&!knowsSectLiveSource(speaker,show,event))return [];
      return [{id:`${show.id}-w-${index}`,name:speaker.name,text:policy.lines[line.variant],player:false}];
    });
    for(const [index,text] of (show.playerLines??[]).entries())lines.push({
      id:`${show.id}-p-${index}`,name:leader.name,text,player:true,
    });
    return [{show,title:policy.title,lines,live,...(live&&tipAvailable(show,sect)?{giftCost:SECT_LIVE_GIFT_COST}:{})}];
  });
  return {shows,treasury:sect.spiritStones};
}

/** One explicit command on a current dated source. Text itself cannot cause any side effect. */
export function applySectLiveCommand(world:WorldState,command:SectLiveCommand):boolean{
  const context=authority(world),state=context?.managed.live;
  if(!context||!state||!command||typeof command!=='object')return false;
  const {leader,managed,sect}=context;
  const matches=state.shows.filter(show=>show.id===command.showId);
  if(matches.length!==1)return false;
  const [show]=matches;
  if(show.tick!==world.tick||!resolveSectLiveSource(world,show))return false;
  let next:SectLiveShow;
  if(command.kind==='danmaku'){
    if(Object.keys(command).some(key=>key!=='kind'&&key!=='showId'&&key!=='text')||typeof command.text!=='string')return false;
    const text=command.text.trim(),existing=show.playerLines??[];
    if(!isSectLiveText(text)||existing.length>=SECT_LIVE_PLAYER_LINE_LIMIT)return false;
    next={...show,playerLines:[...existing,text]};
  }else if(command.kind==='gift'){
    if(Object.keys(command).some(key=>key!=='kind'&&key!=='showId')||!tipAvailable(show,sect)||
      world.resourceFlow.months.some(month=>month.entries.some(entry=>entry.reason==='livestream_tip'&&entry.refId===show.id)))return false;
    const gift={tick:world.tick,leaderId:leader.id,sectId:sect.id,cost:SECT_LIVE_GIFT_COST,reputation:SECT_LIVE_GIFT_REPUTATION} as const;
    sect.spiritStones-=gift.cost;
    sect.reputation+=gift.reputation;
    recordResourceFlow(world,{kind:'consumption',mechanism:'sect_economy',refId:show.id,reason:'livestream_tip',
      from:flowSect(sect.id),good:'stone',amount:gift.cost,visibility:{kind:'participants',actorIds:[leader.id]}});
    next={...show,gift};
  }else return false;
  managed.live={shows:state.shows.map(row=>row===show?next:row)};
  return true;
}
