import type { projectCourierHandoffs } from '../engine/sealedCourierEngine';

export type CourierHandoffRecord = ReturnType<typeof projectCourierHandoffs>[number];
const STATUS: Record<CourierHandoffRecord['status'], string> = {
  arrived: '原信使已实际抵驿，尚未换手', offered: '原件在驿站候交，待受邀人明确同意',
  transferred: '原件已在驿站实际交接', declined: '受邀人谢绝，原件未换手',
  missed: '候交窗口已过，原件未换手', interrupted: '交接中断，原件未换手',
};
const REASON: Record<NonNullable<CourierHandoffRecord['reason']>, string> = {
  unoffered: '没有发出转接邀约', unconfirmed: '未取得接手确认', carrier_unavailable: '没有满足在场条件',
  post_unavailable: '原驿站不可用', hazard: '当时现场遇灾', route_interrupted: '原通路中断',
};

export function CourierHandoffReceipt({ record }: { record?: CourierHandoffRecord }) {
  if (!record) return null;
  return <section aria-label="驿站转接" className="min-w-0 space-y-1 break-words border-t border-slate-800 pt-1.5">
    <h6 className="font-semibold text-sky-100">驿站转接 · {record.postName}</h6>
    <p>{STATUS[record.status]}。</p>
    <p>第 {record.arrivedTick} 轮实际抵驿
      {record.offeredTick !== undefined && ` · 第 ${record.offeredTick} 轮发出转接邀约`}
      {record.lastHeldTick !== undefined && ` · 第 ${record.lastHeldTick} 轮实停候交`}
      {record.settledTick !== undefined && ` · 第 ${record.settledTick} 轮${record.status === 'transferred' ? '实交' : '结案'}`}。</p>
    {record.reason && <p>实录：{REASON[record.reason]}。</p>}
    {record.status === 'transferred' && <p className="text-emerald-200">封泥未拆，信先换了肩。同一原件续送；收件人的回执还在前路等着。</p>}
  </section>;
}
