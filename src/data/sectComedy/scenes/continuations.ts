import type {ComedyRecruitId,SectComedyEffect} from '../../../types/sectComedy';

type FollowUp=Extract<SectComedyEffect,{kind:'visit'|'sequel'}>;
export const COMEDY_FOLLOW_UPS:Readonly<Record<string,FollowUp>>={
  "h6-work-pair-glutton-lost-gather-windfall":{kind:'sequel',templateId:"the-wok",afterMonths:[2,3]},
  "h6-work-kitchen-drama-mishap":{kind:'visit',npc:"host",afterMonths:[1,2],reason:"灶台边那句「火起」和飞起来的屋顶"},
  "h6-work-explore-drama-mishap":{kind:'visit',npc:"wang",afterMonths:[1,2],reason:"给茶担赔了九枚灵石"},
  "h6-work-guard-contrarian-windfall":{kind:'visit',npc:"rival",afterMonths:[1,2],reason:"替人看伞还收寄存钱"},
  "h6-work-guard-coward-windfall":{kind:'visit',npc:"ancestor",afterMonths:[1,2],reason:"捡回人家的药匣，得了两株翡翠灵叶"},
  "h6-work-kitchen-neat-windfall":{kind:'visit',npc:"cat",afterMonths:[1,2],reason:"那罐用两株地脉灵根换去的酱"},
  "h6-work-pair-miser-neat-kitchen-mishap":{kind:'visit',npc:"wang",afterMonths:[1,2],reason:"一碗一粒盐和那九枚退席钱"},
  "h6-field-stall-careful-price":{kind:'visit',npc:"wang",afterMonths:[1,2],reason:"把算盘也卖出去的那笔买卖"},
  "h6-field-stall-quiet-sign":{kind:'sequel',templateId:"silent-stall",afterMonths:[2,3]},
  "h6-field-recruit-three-lines":{kind:'visit',npc:"host",afterMonths:[1,2],reason:"把屋漏说成天人感应、说动了孔落第"},
  "h6-field-matchmaking-tea":{kind:'visit',npc:"rival",afterMonths:[1,2],reason:"赴席赔了一盏茶"},
  "h6-field-deliver-complete":{kind:'visit',npc:"ancestor",afterMonths:[1,2],reason:"送完货，收得两株地脉灵根"},
  "h6-home-runaway-princess":{kind:'visit',npc:"wang",afterMonths:[1,3],reason:"赵小满入门，接手理账"},
  "h6-guard-retired-assassin":{kind:'sequel',templateId:"flower-bed",afterMonths:[1,3]},
  "h6-ambient-home-glutton":{kind:'visit',npc:"cat",afterMonths:[1,2],reason:"第三沸才揭盖的羊骨汤"},
  "h6-ambient-home-chatterbox":{kind:'visit',npc:"host",afterMonths:[1,2],reason:"喊茶摊喊到茶钱刚回本"},
  "h6-ambient-home-miser":{kind:'visit',npc:"wang",afterMonths:[1,2],reason:"翻出八枚旧押金"},
  "h6-ambient-home-drama":{kind:'visit',npc:"host",afterMonths:[1,2],reason:"套着米袋扮山神"},
  "h6-ambient-pair-lost-jinx":{kind:'visit',npc:"rival",afterMonths:[1,2],reason:"路指偏了，樵人却分来三株翡翠灵叶"},
  "h6-ambient-pair-glutton-coward":{kind:'visit',npc:"ancestor",afterMonths:[1,2],reason:"用长勺试汤，回来拿了两株地脉灵根"},
  "h6-ambient-plain-punctuation":{kind:'visit',npc:"wang",afterMonths:[1,2],reason:"茶钱牌上的值五枚灵石的问号"},
  "h6-festival-social-done-windfall":{kind:'visit',npc:"host",afterMonths:[1,2],reason:"以乡里话论道，传出四分名声"},
  "h6-festival-review-done-windfall":{kind:'visit',npc:"rival",afterMonths:[1,2],reason:"以剑挑花，又赚了四分名声"},
  'h6-ambient-plain-ink':{kind:'visit',npc:'wang',afterMonths:[1,2],reason:'只用一滴墨便赚了六枚灵石'},
  'h6-ambient-plain-sock':{kind:'visit',npc:'ancestor',afterMonths:[1,2],reason:'从一双旧袜里抖出翡翠灵叶'},
  'h6-ambient-plain-shadow':{kind:'visit',npc:'ancestor',afterMonths:[1,2],reason:'跟着两条影子捡了株幽影苔'},
  'h6-ambient-plain-errand':{kind:'visit',npc:'wang',afterMonths:[1,2],reason:'搬柴至日落，收五枚灵石'},
  'h6-ambient-plain-pin':{kind:'visit',npc:'ancestor',afterMonths:[1,2],reason:'拿歪簪从石缝勾出灵叶'},
  'h6-ambient-plain-leaf':{kind:'visit',npc:'rival',afterMonths:[1,2],reason:'清完院角，带回两株地脉灵根'},
  'h6-ambient-plain-oath':{kind:'visit',npc:'wang',afterMonths:[1,2],reason:'靠「择日开席」四个字赚了五枚灵石'},
  'h6-ambient-plain-celestial':{kind:'visit',npc:'host',afterMonths:[1,2],reason:'画一座天门收六枚灵石'},
  'h6-ambient-plain-varnish':{kind:'visit',npc:'wang',afterMonths:[1,2],reason:'给旧灯笼描漆，收了四枚灵石'},
  'h6-ambient-plain-moon':{kind:'visit',npc:'ancestor',afterMonths:[1,2],reason:'捞月亮捞到两株星辉花'},
  'h6-ambient-plain-questions':{kind:'visit',npc:'wang',afterMonths:[1,2],reason:'念十个错字便换来四枚灵石'},
  'h6-ambient-home-neat':{kind:'visit',npc:'wang',afterMonths:[1,2],reason:'把纸箱码齐，抖出八枚旧灵石'},
  'h6-ambient-home-contrarian':{kind:'visit',npc:'ancestor',afterMonths:[1,2],reason:'从尾页倒读药札，翻出两株幽影苔'},
  'h6-ambient-pair-shy-chatterbox':{kind:'visit',npc:'host',afterMonths:[1,2],reason:'给竹筒讲了半柱香，换来八枚订钱'},
  'h6-ambient-pair-miser-drama':{kind:'visit',npc:'wang',afterMonths:[1,2],reason:'拿扫帚演剑客，末了连剑也卖了'},
  'h6-ambient-pair-contrarian-neat':{kind:'visit',npc:'rival',afterMonths:[1,2],reason:'倒着扫石阶，扫到两株幽影苔'},
  'h6-ambient-pair-love-chuunibyou':{kind:'visit',npc:'host',afterMonths:[1,2],reason:'替纸鹤主人找回药包，换了两株星辉花'},

};

type ChoiceEffect=Extract<SectComedyEffect,{kind:'herb'|'sect_relation'}>|{kind:'stones'|'fame'|'debt';amount:number};
interface SequelScene {
  readonly requiredRecruit?:ComedyRecruitId;
  readonly title:string;
  readonly line:string;
  readonly choices:readonly {readonly id:string;readonly label:string;readonly response:string;readonly effects:readonly ChoiceEffect[]}[];
}
export const COMEDY_SEQUELS:Readonly<Record<string,SequelScene>>={
  'the-wok':{
    requiredRecruit:'demon-sect-cook',
    title:'血月来信讨屠大勺',
    line:'信里说后厨三灶齐冷，连长老的辟谷宴也没人掌勺。屠大勺把围裙往腰后一藏，等掌门回话。',
    choices:[
      {id:'stand',label:'护着屠师傅',response:'回信说屠大勺已拜入本门，想吃肉便请另寻厨子。',effects:[{kind:'sect_relation',target:'bloodmoon',amount:-10},{kind:'fame',amount:5}]},
      {id:'recipe',label:'卖一页炖肉谱（＋12 灵石）',response:'屠大勺写下火候，派人送了去。本门公库收到十二枚灵石。',effects:[{kind:'stones',amount:12}]},
      {id:'feast',label:'回赠一袋药膳料（要 1 株翡翠灵叶）',response:'回礼捎上一株翡翠灵叶，信末还添了炖汤的时辰。',effects:[{kind:'herb',herb:'jade_leaf',amount:-1},{kind:'sect_relation',target:'bloodmoon',amount:9}]},
    ]},
  'silent-stall':{
    title:'坊市请那位「不语前辈」再出摊',
    line:'摊主寄来一纸邀约，要请上回那位一句话没说的弟子再去。旁注写着：若今年也不肯开口，赏钱照给。',
    choices:[
      {id:'deposit',label:'收十二枚订钱，把席位留到下回',response:'公库收下十二枚订钱，掌门回了一张约帖。',effects:[{kind:'stones',amount:12}]},
      {id:'teach',label:'送一张开摊帖，替山门挣名声',response:'掌门写去一张开摊帖，坊市把本门的名号抄上了灯牌。',effects:[{kind:'fame',amount:6}]},
    ]},
  'flower-bed':{
    requiredRecruit:'retired-assassin',
    title:'无名的花牌传到邻宗',
    line:'赵掌门让人捎来说，隔壁弟子路过旧木牌都绕三步。想请懂种花的无名抄一份花圃规矩。',
    choices:[
      {id:'send',label:'抄一份给邻宗',response:'无名改了末一行，请邻宗来年分几粒花种。',effects:[{kind:'sect_relation',target:'rival',amount:8}]},
      {id:'hang',label:'只把木牌挂在自家山门',response:'路过的人如今也学会了绕花，传出几分名声。',effects:[{kind:'fame',amount:5}]},
    ]},
};
export const isSectComedySequel=(id:string):boolean=>Object.hasOwn(COMEDY_SEQUELS,id);
