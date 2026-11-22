import type {DestinyTraitId} from '../types/destinyTrait';
import type {PersonalityTrait} from '../types/world';

export type DestinyDuelTrigger='always'|'wounded'|'healthy'|'against-stronger'|'equal-footing';
export interface DestinyTraitDetails {
  readonly name:string;
  readonly description:string;
  readonly artName:string;
  readonly cultivation:number;
  readonly attack:number;
  readonly guard:number;
  readonly appetite:number;
  readonly trigger:DestinyDuelTrigger;
  readonly favored:readonly PersonalityTrait[];
}

/** Authored and mechanically bounded at use, never described by a free-form simulation action. */
export const DESTINY_TRAIT_CATALOG:Readonly<Record<DestinyTraitId,DestinyTraitDetails>>={
  'clear-sword-heart':{
    name:'剑心通明',artName:'照心一剑',description:'斗法时剑意凝于一处，行气更快，交手更锐。',
    cultivation:.09,attack:.13,guard:0,appetite:.12,trigger:'always',favored:['刚正','狂傲'],
  },
  'unfading-blood-sea':{
    name:'血海不枯',artName:'回澜血印',description:'气血不足半数时，斗法锋芒更盛，并能卸去部分来势。',
    cultivation:0,attack:.22,guard:.14,appetite:.24,trigger:'wounded',favored:['嗜血','狂傲'],
  },
  'heaven-favored':{
    name:'天道眷顾',artName:'承天护身',description:'平日修行更顺；交手时亦能卸去小部分来势。',
    cultivation:.15,attack:0,guard:.09,appetite:0,trigger:'always',favored:['逍遥','痴情'],
  },
  'supreme-patience':{
    name:'苟道至尊',artName:'藏锋守拙',description:'平日修炼收益更高，斗法偏守，也更少主动邀战。',
    cultivation:.12,attack:0,guard:.16,appetite:-.24,trigger:'always',favored:['苟道','阴险'],
  },
  'alchemy-poison-transmutation':{
    name:'丹毒化灵',artName:'化秽返元',description:'实际修炼时多得灵息，并化去至多三点已有丹毒；斗法时也能卸劲。',
    cultivation:.11,attack:0,guard:.11,appetite:-.05,trigger:'always',favored:['诡诈','阴险'],
  },
  'star-reforged-bones':{
    name:'星骨重铸',artName:'星墟破阵',description:'本身战力低于对方时，斗法能更有力地反击，并缓冲部分伤害。',
    cultivation:0,attack:.19,guard:.14,appetite:.15,trigger:'against-stronger',favored:['狂傲','刚正'],
  },
  'still-heart-mirror':{
    name:'静心如镜',artName:'照妄无尘',description:'平日修炼更稳；与对手战力相近时，能卸去更多来势。',
    cultivation:.10,attack:0,guard:.17,appetite:-.08,trigger:'equal-footing',favored:['刚正','苟道'],
  },
  'primordial-breath':{
    name:'太初一息',artName:'抱元开脉',description:'吐纳收益显著提高；此命格不直接增强斗法。',
    cultivation:.21,attack:0,guard:0,appetite:-.07,trigger:'always',favored:['逍遥','苟道'],
  },
  'benevolent-worldtree':{
    name:'长生木心',artName:'青枝回护',description:'行气有余香。气血不足半数时，斗法更善于守御。',
    cultivation:.08,attack:0,guard:.20,appetite:-.12,trigger:'wounded',favored:['痴情','刚正'],
  },
  'night-wandering-soul':{
    name:'夜游魂',artName:'无声入影',description:'气血尚旺时，斗法出手更锋利，也更愿先行发难。',
    cultivation:0,attack:.16,guard:0,appetite:.18,trigger:'healthy',favored:['阴险','诡诈','嗜血'],
  },
};
