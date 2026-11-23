import type {WorldState} from '../types/world';

export const SECT_FESTIVALS=[
  {id:'review',month:1,title:'仙盟考核',jobId:'festival-review',jobLabel:'回山演功',intent:'回山演功，为本门年考做准备。',replaces:'cultivate'},
  {id:'recruit',month:3,title:'招新大会',jobId:'festival-recruit',jobLabel:'春招访贤',intent:'到安稳村社访贤。要本人愿意入门，也得备足安家钱；这里只收成人。',replaces:'recruit'},
  {id:'social',month:5,title:'联谊会',jobId:'festival-social',jobLabel:'赴市同席论道',intent:'到开市的坊间，请别门道友同席论道。',replaces:'matchmaking'},
  {id:'debt',month:7,title:'讨债日',jobId:'festival-debt',jobLabel:'候账守门',intent:'借条到期便回山守门。守的是山门，还债另说。',replaces:'guard'},
  {id:'market',month:10,title:'坊市大集',jobId:'festival-market',jobLabel:'大集应价',intent:'到开市的坊间，碰上合意的本地买价，再挂一份货。',replaces:'stall'},
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
      sectFestivalReviewDue(world,occurrence)?'到本门年例，可演功备考。':'且记下日子，还没轮到本门年考。':
      entry.id==='debt'?
        sectFestivalDebtDue(world,occurrence)?
          sectFestivalDebtDue(world,world.tick)?'借条已到期，可派人回山候账。':'届时借条到期，可派人回山候账。':
          '到日看账；眼下没有到期余款。':
        entry.intent;
    return {...entry,year:Math.floor(calendarIndex(world,occurrence)/12),ticksUntil:offset+1,isUpcoming:offset===0,detail};
  }).sort((a,b)=>a.ticksUntil-b.ticksUntil);
}
