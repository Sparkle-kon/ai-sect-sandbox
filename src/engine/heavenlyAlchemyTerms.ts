import type {HeavenlyAlchemyAttempt,HeavenlyHeat,HeavenlyQuality,HeavenlyRecipeId} from '../types/heavenlyAlchemy';
import type {HerbId} from '../types/world';
export const HEAVENLY_ALCHEMY_MAX_ATTEMPTS=64;
export const HEAVENLY_WARD_TICKS=8;
export const HEAVENLY_ALCHEMY_RECIPES:Readonly<Record<HeavenlyRecipeId,{
  readonly name:string;readonly stones:number;readonly herbs:Readonly<Partial<Record<HerbId,number>>>;
}>>={
  nine_turn_golden:{name:'九转金丹',stones:120,herbs:{jade_leaf:2,star_bloom:3}},
  tribulation_divine:{name:'渡劫神丹',stones:180,herbs:{earth_root:2,star_bloom:2,shadow_moss:2}},
};
export const HEAVENLY_ALCHEMY_HEAT:Readonly<Record<HeavenlyHeat,{readonly name:string;readonly description:string}>>={
  calm:{name:'温火守炉',description:'稳住药力，失手较少，绝世丹纹更难见。'},
  balanced:{name:'文武相济',description:'进退各有余地，丹质随实火浮动。'},
  fierce:{name:'烈火冲纹',description:'最考验炉火；能冲出丹纹，也最容易烧尽原材。'},
};
export const HEAVENLY_ALCHEMY_QUALITY:Readonly<Record<HeavenlyQuality,{
  readonly name:string;readonly goldenQi:number;readonly goldenHeal:number;readonly goldenToxicity:number;
  readonly wardReduction:number;readonly wardToxicity:number;
}>>={
  common:{name:'凡品',goldenQi:18,goldenHeal:.06,goldenToxicity:24,wardReduction:.18,wardToxicity:20},
  spirit:{name:'灵品',goldenQi:26,goldenHeal:.10,goldenToxicity:19,wardReduction:.26,wardToxicity:16},
  immortal:{name:'仙品',goldenQi:36,goldenHeal:.15,goldenToxicity:14,wardReduction:.34,wardToxicity:12},
  peerless:{name:'绝世丹纹',goldenQi:48,goldenHeal:.22,goldenToxicity:8,wardReduction:.42,wardToxicity:8},
};
type Formula=Pick<HeavenlyAlchemyAttempt,'recipeId'|'heat'|'roll'|'mastery'|'toxicity'|'fireRoot'>;
export function heavenlyPillScore(row:Formula):number{
  const fire=row.heat==='calm'?12+Math.floor(row.roll*27/1000):
    row.heat==='balanced'?6+Math.floor(row.roll*45/1000):-8+Math.floor(row.roll*67/1000);
  return Math.max(0,Math.min(100,34+Math.round(row.mastery*.15)+(row.fireRoot?4:0)-
    Math.round(row.toxicity*.08)+(row.recipeId==='tribulation_divine'?-5:0)+fire));
}
export function heavenlyPillQuality(row:Formula):HeavenlyQuality|undefined{
  const score=heavenlyPillScore(row);
  return score>=93?'peerless':score>=79?'immortal':score>=62?'spirit':score>=42?'common':undefined;
}
export const heavenlyBrewId=(actorId:string,tick:number)=>`heavenly-brew-${actorId}-${tick}`;
export const heavenlyAlchemyEventId=(actorId:string,tick:number,move:'brew'|'take')=>`evt-${tick}-${actorId}-heavenly-${move}`;
