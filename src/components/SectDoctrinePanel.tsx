import { DOCTRINE_LABELS, doctrineSupport } from '../engine/doctrineEngine';
import type { Cultivator, WorldState } from '../types/world';

type Doctrine = WorldState['doctrines'];
type School = Doctrine['schools'][number];
type History = Doctrine['records'][number];
type Proposal = Doctrine['proposals'][number];
const STATUS: Record<School['status'], string> = { attached: '隶属宗门', autonomous: '自主道统', reconciled: '已归和' };
const PROPOSALS: Record<Proposal['kind'], string> = { separation: '和平分立', reconciliation: '宗门归和' };
const OUTCOMES: Record<Proposal['status'], string> = {
  pending: '协商中', accepted: '已接受', declined: '已拒绝', expired: '已到期', invalidated: '条件变化，已失效',
};
const HISTORY: Record<History['kind'], string> = {
  endorse: '表明支持', proposal: '提出协商', separation: '和平分立', reconciliation: '宗门归和', declined: '协商遭拒',
  expired: '协商期满', invalidated: '议案失效', join: '加入道统', leave: '退出道统', training: '道统研修',
};
const movement = (row: History) => {
  if (row.amount <= 0) return '';
  if (row.kind === 'separation') return ` · 本宗拨入道统 ${row.amount} 灵石`;
  if (row.kind === 'reconciliation') return ` · 道统交还本宗 ${row.amount} 灵石`;
  if (row.kind === 'training') return ` · 研修实际支出 ${row.amount} 灵石`;
  return '';
};

export function SectDoctrinePanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator | undefined }) {
  const viewer = world.cultivators.find(({ id }) => id === cultivator?.id);
  const sect = world.sects.find(({ id }) => id === viewer?.sectId);
  const local = sect ? (world.doctrines?.schools ?? []).filter(({ parentSectId, foundedTick }) => parentSectId === sect.id && foundedTick <= world.tick)
    .sort((a, b) => b.foundedTick - a.foundedTick || a.id.localeCompare(b.id)) : [];
  const people = new Map(world.cultivators.map((actor) => [actor.id, actor]));
  const names = (id: string) => people.get(id)?.name ?? '姓名未详';

  return (
    <section aria-label="道统与分合档案" className="min-w-0 space-y-2 rounded-xl border border-teal-400/25 bg-slate-900/70 p-3 text-slate-100 sm:p-4">
      <header className="space-y-1">
        <h4 className="text-sm font-semibold text-teal-100">道统与分合档案</h4>
        <p className="break-words text-xs text-slate-300">{sect ? `${sect.name} · Tick #${world.tick} · ${local.length} 支道统` : viewer ? '散修暂无本宗道统档案。' : '选中修士后查看所属宗门的公开道统。'}</p>
        <p className="text-xs text-slate-400">仅列公开表态、证据计数与已记载的交割，不显示私人心声或记忆原文。有效支持不按门中位阶加权。</p>
      </header>
      {sect && local.length === 0 && <p className="text-xs text-slate-400">本宗尚无公开道统记录。</p>}
      {local.map((school) => {
        const support = doctrineSupport(world, school);
        const supporters = new Set(support.supporterIds);
        const evidence = [...new Map(world.doctrines.endorsements.filter((entry) => entry.schoolId === school.id &&
          entry.sectId === school.parentSectId && entry.theme === school.theme && supporters.has(entry.actorId) && entry.tick <= world.tick)
          .sort((a, b) => a.tick - b.tick).map((entry) => [entry.actorId, entry])).values()];
        const proposals = world.doctrines.proposals.filter(({ schoolId, openedTick }) => schoolId === school.id && openedTick <= world.tick)
          .sort((a, b) => b.openedTick - a.openedTick || b.id.localeCompare(a.id));
        const history = world.doctrines.records.filter(({ schoolId, tick }) => schoolId === school.id && tick <= world.tick)
          .sort((a, b) => a.tick - b.tick || a.id.localeCompare(b.id));
        const samples = history.slice(-6);
        const scale = Math.max(1, ...samples.map(({ support }) => support));
        const liveMembers = school.memberIds.filter((id) => people.get(id)?.alive).length;
        return (
          <details key={school.id} className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/60">
            <summary className="min-h-11 cursor-pointer break-words px-3 py-2 text-xs font-semibold text-teal-100">
              {DOCTRINE_LABELS[school.theme]} · {STATUS[school.status]} · 有效支持 {support.supporters} 人
            </summary>
            <div className="space-y-2 border-t border-slate-800 p-3 text-xs text-slate-300">
              <p className="break-words">发起：{names(school.founderId)} · 始于 Tick #{school.foundedTick}{school.stewardId ? ` · 主持：${names(school.stewardId)}` : ''}</p>
              <dl className="grid grid-cols-2 gap-2">
                <div className="rounded bg-slate-900 p-2"><dt className="text-slate-400">在世成员</dt><dd>{liveMembers} 人</dd></div>
                <div className="rounded bg-slate-900 p-2"><dt className="text-slate-400">道统公库余额</dt><dd>{school.treasury} 灵石</dd></div>
              </dl>
              {school.status === 'autonomous' && <p className="text-slate-400">自治学舍有独立公库；成员保留原宗籍，加入和退出均须自愿。</p>}
              <div className="space-y-1 border-t border-slate-800 pt-2">
                <h5 className="font-semibold text-teal-100">有效支持与分立门槛</h5>
                <p>有效支持 {support.supporters} 人 · 可参与 {support.eligibleMembers} 人 · 至少需 {support.threshold} 人</p>
                <progress className="h-2 w-full accent-teal-400" aria-label="相对分立门槛的有效支持" max={Math.max(1, support.threshold)} value={Math.min(support.supporters, support.threshold)} />
                {school.status === 'attached' && <p className="text-slate-400">{support.supporters >= support.threshold ? '达到人数门槛，是否分立仍由协商决定。' : '尚未达到分立人数门槛。'}</p>}
                {evidence.length > 0 && <details>
                  <summary className="min-h-11 cursor-pointer py-2 text-slate-300">查看有效公开表态 · {evidence.length} 条</summary>
                  <ul className="max-h-44 space-y-1 overflow-y-auto text-slate-400">
                    {evidence.map((entry) => <li key={`${entry.actorId}:${entry.tick}`} className="break-words">
                      {names(entry.actorId)} · 证据计数 {entry.evidenceCount} · 表态评分 {entry.score} · Tick #{entry.tick}
                    </li>)}
                  </ul>
                </details>}
              </div>
              <div className="space-y-1 border-t border-slate-800 pt-2">
                <h5 className="font-semibold text-teal-100">协商、表态与交割</h5>
                {!proposals.length ? <p className="text-slate-400">尚无协商。</p> : <ul className="space-y-1">
                  {proposals.slice(0, 8).map((item) => <li key={item.id} className="space-y-1 rounded bg-slate-900 p-2">
                    <p>{PROPOSALS[item.kind]} · {OUTCOMES[item.status]} · Tick #{item.openedTick}</p>
                    <p className="break-words text-slate-400">当事者：{names(item.stewardId)}、{names(item.leaderId)} · 协议金额 {item.amount} 灵石
                      {item.status === 'pending' ? ` · Tick #${item.expiresTick} 前有效` : item.settledTick !== undefined ? ` · Tick #${item.settledTick} 结案` : ''}</p>
                    {item.votes.filter(({ tick }) => tick <= world.tick).map((vote) => <p key={`${vote.actorId}:${vote.tick}`} className="break-words">
                      {names(vote.actorId)}：{vote.verdict === 'accept' ? '明确接受' : '明确拒绝'} · Tick #{vote.tick}
                    </p>)}
                  </li>)}
                </ul>}
              </div>
              <div className="space-y-1 border-t border-slate-800 pt-2">
                <h5 className="font-semibold text-teal-100">道统历史与支持变化</h5>
                {!history.length ? <p className="text-slate-400">尚无演变记录。</p> : <>
                  <ol className="space-y-1" aria-label="近六次实录的支持人数">
                    {samples.map((row) => <li key={row.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                      <span>Tick #{row.tick}</span><progress aria-label={`Tick ${row.tick} 支持人数`} className="h-2 w-full accent-teal-400" value={row.support} max={scale} />
                      <span>支持 {row.support} 人</span>
                    </li>)}
                  </ol>
                  <ul className="mt-1 max-h-44 space-y-1 overflow-y-auto text-slate-400" aria-label="道统事项历史">
                    {history.slice().reverse().map((row) => <li className="break-words" key={row.id}>
                      Tick #{row.tick} · {HISTORY[row.kind]}{movement(row)}{row.actorIds.length ? ` · ${row.actorIds.length} 位参与者` : ''}
                    </li>)}
                  </ul>
                </>}
                {school.lastTrainingTick !== undefined && school.lastTrainingTick <= world.tick && <p>最近实办研修：Tick #{school.lastTrainingTick}</p>}
              </div>
            </div>
          </details>
        );
      })}
    </section>
  );
}
