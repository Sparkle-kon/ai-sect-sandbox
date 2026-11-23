import type {SectLiveKind} from '../types/sectLive';

type Lines=readonly [string,string,string,string];

/** Voices speak from the stands; none is a scoring or spending rule. */
export const SECT_LIVE_LINES:Readonly<Record<SectLiveKind,{title:string;lines:Lines}>>={
  tournament:{title:'仙门大比',lines:['好招。我这杯茶都端偏了。','擂台看着不宽，这一招倒叫我坐直了。','道友且记住这一路，回山再慢慢琢磨。','方才不敢出声，现下总算能喝口茶。']},
  tribulation:{title:'渡劫',lines:['雷声入耳，愿道友守得住这一念。','都静一静，莫扰场中人。','这重雷不轻。且候道友平安。','离得远，心也跟着提了起来。']},
  furnace:{title:'炸炉',lines:['先看人有无大碍，再来算这一炉账。','我先把自己的炉盖放远些。','这一响叫我把口诀忘了半句。','添柴之前，且问问炉边的道友。']},
  furnace_hazard:{title:'炉灾',lines:['炉旁不要久留，先退到开阔处。','待炉火安稳，再来看丹房。','我把路让开，让能帮手的先过。','风头这样急，这炉茶也先罢了。']},
  sect_challenge:{title:'山门踢馆',lines:['输赢说清便好，别叫守门人再扫一遍台阶。','方才那步我看清了，且留着回山练。','既已分出高下，两边都先喝口茶。','门前人多，且给下场的两位让条路。']},
  combat:{title:'斗法',lines:['好身法。再迟半步便不好说了。','我只看清一招，已够回去练三天。','你我在边上看，莫急着替场里人争。','两位道友且缓一口气。']},
};
