import { visibleExpeditionRescues } from '../engine/expeditionRescueEngine';
import type { Cultivator, ExpeditionRescue, WorldState } from '../types/world';

type RescueView = ReturnType<typeof visibleExpeditionRescues>[number];
const STATUS: Record<ExpeditionRescue['status'], string> = {
  signaled: '已发出求援，尚未有人同意',
  extracting: '救援者已同意，正在实际撤离',
  rescued: '已到达经验证的永久出口',
  withdrawn: '求援已撤回',
  expired: '求援已过期',
  interrupted: '撤离中断，未完成救援',
};
const REASON: Record<NonNullable<ExpeditionRescue['reason']>, string> = {
  withdrawn: '求援方实际撤回',
  offer_expired: '求援期限已满，无人接受',
  gate_closed: '秘境门已关闭；不是完成撤离',
  participant_lost: '有参与者已无法继续',
  unsafe_route: '原路线或出口已不可安全通行',
};

export function ExpeditionRescuePanel({ world, cultivator }: { world: WorldState; cultivator?: Cultivator }) {
  const viewer = world.cultivators.find(({ id }) => id === cultivator?.id);
  if (!viewer) return null;
  const rows = visibleExpeditionRescues(world, viewer).filter((row) => row.openedTick <= world.tick);
  if (!rows.length) return null;

  return <details className="min-w-0 rounded border border-teal-400/20 bg-slate-950/60">
    <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-teal-100">秘境求援与实际撤离</summary>
    <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
      <p>仅显示本人有权查看的求援。有人同意不等于获救，沿路线抵达永久出口才会记为完成。本页只读。</p>
      <ol className="max-h-64 space-y-1.5 overflow-y-auto" aria-label="本人可查的求援与撤离凭证">
        {rows.map((row) => <RescueReceipt key={row.id} row={row} tick={world.tick}
          exitName={row.arrived && row.exitSiteId ? world.locations.find(({ id }) => id === row.exitSiteId)?.name : undefined} />)}
      </ol>
    </div>
  </details>;
}

const ROLE: Record<RescueView['role'], string> = { explorer: '本人为求援者', rescuer: '本人为救援者', witness: '本人当时可收到求援' };

function RescueReceipt({ row, tick, exitName }: { row: RescueView; tick: number; exitName?: string }) {
  const participant = row.role !== 'witness';
  const accepted = participant && row.acceptedTick !== undefined && row.acceptedTick <= tick;
  const finished = row.finishedTick !== undefined && row.finishedTick <= tick;
  const arrived = accepted && finished && row.arrived === true && (row.status === 'rescued' || row.reason === 'participant_lost');
  const displayStatus = (row.status === 'extracting' && !accepted) ||
    (!finished && row.status !== 'signaled' && row.status !== 'extracting')
    ? accepted ? 'extracting' : 'signaled' : row.status;
  const statusLabel = !participant && displayStatus === 'signaled' ? '现场曾收到求援信号'
    : displayStatus === 'rescued' && !arrived ? '尚无可验证的到达凭证'
      : arrived && displayStatus === 'interrupted' ? '本人实际到达，未完成全队撤离' : STATUS[displayStatus];
  return <li className="min-w-0 space-y-0.5 break-words rounded border border-slate-800 p-2">
    <p className="font-semibold text-teal-100">{ROLE[row.role]} · {statusLabel}</p>
    <p>求援 Tick #{row.openedTick} · 应援截止 Tick #{row.offerExpiresTick} 前</p>
    {accepted && <p>救援者实际同意 Tick #{row.acceptedTick}{row.supplySpent === 1 && ' · 救援者实耗 1 株翡翠灵叶。'}</p>}
    {accepted && (displayStatus === 'extracting' || arrived) && row.stepsDone !== undefined && row.stepsTotal !== undefined &&
      <p>实际已行进 {row.stepsDone}/{row.stepsTotal} 步{arrived ? '。' : '，未到出口。'}</p>}
    {arrived && <p>实际到达 Tick #{row.finishedTick}{exitName && ` · ${exitName}`}。</p>}
    {finished && (!arrived || row.reason) && <p>结束 Tick #{row.finishedTick}{row.reason && ` · ${REASON[row.reason]}`}。</p>}
  </li>;
}
