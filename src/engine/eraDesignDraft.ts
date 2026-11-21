import { createInitialWorld } from '../data/initialWorld';
import type { WorldgenProfileId, WorldState } from '../types/world';
import { planCampaignCalendar, type FastForwardCalendarDate } from './fastForwardCalendar';
import { isWorldgenProfileId } from './worldgenProfiles';
import { terrainTileAt } from './terrainEngine';
import { SECT_CREDIT_RESERVE } from './sectCreditEngine';
import { DOCTRINE_FOUNDING_MIN_MEMBERS, DOCTRINE_FOUNDING_MIN_SUPPORT_QI, DOCTRINE_FOUNDING_MIN_WALLET } from './doctrineFoundingTerms';

export const ERA_DESIGN_FORMAT='sect-era-design';
export const ERA_DESIGN_VERSION=1;
export const ERA_DESIGN_MAX_BYTES=16_384;
export const ERA_DESIGN_STORAGE_KEY='sect-sandbox:era-design:v1';
export const ERA_DESIGN_CONDITIONS=['jade_vein_depleted','danxia_branch_moves_north','village_capacity'] as const;
export const ERA_DESIGN_PROFILE_LABELS={
  jade_vein_depleted:'寒玉灵脉衰竭',danxia_branch_moves_north:'丹霞一支迁北',village_capacity:'村落承载条件',
} as const;

export type EraDesignCondition =
  | {readonly kind:'jade_vein_depleted';readonly siteId:string;readonly spiritQi:number;readonly jadeCapacity:number}
  | {readonly kind:'danxia_branch_moves_north';readonly destinationId:string;readonly memberIds:readonly string[];readonly stones:number}
  | {readonly kind:'village_capacity';readonly settlementId:string;readonly capacity:number};
export interface EraDesignDraft {
  readonly format:typeof ERA_DESIGN_FORMAT;
  readonly version:typeof ERA_DESIGN_VERSION;
  readonly seed:number;
  readonly profileId:WorldgenProfileId;
  readonly anchor:FastForwardCalendarDate;
  readonly target:FastForwardCalendarDate;
  readonly conditions:readonly EraDesignCondition[];
}
export type EraDesignErrorCode='syntax'|'size'|'schema'|'duplicate_condition'|'invalid_date'|'not_future'|'out_of_range'|'storage';
export class EraDesignError extends Error {
  constructor(readonly code:EraDesignErrorCode,message:string,readonly conditionIndex?:number){super(message);this.name='EraDesignError';}
}

type Data=Record<string,unknown>;
const whole=(v:unknown,minimum:number,maximum:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=minimum&&v<=maximum;
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/u.test(v);
function fields(value:unknown,keys:readonly string[]):Data|undefined {
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return undefined;
  const actual=Reflect.ownKeys(value);
  if(actual.length!==keys.length||!keys.every(key=>actual.includes(key)))return undefined;
  const result:Data=Object.create(null);
  for(const key of keys){
    const row=Object.getOwnPropertyDescriptor(value,key);
    if(!row?.enumerable||!('value' in row))return undefined;
    result[key]=row.value;
  }
  return result;
}
function items(value:unknown):unknown[]|undefined {
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)return undefined;
  const length=Object.getOwnPropertyDescriptor(value,'length')?.value;
  if(!whole(length,0,ERA_DESIGN_MAX_BYTES)||Reflect.ownKeys(value).length!==length+1)return undefined;
  const normalized:unknown[]=[];
  for(let index=0;index<length;index++){
    const row=Object.getOwnPropertyDescriptor(value,String(index));
    if(!row?.enumerable||!('value' in row))return undefined;
    normalized.push(row.value);
  }
  return normalized;
}
function date(value:unknown):FastForwardCalendarDate|undefined {
  const row=fields(value,['year','month']);
  return row&&whole(row.year,1,Number.MAX_SAFE_INTEGER)&&whole(row.month,1,12)?Object.freeze({year:row.year,month:row.month}):undefined;
}
function condition(value:unknown):EraDesignCondition|undefined {
  const kind=value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,'kind')?.value:undefined;
  if(kind==='jade_vein_depleted'){
    const row=fields(value,['kind','siteId','spiritQi','jadeCapacity']);
    if(row&&id(row.siteId)&&whole(row.spiritQi,5,150)&&whole(row.jadeCapacity,0,99))
      return Object.freeze({kind,siteId:row.siteId,spiritQi:row.spiritQi,jadeCapacity:row.jadeCapacity});
  }else if(kind==='danxia_branch_moves_north'){
    const row=fields(value,['kind','destinationId','memberIds','stones']);
    const members=row&&items(row.memberIds);
    if(row&&id(row.destinationId)&&members&&members.every(id)&&whole(row.stones,0,50_000))
      return Object.freeze({kind,destinationId:row.destinationId,memberIds:Object.freeze([...members].sort()),stones:row.stones});
  }else if(kind==='village_capacity'){
    const row=fields(value,['kind','settlementId','capacity']);
    if(row&&id(row.settlementId)&&whole(row.capacity,1,100_000))
      return Object.freeze({kind,settlementId:row.settlementId,capacity:row.capacity});
  }
  return undefined;
}
function byteLength(text:string){return new TextEncoder().encode(text).byteLength;}
function safeText(text:string){
  if(typeof text!=='string'||text.length===0||byteLength(text)>ERA_DESIGN_MAX_BYTES)
    throw new EraDesignError('size','纪元草案为空或超过 16 KiB。');
}
export function validateEraDesignDraft(value:unknown):EraDesignDraft {
  const row=fields(value,['format','version','seed','profileId','anchor','target','conditions']);
  if(!row||row.format!==ERA_DESIGN_FORMAT||row.version!==ERA_DESIGN_VERSION||
    !whole(row.seed,0,0xffffffff)||!isWorldgenProfileId(row.profileId))throw new EraDesignError('schema','种子、预设或草案版本无效。');
  const anchor=date(row.anchor),target=date(row.target);
  if(!anchor||!target)throw new EraDesignError('invalid_date','年月必须是有效的原生历法日期。');
  const planned=planCampaignCalendar(anchor,String(target.year),String(target.month));
  if(!planned.ok)throw new EraDesignError(planned.reason,planned.reason==='not_future'?'目标年月必须晚于草案记录的起点。':
    planned.reason==='out_of_range'?'目标日期须在起点之后 1200 月以内。':'年月不符合原生历法。');
  const raw=items(row.conditions);
  if(!raw||raw.length<2||raw.length>3)throw new EraDesignError('schema','纪元草案须写下两至三项明确条件。');
  const found=new Set<EraDesignCondition['kind']>();
  const conditions=raw.map((value,index)=>{
    const normalized=condition(value);
    if(!normalized)throw new EraDesignError('schema','条件类型或栏位无效。',index);
    if(found.has(normalized.kind))throw new EraDesignError('duplicate_condition','同类条件只能写一次。',index);
    found.add(normalized.kind);return normalized;
  });
  return Object.freeze({format:ERA_DESIGN_FORMAT,version:ERA_DESIGN_VERSION,seed:row.seed,profileId:row.profileId,anchor,target,
    conditions:Object.freeze(conditions)});
}
export function createEraDesignDraft(seed:number,profileId:WorldgenProfileId,anchor:FastForwardCalendarDate,
  target:FastForwardCalendarDate,conditions:readonly EraDesignCondition[]):EraDesignDraft {
  return validateEraDesignDraft({format:ERA_DESIGN_FORMAT,version:ERA_DESIGN_VERSION,seed,profileId,anchor,target,conditions:[...conditions]});
}
export function decodeEraDesignDraft(text:string):EraDesignDraft {
  safeText(text);
  let value:unknown;
  try{value=JSON.parse(text);}catch{throw new EraDesignError('syntax','草案不是有效的 JSON。');}
  return validateEraDesignDraft(value);
}
export function encodeEraDesignDraft(input:unknown):string {
  const text=JSON.stringify(validateEraDesignDraft(input));safeText(text);return text;
}

const DANXIA_ID='sect-danxia', COLD_VEIN_ID='loc-vein-north';
export interface EraDesignSite {id:string;name:string;spiritQi:number;jadeCapacity:number;earthRoots:number;ownerSectId?:string}
export interface EraDesignActor {id:string;name:string;age:number;lifespan:number}
export interface EraDesignCatalog {
  depletionSites:EraDesignSite[];northSites:EraDesignSite[];danxiaMembers:EraDesignActor[];villages:{id:string;name:string;population:number;capacity:number}[];
  danxia?:{id:string;name:string;headquartersId:string;headquartersName:string;leaderId?:string;stones:number};
}
function catalogOf(world:WorldState):EraDesignCatalog {
  const parent=world.sects.find(row=>row.id===DANXIA_ID);
  const home=parent&&world.locations.find(site=>site.id===parent.headquartersId&&site.ownerSectId===parent.id);
  const site=(row:WorldState['locations'][number]):EraDesignSite=>({id:row.id,name:row.name,spiritQi:row.spiritQi,
    jadeCapacity:row.herbCapacity.jade_leaf,earthRoots:row.herbs.earth_root,...(row.ownerSectId?{ownerSectId:row.ownerSectId}:{})});
  const eligibleLand=world.locations.filter(row=>row.type==='spirit_vein');
  return {
    depletionSites:eligibleLand.filter(row=>row.id===COLD_VEIN_ID||row.spiritRoot==='水').map(site),
    northSites:home?eligibleLand.filter(row=>row.y<home.y&&row.id!==home.id).map(site):[],
    danxiaMembers:parent?world.cultivators.filter(row=>row.sectId===parent.id&&row.id!==parent.leaderId&&row.alive&&row.hp>0)
      .map(({id,name,age,lifespan})=>({id,name,age,lifespan})):[],
    villages:world.settlements.villages.map(({id,name,population,capacity})=>({id,name,population,capacity})),
    ...(parent&&home?{danxia:{id:parent.id,name:parent.name,headquartersId:home.id,headquartersName:home.name,
      ...(parent.leaderId?{leaderId:parent.leaderId}:{}),stones:parent.spiritStones}}:{}),
  };
}
export function eraDesignCatalog(seed:number,profileId:WorldgenProfileId):EraDesignCatalog {
  if(!whole(seed,0,0xffffffff)||!isWorldgenProfileId(profileId))throw new EraDesignError('schema','目标表需要有效的种子和创世预设。');
  return catalogOf(createInitialWorld(seed,profileId));
}

export type EraDesignIssueCode =
  'unknown_depletion_site'|'unchanged_depletion'|'unknown_north_site'|'site_already_titled'|'insufficient_land_support'|
  'member_duplicate'|'unknown_member'|'insufficient_members'|'insufficient_residents_at_origin'|'insufficient_treasury'|
  'future_member_unverified'|'unknown_village'|'insufficient_village_capacity'|'editor_date_changed'|'editor_target_passed';
export interface EraDesignIssue {
  code:EraDesignIssueCode;severity:'conflict'|'caution';conditionIndex?:number;message:string;
}
export interface EraDesignConditionPreview {
  kind:EraDesignCondition['kind'];origin:'author_design';label:string;targetName?:string;memberNames?:string[];
  quotedStones?:number;baselineStones?:number;baselinePopulation?:number;effectiveQi?:number;
}
export interface EraDesignPreview {
  draft:EraDesignDraft;monthsAhead:number;ready:boolean;issues:EraDesignIssue[];conditions:EraDesignConditionPreview[];
}
const eraMonth=(instant:FastForwardCalendarDate,other:FastForwardCalendarDate)=>instant.year===other.year?instant.month-other.month:instant.year-other.year;
export function previewEraDesignDraft(input:unknown,editorDate?:FastForwardCalendarDate):EraDesignPreview {
  const draft=validateEraDesignDraft(input);
  const generated=createInitialWorld(draft.seed,draft.profileId),catalog=catalogOf(generated);
  const datePlan=planCampaignCalendar(draft.anchor,String(draft.target.year),String(draft.target.month));
  if(!datePlan.ok)throw new EraDesignError(datePlan.reason,'日期未通过原生历法复核。');
  const issues:EraDesignIssue[]=[];
  const issue=(code:EraDesignIssueCode,message:string,conditionIndex?:number,severity:EraDesignIssue['severity']='conflict')=>
    issues.push({code,severity,message,...(conditionIndex===undefined?{}:{conditionIndex})});
  if(editorDate&&eraMonth(editorDate,draft.anchor)!==0){
    if(eraMonth(editorDate,draft.target)>=0)issue('editor_target_passed','当前游玩日期已到或超过拟定年月；仍可编辑或保存草案，尚未开启新纪元。',undefined,'caution');
    else issue('editor_date_changed','当前游玩日期与原草案起点不同；原草案起点未被改写。',undefined,'caution');
  }
  const decline=draft.conditions.find(value=>value.kind==='jade_vein_depleted');
  const previews=draft.conditions.map((value,index):EraDesignConditionPreview=>{
    const base={kind:value.kind,origin:'author_design' as const,label:ERA_DESIGN_PROFILE_LABELS[value.kind]};
    if(value.kind==='jade_vein_depleted'){
      const actual=catalog.depletionSites.find(site=>site.id===value.siteId);
      if(!actual)issue('unknown_depletion_site','此创世预设没有指定的可衰竭寒玉灵脉。',index);
      else if(value.spiritQi>actual.spiritQi||value.jadeCapacity>actual.jadeCapacity||
        value.spiritQi===actual.spiritQi&&value.jadeCapacity===actual.jadeCapacity)
        issue('unchanged_depletion','衰竭须实际减少灵气或药草承载之一，不可提高另一项。',index);
      return {...base,...(actual?{targetName:actual.name}:{}),effectiveQi:value.spiritQi};
    }
    if(value.kind==='danxia_branch_moves_north'){
      const actual=catalog.northSites.find(site=>site.id===value.destinationId),parent=catalog.danxia;
      const dest=generated.locations.find(site=>site.id===value.destinationId);
      const effectiveQi=actual&&(decline?.siteId===actual.id?decline.spiritQi:actual.spiritQi);
      if(!actual||!parent||!dest)issue('unknown_north_site','只可选择此预设中确切存在、位于丹霞原址以北的灵脉。',index);
      else {
        const tile=terrainTileAt(generated,dest.x,dest.y);
        if(actual.ownerSectId||tile?.ownerSectId||generated.sects.some(item=>item.headquartersId===actual.id))
          issue('site_already_titled','预设分所与此真实地权重叠；草案不能转移他宗地产。',index);
        if(effectiveQi===undefined||effectiveQi<DOCTRINE_FOUNDING_MIN_SUPPORT_QI||actual.earthRoots<1||!tile||tile.biome==='魔渊')
          issue('insufficient_land_support','北迁拟址实际供养条件不足；此处如同时衰竭，须提高剩余灵气或另选合法北地。',index);
      }
      const ids=new Set(value.memberIds);
      if(ids.size!==value.memberIds.length)issue('member_duplicate','同一成员不能在迁北名单内重复登记。',index);
      if(ids.size<DOCTRINE_FOUNDING_MIN_MEMBERS)issue('insufficient_members',`迁北至少须列出 ${DOCTRINE_FOUNDING_MIN_MEMBERS} 位真实候选成员。`,index);
      const catalogMembers=new Map(catalog.danxiaMembers.map(member=>[member.id,member]));
      const selected=[...ids].flatMap(selectedId=>{const member=catalogMembers.get(selectedId);return member?[member]:[];});
      if(selected.length!==ids.size)issue('unknown_member','候选必须是此预设中实际存在的丹霞成员，不含原掌门或他宗人员。',index);
      if(parent&&selected.length>=catalog.danxiaMembers.length)
        issue('insufficient_residents_at_origin','创世名单上只剩原掌门未列入；当代复核仍须证实原宗有足够的实际留守成员。',index,'caution');
      if(!parent||value.stones<DOCTRINE_FOUNDING_MIN_WALLET||value.stones>parent.stones-SECT_CREDIT_RESERVE)
        issue('insufficient_treasury','拟划的库银不足以立支，或使原宗在预设余额下失去最低储备；实际未结义务仍须在未来另核。',index);
      if(selected.some(member=>member.age+Math.max(0,draft.target.year-generated.year)>=member.lifespan))
        issue('future_member_unverified','有候选到拟定年月将接近现寿元；这里只核对创世身份，不保证未来在世、同意、任职或到场。',index,'caution');
      return {...base,...(actual?{targetName:actual.name,effectiveQi}:{}),
        memberNames:selected.map(member=>member.name),quotedStones:value.stones,...(parent?{baselineStones:parent.stones}:{})};
    }
    const village=catalog.villages.find(row=>row.id===value.settlementId);
    if(!village)issue('unknown_village','指定的村落在此创世预设中不存在。',index);
    else if(value.capacity<village.population)
      issue('insufficient_village_capacity','拟设承载低于此预设的已有居民。本草案不能搬走、清除或转籍任何人。',index);
    return {...base,...(village?{targetName:village.name,baselinePopulation:village.population}:{})};
  });
  return {draft,monthsAhead:datePlan.months,ready:issues.every(item=>item.severity!=='conflict'),issues,conditions:previews};
}

export type EraDesignDraftStorage=Pick<Storage,'getItem'|'setItem'>;
function defaultDraftStorage():EraDesignDraftStorage|undefined {
  try{return typeof window==='undefined'?undefined:window.localStorage;}catch{return undefined;}
}
/** Explicit drafting persistence only: no access to WorldSave, timeline, simulation or provider. */
export function readEraDesignDraft(storage:EraDesignDraftStorage|undefined=defaultDraftStorage()):EraDesignDraft|undefined {
  try{
    const raw=storage?.getItem(ERA_DESIGN_STORAGE_KEY);
    return raw?decodeEraDesignDraft(raw):undefined;
  }catch{return undefined;}
}
export function writeEraDesignDraft(input:unknown,storage:EraDesignDraftStorage|undefined=defaultDraftStorage()):boolean {
  const text=encodeEraDesignDraft(input);
  try{
    if(!storage)return false;
    storage.setItem(ERA_DESIGN_STORAGE_KEY,text);return true;
  }catch{return false;}
}
