import {COMEDY_ITEMS,COMEDY_PETS,COMEDY_RECRUITS} from '../data/sectComedy/consequences';
import type {SectPairDramaView} from '../engine/sectPairDrama';
import {SectPairDramaRead} from './SectPairDramaRead';
import type {WorldState} from '../types/world';
import {SectRecurringRead,type SectRecurringViews} from './SectRecurringRead';
import type {projectSectComicMoment} from '../engine/sectComedy';
import type {SectComicAppliedEffect} from '../types/sectComedy';
import type {SectJobReport,SectJobReportRow} from '../types/sectJobs';

export type SectComicView=NonNullable<ReturnType<typeof projectSectComicMoment>>;

export function associatedComicRow(comic:SectComicView|undefined,report:SectJobReport|undefined):SectJobReportRow|undefined {
  const source=comic?.moment.source;
  if(!comic||!report||!source||source.phase==='ambient'||comic.moment.tick!==report.settledTick)return undefined;
  const rows=report.rows.filter(row=>row.discipleId===comic.speakerId&&row.jobId===source.jobId&&row.phase===source.phase&&
    row.sourceEventId===source.reportEventId&&(source.phase!=='performed'||row.tier===source.tier));
  return rows.length===1?rows[0]:undefined;
}

const buildingNames={hall:'大殿',kitchen:'饭堂',furnace:'丹房',trainingGround:'演武场',gate:'山门',library:'藏经阁'};
const herbNames={jade_leaf:'碧叶草',earth_root:'地脉参',star_bloom:'星辉花',shadow_moss:'幽影苔'};
const npcNames={wang:'王掌柜',rival:'隔壁赵掌门',cat:'偷丹灵猫',ancestor:'后山老祖',host:'天机阁主播'};
export function describeSectComicEffect(effect:SectComicAppliedEffect,world?:WorldState){
  const delta='amount' in effect?`${effect.amount>=0?'+':'−'}${Math.abs(effect.amount).toLocaleString('zh-CN',{maximumFractionDigits:3})}`:'';
  switch(effect.kind){
    case 'qi':return `真气进度 ${delta} 个百分点`;
    case 'stones':return `公库灵石 ${delta}`;
    case 'fame':return `宗门名望 ${delta}`;
    case 'debt':return `王掌柜的借条 ${delta} 灵石`;
    case 'injury':return `气血 ${delta}`;
    case 'kitchen_damage':return '饭堂等级 −1';
    case 'building_damage':return `${buildingNames[effect.building]}等级 −1`;
    case 'herb':return `${herbNames[effect.herb]} ${delta} 株`;
    case 'item':return `带回奇物：${COMEDY_ITEMS[effect.template].name}`;
    case 'item_loss':return `丢失奇物：${COMEDY_ITEMS[effect.template].name}`;
    case 'sect_relation':return `与${world?.sects.find(row=>row.id===effect.targetSectId)?.name??'对方宗门'}的交情 ${delta}`;
    case 'recruit':return `${COMEDY_RECRUITS[effect.template].name}拜入山门`;
    case 'pet':return `${COMEDY_PETS[effect.template].name}认主`;
    case 'visit':return `${npcNames[effect.npc]}日后登门`;
    case 'sequel':return '此事后续未完';
    case 'rumor':return '消息传进了群里';
  }
}

export function SectComicEffects({effects,world}:{effects:readonly SectComicAppliedEffect[];world?:WorldState}){
  if(!effects.length)return null;
  return <ul aria-label="小插曲的得失" className="flex flex-wrap gap-1.5 text-xs">
    {effects.map((effect,index)=><li key={`${effect.kind}:${index}`}
      className={`rounded bg-stone-950/80 px-1.5 py-1 ${'amount' in effect&&effect.amount<0||effect.kind==='item_loss'?'text-rose-200':'text-emerald-200'}`}>{describeSectComicEffect(effect,world)}</li>)}
  </ul>;
}

export function SectComicAside({world,comic,speaks,visits,drama}:{world:WorldState;comic?:SectComicView;speaks:boolean;visits:SectRecurringViews;drama?:SectPairDramaView}){
  return <details data-sect-comic-aside="" className="rounded-lg border border-amber-300/25 bg-stone-950/80 px-3">
    <summary className="min-h-11 cursor-pointer content-center font-serif text-sm text-amber-100 focus-visible:outline focus-visible:outline-amber-300">
      本月小插曲
    </summary>
    {comic&&<div className="min-w-0 space-y-2 pb-2 text-sm text-stone-200 [overflow-wrap:anywhere]">
      <p>{comic.report}</p>
      {speaks&&<blockquote className="border-l border-amber-400/40 pl-2 font-serif leading-6">{comic.speakerName}：「{comic.quote}」</blockquote>}
      <SectComicEffects effects={comic.effects} world={world}/>
    </div>}
    {drama&&<div className="pb-2"><SectPairDramaRead drama={drama}/></div>}
    <SectRecurringRead world={world} visits={visits}/>
  </details>;
}
