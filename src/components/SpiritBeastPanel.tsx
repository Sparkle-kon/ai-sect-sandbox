import type { Cultivator, LocationNode, SpiritBeast, WorldState } from '../types/world';
import { HabitatStewardshipPanel } from './HabitatStewardshipPanel';
import { BEAST_COLORS, isLivingBeast } from './spiritBeastView';

export function SpiritBeastPanel({ cultivator, location, beasts, world }: {
  cultivator: Cultivator;
  location: LocationNode | undefined;
  beasts: SpiritBeast[];
  world?: WorldState;
}) {
  const living = beasts.filter(isLivingBeast);
  const pets = living.filter(({ tamedBy }) => tamedBy === cultivator.id);
  const wild = cultivator.alive && location
    ? living.filter((beast) => !beast.tamedBy && beast.locationId === location.id) : [];
  return (
    <section className="space-y-2 pt-2 border-t border-slate-800" aria-label="灵宠与野兽">
      <h4 className="text-xs font-semibold text-slate-200">灵宠与野兽</h4>
      <details className="rounded border border-slate-800/80 bg-slate-950/50 px-2 py-1.5">
        <summary className="cursor-pointer text-xs text-slate-200">契约灵宠 · {pets.length} 只</summary>
        {pets.length === 0 ? <p className="mt-1 text-[11px] text-slate-400">尚无存活的契约灵宠。</p> : (
          <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto">
            {pets.map((pet) => (
              <li key={pet.id} className="rounded bg-slate-900/70 px-2 py-1.5 text-[11px] text-slate-300">
                <div className="flex flex-wrap gap-x-2">
                  <span className="font-medium text-slate-100">{pet.name}</span>
                  <span style={{ color: BEAST_COLORS[pet.kind] }}>{pet.kind}</span>
                  <span>{!cultivator.alive ? '契约留档' : pet.locationId === cultivator.locationId ? '同行' : '尚未会合'}</span>
                </div>
                <p className="text-slate-400">气血 {pet.hp}/{pet.maxHp} · 战力 {pet.power} · 修为 {pet.cultivation}</p>
              </li>
            ))}
          </ul>
        )}
      </details>
      {cultivator.alive && location ? (
        <details className="rounded border border-slate-800/80 bg-slate-950/50 px-2 py-1.5">
          <summary className="cursor-pointer text-xs text-slate-200">
            此地野兽 · {wild.length} 只{wild.some(({ kind }) => kind === '凶兽') ? ' · 有凶兽出没' : ''}
          </summary>
          {wild.length === 0 ? <p className="mt-1 text-[11px] text-slate-400">当前未见野生灵兽。</p> : (
            <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-[11px] text-slate-300">
              {wild.map((beast) => (
                <li key={beast.id} className="flex flex-wrap gap-x-2">
                  <span>{beast.name}</span>
                  <span style={{ color: BEAST_COLORS[beast.kind] }}>{beast.kind}</span>
                  <span className="text-slate-400">战力 {beast.power}</span>
                </li>
              ))}
            </ul>
          )}
        </details>
      ) : <p className="text-[11px] text-slate-400">无可查看的当前地点野兽记录。</p>}
      {world && <HabitatStewardshipPanel world={world} cultivator={cultivator} />}
    </section>
  );
}
