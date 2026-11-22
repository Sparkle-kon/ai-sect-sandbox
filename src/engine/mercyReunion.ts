import type {MercyReunionCase,MercyReunionOption,MercyReunionView} from '../types/mercyReunion';
import type {Cultivator,LLMDecisionPayload,LocationNode,WorldEvent,WorldState} from '../types/world';
import {doctrineFoundingPhysicallyAt} from './doctrineFoundingEngine';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {knownMapLocations,noteTerrainVisit,terrainTileAt} from './terrainEngine';
import {ascensionDutyActive} from './ascensionPresence';
export type {MercyReunionOption,MercyReunionView} from '../types/mercyReunion';

export const MERCY_REUNION_AID_QI=8;
const unique=<T extends {id:string}>(rows:readonly T[],id:string)=>{const found=rows.filter(row=>row.id===id);return found.length===1?found[0]:undefined;};
const actor=(world:WorldState,id:string)=>unique(world.cultivators,id);
const place=(world:WorldState,id:string)=>unique(world.locations,id);
const knownScene=(site:LocationNode|undefined):site is LocationNode=>Boolean(site&&site.type!=='abyss'&&site.type!=='secret_realm'&&!isScopedExpeditionGate(site));
const here=(world:WorldState,who:Cultivator,siteId:string,tick:number)=>
  actor(world,who.id)===who&&who.positionPlane===undefined&&!ascensionDutyActive(world,who)&&
  knownScene(place(world,siteId))&&doctrineFoundingPhysicallyAt(world,who,siteId,tick);
const other=(row:MercyReunionCase,id:string)=>row.victorId===id?row.sparedId:row.sparedId===id?row.victorId:undefined;
const idAt=(tick:number,victor:string,spared:string)=>`mercy-reunion-${tick}-${victor}-${spared}`;
const eventId=(row:MercyReunionCase,tick:number,tag:string)=>`evt-${tick}-${row.id}-${tag}`;
export const isPrivateMercyReunionEvent=(event:Pick<WorldEvent,'id'|'witnessScope'>)=>
  event.witnessScope==='participants'&&/^evt-\d+-mercy-reunion-/.test(event.id);
const words={
  spared:{title:'剑到命门而收',description:'原本足以致命的一击收住了。人尚在世，未夺对方的物件。'},
  departure:{title:'从原交锋地离开',description:'确有人离开了原先交锋的地方；此时还没有重逢。'},
  reunion:{title:'走过别路又相逢',description:'自那一次收剑之后，确有人离去；如今两人又亲身到了同一处。'},
  stand_down:{title:'这次不再挑起争斗',description:'一人收了自己的挑战；不替另一人原谅或立誓。'},
  offer:{title:'提议同行避险',description:'一人提议去近处，并未替对方答应，也还没有动身。'},
  aid:{title:'两人同意后到达邻地',description:'对方亲自应允，两人一同步至可走的邻地，提议者实付八点灵气。'},
  challenge:{title:'再相逢时确已交锋',description:'这一次确有交手，未预写输赢。'},
} as const;
function receipt(world:WorldState,row:MercyReunionCase,tag:keyof typeof words,siteId:string,first:string,second:string):WorldEvent{
  return {id:eventId(row,world.tick,tag),tick:world.tick,year:world.year,month:world.month,category:'intrigue',
    actorIds:[first,second],locationId:siteId,witnessScope:'participants',...words[tag]};
}
function exactDuel(row:MercyReunionCase,event:WorldEvent){
  return event.id===row.sourceEventId&&event.tick===row.sparedTick&&event.locationId===row.siteId&&
    event.id===`evt-${row.sparedTick}-${row.victorId}-duel`&&event.category==='combat'&&event.witnessScope===undefined&&
    event.duelWinnerId===row.victorId&&event.actorIds.length===2&&event.actorIds[0]===row.victorId&&event.actorIds[1]===row.sparedId&&
    event.damage?.filter(hit=>hit.cultivatorId===row.sparedId).length===(row.appliedDamage>0?1:0)&&
    (event.damage?.find(hit=>hit.cultivatorId===row.sparedId)?.amount??0)===row.appliedDamage;
}
function trusted(world:WorldState,row:MercyReunionCase){
  const matches=world.events.filter(event=>event.id===row.sourceEventId);
  return matches.length===1&&exactDuel(row,matches[0]);
}
/** Only the completed native kernel passes a genuinely measured withheld fatal hit. */
export function recordMercySpared(world:WorldState,victor:Cultivator,spared:Cultivator,hpBefore:number,
  lethalDamage:number,duelEvent:WorldEvent):WorldEvent|undefined{
  if(victor.id===spared.id||spared.hp!==1||!Number.isSafeInteger(hpBefore)||hpBefore<2||
    !Number.isSafeInteger(lethalDamage)||lethalDamage<hpBefore||
    !here(world,victor,victor.locationId,world.tick)||!here(world,spared,victor.locationId,world.tick)||
    (world.mercyReunions?.cases??[]).some(row=>row.victorId===victor.id&&row.sparedId===spared.id&&!row.outcome))return;
  const row:MercyReunionCase={id:idAt(world.tick,victor.id,spared.id),victorId:victor.id,sparedId:spared.id,
    siteId:victor.locationId,sparedTick:world.tick,sourceEventId:duelEvent.id,hpBefore,lethalDamage,appliedDamage:hpBefore-1};
  if(!exactDuel(row,duelEvent))return;
  (world.mercyReunions??={cases:[]}).cases.push(row);
  return receipt(world,row,'spared',row.siteId,victor.id,spared.id);
}
export function recordMercyReunionMovement(world:WorldState,who:Cultivator,fromSiteId:string):WorldEvent|undefined{
  if(fromSiteId===who.locationId||!knownScene(place(world,fromSiteId))||!here(world,who,who.locationId,world.tick))return;
  for(const row of world.mercyReunions?.cases??[]){
    const counterpart=other(row,who.id);
    if(!counterpart||row.outcome||row.sparedTick>=world.tick||!trusted(world,row))continue;
    if(!row.departure){
      if(fromSiteId===row.siteId){
        row.departure={actorId:who.id,fromSiteId,toSiteId:who.locationId,tick:world.tick};
        return receipt(world,row,'departure',who.locationId,who.id,counterpart);
      }
      continue;
    }
    if(row.reunion||row.departure.tick>=world.tick||!retained(world,row,'departure',row.departure,row.departure.toSiteId))continue;
    const peer=actor(world,counterpart);
    if(!peer||!here(world,peer,who.locationId,world.tick))continue;
    row.reunion={actorId:who.id,siteId:who.locationId,tick:world.tick};
    return receipt(world,row,'reunion',who.locationId,who.id,peer.id);
  }
}
function safeRefuge(world:WorldState,siteId:string,targetId:string,tick:number){
  const site=place(world,siteId),target=place(world,targetId);
  if(!knownScene(site)||!knownScene(target))return;
  const from=terrainTileAt(world,site.x,site.y),to=terrainTileAt(world,target.x,target.y);
  if(!from||!to||Math.abs(from.col-to.col)+Math.abs(from.row-to.row)!==1||to.biome==='魔渊'||
    world.mapHazards.some(hazard=>hazard.tileId===to.id&&hazard.createdTick<=tick&&hazard.expiresTick>tick))return;
  return target;
}
function retained(world:WorldState,row:MercyReunionCase,mark:'departure'|'reunion',step:{actorId:string;tick:number},siteId:string){
  const source=unique(world.events,eventId(row,step.tick,mark));
  return !!source&&source.tick===step.tick&&source.locationId===siteId&&isPrivateMercyReunionEvent(source)&&
    source.category==='intrigue'&&source.title===words[mark].title&&source.description===words[mark].description&&
    source.actorIds.length===2&&source.actorIds[0]===step.actorId&&source.actorIds[1]===other(row,step.actorId);
}
function current(world:WorldState,who:Cultivator,row:MercyReunionCase,tick:number){
  const id=other(row,who.id),siteId=row.reunion?.siteId,peer=id?actor(world,id):undefined;
  if(!siteId||!peer||row.outcome||!row.reunion||row.reunion.tick>=tick||tick>row.reunion.tick+4||
    !row.departure||!retained(world,row,'departure',row.departure,row.departure.toSiteId)||
    !retained(world,row,'reunion',row.reunion,siteId)||!trusted(world,row)||!here(world,who,siteId,tick)||!here(world,peer,siteId,tick))return;
  return {peer,siteId};
}
function allowAid(world:WorldState,row:MercyReunionCase,tick:number):boolean{
  const aid=row.aid,siteId=row.reunion?.siteId;
  const proposer=aid&&actor(world,aid.proposerId),partner=aid&&actor(world,aid.targetId);
  const refuge=aid&&siteId?safeRefuge(world,siteId,aid.destinationId,tick):undefined;
  const original=aid?unique(world.events,eventId(row,aid.offeredTick,'offer')):undefined;
  return !!aid&&!!original&&original.tick===aid.offeredTick&&original.locationId===siteId&&isPrivateMercyReunionEvent(original)&&
    original.actorIds.length===2&&original.actorIds[0]===aid.proposerId&&original.actorIds[1]===aid.targetId&&
    original.title===words.offer.title&&original.description===words.offer.description&&
    aid.acceptedTick===undefined&&tick===aid.offeredTick+1&&!!siteId&&!!proposer&&!!partner&&!!refuge&&
    !!current(world,proposer,row,tick)&&
    proposer.qiProgress>=MERCY_REUNION_AID_QI&&here(world,proposer,siteId,tick)&&here(world,partner,siteId,tick)&&
    knownMapLocations(world,proposer).includes(refuge)&&knownMapLocations(world,partner).includes(refuge);
}
export function mercyReunionAidPendingHold(world:WorldState,who:Cultivator):boolean{
  return !!world.mercyReunions?.cases.some(row=>row.aid?.proposerId===who.id&&!row.outcome&&allowAid(world,row,world.tick));
}
export const isMercyAidProposerReserved=mercyReunionAidPendingHold;
export function mercyReunionAidActed(world:WorldState,who:Cultivator):boolean{
  return !!world.mercyReunions?.cases.some(row=>row.aid?.acceptedTick===world.tick&&
    (row.aid.proposerId===who.id||row.aid.targetId===who.id));
}
export function availableMercyReunionActions(who:Cultivator,world:WorldState,tick=world.tick+1):MercyReunionOption[]{
  if(tick!==world.tick&&tick!==world.tick+1||!who.alive||!world.mercyReunions)return [];
  return world.mercyReunions.cases.flatMap(row=>{
    const present=current(world,who,row,tick);
    if(!present)return [];
    const base={action:'MERCY_REUNION',targetMercyReunionId:row.id} as const;
    if(row.aid&&(tick===row.aid.offeredTick+1||tick===row.aid.offeredTick)){
      return row.aid.targetId===who.id&&allowAid(world,row,tick)?[{...base,mercyReunionMove:'accept_aid'}]:[];
    }
    // Only the spared party opens its own reaction; the other party gets only an exact acceptance.
    if(row.sparedId!==who.id)return [];
    const out:MercyReunionOption[]=[{...base,mercyReunionMove:'stand_down'},{...base,mercyReunionMove:'challenge'}];
    const refuge=who.qiProgress>=MERCY_REUNION_AID_QI&&row.reunion&&tick<row.reunion.tick+4?knownMapLocations(world,who)
      .filter(site=>safeRefuge(world,present.siteId,site.id,tick)===site&&knownMapLocations(world,present.peer).includes(site))
      .sort((a,b)=>a.id<b.id?-1:1)[0]:undefined;
    if(refuge)out.splice(1,0,{...base,mercyReunionMove:'aid',targetLocationId:refuge.id});
    return out;
  });
}
export function resolveMercyReunionAction(world:WorldState,who:Cultivator,decision:LLMDecisionPayload,
  challenge?:(target:Cultivator)=>WorldEvent|null,emit?:(event:WorldEvent)=>void):WorldEvent|null{
  if(decision.chosenAction!=='MERCY_REUNION'||Object.keys(decision).some(key=>
    !['chosenAction','innerMonologue','mercyReunionMove','targetMercyReunionId','targetLocationId'].includes(key)))return null;
  const option=availableMercyReunionActions(who,world,world.tick).find(row=>row.mercyReunionMove===decision.mercyReunionMove&&
    row.targetMercyReunionId===decision.targetMercyReunionId&&row.targetLocationId===decision.targetLocationId);
  const row=option&&unique(world.mercyReunions?.cases??[],option.targetMercyReunionId);
  const present=row&&current(world,who,row,world.tick);
  if(!option||!row||!present)return null;
  const {peer,siteId}=present,move=option.mercyReunionMove;
  if(move==='aid'){
    row.aid={offeredTick:world.tick,proposerId:who.id,targetId:peer.id,destinationId:option.targetLocationId};
    return receipt(world,row,'offer',siteId,who.id,peer.id);
  }
  if(move==='accept_aid'){
    if(!row.aid||!allowAid(world,row,world.tick))return null;
    peer.qiProgress-=MERCY_REUNION_AID_QI;
    for(const body of [peer,who]){
      body.locationId=row.aid.destinationId;
      noteTerrainVisit(world,body);
    }
    row.aid.acceptedTick=world.tick;
    const event=receipt(world,row,'aid',who.locationId,who.id,peer.id);
    row.outcome={move:'aid',actorId:who.id,tick:world.tick,sourceEventId:event.id};
    return event;
  }
  if(move==='challenge'){
    const event=challenge?.(peer);
    if(!event)return null;
    if(event.tick===world.tick&&event.locationId===siteId&&!!event.duelWinnerId&&
      (event.category==='combat'||event.category==='death')&&event.actorIds[0]===who.id&&event.actorIds[1]===peer.id){
      row.outcome={move,actorId:who.id,tick:world.tick,sourceEventId:event.id};
      emit?.(receipt(world,row,'challenge',siteId,who.id,peer.id));
    }
    return event;
  }
  const event=receipt(world,row,'stand_down',siteId,who.id,peer.id);
  row.outcome={move,actorId:who.id,tick:world.tick,sourceEventId:event.id};
  return event;
}
export function projectMercyReunion(world:WorldState,viewer:Cultivator):MercyReunionView|undefined{
  if(actor(world,viewer.id)!==viewer||!viewer.alive||viewer.positionPlane!==undefined)return;
  const options=availableMercyReunionActions(viewer,world);
  for(const row of [...(world.mercyReunions?.cases??[])].reverse()){
    const id=other(row,viewer.id),peer=id?actor(world,id):undefined,local=place(world,viewer.locationId);
    if(!peer||!knownScene(local)||!here(world,viewer,local.id,world.tick))continue;
    const offered=options.filter(mark=>mark.targetMercyReunionId===row.id);
    const tags=Object.keys(words) as (keyof typeof words)[];
    const records=world.events.filter(event=>event.tick===world.tick&&event.locationId===local.id&&
      isPrivateMercyReunionEvent(event)&&event.actorIds.length===2&&event.actorIds.includes(viewer.id)&&event.actorIds.includes(peer.id)&&
      tags.some(tag=>event.id===eventId(row,world.tick,tag)&&event.title===words[tag].title&&event.description===words[tag].description));
    const original=records.length===1?unique(world.events,records[0].id):undefined;
    if(offered.length||original)return {siteName:local.name,otherName:peer.name,options:offered,
      ...(original?{receipt:{title:original.title,description:original.description}}:{})};
  }
}

export function validateMercyReunionSave(world:WorldState,fail:(path:string)=>never):void{
  const seen=new Set<string>();
  for(const row of world.mercyReunions?.cases??[]){
    if(seen.has(row.id)||row.id!==idAt(row.sparedTick,row.victorId,row.sparedId)||
      row.sourceEventId!==`evt-${row.sparedTick}-${row.victorId}-duel`||row.victorId===row.sparedId||
      !actor(world,row.victorId)||!actor(world,row.sparedId)||!knownScene(place(world,row.siteId))||
      row.sparedTick>world.tick||!Number.isSafeInteger(row.hpBefore)||row.hpBefore<2||
      !Number.isSafeInteger(row.lethalDamage)||row.lethalDamage<row.hpBefore||row.appliedDamage!==row.hpBefore-1)
      fail('mercyReunions.case');
    seen.add(row.id);
    const matches=world.events.filter(event=>event.id===row.sourceEventId);
    if(matches.length>1||matches[0]&&!exactDuel(row,matches[0]))fail('mercyReunions.source');
    const {departure,reunion,aid,outcome}=row;
    if(departure&&(!other(row,departure.actorId)||departure.fromSiteId!==row.siteId||departure.toSiteId===row.siteId||
      !knownScene(place(world,departure.toSiteId))||departure.tick<=row.sparedTick||departure.tick>world.tick))
      fail('mercyReunions.departure');
    if(reunion&&(!departure||reunion.tick<=departure.tick||reunion.tick>world.tick||!other(row,reunion.actorId)||
      !knownScene(place(world,reunion.siteId))))fail('mercyReunions.reunion');
    if(aid&&(!reunion||aid.proposerId!==row.sparedId||aid.targetId!==row.victorId||
      aid.offeredTick<=reunion.tick||aid.offeredTick>world.tick||aid.offeredTick>reunion.tick+4||
      !knownScene(place(world,aid.destinationId))||
      (aid.acceptedTick!==undefined&&(aid.acceptedTick!==aid.offeredTick+1||aid.acceptedTick>world.tick||
        outcome?.move!=='aid'||outcome.tick!==aid.acceptedTick))))fail('mercyReunions.aid');
    if(outcome&&(!reunion||outcome.tick<=reunion.tick||outcome.tick>world.tick||outcome.tick>reunion.tick+4||
      outcome.actorId!==(outcome.move==='aid'?row.victorId:row.sparedId)||
      (outcome.move==='aid'&&aid?.acceptedTick!==outcome.tick)||
      (outcome.move!=='challenge'&&outcome.sourceEventId!==eventId(row,outcome.tick,outcome.move))||
      (outcome.move==='challenge'&&outcome.sourceEventId!==`evt-${outcome.tick}-${row.sparedId}-duel`&&
        outcome.sourceEventId!==`evt-${outcome.tick}-${row.sparedId}-kill`)))fail('mercyReunions.outcome');
    if(departure&&world.events.some(event=>event.id===eventId(row,departure.tick,'departure'))&&
      !retained(world,row,'departure',departure,departure.toSiteId))fail('mercyReunions.departure.source');
    if(reunion&&world.events.some(event=>event.id===eventId(row,reunion.tick,'reunion'))&&
      !retained(world,row,'reunion',reunion,reunion.siteId))fail('mercyReunions.reunion.source');
  }
}
