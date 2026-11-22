import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {ImmortalAuctionRead} from '../src/components/ImmortalAuctionRead';
import type {ImmortalAuctionView} from '../src/engine/immortalAuctionEngine';

const open:ImmortalAuctionView={
  actorId:'own-original-actor',siteId:'loc-market',opensTick:13,
  lots:[{
    id:'internal-lot',sellerId:'original-seller',listedTick:13,closesTick:15,minimum:55,nextBid:65,
    asset:{kind:'pill',pillId:'foundation'},highBid:{bidderId:'current-rival',stones:55,tick:13},ownBids:[],
  }],
  options:[{action:'IMMORTAL_AUCTION',auctionMove:'bid',targetAuctionLotId:'internal-lot',auctionBidStones:65,auctionQuoteBidCount:1}],
};
const named=(id:string)=>id==='current-rival'?'陆秋声':'苏云';

describe('immortal auction read',()=>{
  it('distinguishes public reserve price and actually held bid from a future receipt',()=>{
    const html=renderToStaticMarkup(<ImmortalAuctionRead view={open} tick={13} named={named}/>);
    expect(html).toContain('万宝大会 · 万仙坊市');
    expect(html).toContain('筑基丹');
    expect(html).toContain('起价 55 灵石');
    expect(html).toContain('距截拍 2 月');
    expect(html).toContain('当前有效价 55 灵石（已托管）');
    expect(html).toContain('陆秋声');
    expect(html).not.toContain('出价 65 灵石');
    expect(html).not.toContain('已交割');
    expect(html).not.toContain('internal-lot');
  });

  it('offers only the exact native quote and no silent commitment on render',()=>{
    const guide=vi.fn(async()=>true);
    const html=renderToStaticMarkup(<ImmortalAuctionRead view={open} tick={13} named={named} controls={{guide}}/>);
    expect(html).toContain('出价 65 灵石 · 筑基丹');
    expect(html).not.toContain('确认并推进一月');
    expect(guide).not.toHaveBeenCalled();
    expect(html).not.toContain('own-original-actor');
  });

  it('shows original refunded bid separately from another actor actually buying the lot',()=>{
    const lot:ImmortalAuctionView['lots'][number]={...open.lots[0],nextBid:undefined,highBid:undefined,
      ownBids:[{bidderId:open.actorId,tick:13,stones:55,status:'outbid',settledTick:14}],
      terminal:{reason:'sold',tick:15,eventId:'native-settlement',buyerId:'current-rival',stones:65}};
    const html=renderToStaticMarkup(<ImmortalAuctionRead view={{...open,lots:[lot],options:[]}} tick={15} named={named}/>);
    expect(html).toContain('已交割 · 实付 65 灵石');
    expect(html).toContain('买受人：陆秋声');
    expect(html).toContain('本人出价被超过，原押已退 · 55 灵石');
    expect(html).not.toContain('native-settlement');
    expect(html).not.toContain('截杀');
  });
});
