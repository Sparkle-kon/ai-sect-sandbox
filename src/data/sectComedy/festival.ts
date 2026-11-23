import type {SectComedyTemplate} from '../../types/sectComedy';
import type {SectFestivalJobId} from '../../engine/sectFestivals';

interface FestivalReactions {
  readonly route:readonly [string,string];
  readonly blocked:readonly [string,string];
  readonly done?:readonly [string,string];
}
const reactions = {
  'festival-recruit':{
    route:['春招的牌子到了村口，名册还没动笔。','这一路最先入门的是我鞋里的三粒沙。'],
    blocked:['春招这回未能办成。','名册先留白，省得笔替人点头。'],
    done:['春招办过入门礼，名册有了新一笔。','新人的名字可别让我写，我连自己的都练了三年。'],
  },
  'festival-social':{
    route:['论道的人到了坊间，席上还没有问答。','贫道一路备了三句话，眼下先用一句：借过。'],
    blocked:['联谊这回没能开口论道。','准备了半篇高论，最后抄了一遍杯底花纹。'],
    done:['在场道友论过一道题，话止于这一席。','我讲了半天心法，末了才知人家问的是茶该沏几遍。'],
  },
  'festival-market':{
    route:['大集的差事走到了前一程，账上还没说卖成。','我最先学会了一个好价钱：站到腿酸，还分文不收。'],
    blocked:['大集的买卖没能打开张。','今日算盘一颗珠子没动，算是少磨损了一回。'],
  },
  'festival-review':{
    route:['回山的路走完一段，这回还没练到。','山路倒先考了我一题：哪条坡不是捷径。'],
    blocked:['这回没能在山门演功。','谁催得急，谁先替我背一遍功课。'],
    done:['弟子在本门演过一场功，年考另有门里的评说。','最后一式叫收势，收了三次才记得收剑。'],
  },
  'festival-debt':{
    route:['候账守门的人赶到前一程，没记上一班，也没交钱。','这一路最响的是鞋底，倒不是钱袋。'],
    blocked:['候账这回没能守成一班。','我把算盘擦了一遍，数还是那个数。'],
    done:['山门记下一班候账的值守，借条要另按正账。','账本纹丝没动，倒是门闩跟我混熟了。'],
  },
} as const satisfies Readonly<Record<SectFestivalJobId,FestivalReactions>>;

export const FESTIVAL_SECT_COMEDY:readonly SectComedyTemplate[] = Object.entries<FestivalReactions>(reactions).flatMap<SectComedyTemplate>(
  ([key,lines])=>{
    // Keys are exhaustively checked against the festival job IDs above.
    const job=key as SectFestivalJobId;
    const base:SectComedyTemplate[]=[
      {id:`${job}-route`, match:{phase:'on_route',job},report:lines.route[0],quote:lines.route[1],effects:[]},
      {id:`${job}-blocked`, match:{phase:'unavailable',job},report:lines.blocked[0],quote:lines.blocked[1],effects:[]},
    ];
    const done=lines.done;
    return done?[
      ...base,
      ...(['success','windfall','mishap'] as const).map((tier):SectComedyTemplate=>({
        id:`${job}-done-${tier}`,match:{phase:'performed',job,tier},report:done[0],quote:done[1],effects:[],
      })),
    ]:base;
  }
);
