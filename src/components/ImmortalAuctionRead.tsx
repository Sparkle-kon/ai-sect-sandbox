import {useEffect,useId,useRef,useState} from 'react';
import type {ImmortalAuctionOption,ImmortalAuctionView} from '../engine/immortalAuctionEngine';

import {ALCHEMY_RECIPES} from '../engine/alchemyCatalog';
import {immortalAuctionMinimum} from '../engine/immortalAuctionTerms';
import type {ImmortalAuctionAsset,ImmortalAuctionBid,ImmortalAuctionTerminal} from '../types/immortalAuction';

export interface ImmortalAuctionControls {
  busy?:boolean;
  guide?:(option:ImmortalAuctionOption)=>Promise<boolean>;
}
const touch='min-h-11 min-w-0 rounded-md border border-amber-300/35 px-3 py-1.5 text-left text-sm text-amber-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-50';

function AuctionInk(){
  return <svg viewBox="0 0 40 32" aria-hidden="true" focusable="false" className="h-8 w-10 shrink-0 text-amber-300">
    <path d="M5 10h30l-4 6H9l-4-6Zm0 0 15-6 15 6M10 16v10m20-10v10M7 27h26m-21-6h16m-9-2h2v4h-2z"
      fill="none" stroke="currentColor" strokeWidth="1.05" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}

function AuctionActionReview({label,description,busy,starting,onConfirm,onCancel}:{
  label:string;description:string;busy:boolean;starting:boolean;onConfirm:()=>void;onCancel:()=>void;
}){
  return <div className="space-y-2 rounded-md border border-amber-400/30 bg-slate-950/60 p-2.5" aria-busy={busy}>
    <h5 className="font-semibold text-amber-100">{label}</h5>
    <p className="text-sm leading-relaxed text-slate-200">{description}</p>
    <p className="text-xs text-slate-300">确认后推进一月，仍须按当时的坊市见证结算。</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={touch} disabled={busy} onClick={onConfirm}>{starting?'正在行过此月…':'确认并推进一月'}</button>
      <button type="button" className={touch} disabled={busy} onClick={onCancel}>取消</button>
    </div>
  </div>;
}

const assetName=(asset:ImmortalAuctionAsset)=>asset.kind==='artifact'?asset.name:ALCHEMY_RECIPES[asset.pillId].name;
const ending:Record<ImmortalAuctionTerminal['reason'],string>={
  sold:'已交割',withdrawn:'原主收回',no_bid:'无人出价，拍卖落空',unavailable:'此场未能完成交割',
};
const ownBidCaption:Record<ImmortalAuctionBid['status'],string>={
  held:'本人出价已托管',outbid:'本人出价被超过，原押已退',refunded:'本人原押已退',paid:'本人已实付',
};
type ActorName=(id:string)=>string;
type ArtifactQuote=(id:string)=>{name:string;minimum:number}|undefined;

function auctionChoices(view:ImmortalAuctionView,named?:ActorName,artifactQuote?:ArtifactQuote){
  const choices:{key:string;option:ImmortalAuctionOption;label:string;description:string}[]=[];
  const actor=named?.(view.actorId)??'在场修士';
  for(const option of view.options){
    let label:string,description:string;
    switch(option.auctionMove){
      case 'bid':{
        const lot=view.lots.find(row=>row.id===option.targetAuctionLotId&&!row.terminal);
        if(!lot)continue;
        label=`出价 ${option.auctionBidStones} 灵石 · ${assetName(lot.asset)}`;
        description=`${actor}报价 ${option.auctionBidStones} 灵石。竞价成立才会托管灵石；若被加价超越，退回原押，不等于已买下拍品。`;
        break;
      }
      case 'consign_pill':{
        const pill=ALCHEMY_RECIPES[option.targetAuctionPillId].name;
        label=`送拍一枚${pill}`;
        description=`由${actor}送拍一枚${pill}，起价 ${immortalAuctionMinimum({kind:'pill',pillId:option.targetAuctionPillId})} 灵石。受理后原物暂存于坊市，成交前不会收到灵石。`;
        break;
      }
      case 'consign_artifact':{
        const asset=artifactQuote?.(option.targetAuctionArtifactId);
        if(!asset)continue;
        label=`送拍${asset.name}`;
        description=`由${actor}递交原件「${asset.name}」，起价 ${asset.minimum} 灵石。受理后原件暂存于坊市。`;
        break;
      }
      case 'withdraw':{
        const lot=view.lots.find(row=>row.id===option.targetAuctionLotId&&!row.terminal);
        if(!lot)continue;
        label=`收回${assetName(lot.asset)}`;
        description=`由${actor}撤下原拍品；实际返还以本场结算为准。`;
        break;
      }
    }
    choices.push({key:JSON.stringify(option),option,label,description});
  }
  return choices;
}

function AuctionLots({view,tick,named}:{view:ImmortalAuctionView;tick:number;named?:ActorName}){
  return <div className="space-y-2">
    {view.lots.map(lot=><section key={lot.id} aria-label={assetName(lot.asset)} className="min-w-0 space-y-1 rounded-md border border-slate-800 bg-slate-900/55 p-2.5 [overflow-wrap:anywhere]">
      <h5 className="font-serif text-base font-semibold text-amber-100">{assetName(lot.asset)}{lot.asset.kind==='artifact'?` · ${lot.asset.tier}`:''}</h5>
      {lot.asset.kind==='artifact'&&<p className="text-xs text-slate-300">原件耐久 {lot.asset.durability} / {lot.asset.maxDurability}</p>}
      {lot.terminal?<div className="text-sm text-slate-200">
        <p>{ending[lot.terminal.reason]}{lot.terminal.reason==='sold'&&lot.terminal.stones!==undefined?` · 实付 ${lot.terminal.stones} 灵石`:''}</p>
        {lot.terminal.reason==='sold'&&lot.terminal.buyerId&&named&&<p>买受人：{named(lot.terminal.buyerId)}</p>}
      </div>:<>
        <p className="text-xs text-slate-300">起价 {lot.minimum} 灵石 · 距截拍 {Math.max(0,lot.closesTick-tick)} 月</p>
        <p className="text-sm text-slate-200">{lot.highBid?`当前有效价 ${lot.highBid.stones} 灵石（已托管）${named?` · ${named(lot.highBid.bidderId)}`:''}`:'尚无有效出价'}</p>
      </>}
      {lot.ownBids.length>0&&<ul aria-label="本人竞价实录" className="space-y-0.5 text-xs text-amber-100">
        {lot.ownBids.map(bid=><li key={bid.tick}>{ownBidCaption[bid.status]} · {bid.stones} 灵石</li>)}
      </ul>}
    </section>)}
    {!view.lots.length&&<p className="text-sm text-slate-300">坊中眼下没有可查拍品。</p>}
  </div>;
}

export function ImmortalAuctionRead({view,tick,controls,named,artifactQuote}:{
  view:ImmortalAuctionView;tick:number;controls?:ImmortalAuctionControls;named?:ActorName;artifactQuote?:ArtifactQuote;
}){
  const id=useId();
  const [review,setReview]=useState<{key:string;tick:number;frame:ImmortalAuctionView}>();
  const [starting,setStarting]=useState(false);
  const [failed,setFailed]=useState(false);
  const inFlight=useRef(false);
  const mounted=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const busy=starting||!!controls?.busy;
  const choices=controls?.guide?auctionChoices(view,named,artifactQuote):[];
  const current=review?.tick===tick&&review.frame===view?choices.find(choice=>choice.key===review.key):undefined;
  const submit=async()=>{
    if(!controls?.guide||!current||busy||inFlight.current)return;
    inFlight.current=true;
    setStarting(true);
    setFailed(false);
    try {
      const advanced=await controls.guide(current.option);
      if(mounted.current){setFailed(!advanced);if(advanced)setReview(undefined);}
    } catch {if(mounted.current)setFailed(true);}
    finally {inFlight.current=false;if(mounted.current)setStarting(false);}
  };
  return <details aria-labelledby={id} className="min-w-0 rounded-lg border border-amber-300/25 bg-gradient-to-b from-amber-950/20 to-slate-950/75 px-3">
    <summary id={id} className="flex min-h-11 cursor-pointer items-center gap-2 font-serif text-base font-semibold text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">
      <AuctionInk/>万宝大会 · 万仙坊市
    </summary>
    <div className="min-w-0 space-y-3 pb-3">
      <AuctionLots view={view} tick={tick} named={named}/>
      {current?<AuctionActionReview label={current.label} description={current.description} busy={busy} starting={starting}
        onConfirm={()=>void submit()} onCancel={()=>{setReview(undefined);setFailed(false);}}/>:
        choices.length>0&&<div role="group" aria-label="此刻可办" className="flex flex-wrap gap-2">
          {choices.map(choice=><button type="button" key={choice.key} className={touch} disabled={busy}
            onClick={()=>{setReview({key:choice.key,tick,frame:view});setFailed(false);}}>{choice.label}</button>)}
        </div>}
      {failed&&<p role="status" className="text-xs text-amber-200">这笔未能办成，请核对当前拍品与余下灵石。</p>}
    </div>
  </details>;
}
