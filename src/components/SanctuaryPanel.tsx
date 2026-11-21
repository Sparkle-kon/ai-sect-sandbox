import { activeSanctuaryPass, isSanctuaryCharterActive, SANCTUARY_BLOCK_HP, visibleSanctuaries } from '../engine/sanctuaryEngine';
import { wardCharges } from './sanctuaryView';
import type { Cultivator, SanctuaryCharter, SanctuaryIncident, SanctuaryPass, WorldState } from '../types/world';

const charterEnd: Record<NonNullable<SanctuaryCharter['endReason']>, string> = {
  expiry: '敕令到期', site_lost: '设立地点已失效',
};
const passEnd: Record<NonNullable<SanctuaryPass['endReason']>, string> = {
  expiry: '通行期满', charter_ended: '所属敕令已终止', surrendered: '主动交还', violation: '违规失权', ineligible: '访客已不具资格',
};
const incidentLabel: Record<SanctuaryIncident['kind'], string> = {
  blocked: '护阵挡下决斗', exhausted: '护阵余量不足，未能阻止决斗', forfeited: '通行权因违规被撤销',
};

export function SanctuaryPanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator | undefined }) {
  const viewer = world.cultivators.find(({ id }) => id === cultivator?.id);
  const sites = new Map(world.locations.map(({ id, name }) => [id, name]));
  const sponsors = new Map(world.sects.map(({ id, name }) => [id, name]));
  const activePassId = viewer && activeSanctuaryPass(world, viewer)?.id;
  const rows = visibleSanctuaries(world, viewer).filter(({ charter }) => charter.openedTick <= world.tick)
    .sort((a, b) => Number(b.ownPass?.status === 'active') - Number(a.ownPass?.status === 'active') || b.charter.openedTick - a.charter.openedTick);

  return (
    <section aria-label="避难所与通行敕令档案" className="min-w-0 space-y-2 rounded-xl border border-cyan-400/25 bg-slate-900/70 p-3 text-slate-100 sm:p-4">
      <header className="space-y-1">
        <h4 className="text-sm font-semibold text-cyan-100">避难所与通行敕令档案</h4>
        <p className="break-words text-xs text-slate-300">{viewer ? `${viewer.name} · Tick #${world.tick}` : '选择修士后，可查其已知地点敕令及本人实际通行权。'}</p>
        <p className="text-xs leading-relaxed text-slate-400">通行权不以宗门结盟为前提，也不因结盟自动取得。护阵只在指定地点阻止针对持有效敕令访客的直接决斗；每次消耗 {SANCTUARY_BLOCK_HP} 点，不保证抵御天灾或其他伤害。不显示其他持敕者名单。</p>
      </header>
      {!rows.length && <p className="text-xs text-slate-400">此时点无可阅的已知敕令。</p>}
      <div className="max-h-[29rem] space-y-2 overflow-y-auto">
        {rows.map(({ charter, ownPass, incidents }) => {
          const charterLive = isSanctuaryCharterActive(world, charter);
          const passLive = !!ownPass && ownPass.id === activePassId;
          const charges = wardCharges(charter);
          const history = incidents.filter(({ tick }) => tick <= world.tick);
          const passStatus = passLive ? '有效' : ownPass?.endReason ? passEnd[ownPass.endReason]
            : !charterLive ? '敕令已终止' : ownPass && ownPass.expiresTick <= world.tick ? '通行期满' : '当前无效';
          return (
            <details key={charter.id} className="min-w-0 rounded border border-slate-800 bg-slate-950/55">
              <summary className="min-h-11 cursor-pointer break-words px-3 py-2 text-xs font-semibold text-cyan-100">
                {sites.get(charter.siteId) ?? '旧址未详'} · {charterLive ? '敕令生效' : '敕令已终止'}{passLive ? ' · 本人有通行权' : ''}
              </summary>
              <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
                <p>{sponsors.get(charter.sponsorSectId) ?? '宗门未详'}立敕 · Tick #{charter.openedTick} · 到期 Tick #{charter.expiresTick}（到期时即失效）</p>
                {!charterLive && <p>{charter.endReason ? charterEnd[charter.endReason] : world.tick >= charter.expiresTick ? '敕令到期' : '设立地点已不符条件'}{charter.endedTick !== undefined ? ` · Tick #${charter.endedTick}` : ''}</p>}
                <p>护阵：{charter.shieldHp}/{charter.maxShieldHp} 点 · {charterLive ? (charges > 0 ? `可挡 ${charges} 次决斗` : '护阵已耗尽，通行权不等于仍受护阵保护') : '已不提供保护'}</p>
                {charter.lastRepairTick !== undefined && charter.lastRepairTick <= world.tick && <p>最近修复：Tick #{charter.lastRepairTick}</p>}
                {viewer && <p className={passLive ? 'text-emerald-200' : 'text-slate-400'}>
                  {!ownPass || ownPass.issuedTick > world.tick ? '本人无已记录通行权' : <>
                    本人通行权：{passStatus} · 签发 Tick #{ownPass.issuedTick} · 到期 Tick #{ownPass.expiresTick}
                    {ownPass.endedTick !== undefined ? ` · 终止 Tick #${ownPass.endedTick}` : ''}
                    {passLive && ' · 仅在此地生效'}
                  </>}
                </p>}
                <p>本人相关的已记录冲突：{history.length} 件</p>
                {history.length > 0 && <ol className="list-inside list-disc space-y-1">
                  {[...history].reverse().map((row) => (
                    <li key={row.id}>Tick #{row.tick} · {row.aggressorId === viewer?.id ? '本人发起' : '本人为决斗目标'} · {incidentLabel[row.kind]} · 护阵消耗 {row.shieldSpent} 点 · 发起方业力扣除 {row.karmaPenalty} 点</li>
                  ))}
                </ol>}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
