import { ESCORT_FEE, ESCORT_RATIONS, visibleEscorts } from '../engine/escortEngine';
import { terrainTileAt } from '../engine/terrainEngine';
import type { WorldState } from '../types/world';

type EscortView = ReturnType<typeof visibleEscorts>[number];
const STATUS: Record<EscortView['contract']['status'], string> = {
  offered: '待接镖', active: '护送中', delivered: '护送已送达', failed: '护送失败', expired: '未接镖，委托已到期',
};

export function ShipmentEscortDetails({ view, world, actorName }: { view: EscortView; world: WorldState; actorName: (id: string) => string }) {
  const { contract, checkpoint, reportCount } = view;
  const tile = checkpoint && contract.status === 'active' ? terrainTileAt(world, checkpoint.x, checkpoint.y) : undefined;
  const detours = contract.detours.filter(({ tick, reportId }) => tick <= world.tick && contract.usedReportIds.includes(reportId));
  return (
    <div className="mt-1.5 space-y-1 border-t border-slate-700 pt-1.5" aria-label="护镖委托与独立账目">
      <p className="break-words font-semibold text-sky-100">{STATUS[contract.status]} · 委托方：{actorName(contract.clientId)} · 护镖修士：{contract.escortId ? actorName(contract.escortId) : '尚未承接'}</p>
      <p className="text-slate-400">登记 Tick #{contract.offeredTick}{contract.acceptedTick !== undefined ? ` · 承接 Tick #${contract.acceptedTick}` : ''}
        {contract.settledTick !== undefined ? ` · 结案 Tick #${contract.settledTick}` : contract.status === 'offered' ? ` · 到期 Tick #${contract.expiresTick}` : ''}</p>
      {contract.status === 'offered' && <p>合约约定：委托费 {ESCORT_FEE} 灵石，护镖者须自备玄土根 {ESCORT_RATIONS} 株。</p>}
      <p>护镖费：托管 {contract.feeEscrow} 灵石 · 已付护镖者 {contract.feePaid} · 退还委托方 {contract.feeRefunded}</p>
      <p>护镖者自备玄土根：托管 {contract.rationsEscrow} 株 · 已耗 {contract.rationsSpent} · 退回 {contract.rationsReturned}</p>
      {contract.status === 'active' && <p className="text-slate-400">{tile ? `当前所见关口：第 ${tile.row + 1} 行，第 ${tile.col + 1} 列` : '当前未观测到在途关口，仅显示所知运输端点'}
        {contract.arrivedTick !== undefined ? ` · 已抵达 Tick #${contract.arrivedTick}，待货运结算` : ''}。</p>}
      {(reportCount > 0 || detours.length > 0) && <details>
        <summary className="flex min-h-11 cursor-pointer items-center text-sky-100">核验路报与绕行 · 记录 {reportCount} 条，已采纳 {detours.length} 条</summary>
        {detours.length ? <ul className="space-y-1 text-slate-400">
          {detours.map(({ tick, reportId, extraSteps }) => <li key={`${tick}:${reportId}`}>Tick #{tick} · 依核验路报改道{extraSteps > 0 ? ` · 增加 ${extraSteps} 段` : ' · 未增加路段'}</li>)}
        </ul> : <p className="text-slate-400">尚无已落实的改道路报。</p>}
      </details>}
    </div>
  );
}
