import type {ForbiddenArtId} from '../types/forbiddenArt';
import type {SpiritRoot} from '../types/world';

export interface ForbiddenArtRecipe {
  readonly name:string;
  readonly description:string;
  readonly roots?:readonly SpiritRoot[];
  readonly strongerOpponent?:true;
  readonly life:number;
  readonly bloodFraction:number;
  readonly durability:number;
  readonly scoreMultiplier:number;
  readonly incomingMultiplier:number;
  readonly escape?:true;
  readonly lastStand?:true;
}
export const FORBIDDEN_ART_CATALOG:Readonly<Record<ForbiddenArtId,ForbiddenArtRecipe>>={
  'taixu-sword-seal':{
    name:'太虚诛仙剑阵',description:'以寿数祭剑，将一线剑气逼至极处；能提高这一场的出手战势，胜负仍由真斗法决定。',
    roots:['金','天灵根'],life:3,bloodFraction:0,durability:9,scoreMultiplier:1.35,incomingMultiplier:1,
  },
  'blood-sea-veil':{
    name:'万魂血海吞天',description:'寿元与精血一并祭出；这一场攻守皆有改易，却不能保命。',
    roots:['暗','火'],life:2,bloodFraction:.025,durability:8,scoreMultiplier:1.24,incomingMultiplier:.82,
  },
  'meridian-reversal':{
    name:'斩脉回天',description:'逆转残余气血换一记反手；战势稍增，只解得去一小截来势。',
    life:0,bloodFraction:.038,durability:6,scoreMultiplier:1.16,incomingMultiplier:.91,
  },
  'falling-star-echo':{
    name:'星陨返照',description:'本身战力确实不及对手时，以寿数换一道乘隙回锋。尚未分出胜负。',
    strongerOpponent:true,life:3,bloodFraction:0,durability:10,scoreMultiplier:1.32,incomingMultiplier:.91,
  },
  'abyss-wave-split':{
    name:'归墟断浪',description:'以寿元撑住器灵，卸去这场交手的一部分伤害，不能凭空恢复气血。',
    life:2,bloodFraction:0,durability:7,scoreMultiplier:1,incomingMultiplier:.65,
  },
  'thunder-body-seal':{
    name:'雷印封身',description:'引器灵雷纹压住气机，以寿数换均衡的反击与守御，仍须承受余势。',
    roots:['雷','天灵根'],life:4,bloodFraction:0,durability:11,scoreMultiplier:1.19,incomingMultiplier:.74,
  },
  'heart-lantern-flame':{
    name:'焚灯护心',description:'烧掉一截现有气血点起心灯，挡下一部分杀招。若余势过强，依旧会倒下。',
    roots:['火'],life:0,bloodFraction:.042,durability:5,scoreMultiplier:1.05,incomingMultiplier:.69,
  },
  'frost-mirror-break':{
    name:'寒镜断影',description:'折寿碎镜，断开此地这一场交手。不是传送，不产生胜者或战利品。',
    roots:['水','天灵根'],life:2,bloodFraction:0,durability:12,scoreMultiplier:1,incomingMultiplier:1,escape:true,
  },
  'severed-shadow-flight':{
    name:'断臂血遁',description:'割舍一截气血，留下一道不可消的伤痕；在原地断开这场交手，不宣称已经赶到别处。',
    life:0,bloodFraction:.062,durability:10,scoreMultiplier:1,incomingMultiplier:1,escape:true,
  },
  'verdant-last-breath':{
    name:'青木续息',description:'以寿元维持最后一缕生机。只能守住一口余息，不补回已受伤势或改写胜负。',
    roots:['木','土','天灵根'],life:4,bloodFraction:0,durability:9,scoreMultiplier:1,incomingMultiplier:.89,lastStand:true,
  },
};

// Stable native source identity is shared by the live resolver and the read-only chronicle.
export const forbiddenDuelContactId=(openedTick:number,attackerId:string,defenderId:string)=>
  `forbidden-duel-${openedTick}-${attackerId}-${defenderId}`;
export const forbiddenArtScarId=(contactId:string,artId:ForbiddenArtId)=>`forbidden-scar-${contactId}-${artId}`;
export const forbiddenArtEventId=(contactId:string)=>`evt-${contactId}-art`;
