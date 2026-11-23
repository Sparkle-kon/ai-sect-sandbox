import type {BanquetSeatChoice,BanquetSeatTable} from '../types/banquetSeat';
import type {ChronicleAnchor,WorldEvent,WorldState} from '../types/world';
import {SHARE_SAVE_REDACTED_TEXT} from './shareSaveRedactionText';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {tournamentArenaPrizeId,TOURNAMENT_ARENA_TITLE} from './tournamentArenaTerms';

export function onlyBanquetRow<T>(rows:readonly T[],test:(row:T)=>boolean):T|undefined {
  let result:T|undefined;
  for(const row of rows) if(test(row)){if(result!==undefined)return;result=row;}
  return result;
}
const only=onlyBanquetRow;
export const banquetTableId=(occasionId:string)=>`banquet-seat-${occasionId}`;
export const banquetSeatSummaryId=(table:BanquetSeatTable)=>`evt-${table.id}-summary-${table.seatTick}`;
export const banquetSeatChoiceId=(table:BanquetSeatTable, actorId:string,move:BanquetSeatChoice['move'],tick:number)=>
  `evt-${table.id}-${actorId}-${move}-${tick}`;
export const banquetSeatPerson=(world:WorldState,id:string)=>only(world.cultivators,actor=>actor.id===id);
export const banquetSeatSite=(world:WorldState,id:string)=>only(world.locations,site=>site.id===id);
export const banquetSeatCalendar=(world:WorldState,tick:number)=>{
  const months=world.year*12+world.month-1-(world.tick-tick);
  return {year:Math.floor(months/12),month:months%12+1,tick};
};
export const banquetSeatLine=(count:0|1|2)=>[
  '约定时候已过；这两席，都不曾有人按约入座。',
  '约定时候已过；两席之中，只见一人按约入座。',
  '约定时候已过；两人都按约到场，在同一张桌前坐下。',
][count];
const titles={attend:'论剑夜宴·按约入座',decline:'论剑夜宴·辞席',late:'论剑夜宴·迟到'};
const descriptions={attend:'应了这一席，亲身到了宴处。',decline:'这一席，亲口辞了。',late:'赶到宴处时，原约的席时已经过去。'};
export const banquetSeatChoiceWords=(move:BanquetSeatChoice['move'])=>({title:titles[move],description:descriptions[move]});
export const banquetSeatSummaryTitle='论剑夜宴·席时已过';
type Source=ChronicleAnchor|WorldEvent;
function source(world:WorldState,id:string,proof:(row:Source)=>boolean,privateSource=false){
  const hot=world.events.filter(row=>row.id===id);
  if(hot.length)return hot.length===1&&(privateSource?hot[0].witnessScope==='participants':hot[0].witnessScope===undefined)&&proof(hot[0]);
  if(privateSource)return undefined;
  const old=world.chronicleArchive.anchors.filter(row=>row.id===id);
  return old.length?old.length===1&&proof(old[0]):undefined;
}
const same=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((id,i)=>id===b[i]);
function matches(world:WorldState,row:Source,tick:number,siteId:string,ids:readonly string[]){
  const date=banquetSeatCalendar(world,tick);
  return row.tick===tick&&row.year===date.year&&row.month===date.month&&row.locationId===siteId&&same(row.actorIds,ids);
}
export function banquetSeatTableAuthority(world:WorldState,table:BanquetSeatTable,requireRetained=false):boolean {
  const occasion=only(world.occasions,row=>row.id===table.occasionId);
  const site=banquetSeatSite(world,table.siteId);
  const arena=occasion?.arena,terminal=arena?.terminal,prize=arena?.prize,round=arena?.rounds.at(-1),bout=round?.bouts[0];
  if(!occasion||occasion.kind!=='tournament'||occasion.omenId||occasion.status!=='completed'||!site||
    (site.type!=='market'&&site.type!=='sect_hq')||isScopedExpeditionGate(site)||
    occasion.locationId!==site.id||!arena||![8,16].includes(arena.seededIds.length)||
    new Set(arena.seededIds).size!==arena.seededIds.length||!arena.seededIds.every(id=>occasion.participantIds.includes(id))||
    !round||!bout?.secondId||bout.secondId===bout.firstId||!same(table.finalistIds,[bout.firstId,bout.secondId])||
    !same(arena.rounds.at(-2)?.bouts.map(item=>item.winnerId)??[],table.finalistIds)||
    !table.finalistIds.every(id=>banquetSeatPerson(world,id))||!table.finalistIds.includes(bout.winnerId)||
    round.round!==Math.log2(arena.seededIds.length)||round.round!==occasion.round||round.round!==arena.rounds.length||
    round.bouts.length!==1||round.absentIds.length!==0||!Number.isSafeInteger(bout.firstDamage)||bout.firstDamage<0||
    bout.secondDamage===undefined||!Number.isSafeInteger(bout.secondDamage)||bout.secondDamage<0||
    bout.firstDamage+bout.secondDamage<=0||
    !only(occasion.bouts,row=>row.round===round.round&&row.firstId===bout.firstId&&row.secondId===bout.secondId&&row.winnerId===bout.winnerId)||
    table.id!==banquetTableId(occasion.id)||table.invitedTick<1||table.invitedTick>world.tick||
    table.seatTick!==table.invitedTick+1||round.tick!==table.invitedTick||occasion.championId!==bout.winnerId||
    terminal?.status!=='completed'||terminal.tick!==round.tick||terminal.eventId!==round.eventId||
    table.crownEventId!==round.eventId||table.crownEventId!==`evt-${round.tick}-${occasion.id}-champion`||
    table.invitationEventId!==`evt-banquet-${occasion.id}-hall-${round.tick}`||
    prize?.actorId!==bout.winnerId||prize.tick!==round.tick||prize.artifactId!==tournamentArenaPrizeId(occasion.id)||prize.title!==TOURNAMENT_ARENA_TITLE)return false;
  const crown=source(world,table.crownEventId,row=>row.category==='heavenly'&&row.title==='大比魁首揭晓'&&matches(world,row,round.tick,site.id,[bout.winnerId]));
  const invite=source(world,table.invitationEventId,row=>row.category==='diplomacy'&&row.title==='论剑夜宴·前厅'&&
    row.description==='胜负已写在榜上。今夜歇一歇剑，请你同饮这一盏。席上不另论输赢。'&&matches(world,row,round.tick,site.id,table.finalistIds));
  return requireRetained ? crown===true&&invite===true : crown!==false&&invite!==false;
}
export function banquetSeatChoiceSource(world:WorldState,table:BanquetSeatTable,choice:BanquetSeatChoice,allowSharedRedaction=false){
  const words=banquetSeatChoiceWords(choice.move);
  return source(world,choice.eventId,row=>row.category==='diplomacy'&&
    ((row.title===words.title&&row.description===words.description)||allowSharedRedaction&&
      row.title===SHARE_SAVE_REDACTED_TEXT&&row.description===SHARE_SAVE_REDACTED_TEXT)&&matches(world,row,choice.tick,table.siteId,[choice.actorId]),true);
}
export function banquetSeatSummarySource(world:WorldState,table:BanquetSeatTable){
  const summary=table.summary;
  if(!summary)return undefined;
  return source(world,summary.eventId,row=>row.category==='diplomacy'&&row.title===banquetSeatSummaryTitle&&
    row.description===banquetSeatLine(summary.presentIds.length as 0|1|2)&&matches(world,row,table.seatTick,table.siteId,[]));
}
export function validateBanquetSeatSave(world:WorldState,fail:(path:string)=>never){
  const tables=world.banquetSeats?.tables;
  if(!tables)return;
  if(new Set(tables.map(row=>row.id)).size!==tables.length)fail('banquetSeats.tables');
  for(const table of tables){
    if(!banquetSeatTableAuthority(world,table,world.tick<=table.seatTick+2))fail('banquetSeats.invitation');
    const timely=new Set<string>(),late=new Set<string>();
    const shouldBeHot=(tick:number)=>world.events.length<120||world.events.some(row=>row.tick<tick);
    let last=table.invitedTick;
    for(const choice of table.choices){
      const dates=choice.move==='late'?choice.tick>table.seatTick&&choice.tick<=table.seatTick+2:choice.tick===table.seatTick;
      const seen=choice.move==='late'?late:timely;
      const proof=banquetSeatChoiceSource(world,table,choice,true);
      if(!dates||choice.tick<last||choice.tick>world.tick||!table.finalistIds.includes(choice.actorId)||seen.has(choice.actorId)||
        choice.eventId!==banquetSeatChoiceId(table,choice.actorId,choice.move,choice.tick)||
        choice.move==='decline'&&choice.fromSiteId!==undefined||choice.fromSiteId!==undefined&&
        (choice.fromSiteId===table.siteId||!banquetSeatSite(world,choice.fromSiteId))||
        choice.move==='late'&&table.choices.some(row=>row.actorId===choice.actorId&&row.move==='attend')||
        (proof===false||proof!==true&&shouldBeHot(choice.tick)))fail('banquetSeats.choice');
      seen.add(choice.actorId);last=choice.tick;
    }
    const summary=table.summary;
    if(summary){
      const proof=banquetSeatSummarySource(world,table);
      if(summary.tick!==table.seatTick||summary.tick>world.tick||summary.eventId!==banquetSeatSummaryId(table)||
        !same(summary.presentIds,table.finalistIds.filter(id=>summary.presentIds.includes(id)))||
        !summary.presentIds.every(id=>table.choices.some(row=>row.actorId===id&&row.move==='attend'))||
        (proof===false||proof!==true&&shouldBeHot(summary.tick)))fail('banquetSeats.summary');
    }else if(world.tick>=table.seatTick)fail('banquetSeats.summary');
  }
}
