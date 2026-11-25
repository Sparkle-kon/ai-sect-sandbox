import type {SceneRewrite} from './types';

export const FIELD_SCENES={
  "field-stall-careful-price":["{name}在{site}把一块旧算盘放在货摊正中，客人只相中了算盘；公库收十六枚灵石。","连算盘都卖了，这回让我拿什么算赚了多少？",[{"kind":"stones","amount":16}],"windfall"],
  "field-stall-quiet-sign":["{name}在{site}不敢张口叫卖，买家当他在考校眼力，打了三次揖，留下十八枚灵石。","我本来只是在等他说第一句。",[{"kind":"stones","amount":18},{"kind":"fame","amount":2}],"windfall"],
  "field-deliver-seal":["{name}到{site}才发现包裹上写的「茶」被当作「荼」，更换封纸和急脚费了六枚灵石。","这桩亏只亏在一笔，笔画说的那一笔。",[{"kind":"stones","amount":-6}],"mishap"],
  "field-deliver-well-sealed":["{name}在{site}按东西南北把回条叠好，得一位识路杂货郎相助。杂货郎用两株地脉灵根谢他让出驮篮。","弟子总算辨明哪边算东了：回条盖章的那边。",[{"kind":"herb","herb":"earth_root","amount":2}],"windfall"],
  "field-recruit-bowl":["{name}在{site}拿空汤碗做招徒铃，敲来一位赵小满。她把银簪藏在碗底，当场投了{sect}。","问她荐人书何在，她说拿来包葱，刚递给伙房。",[{"kind":"recruit","template":"runaway-princess"}],"windfall"],
  "field-recruit-three-lines":["{name}在{site}拿三句话讲完本门前尘，连讨水喝的书生孔落第也留下，进了{sect}。","弟子也没夸大，只把漏雨讲成了天人感应。",[{"kind":"recruit","template":"failed-scholar"}],"windfall"],
  "field-challenge-sleeve":["{name}到{site}袖里压着约战词，临出鞘才踩住衣摆，当场磕破了膝。","要是问我到底哪一招落败，我说「一脚牵衣」。",[{"kind":"injury","rate":0.06}],"mishap"],
  "field-challenge-wit":["{name}在{site}把一招的长名念到人群里，旁观者反倒赏了八枚灵石，请他写下来卖给说书摊。","十八字还嫌少？那是我碍着台上等人出剑，略去了下半段。",[{"kind":"stones","amount":8},{"kind":"fame","amount":2}],"windfall"],
  "field-matchmaking-title":["{name}在{site}与道友交换赠花，回山多了两株星辉花。","问我修什么道，我差点脱口说今日修的是别说太急。",[{"kind":"herb","herb":"star_bloom","amount":2}],"windfall"],
  "field-matchmaking-tea":["{name}在{site}捧盏太紧，瓷盏响了一声便裂开，公库赔了五枚灵石。","我原打算先说句体面话。那盏茶倒抢先给我说了。",[{"kind":"stones","amount":-5}],"mishap"],
  "field-matchmaking-sleepless":["{name}在{site}替一桌道友调换座席，主人留六枚灵石谢他为西窗多腾了个位。","位子挪完，人说我合群。我一晚上也就说了那一句「请坐」。",[{"kind":"stones","amount":6}],"success"],
  "field-deliver-complete":["{name}从{site}带回两株地脉灵根，那是收货人拿出来犒劳这一趟脚力的。","这一回差事与回条都没掉，您别让下回听见。",[{"kind":"herb","herb":"earth_root","amount":2}],"windfall"],
} as const satisfies Readonly<Record<string,SceneRewrite>>;
