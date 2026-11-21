import {
  availableResearchActions, RESEARCH_DEPOSIT, RESEARCH_REQUIRED_RESEARCHERS, RESEARCH_REQUIRED_TURNS, RESEARCH_TOPICS, RESEARCH_WORK_COST, visibleResearchProjects,
} from '../engine/researchEngine';
import { knownMapLocations } from '../engine/terrainEngine';
import type { Cultivator, WorldState } from '../types/world';

type Project = WorldState['research']['projects'][number];
type Contribution = Project['contributors'][number];
const STATUS: Record<Project['status'], string> = { open: '共研进行中', completed: '已创法', expired: '到期未成' };
const REASONS: Record<NonNullable<Contribution['withdrawReason']>, string> = {
  injury: '负伤', assignment: '另有合法任务', relocation: '山门迁移', hardship: '现实困难', ineligible: '不再符合资格',
};
const amount = ({ stones, earthRoots }: Contribution['escrow']): string => `${stones} 灵石、玄土根 ${earthRoots} 株`;

export function SectResearchPanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator | undefined }) {
  const viewer = world.cultivators.find(({ id }) => id === cultivator?.id);
  const sect = world.sects.find(({ id }) => id === viewer?.sectId);
  const projects = world.research && sect && viewer ? visibleResearchProjects(world, viewer)
    .filter((item) => item.sectId === sect.id && item.startedTick <= world.tick)
    .sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open') || b.startedTick - a.startedTick) : [];
  const lawfulOptions = world.research && viewer && sect ? availableResearchActions(viewer, world) : [];
  const people = new Map(world.cultivators.map(({ id, name }) => [id, name]));
  const sites = new Map((viewer ? knownMapLocations(world, viewer) : []).map(({ id, name }) => [id, name]));
  const names = (id: string) => people.get(id) ?? '姓名未详';

  return (
    <section aria-label="本宗论道会与共研创法" className="min-w-0 space-y-2 rounded-xl border border-teal-400/25 bg-slate-900/70 p-3 text-slate-100 sm:p-4">
      <header className="space-y-1">
        <h4 className="text-sm font-semibold text-teal-100">本宗论道会与共研创法</h4>
        <p className="break-words text-xs text-slate-300">{sect ? `${sect.name} · Tick #${world.tick}` : viewer ? '散修无本宗论道会。' : '选中修士后查看所属宗门的共研课题。'}</p>
        {sect && <p className="text-xs text-slate-400">只读。以已登记的出资、实际工作与藏经阁实物为准。</p>}
      </header>
      {sect && !projects.length && <p className="text-xs text-slate-400">本宗暂无可阅共研课题。</p>}
      <div className="max-h-[30rem] space-y-2 overflow-y-auto">
        {projects.map((project) => {
          const topic = RESEARCH_TOPICS[project.topic];
          const lawfulWithdrawal = lawfulOptions.flatMap((option) => option.researchMove === 'withdraw' && option.targetResearchId === project.id && option.researchWithdrawReason ?
            [REASONS[option.researchWithdrawReason]] : []);
          const work = project.contributors.reduce((sum, row) => sum + row.workTurns, 0);
          const result = project.discoveryTechniqueId && sect?.pavilion.find(({ id }) => id === project.discoveryTechniqueId);
          return (
            <details key={project.id} className="min-w-0 rounded border border-slate-800 bg-slate-950/55">
              <summary className="min-h-11 cursor-pointer break-words px-3 py-2 text-xs font-semibold text-teal-100">{topic.label} · {STATUS[project.status]}</summary>
              <div className="space-y-2 border-t border-slate-800 p-3 text-xs text-slate-300">
                <p className="break-words">核定课题：{topic.question}</p>
                <p className="break-words">发起：{names(project.proposerId)}{sites.has(project.locationId) ? ` · ${sites.get(project.locationId)}` : ''} · Tick #{project.startedTick}
                  {project.settledTick !== undefined ? ` · 实际结项 Tick #${project.settledTick}` : ` · 截止 Tick #${project.deadlineTick}`}</p>
                <div className="space-y-1 border-t border-slate-800 pt-2">
                  <h5 className="font-semibold text-teal-100">研究份额与工料</h5>
                  <p>标准出资：{amount(RESEARCH_DEPOSIT)}；每轮实作消耗 {amount(RESEARCH_WORK_COST)}。</p>
                  <p>创法条件：至少 {RESEARCH_REQUIRED_RESEARCHERS} 名修士有实作，累计至少 {RESEARCH_REQUIRED_TURNS} 轮。已记录实作 {work} 轮。</p>
                  {lawfulWithdrawal.length > 0 && <p className="text-teal-200">本时点所选修士可按规则退出：{lawfulWithdrawal.join('、')}。</p>}
                  {project.contributors.length > 0 ? <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                    {project.contributors.map((record) => {
                      const withdrawn = record.withdrawnTick !== undefined && record.withdrawnTick <= world.tick;
                      const settled = withdrawn || project.settledTick !== undefined && project.settledTick <= world.tick;
                      const refund = {
                        stones: Math.max(0, RESEARCH_DEPOSIT.stones - record.escrow.stones - record.spent.stones),
                        earthRoots: Math.max(0, RESEARCH_DEPOSIT.earthRoots - record.escrow.earthRoots - record.spent.earthRoots),
                      };
                      return <li className="min-w-0 space-y-1 break-words rounded bg-slate-900 p-2" key={record.actorId}>
                        <p>{names(record.actorId)} · 加入 Tick #{record.joinedTick} · 实作 {record.workTurns} 轮
                          {record.lastWorkedTick !== undefined ? ` · 最近实作 Tick #${record.lastWorkedTick}` : ''}</p>
                        <p className="text-slate-400">当前托管：{amount(record.escrow)}；已消耗：{amount(record.spent)}。</p>
                        {settled && <p className="text-slate-400">结算退回余料：{amount(refund)}。</p>}
                        {withdrawn && <p className="text-teal-200">已按规则退出 · Tick #{record.withdrawnTick}{record.withdrawReason ? ` · ${REASONS[record.withdrawReason]}` : ''}</p>}
                      </li>;
                    })}
                  </ul> : <p className="text-slate-400">暂无已登记贡献者。</p>}
                </div>
                <div className="space-y-1 border-t border-slate-800 pt-2">
                  <h5 className="font-semibold text-teal-100">实证阁藏成果</h5>
                  {result ? <p className="break-words text-emerald-200">此时点本宗藏经阁可核对：{result.name} · 灵根 {result.spiritRoot}</p> :
                    <p className="text-slate-400">{project.discoveryTechniqueId ? '有创法记录，但此时点本宗阁中未见对应实物。' : '此时点尚无已核实阁藏成果。'}</p>}
                  {project.discoveryLocationId && sites.has(project.discoveryLocationId) && <p className="break-words text-slate-400">记录入阁地点：{sites.get(project.discoveryLocationId)}</p>}
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
