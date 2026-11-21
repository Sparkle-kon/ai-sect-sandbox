import { PROBATION_REQUIRED_RELIEF, PROBATION_REQUIRED_REVIEWS, visibleProbationCases } from '../engine/probationEngine';
import { knownMapLocations } from '../engine/terrainEngine';
import type { Cultivator, WorldState } from '../types/world';

type Case = ReturnType<typeof visibleProbationCases>[number];
const STATUS: Record<Case['status'], string> = {
  requested: '本人已申请，等待宗门接纳', active: '见习与复核进行中', ready: '复核通过，仍待本人确认',
  reinstated: '已由本人确认复籍', withdrawn: '本人已退出', rejected: '未获通过', expired: '已到期',
};
const END: Record<NonNullable<Case['reason']>, string> = {
  withdrawn: '本人主动撤回', deadline: '等待或见习期满', new_misconduct: '出现新的违纪记录',
  unavailable: '相关人员或宗门条件不再满足', review_oppose: '独立复核有反对票',
};

export function ProbationPanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator }) {
  const selected = world.cultivators.find(({ id }) => id === cultivator.id);
  if (!selected) return null;
  const cases = visibleProbationCases(world, selected).filter(({ requestedTick }) => requestedTick <= world.tick)
    .sort((a, b) => b.requestedTick - a.requestedTick);
  const expulsions = world.probation.expulsions;
  const own = expulsions.filter(({ actorId, tick }) => actorId === selected.id && tick <= world.tick).sort((a, b) => b.tick - a.tick);
  if (!cases.length && !own.length) return null;
  const names = new Map(world.cultivators.map(({ id, name }) => [id, name]));
  const sects = new Map(world.sects.map(({ id, name }) => [id, name]));
  const known = new Set(knownMapLocations(world, selected).map(({ id }) => id));
  const villages = new Map(world.settlements.villages.filter(({ locationId }) => known.has(locationId)).map(({ id, name }) => [id, name]));
  const person = (id: string) => names.get(id) ?? '修士未详';

  return (
    <details className="min-w-0 rounded border border-amber-400/20 bg-slate-950/60">
      <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-amber-200">赎责见习与宗籍复核</summary>
      <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
        <p>此处只查有权阅览的游戏记录。原议会处分保留；实际赈济和独立复核只是见习依据，复籍必须另由申请人本人确认。</p>
        {own.length > 0 && <ol aria-label="本人原宗门处分留档" className="max-h-40 space-y-1 overflow-y-auto">
          {own.map((record) => <li key={record.id} className="break-words rounded bg-slate-900/75 p-2">
            原议会除名：{sects.get(record.sectId) ?? '原宗门未详'} · Tick #{record.tick} · 当时违纪 {record.transgressions} 次
            {record.reinstatedTick !== undefined && record.reinstatedTick <= world.tick && ` · 本人复籍 Tick #${record.reinstatedTick}，原处分不改`}
          </li>)}
        </ol>}
        {cases.length === 0 ? <p className="text-slate-400">尚无可查的自愿见习申请。</p> : (
          <ol aria-label="可查的实际见习申请与复核" className="max-h-[26rem] space-y-2 overflow-y-auto">
            {cases.map((entry) => {
              const applicant = entry.actorId === selected.id;
              const original = expulsions.find(({ id, actorId, sectId, tick }) =>
                id === entry.expulsionId && actorId === entry.actorId && sectId === entry.sectId && tick <= world.tick);
              const relief = entry.relief.filter(({ tick, actorId, settlementId }) =>
                tick <= world.tick && actorId === entry.actorId && entry.villageIds.includes(settlementId));
              const distinctSites = new Set(relief.map(({ settlementId }) => settlementId)).size;
              const votes = entry.reviews.filter(({ tick }) => tick <= world.tick);
              return (
                <li key={entry.id} className="min-w-0 space-y-1.5 break-words rounded border border-slate-800 p-2">
                  <h5 className="font-semibold text-amber-100">{applicant ? '本人见习' : `获准核阅 · 申请人 ${person(entry.actorId)}`} · {STATUS[entry.status]}</h5>
                  <p>拟复籍宗门：{sects.get(entry.sectId) ?? '宗门未详'} · 申请 Tick #{entry.requestedTick}
                    {entry.status === 'requested' && ` · 申请有效至 Tick #${entry.requestExpiresTick} 前`}
                  </p>
                  {original && !applicant && <p>原议会除名 Tick #{original.tick} · 当时违纪 {original.transgressions} 次。</p>}
                  {entry.admittedTick !== undefined && entry.admittedTick <= world.tick
                    ? <p>见习实际接纳 Tick #{entry.admittedTick}{entry.sponsorId && ` · 担保人 ${person(entry.sponsorId)}`}
                      {entry.deadlineTick !== undefined && ` · 见习截止 Tick #${entry.deadlineTick}`}
                    </p> : <p className="text-slate-400">尚无宗门同意接纳的凭证。</p>}
                  <p>见习计划：{entry.villageIds.map((id) => villages.get(id) ?? '地点未观测').join('、')}。</p>
                  <p>实际赈济：{distinctSites}/{PROBATION_REQUIRED_RELIEF} 处不同村镇。</p>
                  {relief.length > 0 && <ol aria-label="实际赈济凭证" className="list-inside list-disc space-y-1">
                    {relief.map((entry) => <li key={entry.sourceId}>Tick #{entry.tick} · {villages.get(entry.settlementId) ?? '凭证地点未观测'}
                      { ` · 实付 ${entry.stones} 灵石、翡翠灵叶 ${entry.herbs} 株`}
                    </li>)}
                  </ol>}
                  <p>独立复核实收：{new Set(votes.map(({ reviewerId }) => reviewerId)).size}/{PROBATION_REQUIRED_REVIEWS} 份。</p>
                  {votes.length > 0 ? <ol aria-label="独立复核意见" className="list-inside list-disc space-y-1">
                    {votes.map(({ reviewerId, tick, vote }) =>
                      <li key={reviewerId}>Tick #{tick} · {person(reviewerId)} · {vote === 'support' ? '支持复籍' : '反对复籍'}</li>)}
                  </ol> : <p className="text-slate-400">暂无可查的独立复核意见。</p>}
                  {entry.reason && <p>结案：{END[entry.reason]}{entry.settledTick !== undefined && ` · Tick #${entry.settledTick}`}</p>}
                  {entry.status === 'reinstated' && entry.settledTick !== undefined && <p>本人最终确认 Tick #{entry.settledTick}，历史记录仍保留。</p>}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </details>
  );
}
