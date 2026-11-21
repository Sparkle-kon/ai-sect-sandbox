import { useState } from 'react';
import { availableCompetitionActions, competitionActorOptedOut, COMPETITION_RULES, publicCompetitionStandings } from '../engine/competitionEngine';
import type { Cultivator, WorldState } from '../types/world';

const PAGE_SIZE = 8;
const nav = 'min-h-11 rounded border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200 disabled:opacity-40';
type Standing = ReturnType<typeof publicCompetitionStandings>[number];

function RankRows({ rows, awarded, names }: { rows: Standing[]; awarded: boolean; names: Map<string, string> }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const index = Math.min(page, pages - 1);
  if (!rows.length) return <p className="text-xs text-slate-400">尚无可公布的参赛记录。</p>;
  return (
    <div className="space-y-2">
      <ol aria-label={awarded ? '该赛季正式名次' : '当季暂列名次'} className="space-y-1.5">
        {rows.slice(index * PAGE_SIZE, (index + 1) * PAGE_SIZE).map((entry) => (
          <li key={entry.actorId} className="flex min-w-0 flex-wrap items-center justify-between gap-1.5 rounded bg-slate-950/75 px-2.5 py-1.5 text-xs">
            <span className="min-w-0 break-words">{entry.rank !== undefined ? `第 ${entry.rank} 名 · ` : ''}{names.get(entry.actorId) ?? '修士未详'}</span>
            <span className="shrink-0 text-slate-300">{entry.disposition === 'ranked' ? `${awarded ? '终榜' : '暂列'} ${entry.score} 分` : '已报名，未得分'}</span>
          </li>
        ))}
      </ol>
      {pages > 1 && <div aria-label="赛季榜分页" className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={nav} disabled={index === 0} onClick={() => setPage(index - 1)}>上一页</button>
        <span role="status" className="text-xs text-slate-400">第 {index + 1}/{pages} 页</span>
        <button type="button" className={nav} disabled={index + 1 === pages} onClick={() => setPage(index + 1)}>下一页</button>
      </div>}
    </div>
  );
}

export function RankSeasonPanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator | undefined }) {
  const standings = world.competitions;
  const viewer = world.cultivators.find(({ id }) => id === cultivator?.id);
  const names = new Map(world.cultivators.map(({ id, name }) => [id, name]));
  const seasons = (standings?.seasons ?? []).filter(({ openedTick }) => openedTick <= world.tick).sort((a, b) => b.openedTick - a.openedTick);
  const open = seasons.find(({ status, year }) => status === 'open' && year === world.year);
  const latestFinal = seasons.find(({ status, closedTick }) => status === 'settled' && closedTick !== undefined && closedTick <= world.tick);
  const publicSeason = open ?? latestFinal;
  const allRows = publicSeason ? publicCompetitionStandings(world, publicSeason.id) : [];
  const own = open && viewer ? allRows.find(({ actorId }) => actorId === viewer.id) : undefined;
  const optOut = open && viewer ? competitionActorOptedOut(world, viewer.id) : false;
  const canJoin = open && viewer ? availableCompetitionActions(viewer, world).some(({ seasonMove }) => seasonMove === 'join') : false;
  const rows = allRows.filter(({ disposition }) => disposition !== 'withdrawn');
  const declared = new Map(seasons.filter(({ status, closedTick }) => status === 'settled' && closedTick !== undefined && closedTick <= world.tick)
    .map((season) => [season.id, season]));
  const knownSeasons = new Set((standings?.seasons ?? []).map(({ id }) => id));
  const oldest = seasons.at(-1)?.openedTick ?? 0;
  const honors = (standings?.honors ?? []).filter(({ seasonId, awardedTick }) => awardedTick <= world.tick &&
    (declared.has(seasonId) || !knownSeasons.has(seasonId) && awardedTick < oldest))
    .sort((a, b) => b.awardedTick - a.awardedTick || a.id.localeCompare(b.id));

  return (
    <section aria-label="公开赛季榜与荣誉" className="min-w-0 space-y-2 rounded-xl border border-sky-400/25 bg-slate-900/70 p-3 text-slate-100 sm:p-4">
      <header className="space-y-1">
        <h4 className="text-sm font-semibold text-sky-100">公开赛季榜与荣誉</h4>
        <p className="text-xs text-slate-400">只计规则列明的公开实绩。退出者不列榜，后续赛季不自动续报。</p>
      </header>
      {open && viewer && <p className="break-words rounded bg-slate-950/65 p-2 text-xs text-slate-300" aria-label="所选修士参赛状态">
        所选修士 · {own?.disposition === 'withdrawn' ? '本季已退出（不列名次或分数）' : own ? '本季已报名' :
          optOut ? `本季未报名，保留先前退出选择${canJoin ? '（可重新自愿报名）' : ''}` : canJoin ? '本季未报名（具备报名资格）' : '本季未报名'}
      </p>}
      <div className="space-y-1.5 border-t border-slate-800 pt-2">
        <h5 className="text-xs font-semibold text-sky-100">{open ? '进行中 · 临时排名' : latestFinal ? '最近结算 · 正式排名' : '赛季排名'}</h5>
        {publicSeason ? <>
          <p className="text-xs text-slate-400">仙历 {publicSeason.year} 年 · 开榜 Tick #{publicSeason.openedTick}
            {open ? ' · 结算前不代表已获荣誉。' : ` · 结算 Tick #${publicSeason.closedTick}`}</p>
          <RankRows key={publicSeason.id} rows={rows} awarded={!open} names={names} />
        </> : <p className="text-xs text-slate-400">尚未有可查看的赛季。</p>}
      </div>
      <details className="rounded border border-slate-800 bg-slate-950/50 px-2.5">
        <summary className="min-h-11 cursor-pointer py-2.5 text-xs font-semibold text-sky-100">已授予荣誉 · {honors.length} 项</summary>
        {!honors.length ? <p className="pb-2 text-xs text-slate-400">尚无已结算并授予的荣誉。</p> : <ul className="max-h-56 space-y-1.5 overflow-y-auto pb-2">
          {honors.map((award) => <li key={award.id} className="break-words rounded bg-slate-900 p-2 text-xs">
            <p>{award.title} · {names.get(award.actorId) ?? '修士未详'} · 第 {award.place} 名</p>
            <p className="text-slate-400">{declared.has(award.seasonId) ? `仙历 ${declared.get(award.seasonId)!.year} 年` : '已归档赛季'} · 结算 {award.score} 分 · 实授 Tick #{award.awardedTick}</p>
          </li>)}
        </ul>}
      </details>
      <details className="rounded border border-slate-800 bg-slate-950/50 px-2.5">
        <summary className="min-h-11 cursor-pointer py-2.5 text-xs font-semibold text-sky-100">公开计分规则</summary>
        <p className="pb-1 text-xs text-slate-400">报名后从下一回合起计分；退出后本季不重报。同分先比较首次得分先后，仍相同按固定次序。</p>
        <ul className="space-y-1.5 pb-2 text-xs text-slate-300">
          {Object.entries(COMPETITION_RULES).map(([id, rule]) => <li key={id} className="break-words">{rule.label} · +{rule.points} 分</li>)}
        </ul>
      </details>
    </section>
  );
}
