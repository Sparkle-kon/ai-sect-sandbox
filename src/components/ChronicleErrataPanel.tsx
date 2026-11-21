import { visibleChronicleErrata } from '../engine/chronicleErrataEngine';
import type { ChronicleChapter, ChronicleReading, Cultivator, WorldState } from '../types/world';

function describeReading(reading: ChronicleReading, people: ReadonlyMap<string, string>) {
  if (reading.kind === 'duel') return `斗法获胜者：${people.get(reading.winnerId) ?? '姓名未详'}`;
  return reading.delivery === 'full_supplies' ? '已实际拨付赈灾物资' : '未实际拨付赈灾物资';
}

/** Published accounts are distinct from a structured source and a later editorial correction. */
export function ChronicleErrataPanel({ world, chapter, cultivator }: { world: WorldState; chapter?: ChronicleChapter; cultivator?: Cultivator }) {
  const selected = world.cultivators.find(({ id }) => id === cultivator?.id);
  const people = new Map(world.cultivators.map(({ id, name }) => [id, name]));
  const sites = new Map(world.locations.map(({ id, name }) => [id, name]));
  const anchored = new Map((chapter?.endTick !== undefined && chapter.endTick <= world.tick ? chapter.anchors : [])
    .map(({ id, tick }) => [id, tick]));
  const rows = visibleChronicleErrata(world, selected).map((row) => ({
    ...row, chapterLinked: anchored.get(row.source.sourceEventId) === row.source.tick,
  })).sort((a, b) => Number(b.chapterLinked) - Number(a.chapterLinked) || b.source.tick - a.source.tick);

  return (
    <details className="min-w-0 rounded border border-amber-400/20 bg-slate-950/65">
      <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-amber-200">异闻与勘误</summary>
      <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
        <p>只显示所选修士在当前地点能查到的公开传本。传本署名不等于已核实；勘误单独附录，不改写正文或原始事件。</p>
        {rows.length === 0 ? <p className="text-slate-400">{selected ? '此时此地暂无可查的异闻与勘误。' : '选中修士后，可在其能够阅览的公开地点查阅。'}</p> : (
          <ol aria-label="此地可查的公开传本与勘误" className="max-h-[25rem] space-y-2 overflow-y-auto">
            {rows.map(({ source, retellings, conflict, correction, chapterLinked }) => (
              <li key={source.sourceEventId} className="min-w-0 space-y-1.5 break-words rounded border border-slate-800 p-2">
                <h5 className="font-semibold text-slate-100">
                  公开史料：{source.kind === 'duel' ? '斗法记录' : '赈济记录'} · Tick #{source.tick}
                  {sites.has(source.locationId) && ` · ${sites.get(source.locationId)}`}
                </h5>
                <p className="text-amber-200">{chapterLinked ? '与当前章节引用同一史料' : chapter ? '未引用于当前章，仍可查阅' : '尚无现成章节引证，仍可查阅'}</p>
                <p className={conflict && !correction ? 'text-rose-200' : 'text-slate-400'}>
                  {conflict ? (correction ? '原传本存在冲突，已另附勘误。' : '传本相互冲突，尚无勘误定论。') : '已刊传本，不能据此判定史实。'}
                </p>
                {!!retellings.length && <ul aria-label="未经核实的传本" className="list-inside list-disc space-y-1">
                  {retellings.map(({ id, authorId, tick, reading }) => (
                    <li key={id}>未核实传本 · {people.get(authorId) ?? '编录者姓名未详'} · Tick #{tick} · {describeReading(reading, people)}</li>
                  ))}
                </ul>}
                {correction && (
                  <div aria-label="有据勘误" className="space-y-1 border-t border-slate-800 pt-1.5 text-emerald-200">
                    <p>据公开史料附录勘误 · {people.get(correction.editorId) ?? '勘误者姓名未详'} · Tick #{correction.tick}</p>
                    <p>核定：{describeReading(correction.reading, people)}。对照 {correction.contestedRetellingIds.length} 则传本。</p>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  );
}
