import { SPARRING_MASTERY_MAX, SPARRING_QI_COST, visibleSparring } from '../engine/sparringEngine';
import type { Cultivator, SparringAgreement, WorldState } from '../types/world';

const STATUS: Record<SparringAgreement['status'], string> = {
  offered: '待应邀方同意', active: '双方已同意，协议进行中', completed: '已完成约定轮数',
  declined: '应邀方已拒绝', withdrawn: '邀约已撤回', yielded: '及时认输，切磋停止',
  expired: '期限已到，切磋结束', interrupted: '条件不再满足，切磋中断',
};

export function SparringPanel({ world, cultivator }: { world: WorldState; cultivator?: Cultivator }) {
  const viewer = world.cultivators.find(({ id }) => id === cultivator?.id);
  if (!viewer) return null;
  const rows = visibleSparring(world, viewer).filter(({ proposerId, partnerId, offeredTick }) =>
    offeredTick <= world.tick && (proposerId === viewer.id || partnerId === viewer.id));
  if (!rows.length) return null;
  const names = new Map(world.cultivators.map(({ id, name }) => [id, name]));
  return <details className="min-w-0 rounded border border-indigo-400/20 bg-slate-950/60">
    <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-indigo-200">同契切磋与及时认输</summary>
    <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
      <p>双方同意并在同一回合各自就绪，才会实际练习。每轮每人耗 {SPARRING_QI_COST} 点灵气，实增功法熟练度至多 {SPARRING_MASTERY_MAX} 点。不扣气血，不产生战利品、恶行处罚或大比积分。此处只读。</p>
      <ol className="max-h-64 space-y-1.5 overflow-y-auto" aria-label="本人切磋协议">
        {rows.slice().sort((a, b) => b.offeredTick - a.offeredTick).map((record) => {
          const ownProposal = record.proposerId === viewer.id;
          const partnerId = ownProposal ? record.partnerId : record.proposerId;
          return <li key={record.id} className="min-w-0 space-y-1 break-words rounded border border-slate-800 p-2">
            <p className="font-semibold text-indigo-100">{ownProposal ? '本人发起' : '本人受邀'} · {names.get(partnerId) ?? '练习伙伴未详'}</p>
            <SparringReceipt record={record} tick={world.tick} viewerId={viewer.id} />
          </li>;
        })}
      </ol>
    </div>
  </details>;
}

function SparringReceipt({ record, tick, viewerId }: { record: SparringAgreement; tick: number; viewerId: string }) {
  const accepted = record.acceptedTick !== undefined && record.acceptedTick <= tick;
  const closed = record.closedTick !== undefined && record.closedTick <= tick;
  const status = closed ? record.status : accepted ? 'active' : 'offered';
  const rounds = record.rounds.filter((round) => round.tick <= tick);
  const readiness = !closed && record.readiness?.tick === tick ? record.readiness : undefined;
  const memberLabel = (id: string) => id === viewerId ? '本人' : '对练伙伴';
  return <>
    <p>{STATUS[status]} · 约定最多 {record.roundsPlanned} 轮 · 实际练习 {rounds.length} 轮</p>
    <p>邀约 Tick #{record.offeredTick} · 应答截止 Tick #{record.offerExpiresTick} 前</p>
    {accepted && <p>双方同意 Tick #{record.acceptedTick}{record.deadlineTick !== undefined && ` · 练习截止 Tick #${record.deadlineTick} 前`}</p>}
    {readiness && <p>本回合已登记就绪：{readiness.actorIds.map(memberLabel).join('、') || '暂无'}（未等同实际练习）。</p>}
    {rounds.length > 0 && <ol className="space-y-0.5" aria-label="本协议实际练习凭证">
      {rounds.map((round) => <li key={round.tick} className="rounded bg-slate-900 px-2 py-1">
        <span className="font-medium text-indigo-100">实练 Tick #{round.tick}</span>
        {round.members.map(({ actorId, qiSpent, masteryGained }) =>
          <p key={actorId}>{memberLabel(actorId)}实耗 {qiSpent} 点灵气 · 功法熟练度实增 {masteryGained} 点</p>)}
      </li>)}
    </ol>}
    {closed && <p>停止 Tick #{record.closedTick}{(status === 'yielded' || status === 'withdrawn' || status === 'declined') &&
      record.closedById && ` · 由${memberLabel(record.closedById)}发起`}。停止后不再记新增练习。</p>}
  </>;
}
