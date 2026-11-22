import type {BuiltinScenarioOrigin,BuiltinScenarioPresetId} from '../types/world';
export type {BuiltinScenarioOrigin,BuiltinScenarioPresetId} from '../types/world';

export interface HighDramaPreset {
  readonly id:BuiltinScenarioPresetId;
  readonly title:string;
  readonly description:string;
  readonly intent:string;
  readonly openedTick:number;
  readonly seed:1;
  readonly profileId:'spirit-bloom';
}

export const HIGH_DRAMA_PRESETS:readonly HighDramaPreset[]=Object.freeze([
  Object.freeze({id:'storm-at-blood-moon',title:'山雨欲来：血月山门',
    description:'正魔两宗已然宣战，联军已经抵达血月山门，护山阵尚未接战。',
    intent:'追踪山门首战，留意阵眼和真正到场的斗将。',openedTick:7,seed:1,profileId:'spirit-bloom'} as const),
  Object.freeze({id:'tournament-eve',title:'天骄争锋：仙门大比前夜',
    description:'万仙坊市的仙门大比尚在报名，已有三位修士正式入册，胜负未定。',
    intent:'先翻大比名册，再看报名结束后谁会真正出场。',openedTick:62,seed:1,profileId:'spirit-bloom'} as const),
  Object.freeze({id:'cold-jade-disciple',title:'微末凡人：初入仙途',
    description:'极北寒玉脉旁，一位凡人刚刚自愿入门，宗门已付安置灵石。',
    intent:'从新弟子落脚处看起，休整、修炼，或循矿口求生。',openedTick:3,seed:1,profileId:'spirit-bloom'} as const),
]);

export function highDramaPreset(id:unknown):HighDramaPreset|undefined{
  return HIGH_DRAMA_PRESETS.find(row=>row.id===id);
}

/** The native builder calls this only after independently verifying its actual opening action chain. */
export function builtinScenarioOriginFor(id:BuiltinScenarioPresetId):BuiltinScenarioOrigin|undefined{
  const preset=highDramaPreset(id);
  return preset?Object.freeze({version:1,id:preset.id,openedTick:preset.openedTick}):undefined;
}

export function isBuiltinScenarioOrigin(value:unknown):value is BuiltinScenarioOrigin{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const fields=Object.keys(value).sort();
  if(fields.length!==3||fields[0]!=='id'||fields[1]!=='openedTick'||fields[2]!=='version')return false;
  const row=value as Record<string,unknown>;
  return row.version===1&&highDramaPreset(row.id)?.openedTick===row.openedTick&&typeof row.openedTick==='number';
}
