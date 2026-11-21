import type { Cultivator, LocationNode, Sect, Technique, WorldState } from '../types/world';
import { SpiritRootBadge } from './SpiritRootBadge';
import { ScriptureLendingPanel } from './ScriptureLendingPanel';

interface TechniquePanelProps {
  world?: WorldState;
  cultivator: Cultivator;
  sect: Sect | undefined;
  location: LocationNode | undefined;
  cultivators: Cultivator[];
}

function TechniqueOrigin({ technique, names }: { technique: Technique; names: Map<string, string> }) {
  if (technique.authorId === undefined && technique.createdTick === undefined) return null;
  return (
    <span className="flex flex-wrap gap-x-2 text-[10px] text-slate-400">
      {technique.authorId !== undefined && <span>创法者：{names.get(technique.authorId) ?? '姓名未详'}</span>}
      {technique.createdTick !== undefined && <span>创于 Tick #{technique.createdTick}</span>}
    </span>
  );
}

function TechniqueList({
  label, books, empty, names,
}: { label: string; books: Technique[]; empty: string; names: Map<string, string> }) {
  return (
    <details className="rounded border border-slate-800/80 bg-slate-950/50 px-2 py-1.5">
      <summary className="cursor-pointer text-xs text-slate-200">{label} · {books.length} 卷</summary>
      {books.length === 0 ? (
        <p className="mt-1 text-[11px] text-slate-400">{empty}</p>
      ) : (
        <ul className="mt-1 space-y-1.5 overflow-y-auto max-h-40">
          {books.map((book, index) => (
            <li key={book.id ?? `${book.name}-${index}`} className="border-t border-slate-800/60 pt-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-200">
                <span className="break-words">{book.name}</span>
                <SpiritRootBadge root={book.spiritRoot} />
              </div>
              <TechniqueOrigin technique={book} names={names} />
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

export function TechniquePanel({ world, cultivator, sect, location, cultivators }: TechniquePanelProps) {
  const names = new Map(cultivators.map(({ id, name }) => [id, name]));
  const presentLocation = cultivator.alive ? location : undefined;
  return (
    <section className="space-y-2 pt-2 border-t border-slate-800" aria-label="功法研习与传承">
      <h4 className="text-xs font-semibold text-slate-200">功法研习与传承</h4>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="text-slate-300">当前功法熟练度 {cultivator.techniqueMastery}/100</span>
        <meter aria-label="当前功法熟练度" className="h-2 w-28" min={0} max={100} value={cultivator.techniqueMastery} />
      </div>
      <TechniqueOrigin technique={cultivator.technique} names={names} />
      {sect ? (
        <TechniqueList label={`${sect.name}藏经阁`} books={sect.pavilion} empty="本宗藏经阁尚无功法。" names={names} />
      ) : (
        <p className="text-[11px] text-slate-400">此修士未加入宗门，无本宗藏经阁。</p>
      )}
      {world && <ScriptureLendingPanel world={world} cultivator={cultivator} />}
      {presentLocation ? (
        <TechniqueList label={`${presentLocation.name}遗卷`} books={presentLocation.inheritanceScrolls} empty="此地暂无传承遗卷。" names={names} />
      ) : (
        <p className="text-[11px] text-slate-400">
          {cultivator.alive ? '所在地点不详，无法查看遗卷。' : '修士已陨落，不再查看所在地点的遗卷。'}
        </p>
      )}
    </section>
  );
}
