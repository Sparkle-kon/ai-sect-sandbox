import { availableWitnessActions, visibleWitnessClaims } from '../engine/witnessEngine';
import type { Cultivator, WorldState } from '../types/world';

type Claim = WorldState['witnesses']['claims'][number];
const STATUS: Record<Claim['status'], { label: string; color: string }> = {
  pending: { label: '待核实', color: 'text-amber-200' },
  disputed: { label: '有争议', color: 'text-orange-200' },
  corroborated: { label: '已获佐证', color: 'text-emerald-200' },
  retracted: { label: '已撤回', color: 'text-rose-200' },
};

export function AttestationPanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator | undefined }) {
  const viewer = world.cultivators.find(({ id }) => id === cultivator?.id);
  const privateEvents = new Set(world.events.filter(({ witnessScope }) => witnessScope === 'participants').map(({ id }) => id));
  const claims = viewer?.alive && viewer.hp > 0 && world.witnesses ? visibleWitnessClaims(world, viewer)
    .filter((claim) => !privateEvents.has(claim.sourceEventId) && !privateEvents.has(claim.publicationEventId))
    .sort((a, b) => (b.settledTick ?? b.filedTick) - (a.settledTick ?? a.filedTick) || a.id.localeCompare(b.id)) : [];
  const challenges = new Set(viewer && claims.length ? availableWitnessActions(viewer, world).flatMap((option) =>
    option.action === 'CHALLENGE_WITNESS' ? [option.targetWitnessClaimId] : []) : []);
  const people = new Map(world.cultivators.map(({ id, name }) => [id, name]));
  const name = (id: string) => people.get(id) ?? '姓名未详';

  return (
    <section className="min-w-0 space-y-2 rounded-xl border border-indigo-400/25 bg-slate-900/70 p-3 text-slate-100 sm:p-4" aria-label="证词与名誉复核">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold text-indigo-100">证词与名誉复核</h3>
        <p className="break-words text-xs text-slate-300">{viewer ? `${viewer.name}当前可阅的本地公开案卷 · ${claims.length} 件` : '选择修士后查看其已获知的说法。'}</p>
        <p className="text-xs text-slate-400">原呈报与传话不计入独立证词。此处列当事人的说法，原案结果另查。</p>
      </header>
      {claims.length === 0 ? <p className="text-xs text-slate-400">{viewer ? '此修士当前没有可阅案卷。' : '未选中修士，不显示全局案卷。'}</p> : (
        <div className="max-h-[27rem] space-y-1.5 overflow-y-auto">
          {claims.map((claim) => {
            const status = STATUS[claim.status];
            const independent = new Map<string, Claim['attestations'][number]>();
            for (const entry of claim.attestations) {
              const previous = independent.get(entry.actorId);
              if (entry.actorId !== claim.claimantId && (!previous || previous.tick < entry.tick)) independent.set(entry.actorId, entry);
            }
            const firstHand = [...independent.values()].sort((a, b) => a.tick - b.tick || a.actorId.localeCompare(b.actorId));
            const supports = firstHand.filter(({ verdict }) => verdict === 'supports').length;
            const notice = viewer?.rumors.find((rumor) => (rumor.originEventId === claim.publicationEventId ||
              rumor.id === `rumor-${claim.publicationEventId}`) && rumor.witnessScope !== 'participants' &&
              rumor.originTick <= world.tick && rumor.learnedTick <= world.tick);
            const appeal = claim.appeal;
            const outstanding = claim.status === 'pending' || claim.status === 'disputed';
            return (
              <details key={claim.id} className="min-w-0 rounded border border-slate-800 bg-slate-950/60 p-2">
                <summary className="cursor-pointer break-words text-xs text-slate-100">
                  <span className={`font-semibold ${status.color}`}>{status.label}</span> · {name(claim.subjectId)}被指在比斗中落败
                </summary>
                <div className="mt-2 space-y-2 text-xs text-slate-300">
                  <p className="break-words">原呈报：{name(claim.claimantId)} · Tick #{claim.filedTick}</p>
                  <div className="space-y-1 border-t border-slate-800 pt-2">
                    <h4 className="font-semibold text-indigo-100">独立亲历证词 · {firstHand.length} 份</h4>
                    <p>支持 {supports} · 反驳 {firstHand.length - supports}</p>
                    {firstHand.length ? <ul className="space-y-1 text-slate-400">
                      {firstHand.map((entry) => <li key={entry.actorId} className="break-words">Tick #{entry.tick} · {name(entry.actorId)}：{entry.verdict === 'supports' ? '支持呈报' : '反驳呈报'}</li>)}
                    </ul> : <p className="text-slate-400">尚无独立证词。</p>}
                    {notice && (notice.provenance === 'conversation' || notice.provenance === 'flying_sword') ? (
                      <p className="text-slate-400">此修士由{notice.provenance === 'conversation' ? '当面转述' : '飞剑传书'}获知呈报，转手 {notice.hops} 次；不计入独立证词。</p>
                    ) : <p className="text-slate-400">转述不作为额外佐证。</p>}
                  </div>
                  <div className="space-y-1 border-t border-slate-800 pt-2">
                    <h4 className="font-semibold text-indigo-100">质疑与申诉</h4>
                    <p>证词期限 Tick #{claim.deadlineTick} · 申诉期限 Tick #{claim.challengeUntilTick}</p>
                    {challenges.has(claim.id) && <p>所选修士可在期限内提交申诉。</p>}
                    {appeal ? <p className="break-words">Tick #{appeal.tick} · {name(appeal.actorId)}申诉：{appeal.verdict === 'upheld' ? '申诉成立' : '申诉驳回'}</p>
                      : <p className="text-slate-400">{outstanding ? '暂无已记录的申诉结果。' : '无另行记录的申诉结果。'}</p>}
                    {claim.settledTick !== undefined && <p>结案 Tick #{claim.settledTick} · {status.label}</p>}
                    {(claim.reputationPenalty > 0 || claim.reputationRestored > 0) && <p>
                      宗门名誉扣减 {claim.reputationPenalty} · 实际恢复 {claim.reputationRestored}
                    </p>}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}
