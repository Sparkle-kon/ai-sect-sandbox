import {TournamentArenaRead,type TournamentArenaControls} from './TournamentArenaRead';
import {projectTournamentArena} from '../engine/tournamentArenaEngine';
import type { Cultivator, WorldState } from '../types/world';
import { canSeeOccasion, projectExpeditionOmens, type ExpeditionOmenView } from '../engine/expeditionOmenEngine';
import { isOpenOccasion, OCCASION_KIND, OCCASION_STATUS } from './occasionLabels';
export { isOpenOccasion, OCCASION_KIND, OCCASION_STATUS } from './occasionLabels';

type Occasion = WorldState['occasions'][number];

const EXPEDITION_OUTCOMES: Record<Occasion['expeditions'][number]['outcome'], string> = {
  loot: '获得机缘',
  wounded: '负伤',
  death: '陨落',
  escaped: '撤离',
};
const OMEN_STATUS: Record<ExpeditionOmenView['status'], string> = {
  watching: '候访窗口，尚无开门实录',
  open: '已核实秘境开启',
  missed: '候访期已过，未见开门实录',
  closed: '此线索已不再提供入场',
};

function OmenReceipts({ rows }: { rows: readonly ExpeditionOmenView[] }) {
  if (!rows.length) return null;
  return <section aria-label="本人秘境线索" className="space-y-1.5 border-t border-slate-800 pt-2">
    <h5 className="text-xs font-semibold text-cyan-200">本人秘境线索</h5>
    <ul className="space-y-1.5 text-xs leading-relaxed text-slate-300">
      {rows.map((row,index) => <li key={`${row.siteId}:${row.measuredTick}:${row.learnedTick}:${index}`}
        className="min-w-0 rounded bg-slate-900/60 p-2 [overflow-wrap:anywhere]">
        <p className="font-semibold text-slate-100">{OMEN_STATUS[row.status]}</p>
        <p>观测处：{row.siteName} · 实测第 {row.measuredTick} 轮 · 获知第 {row.learnedTick} 轮</p>
        <p>候访窗口第 {row.windowStartsTick} 至 {row.windowEndsTick} 轮
          {row.status === 'open' && row.registrationClosesTick !== undefined && ` · 报名截止第 ${row.registrationClosesTick} 轮`}。</p>
      </li>)}
    </ul>
  </section>;
}


export function WorldOccasionsPanel({ world, cultivator, arenaControls }: { world: WorldState; cultivator: Cultivator; arenaControls?:TournamentArenaControls }) {
  const names = new Map(world.cultivators.map(({ id, name }) => [id, name]));
  const places = new Map(world.locations.map(({ id, name }) => [id, name]));
  const named = (id: string) => names.get(id) ?? '修士未详';
  const viewer = world.cultivators.find((actor) => actor === cultivator);
  const visible = world.occasions.filter((occasion) => canSeeOccasion(world, viewer, occasion));
  const clues = projectExpeditionOmens(world, viewer);
  const open = visible.filter(isOpenOccasion).sort((a, b) => b.startedTick - a.startedTick);
  const recent = visible.filter((occasion) => !isOpenOccasion(occasion))
    .sort((a, b) => (b.lastResolvedTick ?? b.startedTick) - (a.lastResolvedTick ?? a.startedTick)).slice(0, 4);

  return (
    <section className="space-y-2 pt-2 border-t border-slate-800" aria-label="天下盛会与秘境">
      <h4 className="text-xs font-semibold text-slate-200">天下盛会与秘境</h4>
      {open.length + recent.length + clues.length === 0 ? <p className="text-[11px] text-slate-400">尚无盛会或远征记录。</p> : (
        <details className="rounded border border-slate-800/80 bg-slate-950/50 px-2 py-1.5">
          <summary className="min-h-11 cursor-pointer py-2 text-xs text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">查看盛会 · 活跃 {open.length} 场 · 近期结案 {recent.length} 场</summary>
          <ul className="mt-2 space-y-2">
            {[...open, ...recent].map((occasion) => {
              const arena=occasion.kind==='tournament'?projectTournamentArena(world,occasion.id):undefined;
              if(arena)return <li key={occasion.id}><TournamentArenaRead arena={arena} named={named}
                siteName={places.get(arena.siteId)} championName={occasion.championId?named(occasion.championId):undefined} controls={arenaControls}/></li>;
              const linkedOmen = occasion.omenId !== undefined;
              const expeditionResults = linkedOmen
                ? occasion.expeditions.filter(({ cultivatorId }) => cultivatorId === viewer?.id)
                : occasion.expeditions;
              return <li key={occasion.id} className="space-y-1.5 rounded bg-slate-900/60 p-2 text-[11px] text-slate-300">
                <div className="flex flex-wrap items-center gap-x-2">
                  <h5 className="font-medium text-slate-100 break-words">{occasion.title}</h5>
                  <span className={isOpenOccasion(occasion) ? 'text-cyan-300' : 'text-slate-400'}>
                    {OCCASION_KIND[occasion.kind]} · {OCCASION_STATUS[occasion.status]}
                  </span>
                  {viewer && occasion.participantIds.includes(viewer.id) && <span className="text-amber-200">选中修士参会</span>}
                </div>
                <p className="text-slate-400">
                  {places.get(occasion.locationId) ?? (linkedOmen ? '入口不在本刻地图中' : '地点未详')} · 始于 Tick #{occasion.startedTick}
                  {occasion.status === 'registration' ? ` · 报名截止 Tick #${occasion.registrationClosesTick}` : ''}
                  {isOpenOccasion(occasion) ? ` · 最晚结束 Tick #${occasion.expiresTick}` : ''}
                </p>
                {!linkedOmen && <p>已登记者 {occasion.participantIds.length} 人
                  {occasion.status === 'running' ? ` · 仍在进行 ${occasion.remainingIds.length} 人` : ''}
                  {occasion.kind === 'tournament' && occasion.round > 0 ? ` · 轮次 ${occasion.round}` : ''}
                </p>}
                {!linkedOmen && occasion.championId && <p className="text-amber-300">魁首：{named(occasion.championId)}</p>}
                {!linkedOmen && occasion.bouts.length > 0 && (
                  <ol className="max-h-32 overflow-y-auto space-y-0.5" aria-label="大比对阵结果">
                    {occasion.bouts.map((bout, index) => (
                      <li key={`${bout.round}-${bout.firstId}-${index}`}>
                        第 {bout.round} 轮：{named(bout.firstId)}
                        {bout.secondId ? ` 对 ${named(bout.secondId)} · 胜者 ${named(bout.winnerId)}` : ` · 轮空晋级（${named(bout.winnerId)}）`}
                      </li>
                    ))}
                  </ol>
                )}
                {expeditionResults.length > 0 && (
                  <ul className="max-h-40 overflow-y-auto space-y-1" aria-label="秘境远征结果">
                    {expeditionResults.map((result, index) => (
                      <li key={`${result.cultivatorId}-${result.tick}-${index}`}>
                        <span className={result.outcome === 'death' ? 'text-rose-300' : 'text-cyan-200'}>
                          {linkedOmen ? '本人' : named(result.cultivatorId)} · {EXPEDITION_OUTCOMES[result.outcome]} · Tick #{result.tick}
                        </span>
                        {!linkedOmen && <p className="break-words">{result.description}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>;
            })}
          </ul>
          <OmenReceipts rows={clues} />
        </details>
      )}
    </section>
  );
}
