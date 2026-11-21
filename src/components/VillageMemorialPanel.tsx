import { projectCivicMemorials } from '../engine/civicMemorialEngine';
import type { Cultivator, WorldState } from '../types/world';

const READING = {
  full_supplies: '说法称：赈济物资已实付',
  unfunded: '说法称：赈济物资未实际拨付',
} as const;

export function VillageMemorialPanel({ world, cultivator, villageId }: {
  world: WorldState; cultivator: Cultivator; villageId: string;
}) {
  const memorials = projectCivicMemorials(world, cultivator);
  if (memorials?.settlementId !== villageId || !memorials.plaques.length && !memorials.proposals.length) return null;

  return <section aria-label="乡祠纪事" className="min-w-0 space-y-2 break-words border-t border-amber-500/25 pt-2 text-xs leading-relaxed">
    <h4 className="font-semibold text-amber-100">乡祠纪事</h4>
    {memorials.plaques.length > 0 && <ol aria-label="已核验的乡祠纪念" className="max-h-96 space-y-2 overflow-y-auto">
      {memorials.plaques.map((plaque) => <li key={plaque.id} className="min-w-0 rounded border border-amber-500/20 bg-slate-950/60 p-2">
        <p className="font-medium text-amber-100">乡祠册上，记下了{plaque.name}赈济故里的事。</p>
        <p className="mt-1 text-slate-300">已离原坊籍、入宗 · {plaque.subjectStatus === 'deceased' ? '立册时已故' : '立册时仍在世'}</p>
        {plaque.nameAmbiguous && <p className="text-slate-400">存在同名记录；不能仅凭姓名认定是同一人。</p>}
        <details className="mt-1 rounded border border-slate-800 px-2">
          <summary className="flex min-h-11 cursor-pointer items-center text-slate-300">凭据与异闻</summary>
          <div className="space-y-1 pb-2 text-slate-300">
            <p>实录：第 {plaque.deedTick} 轮于本村实付赈济；独立在场者核实后，于第 {plaque.inscribedTick} 轮立册。</p>
            {plaque.errata && (plaque.errata.readings.length > 0 || plaque.errata.correction) && <>
              {plaque.errata.readings.length > 0 && <ul aria-label="匿名传闻，非实录" className="space-y-1 text-slate-400">
                {plaque.errata.readings.map(({ tick, reading }, index) =>
                  <li key={index}>第 {tick} 轮 · 匿名异闻（未证） · {READING[reading]}</li>)}
              </ul>}
              {plaque.errata.correction && <p>第 {plaque.errata.correction.tick} 轮 · 核验勘误：赈济物资确已实付。原异闻仍存，不作实录。</p>}
            </>}
          </div>
        </details>
      </li>)}
    </ol>}
    {memorials.proposals.length > 0 && <ul aria-label="本人可查的待核提议" className="space-y-1 text-slate-300">
      {memorials.proposals.map(({ id, name, deedTick, expiresTick, own }) =>
        <li key={id} className="rounded border border-slate-800 p-2">
          <p>{own ? '本人提议' : '可作独立见证'}：{name}于第 {deedTick} 轮赈济本村。</p>
          <p>待核验，第 {expiresTick} 轮起失效。尚未立册，未为立册耗用物资。</p>
        </li>)}
    </ul>}
  </section>;
}
