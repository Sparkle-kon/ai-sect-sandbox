import { visibleCaravanRestitution } from '../engine/caravanRestitutionEngine';
import { MARKET_GOODS } from '../engine/marketEngine';
import type { Cultivator, WorldState } from '../types/world';

type RestitutionView = ReturnType<typeof visibleCaravanRestitution>[number];

export function CaravanRestitutionPanel({ world, cultivator }: { world: WorldState; cultivator?: Cultivator }) {
  const viewer = world.cultivators.find(({ id }) => id === cultivator?.id);
  if (!viewer) return null;
  const rows = visibleCaravanRestitution(world, viewer);
  if (!rows.length) return null;
  return <details className="min-w-0 rounded border border-amber-400/20 bg-slate-950/60">
    <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-amber-100">遗货寻回与归还凭据</summary>
    <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
      <p>封存遗货、实际发现和亲手归还分别记账。归物不是再次售卖，也不改写原商队的退款结算。本页只读。</p>
      <ol className="max-h-64 space-y-1.5 overflow-y-auto" aria-label="本人可查的遗货凭据">
        {rows.map((row) => <RestitutionReceipt key={row.id} row={row} tick={world.tick} />)}
      </ol>
    </div>
  </details>;
}

const ROLE: Record<RestitutionView['role'], string> = {
  local: '本人在场可见', finder: '本人实际发现', seller: '本人为原卖方',
};

function RestitutionReceipt({ row, tick }: { row: RestitutionView; tick: number }) {
  const receipt = row.receipt;
  const discovery = row.discoveredTick ?? receipt?.discoveredTick;
  const found = discovery !== undefined && discovery <= tick;
  const returned = row.status === 'returned' && receipt && receipt.returnedTick <= tick &&
    receipt.discoveredTick < receipt.returnedTick && found;
  return <li className="min-w-0 space-y-0.5 break-words rounded border border-slate-800 p-2">
    <p className="font-semibold text-amber-100">{ROLE[row.role]} · 存续遗货 {row.units} 株{MARKET_GOODS[row.good].label}</p>
    {returned
      ? <p>已实物归还原卖方 Tick #{receipt.returnedTick} · {receipt.returnedBy === 'seller' ? '原卖方取回' : '发现者在场交回'}。</p>
      : found ? <p>已实际找到并封存，尚无已核验的归还。</p> : <p>在场可查遗货线索，尚未记为实际发现或归还。</p>}
    {found && <p>现场发现 Tick #{discovery}。</p>}
    {returned && <p>原运输损失 Tick #{receipt.openedTick} · 买方原全额退款仍有效；归还这一株不重开交易。</p>}
  </li>;
}
