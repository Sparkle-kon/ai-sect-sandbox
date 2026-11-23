import {HERB_LABELS} from '../engine/alchemyEngine';
import type {SectQuirkId} from '../types/sectManagement';
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

interface Voice {
  readonly tier:SectJobTier;
  readonly job?:SectJobReportRow['jobId'];
  readonly quirks?:readonly SectQuirkId[];
  readonly line:string;
}
const voices:readonly Voice[]=[
  {tier:'windfall',job:'gather',quirks:['glutton','lost'],line:'我一闻见香气就知道该转弯。只是鼻子从来不认路牌。'},
  {tier:'windfall',job:'gather',quirks:['lost'],line:'掌门，您先听结果。至于我是怎么绕到那儿的，且容弟子画上三张图。'},
  {tier:'windfall',job:'kitchen',quirks:['glutton'],line:'我本只想试试咸淡。一勺尝不准，那就再尝一勺。'},
  {tier:'windfall',job:'stall',quirks:['miser'],line:'我用算盘算了两遍，第二遍拨得格外顺耳。'},
  {tier:'windfall',quirks:['chuunibyou'],line:'我就说此番自有天意。掌门，劳您把我先前那句“不好办”忘了。'},
  {tier:'windfall',job:'cultivate',line:'我闭眼时只想坐够一炷香，睁眼倒舍不得起来了。'},
  {tier:'mishap',job:'kitchen',quirks:['glutton'],line:'我觉得再加一把火正合适。火有火的主意。'},
  {tier:'mishap',job:'guard',quirks:['coward_king'],line:'弟子先替山门看了退路。退路一切安好。'},
  {tier:'mishap',job:'recruit',quirks:['chatterbox'],line:'我本想留三句话，说到第三句时，忘了头两句是从哪儿起的。'},
  {tier:'mishap',job:'challenge',line:'弟子开口之前，明明在心里赢过一场。'},
  {tier:'mishap',quirks:['jinx'],line:'我出门前说这事十拿九稳。掌门，下回我先把嘴闭上。'},
  {tier:'success',job:'deliver',line:'掌门，这差事我照吩咐办了。交代的时候慢一些，也省得来回问。'},
  {tier:'success',job:'guard',line:'我把该看的都看了。山风倒比往日爱说话。'},
  {tier:'success',job:'cultivate',line:'我这回没跟自己的杂念争，念头也就散了。'},
];
const plain:Readonly<Record<SectJobTier,string>>={
  windfall:'掌门，弟子本没敢指望这般顺遂。容我缓口气，再从头给您说。',
  mishap:'掌门，我想好的话很圆满，可惜办起差事来，拐了个弯。',
  disaster:'掌门，弟子不敢遮掩。这回出了大事，且听我照实回话。',
  success:'掌门，弟子照吩咐办了，且向您交代一声。',
};
export function reportVoice(row:SectJobReportRow,actor:Cultivator):string {
  if(row.phase==='on_route')return '掌门，弟子只先办到了这一步。且莫忙着记作办成。';
  if(row.phase==='unavailable')return '掌门，这件差事我这回没能办成，先来回个话。';
  const tier=row.tier??'success';
  const quirkIds=actor.quirks??[];
  const voice=voices.find(item=>item.tier===tier&&(!item.job||item.job===row.jobId)&&
    (item.quirks??[]).every(id=>quirkIds.includes(id)));
  return voice?.line??plain[tier];
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
