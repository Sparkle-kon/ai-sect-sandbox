import type {WorldgenProfileId} from '../types/world';
import {planCampaignCalendar,type FastForwardCalendarDate} from './fastForwardCalendar';
import {isWorldgenProfileId} from './worldgenProfiles';

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
export const isEraDesignInteger=(v:unknown,minimum:number,maximum:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=minimum&&v<=maximum;
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
  if(!isEraDesignInteger(length,0,ERA_DESIGN_MAX_BYTES)||Reflect.ownKeys(value).length!==length+1)return undefined;
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
  return row&&isEraDesignInteger(row.year,1,Number.MAX_SAFE_INTEGER)&&isEraDesignInteger(row.month,1,12)?Object.freeze({year:row.year,month:row.month}):undefined;
}
function condition(value:unknown):EraDesignCondition|undefined {
  const kind=value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,'kind')?.value:undefined;
  if(kind==='jade_vein_depleted'){
    const row=fields(value,['kind','siteId','spiritQi','jadeCapacity']);
    if(row&&id(row.siteId)&&isEraDesignInteger(row.spiritQi,5,150)&&isEraDesignInteger(row.jadeCapacity,0,99))
      return Object.freeze({kind,siteId:row.siteId,spiritQi:row.spiritQi,jadeCapacity:row.jadeCapacity});
  }else if(kind==='danxia_branch_moves_north'){
    const row=fields(value,['kind','destinationId','memberIds','stones']);
    const members=row&&items(row.memberIds);
    if(row&&id(row.destinationId)&&members&&members.every(id)&&isEraDesignInteger(row.stones,0,50_000))
      return Object.freeze({kind,destinationId:row.destinationId,memberIds:Object.freeze([...members].sort()),stones:row.stones});
  }else if(kind==='village_capacity'){
    const row=fields(value,['kind','settlementId','capacity']);
    if(row&&id(row.settlementId)&&isEraDesignInteger(row.capacity,1,100_000))
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
    !isEraDesignInteger(row.seed,0,0xffffffff)||!isWorldgenProfileId(row.profileId))throw new EraDesignError('schema','种子、预设或草案版本无效。');
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
