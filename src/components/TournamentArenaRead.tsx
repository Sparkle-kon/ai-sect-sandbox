import {VisualDuelArena} from './VisualDuelArena';
import type {VisualDuelArenaFrame} from './visualDuelArenaModel';
import {useEffect,useId,useRef,useState} from 'react';
import {TOURNAMENT_ARENA_PRIZE_NAME,type TournamentArenaView} from '../engine/tournamentArenaEngine';
import type {availableTournamentWager,placeTournamentWager,projectTournamentWager} from '../engine/tournamentWagerEngine';

export interface TournamentArenaControls {
  busy?:boolean;
  nextRound?:(id:string)=>boolean|Promise<boolean>;
  finishTournament?:(id:string)=>boolean|Promise<boolean>;
  getWager?:(id:string)=>ReturnType<typeof availableTournamentWager>;
  placeWager?:(request:Parameters<typeof placeTournamentWager>[1])=>boolean;
  getWagerReceipt?:(id:string)=>ReturnType<typeof projectTournamentWager>;
}
const button='min-h-11 min-w-0 rounded-md border border-amber-300/35 px-3 py-1.5 text-left text-sm text-amber-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-50';

type WagerRequest=Parameters<typeof placeTournamentWager>[1];
type WagerTicket=NonNullable<ReturnType<typeof projectTournamentWager>>;
const wagerStatus:Record<WagerTicket['status'],string>={
  open:'灵石已押，尚待本场结束',won:'押中魁首',lost:'未押中魁首',refunded:'已退回原押灵石',forfeited:'原押未退',
};

function WagerRead({quote,ticket,named,busy,commit}:{quote:ReturnType<typeof availableTournamentWager>;
  ticket:ReturnType<typeof projectTournamentWager>;named:(id:string)=>string;busy:boolean;commit?:TournamentArenaControls['placeWager']}){
  const [contender,setContender]=useState('');
  const [stake,setStake]=useState<WagerRequest['stake']>();
  const [pending,setPending]=useState<WagerRequest>();
  const [failed,setFailed]=useState(false);
  const picked=quote&&contender&&stake&&quote.contenderIds.includes(contender)&&quote.stakes.includes(stake);
  const reviewMatches=pending&&quote&&pending.arenaId===quote.arenaId&&pending.spectatorId===quote.spectatorId&&
    quote.contenderIds.includes(pending.contenderId)&&quote.stakes.includes(pending.stake);
  if(ticket)return <div className="space-y-1 rounded-md border border-slate-700 p-2.5 text-sm text-slate-200">
    <p>本人押注：{named(ticket.contenderId)} · {ticket.stake} 灵石</p>
    <p>{wagerStatus[ticket.status]}{ticket.settlement&&ticket.settlement.payout>0?` · 实收 ${ticket.settlement.payout} 灵石`:''}</p>
  </div>;
  if(!quote||!commit)return null;
  return <details className="rounded-md border border-slate-700 px-2.5">
    <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-amber-100">旁观押注 · 游戏灵石</summary>
    <div className="space-y-2 pb-2.5">
      <p className="text-xs leading-relaxed text-slate-300">仅用游戏内灵石。灵石不能兑换现金，也可能输掉。</p>
      {reviewMatches&&pending?<div className="space-y-2">
        <p className="text-sm text-slate-100">押 {pending.stake} 灵石，认 {named(pending.contenderId)} 为魁首。确认后立即扣押。</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} disabled={busy} onClick={()=>{
            if(commit(pending)){setPending(undefined);setFailed(false);}else setFailed(true);
          }}>确认押注</button>
          <button type="button" className={button} disabled={busy} onClick={()=>{setPending(undefined);setFailed(false);}}>取消</button>
        </div>
      </div>:<div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <label className="min-w-0 space-y-1 text-xs text-slate-300">押谁夺魁
          <select value={quote.contenderIds.includes(contender)?contender:''} disabled={busy}
            className={`${button} block w-full bg-slate-950`} onChange={event=>{setContender(event.currentTarget.value);setFailed(false);}}>
            <option value="">选一位参赛者</option>
            {quote.contenderIds.map(id=><option key={id} value={id}>{named(id)}</option>)}
          </select>
        </label>
        <label className="min-w-0 space-y-1 text-xs text-slate-300">押多少灵石
          <select value={stake&&quote.stakes.includes(stake)?stake:''} disabled={busy}
            className={`${button} block w-full bg-slate-950`} onChange={event=>{
              const option=quote.stakes.find(amount=>String(amount)===event.currentTarget.value);
              setStake(option);setFailed(false);
            }}>
            <option value="">选灵石数</option>
            {quote.stakes.map(amount=><option key={amount} value={amount}>{amount} 灵石</option>)}
          </select>
        </label>
        <button type="button" className={button} disabled={busy||!picked} onClick={()=>{
          if(picked&&stake)setPending({arenaId:quote.arenaId,spectatorId:quote.spectatorId,contenderId:contender,stake});
        }}>核对旁观押注</button>
      </div>}
      {failed&&<p role="status" className="text-xs text-amber-200">本次未押成，请核对赛况和余下灵石。</p>}
    </div>
  </details>;
}

function roundLabel(round:number,size:number,final:boolean){
  if(final)return '决赛';
  const rounds=Math.ceil(Math.log2(Math.max(2,size)));
  if(round===rounds)return '决赛';
  if(round===rounds-1)return '半决赛';
  if(round===rounds-2)return '八进四';
  if(round===rounds-3)return '十六进八';
  return `第 ${round} 轮`;
}

function BoutList({label,children}:{label:string;children:React.ReactNode}){
  return <section aria-label={label} className="min-w-0 space-y-1.5 rounded-lg border border-slate-800 bg-slate-950/45 p-2.5">
    <h5 className="font-serif text-base font-semibold text-amber-100">{label}</h5>
    <ol className="space-y-1.5">{children}</ol>
  </section>;
}

export function TournamentArenaRead({arena,named,siteName,championName,controls,duel}:{
  arena:TournamentArenaView;named:(id:string)=>string;siteName?:string;championName?:string;controls?:TournamentArenaControls;duel?:VisualDuelArenaFrame;
}){
  const id=useId();
  const [pending,setPending]=useState<'next'|'finish'>();
  const [failed,setFailed]=useState(false);
  const [confirmFinish,setConfirmFinish]=useState(false);
  const inFlight=useRef(false);
  const mounted=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const busy=!!pending||!!controls?.busy;
  const run=async(which:'next'|'finish')=>{
    const callback=which==='next'?controls?.nextRound:controls?.finishTournament;
    if(!callback||busy||inFlight.current)return;
    inFlight.current=true;
    setPending(which);
    setFailed(false);
    try {
      const ok=await callback(arena.occasionId);
      if(mounted.current){setFailed(!ok);if(ok)setConfirmFinish(false);}
    } catch {if(mounted.current)setFailed(true);}
    finally {inFlight.current=false;if(mounted.current)setPending(undefined);}
  };
  const size=arena.seededIds.length;
  const quote=controls?.getWager?.(arena.occasionId);
  const ticket=controls?.getWagerReceipt?.(arena.occasionId);
  const active=arena.status==='registration'||arena.status==='running';
  return <article aria-labelledby={id} className="min-w-0 space-y-3 rounded-xl border border-amber-300/30 bg-gradient-to-b from-amber-950/25 to-slate-950/80 p-3">
    <header>
      <p className="text-xs font-medium tracking-wider text-amber-400">演武擂台</p>
      <h4 id={id} className="font-serif text-lg font-semibold leading-snug text-amber-50 [overflow-wrap:anywhere]">{arena.title}</h4>
      {siteName&&<p className="mt-1 text-xs text-slate-300 [overflow-wrap:anywhere]">{siteName}</p>}
      {size>0&&<p className="mt-1 text-xs text-slate-300">入签：{size} 人</p>}
    </header>
    {duel&&<VisualDuelArena frame={duel}/>}
    {arena.status==='registration'&&<p className="text-sm text-slate-300">尚在报名，未排定对阵。</p>}
    <div className="grid min-w-0 gap-2 lg:grid-cols-2 xl:grid-cols-4">
      {arena.rounds.map((round,index)=><BoutList key={round.round} label={roundLabel(round.round,size,!!arena.prize&&index===arena.rounds.length-1)}>
        {round.bouts.map(bout=><li key={bout.firstId} className="min-w-0 rounded bg-slate-900 p-2 text-sm [overflow-wrap:anywhere]">
          {bout.secondId?<>
            <p className="text-slate-200">{named(bout.firstId)} <span className="text-slate-400">对</span> {named(bout.secondId)}</p>
            <p className="text-amber-200">{named(bout.winnerId)}胜出</p>
          </>:<p className="text-slate-200">{named(bout.firstId)}轮空晋级</p>}
        </li>)}
        {!!round.absentIds.length&&<li className="text-xs text-slate-300 [overflow-wrap:anywhere]">本轮未能出场：{round.absentIds.map(named).join('、')}</li>}
      </BoutList>)}
      {!!arena.currentPairs.length&&<BoutList label={`${roundLabel((arena.rounds.at(-1)?.round??0)+1,size,false)} · 待开打`}>
        {arena.currentPairs.map(pair=><li key={pair.firstId} className="min-w-0 rounded bg-slate-900 p-2 text-sm text-slate-200 [overflow-wrap:anywhere]">
          {named(pair.firstId)}{pair.secondId?` 对 ${named(pair.secondId)}`:'候轮空，未见晋级实录'}
        </li>)}
      </BoutList>}
    </div>
    {arena.prize&&<div className="rounded-lg border border-amber-300/40 bg-amber-950/30 p-3">
      <p className="font-serif text-base font-semibold text-amber-100">魁首：{named(arena.prize.actorId)}</p>
      <p className="text-sm text-slate-200">已获称号「{arena.prize.title}」与通天灵宝「{TOURNAMENT_ARENA_PRIZE_NAME}」。</p>
    </div>}
    {!active&&!arena.prize&&<p className="text-sm text-slate-300">{championName?`魁首：${championName}。未见专属封赏实录。`:'此场已结束，未见魁首受赐实录。'}</p>}
    {(quote||ticket)&&<WagerRead key={quote?`${quote.arenaId}:${quote.spectatorId}`:ticket?.id}
      quote={quote} ticket={ticket} named={named} busy={busy} commit={controls?.placeWager}/>}
    {active&&(controls?.nextRound||controls?.finishTournament)&&<div className="flex flex-wrap gap-2" aria-busy={busy}>
      {controls.nextRound&&!confirmFinish&&<button type="button" className={button} disabled={busy} onClick={()=>void run('next')}>
        {arena.status==='registration'?'推进一月，候开擂':'看下一轮'}
      </button>}
      {controls.finishTournament&&!confirmFinish&&<button type="button" className={button} disabled={busy} onClick={()=>setConfirmFinish(true)}>快进至此场落幕</button>}
      {confirmFinish&&<>
        <p className="w-full text-xs text-slate-300">世界也会随赛程推进，不只改变这张对阵图。</p>
        <button type="button" className={button} disabled={busy} onClick={()=>void run('finish')}>确认快进</button>
        <button type="button" className={button} disabled={busy} onClick={()=>{setConfirmFinish(false);setFailed(false);}}>取消</button>
      </>}
      {pending&&<p role="status" className="w-full text-sm text-slate-300">赛程推进中…</p>}
      {failed&&<p role="status" className="w-full text-sm text-amber-200">未能推进这场大比，请核对当前赛程。</p>}
    </div>}
  </article>;
}
