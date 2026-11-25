import type { projectToolLoans } from '../engine/toolLoanEngine';
import type { ToolLoan } from '../types/world';

type Receipt = ReturnType<typeof projectToolLoans>[number];
const STATUS: Record<ToolLoan['status'], string> = {
  offered: '邀约待同意，原件未转出', active: '已同意，原件由工坊保管', awaiting_recovery: '借用已结束，原件仍待领取',
  returned: '原物主已领回', probate: '同一原件已交原物主遗产流程', declined: '邀约被谢绝，原件未转出',
  withdrawn: '邀约已撤回，原件未转出', expired: '邀约已过期，原件未转出',
};
const RELEASE: Record<NonNullable<ToolLoan['release']>['reason'], string> = {
  borrower_released: '借用人已停止借用', term_expired: '借期已满', borrower_died: '借用人已故', workshop_closed: '对应工坊委制已结束',
};

export function ToolLoanReceipts({ receipts }: { receipts: readonly Receipt[] }) {
  if (!receipts.length) return null;
  return <section aria-label="共器借用与磨损交割" className="min-w-0 space-y-1.5 break-words">
    <h4 className="font-semibold text-indigo-100">共器借用与磨损交割</h4>
    <p>工坊只保管同一原件。借用不转移所有权，不进入借用人的随身装备；验质助益只记实际使用。</p>
    <ol className="max-h-64 space-y-1.5 overflow-y-auto">
      {receipts.map((receipt) => {
        const { wear } = receipt;
        const base = wear?.baseScore, final = wear?.finalScore;
        return <li key={receipt.id} className="min-w-0 space-y-1 rounded border border-slate-800 p-2">
          <p className="font-semibold text-indigo-100">{receipt.artifactName} · {receipt.role === 'lender' ? '本人出借' : '本人借用'} · {STATUS[receipt.status]}</p>
          <p>第 {receipt.offeredTick} 轮邀约 · 借出前耐久 {receipt.initialDurability}/{receipt.maxDurability}。
            {receipt.status === 'offered' && `第 ${receipt.expiresTick} 轮起邀约失效。`}</p>
          {receipt.acceptedTick !== undefined && <p>第 {receipt.acceptedTick} 轮同意并移交工坊保管。
            {receipt.useUntilTick !== undefined && `原定第 ${receipt.useUntilTick} 轮起不得再用。`}</p>}
          {wear && <div className="space-y-1 rounded bg-slate-900/75 p-1.5">
            <p>第 {wear.tick} 轮第 {wear.piece} 件验质时实际用器。耐久 {wear.durabilityBefore} → {wear.durabilityAfter}，实磨 {wear.durabilityBefore - wear.durabilityAfter} 点。</p>
            {base !== undefined && final !== undefined ? <p>名义评分 +{wear.scoreBonus}；实测 {base} → {final}，实际增加 {final - base} 分。</p>
              : <p>名义评分 +{wear.scoreBonus}；未见可核对的实际评分增幅。</p>}
          </div>}
          {receipt.release && <p>第 {receipt.release.tick} 轮停止借用：{RELEASE[receipt.release.reason]}。</p>}
          {receipt.status === 'awaiting_recovery' && <p className="text-amber-200">借用已停，器物等候交还。</p>}
          {receipt.status === 'returned' && receipt.closedTick !== undefined &&
            <p>第 {receipt.closedTick} 轮由原物主现场领回同一原件；不代表如今仍持有。</p>}
          {receipt.status === 'probate' && receipt.closedTick !== undefined &&
            <p>第 {receipt.closedTick} 轮移交原物主遗产流程，不记作归还或借用人所得。</p>}
        </li>;
      })}
    </ol>
  </section>;
}
