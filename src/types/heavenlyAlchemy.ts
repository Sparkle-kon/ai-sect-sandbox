export const HEAVENLY_RECIPE_IDS=['nine_turn_golden','tribulation_divine'] as const;
export const HEAVENLY_HEATS=['calm','balanced','fierce'] as const;
export const HEAVENLY_QUALITIES=['common','spirit','immortal','peerless'] as const;
export type HeavenlyRecipeId=typeof HEAVENLY_RECIPE_IDS[number];
export type HeavenlyHeat=typeof HEAVENLY_HEATS[number];
export type HeavenlyQuality=typeof HEAVENLY_QUALITIES[number];
export type HeavenlyAlchemyMove='brew'|'take';
export interface HeavenlyAlchemyAttempt {
  id:string;
  tick:number;
  siteId:string;
  recipeId:HeavenlyRecipeId;
  heat:HeavenlyHeat;
  /** Exact native sampled heat from the single used world draw, quantized to thousandths. */
  roll:number;
  mastery:number;
  toxicity:number;
  fireRoot:boolean;
  quality?:HeavenlyQuality;
  use?:{tick:number;siteId:string;wardSpentTick?:number;wardTrialId?:string;wardWave?:number};
}
export interface HeavenlyWard {brewId:string;expiresTick:number}
export interface HeavenlyAlchemyState {attempts:HeavenlyAlchemyAttempt[];ward?:HeavenlyWard}
export type HeavenlyAlchemyRecipeId=HeavenlyRecipeId;
export type HeavenlyAlchemyHeat=HeavenlyHeat;
export type HeavenlyAlchemyQuality=HeavenlyQuality;
