import type { DanxiaSeasonReviewView } from '../engine/danxiaSeasonReviewEngine';

const ROLE:Record<DanxiaSeasonReviewView['role'],string> = {
  patient:'原定求药人', original_disciple:'原案具名弟子', representative:'提议所记代表',
};

function original(row:DanxiaSeasonReviewView) {
  switch(row.source.outcome) {
    case 'delivered': return row.source.deliveredLeaves===2 ?
      '原案同批翡翠灵叶 2 株已由原定收药人实际签收。' : '原案交付凭据不完整，不能认定已实交。';
    case 'unfulfilled': return '原案没有实交记录；封存、同意或抵达都不等于签收。';
    case 'observed': return '原案选择旁观，没有拨药或承诺交付。';
    case 'no_commitment': return '原案未立备药承诺，不等于曾拒绝履约。';
  }
}

function seasonStatus(row:DanxiaSeasonReviewView):string {
  const decision=row.decision?.reason;
  switch(row.status) {
    case 'open': return '复议已开始，尚未订新约。';
    case 'proposed': return '已提出合作办法，尚未签定。';
    case 'renewed': return decision==='signed'?'双方已明确同意续约。':'尚不能核定此前续约的同意。';
    case 'switched': return decision==='signed'?'双方已明确同意改与另一宗合作；不等于改换宗门。':'尚不能核定此前改投的同意。';
    case 'refused': return decision==='refused'?'原定求药人已明确拒绝下季合作。':'尚不能核定此前的拒绝。';
    case 'no_agreement': return decision==='expired'?'复议期限已过，未达成新约。':
      decision==='declined'?'提议未获应允，未达成新约。':'未达成可核对的新约。';
  }
}

function ReviewReceiptDetails({row}: {row: DanxiaSeasonReviewView}) {
  return <>
    <p>原案核对第 {row.source.finalTick} 轮：{original(row)}</p>
    <p>次季复议第 {row.openedTick} 轮开始 · 原回应期限为第 {row.expiresTick} 轮之前。</p>
    {row.proposal&&<>
      <p>第 {row.proposal.proposedTick} 轮提出{row.proposal.kind==='renew'?'续合作':'改与另一宗合作'}。</p>
      {row.proposal.kind==='switch'&&row.proposal.reliefTick!==undefined&&
        <p>该提议所据的赈济已实际发生于第 {row.proposal.reliefTick} 轮；不等于双方已经签约。</p>}
    </>}
    <p className="font-medium text-teal-100">{row.decision&&`第 ${row.decision.tick} 轮：`}{seasonStatus(row)}</p>
  </>;
}

export function DanxiaSeasonReviewReceipts({rows}: {rows:readonly DanxiaSeasonReviewView[]}) {
  if(!rows.length)return null;
  return <section aria-label="来年算旧账" className="space-y-1.5 border-t border-slate-800 pt-2">
    <h5 className="text-xs font-semibold text-teal-100">来年算旧账</h5>
    <ul className="max-h-56 space-y-1.5 overflow-y-auto text-xs leading-relaxed text-slate-300">
      {rows.map(row=><li key={row.id} className="min-w-0 space-y-0.5 rounded border border-slate-800 p-2 [overflow-wrap:anywhere]">
        <p className="font-semibold text-slate-100">本人角色：{ROLE[row.role]}</p>
        <ReviewReceiptDetails row={row}/>
      </li>)}
    </ul>
    <p className="text-xs text-slate-400">这是当事人的合作实录，不代表全村同意，也不能说明已经用药或痊愈。</p>
  </section>;
}

export type DanxiaSeasonBranchResult =
  | {kind:'paired';left:DanxiaSeasonReviewView;right:DanxiaSeasonReviewView}
  | {kind:'unavailable'};

export function DanxiaSeasonBranchReading({result}: {result:DanxiaSeasonBranchResult}) {
  if(result.kind==='unavailable')return <p role="status" className="text-xs text-slate-400">两支暂没有可对读的同一原案凭据。不补用相邻快照或另一份诊案。</p>;
  return <section aria-label="丹荒同源分支对读" className="min-w-0 space-y-1.5 text-xs leading-relaxed text-slate-300">
    <p className="font-semibold text-teal-100">同一原案的两支实录</p>
    <ul className="grid min-w-0 gap-1.5 sm:grid-cols-2">
      {([['甲',result.left],['乙',result.right]] as const).map(([side,row])=>(
        <li key={side} className="min-w-0 space-y-0.5 rounded border border-slate-800 p-2 [overflow-wrap:anywhere]">
          <p className="font-semibold text-slate-100">{side}支</p>
          <ReviewReceiptDetails row={row}/>
        </li>
      ))}
    </ul>
    <p className="text-slate-400">仅核对实际交付与次季合作，不推断村户状况、疾病或更远的原因。</p>
  </section>;
}
