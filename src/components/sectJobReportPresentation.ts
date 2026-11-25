import {HERB_LABELS} from '../engine/alchemyEngine';
import {SECT_BRIEFING_VOICES,SECT_COURTYARD_QUIPS} from '../data/sectBriefing';
import type {SectJobReportEffect,SectJobReportRow,SectJobTier} from '../types/sectJobs';
import type {Cultivator} from '../types/world';
import type {PortraitExpression} from './cultivatorPortraitModel';

const tierCopy:Readonly<Record<SectJobTier,{label:string;order:number;ink:string}>>={
  windfall:{label:'歪打正着',order:0,ink:'text-amber-200'},
  mishap:{label:'出了岔子',order:1,ink:'text-orange-200'},
  disaster:{label:'出了大事',order:2,ink:'text-rose-200'},
  success:{label:'办妥了',order:3,ink:'text-emerald-200'},
};
export function reportTier(row:SectJobReportRow) {
  return row.phase==='performed'&&row.tier?tierCopy[row.tier]:
    row.phase==='on_route'?{label:'差事尚未办完',order:4,ink:'text-sky-200'}:
      row.phase==='unavailable'?{label:'这回未办',order:5,ink:'text-slate-300'}:tierCopy.success;
}

export function courtyardQuip(actor:Cultivator,tap=0):string{
  const quirks=actor.quirks??[],quirk=quirks[tap%quirks.length];
  return quirk?SECT_COURTYARD_QUIPS[quirk]:'檐下茶还温着。掌门也来坐一会儿么？';
}
export function reportVoice(row:SectJobReportRow,actor:Cultivator):string {
  const tier=row.tier??'success',voices=SECT_BRIEFING_VOICES[row.jobId];
  const line=row.phase==='on_route'?'我先把路上这一段回给您听，余下的留到下回。':
    row.phase==='unavailable'?'这张差事牌我先带回来，等掌门另派。':
    voices[tier==='success'?0:tier==='windfall'?1:tier==='mishap'?2:3];
  return tier!=='disaster'&&actor.quirks?.length?`${line}${courtyardQuip(actor,row.jobId.length)}`:line;
}
export function reportExpression(row:SectJobReportRow):PortraitExpression {
  if(row.phase!=='performed')return 'calm';
  if(row.tier==='windfall')return 'surprise';
  if(row.tier==='mishap')return 'dismay';
  if(row.tier==='disaster')return row.effects.some(effect=>effect.kind==='hp'&&effect.amount<0)?'wounded':'concern';
  return 'calm';
}
const fields={qi:'真气进度',hp:'气血',contribution:'门中贡献'} as const;
export function reportEffectLine(effect:SectJobReportEffect):string {
  const sign=effect.amount>0?'+':'−';
  const value=`${sign}${Math.abs(effect.amount).toLocaleString('zh-CN',{maximumFractionDigits:3})}`;
  if(effect.kind==='herb')return `${HERB_LABELS[effect.herbId]} ${value} 株`;
  return `${fields[effect.kind]} ${value}${effect.kind==='qi'?' 个百分点':''}`;
}
