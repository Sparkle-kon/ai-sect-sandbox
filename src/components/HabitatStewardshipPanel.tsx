import {
  HABITAT_RESTORE_ROOTS,
  HABITAT_RESTORE_STONES,
  visibleHabitats,
} from '../engine/habitatEngine';
import type { Cultivator, WorldState } from '../types/world';

export function HabitatStewardshipPanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator }) {
  const viewer = world.cultivators.find(({ id }) => id === cultivator.id);
  const rows = visibleHabitats(world, viewer);
  if (rows.length === 0) return null;
  const people = new Map(world.cultivators.map(({ id, name }) => [id, name]));
  const sects = new Map(world.sects.map(({ id, name }) => [id, name]));
  const names = new Map((world.spiritBeasts ?? []).map(({ id, name }) => [id, name]));
  const sites = new Map(world.locations.map(({ id, name }) => [id, name]));

  return (
    <details className="min-w-0 rounded border border-emerald-400/20 bg-slate-950/55">
      <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-emerald-200">灵兽栖息地与放归</summary>
      <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
        <p>放归只解除一只灵兽的契约，不新增个体。野生数量是本地当前观测，复见只证实一次到场观察，不代表个体一直留在原地。此页只读。</p>
        <ul aria-label="可查的栖息地与放归记录" className="max-h-[27rem] space-y-2 overflow-y-auto">
          {rows.map(({ siteId, capacity, wildOccupancy, restoration, releases }) => {
            const local = capacity !== undefined && wildOccupancy !== undefined;
            const active = restoration && restoration.endedTick === undefined && world.tick < restoration.expiresTick;
            return (
              <li key={siteId} className="min-w-0 space-y-1.5 break-words rounded border border-slate-800 p-2">
                <h5 className="font-semibold text-slate-100">{sites.get(siteId) ?? '旧址名称已不可查'}</h5>
                {local ? <p>本地现有野生灵兽：{wildOccupancy} 只 · 当前承载上限：{capacity} 只</p>
                  : <p className="text-slate-400">仅本人旧放归记录；此时点无当地数量或承载观测。</p>}
                {restoration && <>
                  <p>{people.get(restoration.stewardId) ?? '护养者姓名未详'}修复 · Tick #{restoration.restoredTick} · {sects.get(restoration.sponsorSectId) ?? '出资宗门未详'}实付 {HABITAT_RESTORE_STONES} 灵石，护养者实付玄土根 {HABITAT_RESTORE_ROOTS} 株</p>
                  <p className={active ? 'text-emerald-200' : 'text-slate-400'}>
                    {active ? `修复有效 · 到期 Tick #${restoration.expiresTick}` : `修复结束 · ${restoration.endReason === 'site_lost' ? '原址已失效' : '修复已到期'} · Tick #${restoration.endedTick ?? restoration.expiresTick}`}
                  </p>
                </>}
                {releases.length === 0 ? <p className="text-slate-400">没有可查的放归凭证。</p> : (
                  <ol aria-label="独立放归凭证与复见" className="space-y-1.5">
                    {[...releases].sort((a, b) => b.releasedTick - a.releasedTick).map((entry) => (
                      <li key={entry.id} className="rounded bg-slate-900/80 px-2 py-1.5">
                        <p className="font-medium text-slate-100">{names.get(entry.beastId) ?? '已记录的灵兽'} · 放归 Tick #{entry.releasedTick}
                          {entry.formerOwnerId === viewer?.id && ' · 本人放归'}
                        </p>
                        {entry.status === 'sighted' && entry.observation && entry.observation.tick <= world.tick ? (
                          <p className="text-emerald-200">{people.get(entry.observation.observerId) ?? '观察者姓名未详'}复见 · Tick #{entry.observation.tick} · 目击时气血 {entry.observation.hp} 点</p>
                        ) : entry.status === 'monitoring' && world.tick < entry.deadlineTick ? (
                          <p>等待到场复查 · Tick #{entry.earliestSurveyTick} 起，Tick #{entry.deadlineTick} 前 · 尚无复见</p>
                        ) : (
                          <p className="text-slate-400">未获复见，不等于死亡或仍在此地{entry.settledTick !== undefined && ` · 记录结束 Tick #${entry.settledTick}`}</p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
