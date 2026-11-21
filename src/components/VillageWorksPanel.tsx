import { VILLAGE_WORK_RULES, villageWorkReadiness } from '../engine/villageWorksEngine';
import type { MortalSettlement, VillageWorkProject, WorldState } from '../types/world';

const WORK_NAMES: Record<VillageWorkProject['kind'], string> = { well: '开凿水井', field: '开垦田地', shelter: '修建避难屋' };
const END: Record<NonNullable<VillageWorkProject['endReason']>, string> = {
  deadline: '工期已满', abandoned: '工程已停办', site_lost: '工址已失效',
};
const READINESS: Record<ReturnType<typeof villageWorkReadiness>, string> = {
  ready: '可继续施工', starting_tick: '初次登记，本轮未计工', hazard: '受灾害影响，暂缓施工', stress: '村镇压力过高，暂缓施工',
  labor_shortage: '成年劳力不足，暂缓施工', abandoned: '工程已停办', site_lost: '工址已失效', deadline: '工期已满', inactive: '工程不在施工期',
};

export function VillageWorksPanel({ world, village, projects }: {
  world: WorldState;
  village: MortalSettlement;
  projects: readonly VillageWorkProject[];
}) {
  const rows = projects.filter(({ settlementId, startedTick }) => settlementId === village.id && startedTick <= world.tick)
    .sort((a, b) => Number(b.status === 'building') - Number(a.status === 'building') || b.startedTick - a.startedTick);
  if (!rows.length) return null;
  const sects = new Map(world.sects.map(({ id, name }) => [id, name]));
  const sponsors = new Map(world.cultivators.map(({ id, name }) => [id, name]));

  return (
    <details className="min-w-0 rounded border border-emerald-400/20 bg-slate-950/55">
      <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-emerald-200">村镇工役与承载增长</summary>
      <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
        <p>村镇现有人口 {village.population} · 当前总承载 {village.capacity}。有住位不等于新增居民；只有完工才记入新增承载。此处只查看实际工役。</p>
        <ul aria-label="本村可查的工役项目" className="max-h-[29rem] space-y-2 overflow-y-auto">
          {rows.map((project) => {
            const rules = VILLAGE_WORK_RULES[project.kind];
            const readiness = project.status === 'building' ? villageWorkReadiness(world, project) : undefined;
            const { capacityBefore, capacityAfter } = project;
            const gain = project.status === 'completed' && capacityBefore !== undefined && capacityAfter !== undefined
              ? capacityAfter - capacityBefore : undefined;
            const status = project.status === 'completed' ? '已完工' : project.status === 'abandoned' ? '未完工，已结案'
              : readiness ? READINESS[readiness] : '施工中';
            const labor = project.receipts.filter(({ tick }) => tick <= world.tick).slice(-6).reverse();
            return (
              <li key={project.id} className="min-w-0 space-y-1 break-words rounded border border-slate-800 p-2">
                <h5 className="font-semibold text-emerald-100">{WORK_NAMES[project.kind]} · {status}</h5>
                <p>开工 Tick #{project.startedTick} · 施工截止 Tick #{project.deadlineTick}
                  {project.settledTick !== undefined && ` · 结案 Tick #${project.settledTick}`}
                </p>
                <p>{sects.get(project.sponsorSectId) ?? '宗门未详'}公库实付 {project.stonesSpent} 灵石 · {sponsors.get(project.sponsorId) ?? '赞助人'}自付玄土根 {project.rootsSpent} 株</p>
                <p>实记劳力 {project.laborTotal}/{rules.labor} 份工
                  {project.status === 'building' && ` · 若完工，可新增最多 ${rules.capacityGain} 人的承载`}
                </p>
                {gain !== undefined ? <p className="text-emerald-200">完工当时承载：{capacityBefore} → {capacityAfter}（新增 {gain}），不是人口增量。</p>
                  : project.status === 'abandoned' ? <p className="text-amber-200">{project.endReason ? END[project.endReason] : '工程未完成'}，未新增承载。</p> : null}
                {!!labor.length && <ol aria-label="近期实际成年劳力记工" className="list-inside list-disc space-y-1 text-slate-400">
                  {labor.map((entry, index) => <li key={index}>Tick #{entry.tick} · 计入 {entry.labor} 份工 · 当时合格成年劳力 {entry.adultsAvailable} 人</li>)}
                </ol>}
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
