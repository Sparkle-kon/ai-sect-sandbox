import { useMemo } from 'react';
import { availableMentorshipActions, mentorshipBudgetRemaining, mentorshipTechniqueMultiplier, MENTOR_MONTHLY_BUDGET } from '../engine/mentorshipEngine';
import type { Cultivator, Technique, WorldState } from '../types/world';

type Lineage = WorldState['mentorship']['lineage'][number];
type Offer = WorldState['mentorship']['offers'][number];
const OFFER_LABELS: Record<Offer['status'], string> = {
  pending: '待回应', accepted: '已接受', declined: '已拒绝', expired: '已到期',
};

const techniqueKey = (technique: Technique) => technique.id
  ? `id:${technique.id}`
  : `name:${technique.name}:${technique.spiritRoot}`;

/** Return recorded lineage components linked to this cultivator, not guessed teacher assignments. */
export function relatedMentorshipBranches(lineage: readonly Lineage[], actorId: string): Array<{ technique: Technique; edges: Lineage[] }> {
  const relevant = lineage.filter((entry) => entry.mentorId === actorId || entry.studentId === actorId);
  const seeds = new Map(relevant.map(({ technique }) => [techniqueKey(technique), technique]));
  return [...seeds].map(([key, technique]) => {
    const matching = lineage.filter((entry) => techniqueKey(entry.technique) === key);
    const linked = new Set<string>([actorId]);
    // Bound by the actual edge array; breaks once the component can no longer grow.
    for (let i = 0; i < matching.length; i += 1) {
      const before = linked.size;
      for (const entry of matching) {
        if (linked.has(entry.mentorId) || linked.has(entry.studentId)) {
          linked.add(entry.mentorId);
          linked.add(entry.studentId);
        }
      }
      if (linked.size === before) break;
    }
    const edges = matching.filter((entry) => linked.has(entry.mentorId) && linked.has(entry.studentId))
      .sort((a, b) => a.formedTick - b.formedTick || a.mentorId.localeCompare(b.mentorId) || a.studentId.localeCompare(b.studentId));
    return { technique, edges };
  });
}

export function MentorshipPanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator | undefined }) {
  const actorId = cultivator?.id ?? '';
  const branches = useMemo(() => relatedMentorshipBranches(world.mentorship?.lineage ?? [], actorId), [world, actorId]);
  const names = new Map(world.cultivators.map(({ id, name }) => [id, name]));
  const name = (id: string) => names.get(id) ?? '修士未详';
  const related = (world.mentorship?.offers ?? []).filter(({ mentorId, studentId }) => mentorId === actorId || studentId === actorId);
  const pending = related.filter(({ status }) => status === 'pending').sort((a, b) => b.createdTick - a.createdTick);
  const settled = related.filter(({ status }) => status !== 'pending').sort((a, b) => (b.resolvedTick ?? b.createdTick) - (a.resolvedTick ?? a.createdTick)).slice(0, 8);
  const options = cultivator && world.mentorship ? availableMentorshipActions(cultivator, world) : [];
  const legalTargets = [...new Set(options.flatMap(({ action, targetCultivatorId }) => action === 'TEACH' && targetCultivatorId ? [targetCultivatorId] : []))];
  const remaining = cultivator && world.mentorship ? mentorshipBudgetRemaining(cultivator, world) : 0;
  const lostEffect = cultivator && world.mentorship ? (1 - mentorshipTechniqueMultiplier(world, cultivator)) * 100 : 0;

  const offerRow = (offer: Offer) => {
    const responses = options.filter(({ targetTuitionId }) => targetTuitionId === offer.id);
    return (
      <li key={offer.id} className="min-w-0 space-y-0.5 rounded bg-slate-900/85 p-2 text-xs text-slate-200">
        <p className="break-words font-medium text-slate-100">{name(offer.mentorId)} → {name(offer.studentId)} · {offer.technique.name}</p>
        <p className="text-slate-400">
          {OFFER_LABELS[offer.status]} · 提出于 Tick #{offer.createdTick}
          {offer.status === 'pending' ? ` · 至 Tick #${offer.expiresTick}` : offer.resolvedTick !== undefined ? ` · 结算于 Tick #${offer.resolvedTick}` : ''}
        </p>
        {offer.status === 'pending' && responses.length > 0 && (
          <p className="text-cyan-200">修士当前可选择：{responses.map(({ action }) => action === 'ACCEPT_TUITION' ? '接受' : '拒绝').join('／')}</p>
        )}
        {offer.outcome && <p className="break-words text-amber-100">结算：{offer.outcome}</p>}
      </li>
    );
  };

  return (
    <section className="min-w-0 space-y-2 rounded-xl border border-amber-400/25 bg-slate-900/70 p-3 text-slate-100 sm:p-4" aria-label="师徒传承">
      <h3 className="text-sm font-semibold text-amber-100">师徒传承</h3>
      {!cultivator ? <p className="text-xs text-slate-400">选中修士后查看其师承。</p> : (
        <>
          <p className="break-words text-xs text-slate-300">{cultivator.name} · 现修 {cultivator.technique.name} · 熟练度 {cultivator.techniqueMastery}/100</p>
          {lostEffect > 0 && <p className="text-xs text-amber-200">传承偏解降低当前功法效果 {lostEffect.toFixed(1)}%。</p>}
          {cultivator.alive ? (
            <p className="text-xs text-slate-300">本月授艺余量 {remaining}/{MENTOR_MONTHLY_BUDGET}
              {legalTargets.length > 0 ? <> · 当前可授艺：{legalTargets.map(name).join('、')}</> : <> · 当前无合法授艺对象</>}
            </p>
          ) : <p className="text-xs text-slate-400">已陨落，仅展示留档。</p>}
          <details className="rounded border border-slate-800 bg-slate-950/50 p-2">
            <summary className="cursor-pointer text-xs font-semibold text-amber-100">可查衣钵谱系 · {branches.length} 门功法</summary>
            {branches.length === 0 ? <p className="mt-1 text-xs text-slate-400">暂无该修士的授艺或师承记录。</p> : (
              <ul className="mt-2 max-h-64 space-y-3 overflow-y-auto">
                {branches.map(({ technique, edges }) => (
                  <li key={techniqueKey(technique)} className="break-words text-xs">
                    <h4 className="font-semibold text-amber-100">{technique.name} · {technique.spiritRoot}</h4>
                    <ol className="mt-1 space-y-1.5">
                      {edges.map((entry) => (
                        <li key={`${entry.mentorId}:${entry.studentId}:${entry.formedTick}`} className="rounded bg-slate-900/80 p-2">
                          <p className="text-slate-200">{name(entry.mentorId)} → {name(entry.studentId)}
                            {entry.studentId === actorId ? ' · 师从' : entry.mentorId === actorId ? ' · 授艺' : ' · 同一传承链'}
                          </p>
                          <p className="text-slate-400">结缘 Tick #{entry.formedTick} · 最近授艺 Tick #{entry.lastLessonTick} · 共 {entry.lessons} 课</p>
                          <p className={entry.flaw > 0 ? 'text-amber-200' : 'text-slate-400'}>偏解 {entry.flaw}/100 点{entry.flaw === 0 ? '（未见偏差）' : ''}</p>
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ul>
            )}
          </details>
          <details className="rounded border border-slate-800 bg-slate-950/50 p-2">
            <summary className="cursor-pointer text-xs font-semibold text-amber-100">授艺邀约 · 待回应 {pending.length} · 最近结算 {settled.length}</summary>
            <p className="mt-1 text-xs text-slate-400">此处只查看结果；邀约由修士自行决定，不替其答复。</p>
            {pending.length + settled.length > 0
              ? <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">{[...pending, ...settled].map(offerRow)}</ul>
              : <p className="mt-1 text-xs text-slate-400">暂无相关邀约。</p>}
          </details>
        </>
      )}
    </section>
  );
}
