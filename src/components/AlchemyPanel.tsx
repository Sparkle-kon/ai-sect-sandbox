import {useMemo,useState} from 'react';
import {AlchemyWorkshopCanvas} from './AlchemyWorkshopCanvas';
import {projectAlchemyWorkshop,type AlchemyWorkshopFrame} from './alchemyWorkshopVisualModel';
import {createTerrainMapView} from './terrainMapView';
import {HeavenlyAlchemyRead,type HeavenlyAlchemyControls} from './HeavenlyAlchemyRead';
import {projectHeavenlyAlchemy} from '../engine/heavenlyAlchemyEngine';
import type { Cultivator, HerbId, LocationNode, PillId, WorldState } from '../types/world';
export { countHerbs } from './mapStatusLabels';

import { ALCHEMY_RECIPES, HERB_LABELS, alchemyCost, alchemySuccess } from '../engine/alchemyEngine';
import { projectFurnaceSafety, type FurnaceSafetyView } from '../engine/furnaceSafetyEngine';
import { SeedCulturePanel } from './SeedCulturePanel';

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

function RecipeBook({ cultivator, location, safety,workshop }: {
  cultivator: Cultivator; location: LocationNode | undefined; safety: FurnaceSafetyView | undefined;workshop?:AlchemyWorkshopFrame;
}) {
  const [open,setOpen]=useState(false);
  const furnaceGrade = safety?.installedGrade ?? 0;
  const closed = safety !== undefined && safety.status !== 'open';
  return (
    <details className="rounded border border-slate-800/80 bg-slate-950/50 px-2 py-1.5" onToggle={event=>setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-xs text-slate-200">查看丹方 · {PILLS.length} 种</summary>
      {workshop?.furnace&&<AlchemyWorkshopCanvas key={workshop.siteId} frame={workshop} kind="furnace" active={open}/>}
      <p className="mt-1 text-[11px] text-slate-400">
        {closed ? `装设 ${furnaceGrade} 阶，本回合停用，不能炼丹。` : <>
          {location ? (furnaceGrade > 0 ? `当前丹炉：${furnaceGrade} 阶` : '当前地点无丹炉') : '无可查的当前地点丹炉'}
          。成丹率按此修士现况估算；实际炼丹还须获得炉位并备齐灵草和灵石。
        </>}
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
              <p>最低 {recipe.furnaceGrade} 阶丹炉 · {closed
                ? (hasRequiredFurnace ? '装设炉阶满足，当前停用' : '装设炉阶不足，当前停用')
                : (hasRequiredFurnace ? '当前炉阶满足' : location ? '当前炉阶不满足' : '当地炉阶未核实')}</p>
              {hasRequiredFurnace && !closed ? (
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

export function AlchemyPanel({ world, cultivator, location, heavenlyAlchemyControls,historical=false }: { world: WorldState; cultivator: Cultivator; location: LocationNode | undefined; heavenlyAlchemyControls?:HeavenlyAlchemyControls;historical?:boolean }) {
  const viewer = world.cultivators.find(({ id }) => id === cultivator.id);
  const terrain=useMemo(()=>viewer===cultivator&&viewer.alive&&!historical&&location?.id===viewer.locationId&&
    world.locations.includes(location)?createTerrainMapView(world,viewer,true):undefined,
    [world,viewer,cultivator,location,historical]);
  const workshop=useMemo(()=>terrain&&viewer
    ?projectAlchemyWorkshop(world,terrain,viewer.locationId,{viewer,historical}):undefined,[world,terrain,viewer,historical]);
  const heavenly = viewer===cultivator?projectHeavenlyAlchemy(world,viewer):undefined;
  const safety = location && projectFurnaceSafety(world, viewer, location.id);
  const presentLocation = cultivator.alive && (location?.furnaceGrade === 0 || safety) ? location : undefined;
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
            {presentLocation.name} · {safety ? `${safety.installedGrade} 阶丹炉` : '无丹炉'}
            {safety?.status === 'closed' ? '（停用）' : safety?.status === 'reopening' ? '（已签复炉，本回合仍停用）' : ''}
          </p>
          <Inventory heading="此地可采灵草" counts={presentLocation.herbs} labels={HERBS} unit="株" empty="此地当前无可采灵草。" />
        </div>
      ) : (
        <p className="text-[11px] text-slate-400">
          {cultivator.alive ? '当前未在可查地点，无法查看当地丹炉和灵草。' : '修士已陨落，不再查看当地丹炉和灵草。'}
        </p>
      )}
      {viewer && <SeedCulturePanel world={world} cultivator={viewer} workshop={workshop} />}
      {heavenly&&<HeavenlyAlchemyRead key={`${heavenly.actorId}:${heavenly.siteId}`} view={heavenly} tick={world.tick} controls={historical?undefined:heavenlyAlchemyControls} workshop={workshop}
        previewWorkshop={terrain&&viewer&&!historical?option=>projectAlchemyWorkshop(world,terrain,heavenly.siteId,{viewer,heatPreview:option}):undefined}/>}
      <RecipeBook cultivator={cultivator} location={presentLocation} safety={safety} workshop={!heavenly?workshop:undefined} />
    </section>
  );
}
