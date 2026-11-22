import {WaypostMealRead,type WaypostMealControls} from './WaypostMealRead';
import {visibleWaypostMeals} from '../engine/waypostMealEngine';
import { PILGRIMAGE_LEG_COST, PILGRIMAGE_RELIEF_HP, visiblePilgrimages } from '../engine/pilgrimageEngine';
import type { Cultivator, PilgrimageCamp, PilgrimageJourney, WorldState } from '../types/world';
import { visibleRoadCrossings } from '../engine/roadEngine';

const STATUS: Record<PilgrimageJourney['status'], string> = {
  proposed: '同行邀约待回应', active: '巡礼进行中', completed: '已完成巡礼',
  declined: '同行者已拒绝', expired: '已过期', withdrawn: '已退出', interrupted: '巡礼中断',
};
const END: Record<NonNullable<PilgrimageJourney['reason']>, string> = {
  declined: '同行者未同意', offer_expiry: '邀约期满，未获得同意', journey_expiry: '巡礼期限已到',
  withdrawn: '一位参与者主动退出', lost_site: '原路线站点已失效', member_missing: '至少一位同行者无法继续',
};

export function PilgrimagePanel({ world, cultivator, mealControls }: { world: WorldState; cultivator?: Cultivator; mealControls?:WaypostMealControls }) {
  const selected = cultivator&&world.cultivators.includes(cultivator)?cultivator:undefined;
  const rows = visiblePilgrimages(world, selected).sort((a, b) => (
    Number(b.journey.status === 'active' || b.journey.status === 'proposed') -
    Number(a.journey.status === 'active' || a.journey.status === 'proposed')
  ) || b.journey.proposedTick - a.journey.proposedTick);
  if (!selected || rows.length === 0) return null;
  const meals=visibleWaypostMeals(world,selected);
  const crossings = visibleRoadCrossings(world, selected).filter(({ departedTick }) => departedTick <= world.tick);
  const people = new Map(world.cultivators.map(({ id, name }) => [id, name]));
  const sites = new Map(world.locations.map(({ id, name }) => [id, name]));

  return (
    <section aria-label="本人巡礼与共愿档案" className="min-w-0 space-y-2 rounded-xl border border-teal-400/25 bg-slate-900/70 p-3 text-slate-100 sm:p-4">
      <header className="space-y-1">
        <h4 className="text-sm font-semibold text-teal-100">本人巡礼与共愿档案</h4>
        <p className="break-words text-xs text-slate-300">{selected.name} · Tick #{world.tick}</p>
        <p className="text-xs leading-relaxed text-slate-400">须由同地的受邀修士自行接受。两段实际启程各耗每人 {PILGRIMAGE_LEG_COST} 灵石；途中不能远程施援。到站后每人每站最多用一株翡翠灵叶施援，为同伴回复最多 {PILGRIMAGE_RELIEF_HP} 点气血。行程凭据只供查阅。</p>
      </header>
      <div className="max-h-[29rem] space-y-2 overflow-y-auto">
        {rows.map(({ journey, checkpoint, knownStopIds }) => {
          const known = new Set(knownStopIds);
          const stopName = (id: string) => known.has(id) ? sites.get(id) ?? '旧站名称已不可查' : '此时点不可查的站点';
          const visited = new Map(journey.stopsVisited.filter(({ tick }) => tick <= world.tick).map(({ locationId, tick }) => [locationId, tick]));
          const aid = journey.aid.filter(({ tick }) => tick <= world.tick);
          const routeDone = journey.stopIds.slice(1).filter((id) => visited.has(id)).length;
          const accepted = journey.startedTick !== undefined && journey.startedTick <= world.tick;
          const currentLeg = journey.legIndex + 1;
          const other = people.get(journey.organizerId === selected.id ? journey.companionId : journey.organizerId) ?? '同行者姓名未详';
          return (
            <details key={journey.id} className="min-w-0 rounded border border-slate-800 bg-slate-950/55">
              <summary className="min-h-11 cursor-pointer break-words px-3 py-2 text-xs font-semibold text-teal-100">
                {STATUS[journey.status]} · {journey.organizerId === selected.id ? '本人发起' : '本人受邀'} · {other}
              </summary>
              <div className="space-y-2 break-words px-3 pb-3 text-xs leading-relaxed text-slate-300">
                <p>发出邀约：Tick #{journey.proposedTick} · 回应截止 Tick #{journey.offerExpiresTick}</p>
                {accepted && <p>同行者已接受 · Tick #{journey.startedTick}{journey.expiresTick !== undefined && ` · 巡礼截止 Tick #${journey.expiresTick}`}</p>}
                {journey.reason && <p>结案：{END[journey.reason]}{journey.settledTick !== undefined && ` · Tick #${journey.settledTick}`}</p>}
                {journey.status === 'completed' && journey.settledTick !== undefined && <p>实际完成：Tick #{journey.settledTick}</p>}
                <p>实际已到检查站：{routeDone}/2 · 每人已实付：{journey.spentByEach} 灵石（不含另列的路权费）</p>
                {journey.status === 'active' && checkpoint && currentLeg <= 2 && <p className="text-teal-200">正在第 {currentLeg} 段路上，尚未抵达下一站。</p>}
                {crossings.filter(({ journeyId }) => journeyId === journey.id).map((crossing) => {
                  const freeTicks = Math.ceil(crossing.freeSteps / crossing.freeStride);
                  const paidTicks = Math.ceil(crossing.paidSteps / crossing.stride);
                  const arrivalTick = visited.get(journey.stopIds[crossing.legIndex + 1]);
                  return <div key={crossing.id} className="rounded border border-teal-400/20 px-2 py-1.5">
                    <p className="font-medium text-teal-100">第 {crossing.legIndex + 1} 段驿路启程凭证 · Tick #{crossing.departedTick}</p>
                    <p>{crossing.payerId === selected.id ? '本人' : '发起人'}实付路权费 {crossing.fee} 灵石（一次；同行者未另付）。</p>
                    <p>启程时估算：驿路 {crossing.paidSteps} 步 / {paidTicks} 轮行进；普通路线 {crossing.freeSteps} 步 / {freeTicks} 轮行进（不另收路权费）。</p>
                    {arrivalTick !== undefined ? <p>实际到站 Tick #{arrivalTick}。</p> : <p>尚无实际到站记录。</p>}
                  </div>;
                })}
                <PilgrimageCampReceipts camps={journey.camps} tick={world.tick} viewerId={selected.id} />
                <WaypostMealRead key={mealControls?.scopeKey??selected.id} meals={meals} journey={journey} actor={selected}
                  people={people} tick={world.tick} controls={mealControls}/>
                <ol aria-label="按顺序查看起点和两处检查站" className="space-y-1">
                  {journey.stopIds.map((id, index) => {
                    const tick = visited.get(id);
                    return <li key={index}>{index === 0 ? '会合起点' : `检查站 ${index}`}：{stopName(id)} · {tick === undefined ? '尚未到站' : `实际到站 Tick #${tick}`}</li>;
                  })}
                </ol>
                <div className="border-t border-slate-800 pt-2">
                  <p className="font-medium text-teal-100">实录同行施援</p>
                  {aid.length > 0 ? (
                    <ol className="list-inside list-disc space-y-1">
                      {aid.map((relief, index) => (
                        <li key={index}>Tick #{relief.tick} · {stopName(relief.locationId)} · {relief.giverId === selected.id ? '本人施援' : '同行者施援'}
                          {relief.receiverId === selected.id ? '给本人' : '给同行者'} · 实际恢复 {relief.hpRestored} 点气血</li>
                      ))}
                    </ol>
                  ) : <p className="text-slate-400">尚无实际施援记录。</p>}
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

const CAMP_STATUS: Record<PilgrimageCamp['status'], string> = {
  pitched: '已搭营', resumed: '已核验接续并撤营', dismantled: '已撤营，未记接续',
  expired: '营地已过期，未记接续', interrupted: '行程中断，未记接续',
};

function PilgrimageCampReceipts({ camps, tick, viewerId }: { camps?: PilgrimageCamp[]; tick: number; viewerId: string }) {
  const receipts = camps?.filter(({ openedTick }) => openedTick <= tick) ?? [];
  if (!receipts.length) return null;
  return <details className="min-w-0 rounded border border-teal-400/20 bg-slate-950/60">
    <summary className="min-h-11 cursor-pointer break-words px-2 py-2 text-xs font-semibold text-teal-100">途中夜宿营地凭证</summary>
    <div className="space-y-1.5 px-2 pb-2">
      <p>只是旅途中的临时歇脚点，不新增目的地，也不取得地权。须在原检查点核验后才可接续。</p>
      <ol aria-label="本人可查的巡礼夜宿实录" className="space-y-1.5">
        {receipts.map((camp) => {
          const closed = camp.closedTick !== undefined && camp.closedTick <= tick;
          const elapsedThrough = closed ? camp.closedTick! : tick;
          const heldNight = elapsedThrough > camp.openedTick;
          const status = closed ? camp.status : 'pitched';
          const recovered = status === 'resumed' ? camp.recovery?.filter(({ hp }) => hp > 0) : undefined;
          return <li key={`${camp.legIndex}:${camp.openedTick}`} className="min-w-0 rounded border border-slate-800 p-2">
            <p className="font-medium text-teal-100">第 {camp.legIndex + 1} 段途中 · {CAMP_STATUS[status]}</p>
            <p>搭营 Tick #{camp.openedTick} · {camp.payerId === viewerId ? '本人' : '同行者'}已实用 1 株玄土根。</p>
            <p>{heldNight ? '已过一夜。' : '尚未过夜。'}
              {closed && ` 结案 Tick #${camp.closedTick}。`}</p>
            {recovered?.map(({ actorId, hp }) => <p key={actorId}>{actorId === viewerId ? '本人' : '同行者'}实际恢复 {hp} 点气血。</p>)}
          </li>;
        })}
      </ol>
    </div>
  </details>;
}
