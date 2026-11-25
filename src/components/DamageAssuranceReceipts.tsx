import type { projectDamageAssurance } from '../engine/damageAssuranceEngine';
import type { DamageAssuranceClaim } from '../types/world';

export type DamageAssuranceReceipt = ReturnType<typeof projectDamageAssurance>[number];
const STATUS: Record<DamageAssuranceClaim['status'], string> = {
  open: '核验账仍开放', fulfilled: '原损的补偿账已补足', closed: '停止受理，实记保留',
};
const CLOSURE: Record<NonNullable<DamageAssuranceClaim['closure']>, string> = {
  native_reopened: '已走原炉务流程签署复炉', title_changed: '炉点归属已变', case_superseded: '原炉损已由后续炉务记录取代',
};

export function DamageAssuranceReceipts({ receipts, onsiteId }: {
  receipts: readonly DamageAssuranceReceipt[]; onsiteId?: string;
}) {
  if (!receipts.length) return null;
  return <section aria-label="炉损核验与实修" className="min-w-0 space-y-1.5 break-words border-t border-slate-800 pt-2">
    <h5 className="font-semibold text-indigo-100">炉损核验与实修</h5>
    <p>炉损初记，后修另录。补偿只记本案已核的实修，不另退费用；复炉仍须单独签署并按炉务规则生效。</p>
    <ol className="max-h-64 space-y-1.5 overflow-y-auto">
      {receipts.map((record) => <li key={record.id} className="min-w-0 space-y-1 rounded border border-slate-800 p-2">
        <p className="font-semibold text-indigo-100">{STATUS[record.status]} · 原损 {record.initialLoss} 点。</p>
        <p>第 {record.damagedTick} 轮炉体完好度 {record.integrityBefore} → {record.integrityAfterDamage}；
          第 {record.inspectionTick} 轮查验，第 {record.sealedTick} 轮封存初记。</p>
        <p>实修入账 +{record.credited} 点，补偿账尚缺 {record.remaining} 点。</p>
        {record.siteId === onsiteId && record.physicalRemaining !== undefined && <p>
          现场炉体距受损前尚差 {record.physicalRemaining} 点；补偿差额另见补偿账。
        </p>}
        {record.contributions.length > 0 ? <ol aria-label="逐次已核实实修" className="space-y-1 border-t border-slate-800 pt-1">
          {record.contributions.map((work, index) => <li key={index} className="rounded bg-slate-900/70 p-1.5">
            <p>第 {work.tick} 轮{work.own ? '本人' : '经核验'}实修 +{work.integrityAfter - work.integrityBefore} 点：
              完好度 {work.integrityBefore} → {work.integrityAfter}，本账计入 {work.creditedPoints} 点。</p>
            <p>这次实际耗用 {work.stonesSpent} 灵石、玄土根 {work.rootsSpent} 株。</p>
          </li>)}
        </ol> : <p>尚无计入本案的实修凭据。</p>}
        {record.closedTick !== undefined && <p>第 {record.closedTick} 轮结案{record.closure && `：${CLOSURE[record.closure]}`}。</p>}
      </li>)}
    </ol>
  </section>;
}
