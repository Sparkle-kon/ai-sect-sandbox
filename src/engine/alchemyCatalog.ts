import type {HerbId,PillId} from '../types/world';

export interface AlchemyRecipe {
  name: string;
  herbs: Partial<Record<HerbId, number>>;
  furnaceGrade: 1 | 2 | 3;
  spiritStones: number;
  success: number;
  toxicity: number;
}

/** Entirely fictional spirit ingredients and game effects, not real chemistry. */
export const ALCHEMY_RECIPES: Record<PillId, AlchemyRecipe> = {
  foundation: { name: '筑基丹', herbs: { jade_leaf: 2, earth_root: 1 }, furnaceGrade: 1, spiritStones: 40, success: 0.65, toxicity: 18 },
  golden: { name: '九转金丹', herbs: { jade_leaf: 2, star_bloom: 3 }, furnaceGrade: 3, spiritStones: 120, success: 0.55, toxicity: 30 },
  barrier: { name: '破障丹', herbs: { earth_root: 2, star_bloom: 2 }, furnaceGrade: 2, spiritStones: 75, success: 0.6, toxicity: 24 },
  heart_poison: { name: '噬心毒丹', herbs: { shadow_moss: 3, earth_root: 1 }, furnaceGrade: 2, spiritStones: 60, success: 0.6, toxicity: 35 },
};
