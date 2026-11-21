import type { projectSeasonalHousing } from '../engine/seasonalHousingEngine';

type Claim = ReturnType<typeof projectSeasonalHousing>[number];

const REASON: Record<NonNullable<Claim['reason']>, string> = {
  guest_declined: '客方谢绝',
  guest_withdrew: '客方退出借住',
  host_revoked: '主家撤回借住许可',
  offer_expired: '邀约期限已过',
  season_ended: '借住季期已终',
  party_unavailable: '已不再满足双方借住条件',
  shelter_unavailable: '客舍已不可用',
  unsafe_shelter: '客舍现不宜留驻',
  route_interrupted: '已记录的行程中断',
  no_spare_room: '未有可用客房',
};

function stage(claim: Claim) {
  switch (claim.status) {
    case 'offered': return '借住邀约，尚未留房';
    case 'reserved': return claim.arrival ? '已实到，尚未登记入住' : '已留房，尚无实到凭证';
    case 'occupied': return claim.checkedInTick !== undefined ? '已有实际入住凭证' : '入住尚待核实';
    case 'moved_out': return claim.departure ? '已有实际离舍凭证' : '实际离舍尚待核实';
    case 'closed': return '借住已结';
  }
}

export function SeasonalHousingReceipts({ rows, viewerId }: { rows: readonly Claim[]; viewerId: string }) {
  const own = rows.filter((row) => row.hostId === viewerId || row.guestId === viewerId);
  if (!own.length) return null;
  return (
    <section aria-label="时令客舍" className="space-y-1.5 border-t border-slate-800 pt-2">
      <h4 className="text-xs font-semibold text-emerald-100">时令客舍</h4>
      <p>借房只在约定季期内有效，不更改坊籍，也不把客人计入本村人口。</p>
      <ol aria-label="本人客舍借住凭证" className="max-h-56 space-y-1.5 overflow-y-auto">
        {own.map((claim) => (
          <li key={claim.id} className="min-w-0 space-y-0.5 rounded bg-slate-900/80 p-2 [overflow-wrap:anywhere]">
            <p className="font-semibold text-slate-100">{claim.hostId === viewerId ? '本人为主家' : '本人为借住客'} · {stage(claim)}</p>
            <p>邀约 Tick #{claim.offeredTick}{claim.status === 'offered' && <> · 应允期限 Tick #{claim.expiresTick}</>}
              {' · 借住季期 '}Tick #{claim.seasonStartTick} 至 #{claim.seasonEndTick}</p>
            {claim.acceptedTick !== undefined && <p>已应允 Tick #{claim.acceptedTick}{claim.status === 'reserved' && claim.arriveByTick !== undefined && <> · 到访期限 Tick #{claim.arriveByTick}</>}</p>}
            {claim.arrival && <p>实际抵达 Tick #{claim.arrival.tick}。</p>}
            {claim.checkedInTick !== undefined && <p>登记入住 Tick #{claim.checkedInTick}。</p>}
            {claim.departure && <p>实际离舍 Tick #{claim.departure.tick}。</p>}
            {claim.endedTick !== undefined && <p>借住结记 Tick #{claim.endedTick}{claim.reason && <> · {REASON[claim.reason]}</>}。</p>}
            {claim.status === 'closed' && !claim.departure && <p>仅有借住结束记录，未有实际离舍凭证。</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
