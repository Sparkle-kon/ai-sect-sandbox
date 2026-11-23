import type {BanquetSeatChoice,BanquetSeatMove,BanquetSeatOption,BanquetSeatTable} from '../types/banquetSeat';
import type {Cultivator,LLMDecisionPayload,WorldEvent,WorldState} from '../types/world';
import {apprenticeshipPhysicallyAt} from './apprenticeshipPresence';
import {knownMapLocations} from './terrainEngine';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {banquetSeatCalendar,banquetSeatChoiceId,banquetSeatChoiceWords,banquetSeatChoiceSource,banquetSeatLine,
  banquetSeatPerson,banquetSeatSite,banquetSeatSummaryId,banquetSeatSummarySource,banquetSeatSummaryTitle,banquetSeatTableAuthority,
  banquetTableId,onlyBanquetRow} from './banquetSeatProof';

export {validateBanquetSeatSave} from './banquetSeatProof';
export type {BanquetSeatOption} from '../types/banquetSeat';
export interface BanquetSeatView {
  id:string; hallEventId:string; siteId:string; siteName:string; invitedTick:number; presentCount?:0|1|2;
  tableLine:string; options:readonly BanquetSeatOption[]; receipt?:{title:string;description:string;tick:number};
}
const choice=(table:BanquetSeatTable,banquetSeatMove:BanquetSeatMove):BanquetSeatOption=>
  ({action:'BANQUET_SEAT',banquetSeatMove,targetBanquetSeatId:table.id});
const stationary=(world:WorldState,actor:Cultivator,siteId:string,tick:number)=>
  apprenticeshipPhysicallyAt(world,actor,siteId,tick)&&!world.ascension?.trials.some(row=>row.actorId===actor.id&&!row.terminal);
const publicSite=(world:WorldState,id:string)=>{
  const site=banquetSeatSite(world,id);
  return site&&site.type!=='secret_realm'&&!isScopedExpeditionGate(site)?site:undefined;
};
export const isPrivateBanquetSeatEvent=(event:WorldEvent)=>event.witnessScope==='participants'&&event.id.startsWith('evt-banquet-seat-');

export function recordBanquetSeatInvitation(world:WorldState,events:readonly WorldEvent[]):void {
  for(const event of events){
    if(event.tick!==world.tick||event.category!=='diplomacy'||event.witnessScope!==undefined||
      !event.id.startsWith('evt-banquet-')||!event.id.endsWith(`-hall-${world.tick}`)||
      onlyBanquetRow(events,row=>row.id===event.id)!==event||event.actorIds.length!==2||!event.locationId)continue;
    const occasionId=event.id.slice('evt-banquet-'.length,-`-hall-${world.tick}`.length);
    const id=banquetTableId(occasionId);
    if(world.banquetSeats?.tables.some(row=>row.id===id))continue;
    const table:BanquetSeatTable={id,occasionId,siteId:event.locationId,invitationEventId:event.id,
      crownEventId:`evt-${world.tick}-${occasionId}-champion`,invitedTick:world.tick,seatTick:world.tick+1,
      finalistIds:[event.actorIds[0],event.actorIds[1]],choices:[]};
    if(banquetSeatTableAuthority(world,table,true))(world.banquetSeats??={tables:[]}).tables.push(table);
  }
}
export function availableBanquetSeatActions(actor:Cultivator,world:WorldState,tick=world.tick+1):BanquetSeatOption[]{
  const due=world.banquetSeats?.tables.filter(row=>tick>=row.seatTick&&tick<=row.seatTick+2&&row.finalistIds.includes(actor.id));
  if(!due?.length||tick<world.tick||tick>world.tick+1||banquetSeatPerson(world,actor.id)!==actor||
    !publicSite(world,actor.locationId)||!stationary(world,actor,actor.locationId,tick)||
    due.some(row=>row.choices.some(item=>item.actorId===actor.id&&item.tick===tick)))return [];
  return due.flatMap(table=>{
    const prior=table.choices.filter(item=>item.actorId===actor.id);
    if(!banquetSeatTableAuthority(world,table,true)||prior.some(item=>item.move==='late'||item.move==='attend'))return [];
    const canArrive=actor.locationId===table.siteId||knownMapLocations(world,actor).some(site=>site.id===table.siteId);
    if(tick===table.seatTick&&!prior.length&&!table.summary)
      return [...(canArrive?[choice(table,'attend')]:[]),choice(table,'decline')];
    if(tick>table.seatTick&&canArrive&&table.summary&&banquetSeatSummarySource(world,table)!==false)return [choice(table,'late')];
    return [];
  });
}
export function resolveBanquetSeatAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload,
  arriveNative:(siteId:string)=>boolean):WorldEvent|null {
  if(decision.chosenAction!=='BANQUET_SEAT'||!availableBanquetSeatActions(actor,world,world.tick).some(option=>
    option.targetBanquetSeatId===decision.targetBanquetSeatId&&option.banquetSeatMove===decision.banquetSeatMove))return null;
  const table=onlyBanquetRow(world.banquetSeats?.tables??[],row=>row.id===decision.targetBanquetSeatId);
  const move=decision.banquetSeatMove;
  if(!table||!move)return null;
  const from=actor.locationId;
  if(move!=='decline'&&from!==table.siteId&&
    (!arriveNative(table.siteId)||!stationary(world,actor,table.siteId,world.tick)))return null;
  const eventId=banquetSeatChoiceId(table,actor.id,move,world.tick);
  const row:BanquetSeatChoice={actorId:actor.id,move,tick:world.tick,eventId,
    ...(move!=='decline'&&from!==table.siteId?{fromSiteId:from}:{})};
  table.choices.push(row);
  actor.currentAction='BANQUET_SEAT';
  return {...banquetSeatCalendar(world,world.tick),id:eventId,...banquetSeatChoiceWords(move),locationId:table.siteId,
    category:'diplomacy',actorIds:[actor.id],witnessScope:'participants'};
}
export function settleBanquetSeats(world:WorldState):WorldEvent[]{
  const events:WorldEvent[]=[];
  for(const table of world.banquetSeats?.tables??[]){
    if(table.seatTick!==world.tick||table.summary||!banquetSeatTableAuthority(world,table,true))continue;
    const presentIds=table.finalistIds.filter(id=>{
      const actor=banquetSeatPerson(world,id);
      return actor&&stationary(world,actor,table.siteId,world.tick)&&
        table.choices.some(row=>row.actorId===id&&row.tick===world.tick&&row.move==='attend');
    });
    const eventId=banquetSeatSummaryId(table);
    table.summary={tick:world.tick,eventId,presentIds};
    events.push({...banquetSeatCalendar(world,world.tick),id:eventId,title:banquetSeatSummaryTitle,
      description:banquetSeatLine(presentIds.length as 0|1|2),locationId:table.siteId,category:'diplomacy',actorIds:[]});
  }
  return events;
}
export function projectBanquetSeats(world:WorldState,viewer?:Cultivator):BanquetSeatView|undefined {
  const table=world.banquetSeats?.tables.filter(row=>banquetSeatTableAuthority(world,row,true)&&
    (row.summary?banquetSeatSummarySource(world,row)===true:world.tick<row.seatTick))
    .sort((a,b)=>b.invitedTick-a.invitedTick||a.id.localeCompare(b.id))[0];
  if(!table)return;
  const site=banquetSeatSite(world,table.siteId);
  if(!site)return;
  const count=table.summary?.presentIds.length as 0|1|2|undefined;
  const options=viewer?availableBanquetSeatActions(viewer,world).filter(row=>row.targetBanquetSeatId===table.id):[];
  const own=viewer&&banquetSeatPerson(world,viewer.id)===viewer&&stationary(world,viewer,viewer.locationId,world.tick)&&
    world.playerAvatar.possessedId===viewer.id&&(world.playerAvatar.possessionUntilTick??-1)>world.tick?
    [...table.choices].reverse().find(row=>row.actorId===viewer.id):undefined;
  const receipt=own&&banquetSeatChoiceSource(world,table,own)===true?{...banquetSeatChoiceWords(own.move),tick:own.tick}:undefined;
  return {id:table.id,hallEventId:table.invitationEventId,siteId:site.id,siteName:site.name.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu,'').trim().slice(0,64),
    invitedTick:table.invitedTick,tableLine:count===undefined?'此刻只有邀约；还无人按约入席。':banquetSeatLine(count),options,
    ...(count!==undefined?{presentCount:count}:{}),...(receipt?{receipt}:{})};
}
