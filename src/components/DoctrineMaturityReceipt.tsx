import type { DoctrineMaturityView } from '../engine/doctrineMaturityEngine';

const offerStatus = {
  offered: '并宗筹议中，尚未并宗',
  declined: '当事人未同意，筹议已止',
  withdrawn: '并宗提议已撤',
  expired: '并宗筹议到期',
  invalidated: '条件变化，筹议已止',
  merged: '这项筹议已实际交割',
} as const;

export function DoctrineMaturityReceipt({ view }: { view?: DoctrineMaturityView }) {
  if (!view) return null;
  const { support, lastObservation, offer, settlement } = view;
  return <section aria-label="失去根基与并宗实录" className="min-w-0 space-y-1.5 break-words border-t border-slate-800 pt-2">
    <h6 className="font-semibold text-teal-100">此宗后来何往</h6>
    {view.status === 'past_support' && <p className="text-slate-400">根基变化已有旧录；现不能仅按这条旧录发起并宗。</p>}
    {support && <p>第 {support.observedTick} 轮记实：{support.kind === 'sustained_hazard'
      ? '山门连续三个月遭严重灾势。' : '山门原有地权已失。'}</p>}
    {lastObservation?.recoveredFromHazard && <p className="text-slate-400">第 {lastObservation.observedTick} 轮未再记录同等严重灾势；上面的旧灾仍是当时实录。</p>}
    {lastObservation && !lastObservation.recoveredFromHazard && lastObservation.consecutiveSevereMonths > 0 && <p className="text-slate-400">
      截至第 {lastObservation.observedTick} 轮，记录了连续 {lastObservation.consecutiveSevereMonths} 个月的严重灾势。
    </p>}
    {offer && <div className="min-w-0 space-y-0.5 rounded border border-slate-800 px-2 py-1.5">
      <p className="font-medium">{offerStatus[offer.status]} · 第 {offer.openedTick} 轮提议{offer.status === 'offered' && ` · 第 ${offer.expiresTick} 轮届期`}</p>
      <p>实记同意 {offer.memberConsents}/{offer.memberCount}（含发起的掌门）；{offer.receivingLeaderSigned ? '接纳方掌门已另行同意' : '尚未有接纳方掌门同意'}。</p>
      {offer.status === 'offered' && <p className="text-slate-400">拟交割 {offer.agreedStones} 灵石。签字并不等于已划款或已改宗籍。</p>}
      {offer.status !== 'offered' && offer.status !== 'merged' && <p className="text-slate-400">此项筹议未划款、未改宗籍。</p>}
    </div>}
    {settlement?.kind === 'merged' && <>
      <p className="font-semibold text-teal-100">第 {settlement.tick} 轮实际并宗：{settlement.memberCount} 人改宗籍，未因此迁人。</p>
      <p>实交 {settlement.transferredStones} 灵石；原册保留 {settlement.retainedStones} 灵石。{settlement.scriptureAlreadyHeld === true
        ? '接纳方已有同一传承抄本，未重复增加。'
        : settlement.scriptureAlreadyHeld === false ? '约定的传承抄本随本案收入接纳方。' : ''}</p>
      <p className="text-slate-400">本宗旧名与旧账仍可核查；此次没有转让未列明的器物或债务。</p>
    </>}
    {settlement?.kind === 'dispersed' && <>
      <p className="font-semibold text-teal-100">第 {settlement.tick} 轮，已无在世同门，宗门散亡。</p>
      <p>无受领方，未交出库银；{settlement.retainedStones} 灵石仍记原册。旧名、历史与传承实录保留，未另立继任宗门。</p>
    </>}
  </section>;
}
