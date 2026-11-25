import type {SectLiveKind} from '../types/sectLive';

type Lines=readonly [string,string,string,string];
export const SECT_LIVE_LINES:Readonly<Record<SectLiveKind,{title:string;lines:Lines}>>={
  tournament:{title:'仙门大比',lines:['这一剑劈得好，后排茶盏也行了一礼。','方才是谁押三招？第二招都追到看台边了。','山门教我身轻如燕，此人是把燕子教会了用剑。','嘴上说回去便练，腿倒诚实，已经先坐下了。']},
  tribulation:{title:'渡劫',lines:['雷声一近，满席茶盖都不响了。','道友稳住，待你下场，这一壶还温着。','云脚沉了些，愿这一道守得住。','平日嫌山钟嗓门大，今日倒想再听它一响。']},
  furnace:{title:'炸炉',lines:['丹房这回做了回露天通风。','烟里飞过去的是宝丹，还是丹童的靴子？','王掌柜手已经伸到修炉砖的价牌上了。','炉盖出关比主人早，先恭喜炉盖。']},
  furnace_hazard:{title:'炉灾',lines:['给提水的让个道，茶喝不喝改日再说。','这炉比嘴硬的剑修还会冒火。','方才谁说柴太湿？现在那摞柴还很有精神。','我刚把袖口掖好，旁边那位已经把外袍借去扑火。']},
  sect_challenge:{title:'山门踢馆',lines:['守门人刚扫完三层台阶，转眼又得练一遍。','这场我最先学会的一招，叫且慢下赌注。','刚才还说两家剑法相似，过了这一招，眼睛不好的人也认得了。','忽然想起回山功课还没做。先看完这场再想。']},
  combat:{title:'斗法',lines:['这半步让得好，我的茶也跟着往右偏了一寸。','记下这一招。回山问师父时，暂且不提我是怎么吓坐下的。','见过剑气拂袖的，没见过一并拂掉后排帽子的。','道友收招好快。我方才那声喝彩还在半路。']},
};
