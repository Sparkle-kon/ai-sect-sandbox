import { visibleOathArbitrations } from '../engine/oathArbitrationEngine';
import type { Cultivator, WorldState } from '../types/world';

type ArbitrationView = ReturnType<typeof visibleOathArbitrations>[number];
type Appointment = ArbitrationView['appointments'][number];

const ROLE: Record<ArbitrationView['role'], string> = {
  requester: '本人为需方', provider: '本人为供方', adjudicator: '本人为受提名裁断者', observer: '本人为独立见证人',
};
const STATUS: Record<ArbitrationView['status'], string> = {
  offered: '待双方同意', hearing: '裁断进行中', closed: '已结案',
};
const DISPOSITION: Record<NonNullable<ArbitrationView['disposition']>, string> = {
  refund: '价金与押金各返原出资方，原契书已结算',
  inconclusive: '未形成一致裁断；本案未另行拨付，原契书依其规则处理',
  unjoined: '双方未达成共同裁断；本案未改动原托管',
  external_settlement: '原契书已另行结算；本案未重复拨付',
};
const RECUSAL: Record<NonNullable<Appointment['recusal']>, string> = {
  voluntary: '自行回避', faction: '同宗或派系冲突', personal_tie: '个人关系冲突', prior_obligation: '既有义务冲突', unavailable: '无法继续参与',
};

export function OathArbitrationPanel({ world, cultivator }: { world: WorldState; cultivator?: Cultivator }) {
  const rows = visibleOathArbitrations(world, cultivator).slice().sort((a, b) =>
    Number(b.status !== 'closed') - Number(a.status !== 'closed') || b.openedTick - a.openedTick);
  if (rows.length === 0) return null;
  return (
    <details className="min-w-0 rounded border border-amber-400/20 bg-slate-950/60">
      <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-amber-100">回避裁断与多方担保</summary>
      <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
        <p>此页只读。双方先同意，之后各方提名的两位不同裁断者须符合回避规则，并有独立见证实际提交的到场事实。沿用原契书托管，不重复收取价金或押金。</p>
        <ol className="max-h-64 space-y-1.5 overflow-y-auto" aria-label="本人有权查看的裁断">
          {rows.map((row) => <li key={row.id} className="break-words rounded border border-slate-800 p-2">
            <p className="font-semibold text-amber-100">{STATUS[row.status]} · {ROLE[row.role]}</p>
            <ArbitrationRecord row={row} />
          </li>)}
        </ol>
      </div>
    </details>
  );
}

function ArbitrationRecord({ row }: { row: ArbitrationView }) {
  const serving = row.appointments.filter(({ acceptedTick, endedTick }) => acceptedTick !== undefined && endedTick === undefined).length;
  return <>
    <p>原到场凭证 Tick #{row.tenderTick} · 提请裁断 Tick #{row.openedTick} · 同意截止 Tick #{row.joinUntilTick} 前</p>
    {row.joinedTick !== undefined && <p>双方已同意裁断 · Tick #{row.joinedTick}
      {row.expiresTick !== undefined && ` · 裁断期限 Tick #${row.expiresTick} 前`}</p>}
    {row.escrow && <p>原契书当前实际托管：需方价金 {row.escrow.payment} 灵石 · 供方押金 {row.escrow.collateral} 灵石。</p>}
    {row.filedTick !== undefined && <p>独立见证已提交到场事实 · Tick #{row.filedTick}；不是裁断票。</p>}
    {row.status === 'hearing' && (row.role === 'requester' || row.role === 'provider') && <p>账内已受任且未退出：{serving}/2 位裁断者。</p>}
    {row.appointments.length > 0 && (
      <ol aria-label="裁断提名、回避与实投" className="space-y-0.5">
        {row.appointments.map((entry, index) => <li key={index}>
          {entry.side === 'requester' ? '需方提名' : '供方提名'} Tick #{entry.nominatedTick}
          {entry.acceptedTick !== undefined && ` · 已受任 Tick #${entry.acceptedTick}`}
          {entry.recusal && ` · 回避：${RECUSAL[entry.recusal]}`}
          {entry.endedTick !== undefined && ` · 任期终止 Tick #${entry.endedTick}`}
          {entry.votedTick !== undefined && entry.vote && ` · 实投${entry.vote === 'refund' ? '返还' : '不作返还裁断'} Tick #${entry.votedTick}`}
        </li>)}
      </ol>
    )}
    {row.status === 'closed' && row.closedTick !== undefined && row.disposition &&
      <p className="font-medium text-amber-100">唯一结案记录 · Tick #{row.closedTick}：{DISPOSITION[row.disposition]}。</p>}
  </>;
}
