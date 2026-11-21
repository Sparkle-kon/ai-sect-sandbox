import type { VillageEvolutionView } from '../engine/villageEvolutionEngine';

type Reading = Pick<VillageEvolutionView, 'status' | 'currentLocal' | 'asOfTick' | 'lastSurvey' | 'hasActiveDuties' | 'population' | 'juveniles' | 'namedRemaining' | 'recentChanges' | 'knownMoves'>;
type LocalObservation = {
  stock?: { roots: number; stones: number };
};

export function villageDisplayLabel(row: Pick<Reading, 'status' | 'recentChanges'> | undefined): string | undefined {
  if (row?.status === 'town') return '集镇';
  if (row?.status === 'ruin') return '旧址';
  if (row?.status === 'village' && row.recentChanges.at(-1)?.reason === 'actual_return') return '复居';
  return undefined;
}

const CHANGE_LABEL = {
  sustained_growth: '聚落实成集镇。',
  depopulated: '此处成为旧址，旧地名仍在。',
  actual_return: '确有人迁入，旧址重新住了人。',
};

export function VillageEvolutionDetails({ row, observed, local }: {
  row?: Reading; observed: boolean; local?: LocalObservation;
}) {
  if (!row || !(row.recentChanges.length || row.knownMoves.length || row.lastSurvey || local?.stock)) return null;
  const sample = row.lastSurvey;
  const localNow = observed && row.currentLocal;
  const stock = localNow ? local?.stock : undefined;
  return <section aria-label="聚落沿革与迁徙实据" className="min-w-0 space-y-1.5 break-words border-t border-slate-800 pt-2 text-xs leading-relaxed text-slate-300">
    <h4 className="font-semibold text-emerald-100">聚落沿革</h4>
    {(localNow || sample) && <p>{localNow ? '现住' : `第 ${row.asOfTick} 轮旧录：`} {row.population} 人，其中未成年 {row.juveniles} 人、留在坊籍的具名居民 {row.namedRemaining} 人。</p>}
    {sample && <p className="text-slate-400">第 {sample.tick} 轮查验：{sample.usableWell ? '水井可用' : '未见可用水井'} · 通路 {sample.passableCorridors} 条。</p>}
    {stock && <p className="text-slate-400">此处义仓实存：玄土根 {stock.roots} 株、灵石 {stock.stones} 枚。</p>}
    {localNow && row.hasActiveDuties && <p className="text-slate-400">此处仍有记在原址的未了事务。</p>}
    {row.recentChanges.length > 0 && <ul aria-label="聚落实变" className="space-y-0.5 text-slate-400">
      {row.recentChanges.slice(-4).reverse().map(({ tick, reason }) => <li key={`${tick}:${reason}`}>第 {tick} 轮 · {CHANGE_LABEL[reason]}</li>)}
    </ul>}
    {row.knownMoves.length > 0 && <ul aria-label="两地均已知的迁徙实录" className="space-y-1">
      {row.knownMoves.slice(-4).reverse().map((entry, index) => <li className="min-w-0 rounded bg-slate-900/80 p-1.5" key={`${entry.tick}:${entry.direction}:${index}`}>
        <p>第 {entry.tick} 轮 · {entry.direction === 'departures'
          ? <>{entry.people} 人从此处迁往{entry.counterpartName}。</>
          : <>{entry.people} 人从{entry.counterpartName}迁到此处。</>}</p>
        <p className="text-slate-400">原地留下未成年 {entry.leftJuveniles} 人、留在坊籍的具名居民 {entry.leftNamed} 人。</p>
      </li>)}
    </ul>}
  </section>;
}
