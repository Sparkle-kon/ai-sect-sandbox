import type {WorldState} from '../types/world';

export const SECT_FESTIVALS=[
  {id:'review',month:1,title:'仙盟考核',jobId:'festival-review',jobLabel:'回山演功',intent:'回本门演功备考；考核另依门中的年例。',replaces:'cultivate'},
  {id:'recruit',month:3,title:'招新大会',jobId:'festival-recruit',jobLabel:'春招访贤',intent:'访安稳村社；有自愿的成人和足额安家钱，才能入门。',replaces:'recruit'},
  {id:'social',month:5,title:'联谊会',jobId:'festival-social',jobLabel:'赴市同席论道',intent:'赴开市坊间，与可交谈的外门道友论道。',replaces:'matchmaking'},
  {id:'debt',month:7,title:'讨债日',jobId:'festival-debt',jobLabel:'候账守门',intent:'有到期欠款时回山候账守门。这件差事不会扣灵石。',replaces:'guard'},
  {id:'market',month:10,title:'坊市大集',jobId:'festival-market',jobLabel:'大集应价',intent:'赴开市坊间；有同地买价合意才挂一份货。',replaces:'stall'},
] as const;

export type SectFestivalDefinition=typeof SECT_FESTIVALS[number];
export type SectFestivalJobId=SectFestivalDefinition['jobId'];

export const sectFestivalForJob=(jobId:string):SectFestivalDefinition|undefined=>
  SECT_FESTIVALS.find(entry=>entry.jobId===jobId);

function calendarIndex(world:Pick<WorldState,'year'|'month'|'tick'>,tick:number):number {
  return world.year*12+world.month-1+(tick-world.tick);
}
export function sectMonthAt(world:Pick<WorldState,'year'|'month'|'tick'>,tick:number):number{
  return ((calendarIndex(world,tick)%12)+12)%12+1;
}

export function sectFestivalReviewDue(world:Pick<WorldState,'month'|'year'|'tick'|'sectManagement'>,tick:number):boolean{
  const started=world.sectManagement?.foundedTick;
  return started!==undefined&&tick-started>=12&&(tick-started)%12===0&&sectMonthAt(world,tick)===1;
}
export function sectFestivalDebtDue(world:Pick<WorldState,'sectManagement'>,tick:number):boolean{
  const debt=world.sectManagement?.debt;
  return !!debt&&debt.principal>0&&debt.dueTick<=tick;
}

export function projectSectFestivals(world:WorldState){
  const upcomingTick=world.tick+1,upcomingMonth=sectMonthAt(world,upcomingTick);
  return SECT_FESTIVALS.map(entry=>{
    const offset=(entry.month-upcomingMonth+12)%12;
    const occurrence=upcomingTick+offset;
    const detail=entry.id==='review'?
      sectFestivalReviewDue(world,occurrence)?'到本门年例，可演功备考。':'本期只看日程，尚未轮到本门年考。':
      entry.id==='debt'?
        sectFestivalDebtDue(world,occurrence)?
          sectFestivalDebtDue(world,world.tick)?'借条已到期，可派人回山候账。':'届时借条到期，可派人回山候账。':
          '到日看账；眼下没有到期余款。':
        entry.intent;
    return {...entry,year:Math.floor(calendarIndex(world,occurrence)/12),ticksUntil:offset+1,isUpcoming:offset===0,detail};
  }).sort((a,b)=>a.ticksUntil-b.ticksUntil);
}
