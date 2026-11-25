import type {ComedyItemId,ComedyPetId,ComedyRecruitId} from '../../types/sectComedy';
import type {SectQuirkId} from '../../types/sectManagement';
import type {Cultivator,SpiritBeast,SpiritRoot} from '../../types/world';

export const COMEDY_ITEMS:Readonly<Record<ComedyItemId,{name:string;spiritRoot:SpiritRoot}>>={
  'demon-iron-wok':{name:'魔宗铁锅',spiritRoot:'火'},
  'half-stele-rubbing':{name:'半截剑碑拓本',spiritRoot:'金'},
  'talking-gourd':{name:'会说话的葫芦',spiritRoot:'木'},
};
type Recruit=Pick<Cultivator,'name'|'personality'|'spiritRoot'|'gender'>&{
  readonly origin:string;readonly realm:'练气'|'筑基';readonly quirks:readonly SectQuirkId[];
};
export const COMEDY_RECRUITS:Readonly<Record<ComedyRecruitId,Recruit>>={
  'demon-sect-cook':{name:'屠大勺',origin:'原在血月魔宗掌勺',realm:'练气',quirks:['glutton'],spiritRoot:'火',gender:'man',personality:'逍遥'},
  'failed-scholar':{name:'孔落第',origin:'连考七次的书生',realm:'练气',quirks:['chatterbox','contrarian'],spiritRoot:'木',gender:'man',personality:'刚正'},
  'runaway-princess':{name:'赵小满',origin:'离家闯江湖的世家小姐',realm:'练气',quirks:['drama','miser'],spiritRoot:'水',gender:'woman',personality:'诡诈'},
  'retired-assassin':{name:'无名',origin:'收刀种花的老刺客',realm:'筑基',quirks:['shy','neat_freak'],spiritRoot:'暗',gender:'woman',personality:'苟道'},
};
export const COMEDY_PETS:Readonly<Record<ComedyPetId,Pick<SpiritBeast,'name'|'maxHp'|'power'>>> = {
  'pill-cat':{name:'偷丹灵猫',maxHp:96,power:75},
  'lost-crane':{name:'迷路纸鹤',maxHp:110,power:85},
  'fat-goose':{name:'白眉胖鹅',maxHp:125,power:95},
};
