import {useId,useState,type ReactNode} from 'react';
import type {WaterVeinOption,WaterVeinView} from '../engine/waterVeinEngine';
import {WATER_VEIN_OPEN_STONES,WATER_VEIN_SURVEY_STONES} from '../engine/waterVeinTerms';

export type WaterVeinMove='observe'|'open'|'mine';
export type WaterVeinChoice=WaterVeinOption;
type DateStamp={year:number;month:number};
type VisibleSymptom={depthLossInches:number;fieldDry?:boolean;mineRestricted?:boolean;recovered?:boolean};
export type ColdWaterReading=
  | ({kind:'local';hasCompletedWell:boolean} & Partial<VisibleSymptom>)
  | ({kind:'own_observation';date:DateStamp} & Partial<VisibleSymptom>)
  | {kind:'reported';date:DateStamp;symptom:string};
export type ColdWaterDisclosure={reading?:ColdWaterReading;ownOpening?:{date:DateStamp;cost:number;borrowed:number}};
export interface ColdWaterControls {
  scopeKey:string;
  revisionKey:object;
  choices:readonly WaterVeinChoice[];
  pending?: WaterVeinMove;
  disabled?:boolean;
  onQueue:(choice:WaterVeinChoice,revision:object)=>boolean;
}

const names:Record<WaterVeinMove,string>={observe:'定水尺',open:'试启天门',mine:'下镐取石'};
const button='min-h-11 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100 disabled:opacity-50';
const when=({year,month}:DateStamp)=>`仙历 ${year} 年 ${month} 月`;

export function ColdWaterSymptom({reading}:{reading:ColdWaterReading}) {
  if(reading.kind==='reported')return <p>这里传来一则{when(reading.date)}的旧闻：{reading.symptom}。不是实地复核，眼下水位和缘由未查明。</p>;
  if(reading.kind==='local'&&!reading.hasCompletedWell)return <p>水脉在此。乡井还未实地完工，无井尺可查。</p>;
  return <div className="space-y-1">
    <p>{reading.kind==='local'?'眼下在此处所见：':`${when(reading.date)}本人旧测（不是当前实况）：`}
      {reading.depthLossInches===undefined?'尚无读数。':reading.depthLossInches===0?(reading.recovered?'井水回到了常尺。':'井水未见比常尺下落。'):`井水比常尺浅 ${reading.depthLossInches} 寸。`}
    </p>
    {reading.fieldDry&&<p>灵田已经记下失水。</p>}
    {reading.mineRestricted&&<p>矿口已经受水势牵制。</p>}
  </div>;
}

export function ColdWaterDisclosurePanel({disclosure,controls,children}:{disclosure:ColdWaterDisclosure;controls?:ColdWaterControls;children?:ReactNode}) {
  if(!disclosure.reading&&!disclosure.ownOpening&&!controls?.pending&&!children)return null;
  return <details className="min-w-0 rounded border border-sky-500/30 bg-slate-950 p-2 text-xs text-slate-100 [overflow-wrap:anywhere]">
    <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-sky-100">寒玉井边</summary>
    <div className="space-y-2">
      {disclosure.reading&&<ColdWaterSymptom reading={disclosure.reading}/>}
      {disclosure.ownOpening&&<p>{when(disclosure.ownOpening.date)}本人核到门账：实付 {disclosure.ownOpening.cost} 灵石，借水脉灵压 {disclosure.ownOpening.borrowed} 份。不是水尺寸数。</p>}
      {disclosure.reading?.kind==='local'&&!disclosure.ownOpening&&disclosure.reading.depthLossInches!==undefined&&disclosure.reading.depthLossInches>0&&<p>水尺看得见，因何下落还不能断。</p>}
      {controls&&disclosure.reading?.kind==='local'&&<ColdWaterVeinOrders key={controls.scopeKey} {...controls}/>}
      {children}
    </div>
  </details>;
}

const symptoms={well:'井水比往常浅了',field:'井畔灵田发干',mine:'矿口取石渐难',recovered:'井水有回升的迹象'} as const;
export function ColdWaterVeinPanel({view,controls,children}:{view?:WaterVeinView;controls?:ColdWaterControls;children?:ReactNode}) {
  if(!view)return <ColdWaterDisclosurePanel disclosure={{}}>{children}</ColdWaterDisclosurePanel>;
  const date={year:view.year,month:view.month};
  const ownOpening=view.scope!=='rumor'&&view.ownOpening?
    {date:{year:view.ownOpening.year,month:view.ownOpening.month},cost:view.ownOpening.paidStones,borrowed:view.ownOpening.borrowedUnits}:undefined;
  if(view.scope==='rumor'){
    return view.symptom?<ColdWaterDisclosurePanel disclosure={{reading:{kind:'reported',date,symptom:symptoms[view.symptom]}}}>{children}</ColdWaterDisclosurePanel>:<ColdWaterDisclosurePanel disclosure={{}}>{children}</ColdWaterDisclosurePanel>;
  }
  const depthLossInches=view.wellDepth===undefined||view.wellBaseline===undefined?undefined:
    Math.max(0,view.wellBaseline-view.wellDepth);
  const common={fieldDry:!!view.fieldDeficit,mineRestricted:view.symptom==='mine',recovered:view.symptom==='recovered'};
  const reading:ColdWaterReading=view.scope==='local'?
    {kind:'local',hasCompletedWell:view.wellDepth!==undefined,depthLossInches,...common}:
    {kind:'own_observation',date,depthLossInches,...common};
  return <ColdWaterDisclosurePanel disclosure={{reading,ownOpening}} controls={view.scope==='local'?controls:undefined}>{children}</ColdWaterDisclosurePanel>;
}

type ProposedWaterOrder={choice:WaterVeinChoice;revision:object};
export function reviewedWaterOrder(staged:ProposedWaterOrder|undefined,revision:object,choices:readonly WaterVeinChoice[]) {
  if(!staged||staged.revision!==revision)return undefined;
  const matching=choices.filter(choice=>choice.waterVeinMove===staged.choice.waterVeinMove&&choice.targetLocationId===staged.choice.targetLocationId);
  return matching.length===1?matching[0]:undefined;
}

function ColdWaterVeinOrders({revisionKey,choices,pending,disabled,onQueue}:ColdWaterControls) {
  const [staged,setStaged]=useState<ProposedWaterOrder>();
  const [notice,setNotice]=useState('');
  const reviewTitle=useId();
  const offer=reviewedWaterOrder(staged,revisionKey,choices);
  return <>
    {pending&&<p role="status">已候下月：{names[pending]}。尚未落账。</p>}
    {choices.length>0&&!pending&&<div className="flex flex-wrap gap-1">
      {choices.map(choice=><button key={choice.waterVeinMove} type="button" className={button} disabled={disabled}
        aria-pressed={offer?.waterVeinMove===choice.waterVeinMove}
        onClick={()=>{setStaged({choice,revision:revisionKey});setNotice('');}}>{names[choice.waterVeinMove]}</button>)}
    </div>}
    {offer&&!pending&&!disabled&&<div role="group" aria-labelledby={reviewTitle} className="space-y-1 border-t border-slate-800 pt-2">
      <p id={reviewTitle}>{names[offer.waterVeinMove]}：先把打算交给下月。{
        offer.waterVeinMove==='open'?`眼下不动宗库；下月重验井况与资格，实际启门才由宗库支出 ${WATER_VEIN_OPEN_STONES} 灵石。`:
        offer.waterVeinMove==='observe'?`实际量尺才由本人付 ${WATER_VEIN_SURVEY_STONES} 灵石。`:'实掘才有收成，不以打算代替采账。'
      }</p>
      <div className="flex flex-wrap gap-1">
        <button className={button} type="button" onClick={()=>{setNotice(onQueue(offer,revisionKey)?'已经记下打算。':'人、地点或时机已变，未记下。');setStaged(undefined);}}>记作下月打算</button>
        <button className={button} type="button" onClick={()=>setStaged(undefined)}>先不做</button>
      </div>
    </div>}
    {notice&&<p role="status">{notice}</p>}
  </>;
}
