import type { Cultivator, HerbId, LocationNode, PillId } from '../types/world';
export { countHerbs } from './mapStatusLabels';

import { ALCHEMY_RECIPES, HERB_LABELS, alchemyCost, alchemySuccess } from '../engine/alchemyEngine';

const HERBS = (Object.keys(HERB_LABELS) as HerbId[]).map((id) => [id, HERB_LABELS[id]] as const);
const PILLS = (Object.keys(ALCHEMY_RECIPES) as PillId[]).map((id) => [id, ALCHEMY_RECIPES[id].name] as const);

function Inventory<Id extends string>({
  heading, counts, labels, unit, empty,
}: {
  heading: string;
  counts: Record<Id, number>;
  labels: ReadonlyArray<readonly [Id, string]>;
  unit: string;
  empty: string;
}) {
  const stocked = labels.filter(([id]) => counts[id] > 0);
  return (
    <section aria-label={heading} className="space-y-1">
      <h5 className="text-[11px] font-medium text-slate-300">{heading}</h5>
      {stocked.length === 0 ? (
        <p className="text-[11px] text-slate-400">{empty}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {stocked.map(([id, label]) => (
            <li key={id} className="rounded border border-slate-700 bg-slate-950/70 px-2 py-0.5 text-[11px] text-slate-200">
              {label} {counts[id]} {unit}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecipeBook({ cultivator, location }: { cultivator: Cultivator; location: LocationNode | undefined }) {
  const furnaceGrade = location?.furnaceGrade ?? 0;
  return (
    <details className="rounded border border-slate-800/80 bg-slate-950/50 px-2 py-1.5">
      <summary className="cursor-pointer text-xs text-slate-200">查看丹方 · {PILLS.length} 种</summary>
      <p className="mt-1 text-[11px] text-slate-400">
        {location ? (furnaceGrade > 0 ? `当前丹炉：${furnaceGrade} 阶` : '当前地点无丹炉') : '无可用的当前地点丹炉'}
        。成丹率按此修士现况估算，须另备齐灵草和灵石。
      </p>
      <ul className="mt-1 grid gap-2 text-[11px] text-slate-400">
        {PILLS.map(([id, name]) => {
          const recipe = ALCHEMY_RECIPES[id];
          const hasRequiredFurnace = furnaceGrade >= recipe.furnaceGrade;
          return (
            <li key={id} className="space-y-0.5 border-t border-slate-800/80 pt-1.5">
              <span className="font-medium text-slate-200">{name}</span>
              <p>{HERBS.flatMap(([herb, label]) => {
                const qty = recipe.herbs[herb];
                return qty ? [`${label} ${qty} 株`] : [];
              }).join(' · ')}</p>
              <p>最低 {recipe.furnaceGrade} 阶丹炉 · {hasRequiredFurnace ? '当前炉阶满足' : '当前炉阶不满足'}</p>
              {hasRequiredFurnace ? (
                <p>当前耗费 {alchemyCost(id, furnaceGrade)} 灵石 · 成丹率 {(alchemySuccess(cultivator, id, furnaceGrade) * 100).toFixed(1)}%</p>
              ) : (
                <p>基础耗费 {recipe.spiritStones} 灵石 · 暂无当地成丹率</p>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export function AlchemyPanel({ cultivator, location }: { cultivator: Cultivator; location: LocationNode | undefined }) {
  const presentLocation = cultivator.alive ? location : undefined;
  return (
    <section className="space-y-2 pt-2 border-t border-slate-800" aria-label="丹道与灵草">
      <h4 className="text-xs font-semibold text-slate-200">丹道与灵草</h4>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className={cultivator.pillToxicity > 0 ? 'text-rose-200' : 'text-slate-300'}>
          丹毒 {cultivator.pillToxicity}/100
        </span>
        <meter aria-label="丹毒" className="h-2 w-28" min={0} max={100} value={cultivator.pillToxicity} />
      </div>
      <Inventory heading="随身灵草" counts={cultivator.herbs} labels={HERBS} unit="株" empty="未持有灵草。" />
      <Inventory heading="随身丹药" counts={cultivator.pills} labels={PILLS} unit="枚" empty="未持有丹药。" />
      {presentLocation ? (
        <div className="space-y-1.5 rounded border border-slate-800/80 bg-slate-950/50 p-2">
          <p className="text-[11px] text-slate-300">
            {presentLocation.name} · {presentLocation.furnaceGrade > 0 ? `${presentLocation.furnaceGrade} 阶丹炉` : '无丹炉'}
          </p>
          <Inventory heading="此地可采灵草" counts={presentLocation.herbs} labels={HERBS} unit="株" empty="此地当前无可采灵草。" />
        </div>
      ) : (
        <p className="text-[11px] text-slate-400">
          {cultivator.alive ? '所在地点不详，无法查看当地丹炉和灵草。' : '修士已陨落，不再查看当地丹炉和灵草。'}
        </p>
      )}
      <RecipeBook cultivator={cultivator} location={presentLocation} />
    </section>
  );
}
