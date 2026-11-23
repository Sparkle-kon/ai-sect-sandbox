import {ALCHEMY_RECIPES} from '../engine/alchemyCatalog';
import type {projectSectRecurring} from '../engine/sectRecurring';
import type {SectRecurringRole} from '../types/sectRecurring';
import type {SpiritBeast,WorldState} from '../types/world';
import {CultivatorPortrait} from './CultivatorPortrait';
import {projectCultivatorPortrait} from './cultivatorPortraitModel';
import {sectPlayerFactCopy} from '../data/sectPlayerFactCopy';
import {BEAST_COLORS,isLivingBeast} from './spiritBeastView';

export type SectRecurringViews=ReturnType<typeof projectSectRecurring>;
const roles:Readonly<Record<SectRecurringRole,string>>={
  wang:'坊市债主',rival:'邻宗掌门',cat:'山间灵兽',ancestor:'后山旧人',host:'天机阁',
};

function SpiritCat({beast}:{beast:SpiritBeast}){
  const rim=BEAST_COLORS[beast.kind];
  return <svg data-sect-native-cat="" aria-hidden="true" viewBox="0 0 48 48" className="h-11 w-11 shrink-0 rounded-lg bg-slate-950">
    <path d="M35 34q8-1 7-8-1-4-4-5" fill="none" stroke={rim} strokeWidth="2.2" strokeLinecap="round"/>
    <ellipse cx="26.5" cy="33.5" rx="12.5" ry="8.8" fill="#293641" stroke={rim} strokeWidth="1.1"/>
    <path d="m10 20 1-10 7 4 7-4 3 10q1 8-9 9-9 0-9-9Z" fill="#293641" stroke={rim} strokeWidth="1.3"/>
    <path d="m13 20 2 1 2-1m4 0 2 1 2-1m-8 4 1.5 1 1.5-1M8 23l7 1m-6 2 6-.5m8-1 6-1m-6 2 5 1" fill="none" stroke={rim} strokeWidth=".8" strokeLinecap="round"/>
  </svg>;
}

export function SectRecurringRead({world,visits}:{world:WorldState;visits:SectRecurringViews}){
  if(!visits.length)return null;
  return <ul aria-label="本月来客" className="divide-y divide-slate-800">
    {visits.map(visit=>{
      const human=visit.role==='cat'?[]:world.cultivators.filter(row=>row.id===visit.entityId);
      const beasts=visit.role==='cat'?world.spiritBeasts.filter(row=>row.id===visit.entityId&&isLivingBeast(row)):[];
      const actor=human.length===1?human[0]:undefined;
      const portrait=actor&&projectCultivatorPortrait(world,actor);
      const speech=actor?.alive&&actor.hp>0?visit.quote:undefined;
      return <li key={visit.role} data-sect-recurring-visit={visit.role} className="flex min-w-0 items-start gap-2 py-2 [overflow-wrap:anywhere]">
        {portrait&&<CultivatorPortrait portrait={portrait} className="h-12 w-[2.7rem]"/>}
        {beasts.length===1&&<SpiritCat beast={beasts[0]}/>}
        <div className="min-w-0 flex-1 space-y-1 text-sm leading-6 text-stone-200">
          <h3 className="font-serif text-amber-100">{visit.name} <span className="text-xs text-stone-400">{roles[visit.role]}</span></h3>
          <p>{visit.outcome==='public_news'&&visit.sourceEventId?sectPlayerFactCopy(visit.report):visit.report}</p>
          {speech&&<blockquote className="border-l border-amber-300/35 pl-2 font-serif">「{speech}」</blockquote>}
          {visit.recall&&<p className="text-xs text-stone-300"><span className="font-semibold text-amber-100">提起旧事：</span>{visit.recall}</p>}
          {visit.pill&&<p aria-label="丹药折损" className="text-xs text-rose-200">{ALCHEMY_RECIPES[visit.pill.id].name} −{visit.pill.count} 枚</p>}
        </div>
      </li>;
    })}
  </ul>;
}
