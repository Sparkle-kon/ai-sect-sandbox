import {FAST_FORWARD_MAX_TICKS} from './fastForwardEngine';

export interface FastForwardCalendarDate {readonly year:number;readonly month:number}
export interface FastForwardCalendarSource extends FastForwardCalendarDate {readonly tick?:number}
export type FastForwardCalendarPlan=
  | {readonly ok:true;readonly target:FastForwardCalendarDate;readonly months:number}
  | {readonly ok:false;readonly reason:'invalid_date'|'not_future'|'out_of_range'};

function calendarDateValid(date:FastForwardCalendarDate):boolean{
  return Number.isSafeInteger(date.year)&&date.year>=1&&Number.isSafeInteger(date.month)&&date.month>=1&&date.month<=12;
}
function nativeSourceValid(source:FastForwardCalendarSource):boolean{
  return calendarDateValid(source)&&(source.tick===undefined||Number.isSafeInteger(source.tick)&&source.tick>=0);
}

/** Native month calculation for a current base and an actual worker's integer progress, not UTC. */
export function addFastForwardCalendarMonths(source:FastForwardCalendarSource,months:number):FastForwardCalendarDate|undefined{
  if(!nativeSourceValid(source)||!Number.isSafeInteger(months)||months<0||months>FAST_FORWARD_MAX_TICKS||
    source.tick!==undefined&&!Number.isSafeInteger(source.tick+months))return undefined;
  const position=source.month-1+months,year=source.year+Math.floor(position/12);
  if(!Number.isSafeInteger(year))return undefined;
  return {year,month:position%12+1};
}

export function planFastForwardCalendar(source:FastForwardCalendarSource,targetYear:string,targetMonth:string):FastForwardCalendarPlan{
  if(!nativeSourceValid(source)||typeof targetYear!=='string'||typeof targetMonth!=='string'||
    !/^[1-9][0-9]{0,15}(?![\s\S])/.test(targetYear)||!/^(?:0?[1-9]|1[0-2])(?![\s\S])/.test(targetMonth))
    return {ok:false,reason:'invalid_date'};
  const target={year:Number(targetYear),month:Number(targetMonth)};
  if(!calendarDateValid(target))return {ok:false,reason:'invalid_date'};
  if(target.year<source.year||target.year===source.year&&target.month<=source.month)return {ok:false,reason:'not_future'};
  const years=target.year-source.year;
  // Bound before multiplying, avoiding an inexact year*12 absolute epoch on old/future saves.
  if(years>Math.ceil(FAST_FORWARD_MAX_TICKS/12)+1)return {ok:false,reason:'out_of_range'};
  const months=years*12+target.month-source.month;
  if(!addFastForwardCalendarMonths(source,months))return {ok:false,reason:'out_of_range'};
  return {ok:true,target,months};
}
