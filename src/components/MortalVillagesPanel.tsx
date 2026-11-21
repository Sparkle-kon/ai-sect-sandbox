import {
  availableSettlementActions, SETTLEMENT_RELIEF, SETTLEMENT_RECRUIT_STIPEND, visibleSettlements,
} from '../engine/settlementEngine';
import type { Cultivator, WorldState } from '../types/world';
import { createTerrainMapView } from './terrainMapView';

type RecordEntry = WorldState['settlements']['records'][number];
const KIND_LABELS: Record<RecordEntry['kind'], string> = {
  disaster: '受灾', migration: '迁徙', relief: '赈济', recruitment: '自愿入门',
};
const PEOPLE_LABELS: Record<RecordEntry['kind'], string> = {
  disaster: '遇难', migration: '迁出', relief: '受益', recruitment: '自愿入门',
};

export function MortalVillagesPanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator | undefined }) {
  const terrain = createTerrainMapView(world, cultivator, true);
  const knownLocations = new Set(terrain.seenLocations.map(({ id }) => id));
  const villages = (world.settlements?.villages ?? []).filter(({ locationId }) => knownLocations.has(locationId));
  const visible = new Set(cultivator?.alive && world.settlements
    ? visibleSettlements(world, cultivator).filter(({ locationId }) => terrain.isCurrentLocation(locationId)).map(({ id }) => id) : []);
  const options = cultivator?.alive && world.settlements ? availableSettlementActions(cultivator, world) : [];
  const people = new Map(world.cultivators.map(({ id, name }) => [id, name]));
  const sects = new Map(world.sects.map(({ id, name }) => [id, name]));
  const knownVillages = new Map(villages.map(({ id, name }) => [id, name]));

  return (
    <section className="min-w-0 space-y-2 rounded-xl border border-emerald-400/25 bg-slate-900/70 p-3 text-slate-100 sm:p-4" aria-label="凡人村镇与赈济">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold text-emerald-100">凡人村镇与赈济</h3>
        <p className="break-words text-xs text-slate-300">
          {cultivator ? `${cultivator.name}的已知村镇 · 当前观察 ${visible.size} 处` : '选择修士后查看其已知村镇。'}
        </p>
        <p className="text-xs text-slate-400">
          此处只查看。可招募仅指当前满足条件的自愿者，不代表必定加入。
        </p>
      </header>
      {villages.length === 0 ? <p className="text-xs text-slate-400">{cultivator ? '未探索到村镇。' : '未选中修士，无地方观察。'}</p> : (
        <div className="max-h-[28rem] space-y-1.5 overflow-y-auto">
          {villages.map((village) => {
            const observed = visible.has(village.id);
            const eligibleIds = new Set(observed ? options.flatMap((option) =>
              option.action === 'RECRUIT_SETTLER' && option.targetSettlementId === village.id && option.targetVolunteerId
                ? [option.targetVolunteerId] : []) : []);
            const eligible = village.volunteers.filter(({ id, enlistedCultivatorId }) => eligibleIds.has(id) && !enlistedCultivatorId);
            const reliefAvailable = observed && options.some(({ action, targetSettlementId }) =>
              action === 'DELIVER_RELIEF' && targetSettlementId === village.id);
            const ledger = observed ? (world.settlements?.records ?? []).filter(({ settlementId }) => settlementId === village.id)
              .sort((a, b) => b.tick - a.tick).slice(0, 10) : [];
            return (
              <details key={village.id} className="min-w-0 rounded border border-slate-800 bg-slate-950/60 p-2">
                <summary className="cursor-pointer break-words text-xs text-slate-100">
                  {village.name} · {observed ? `人口 ${village.population}/${village.capacity}` : '当前未观测'}
                </summary>
                {observed ? (
                  <div className="mt-2 space-y-2 text-xs text-slate-300">
                    <p>
                      压力 {village.stress}/100
                      {village.lastDisasterTick !== undefined ? ` · 最近受灾 Tick #${village.lastDisasterTick}` : ''}
                      {village.lastReliefTick !== undefined ? ` · 最近赈济 Tick #${village.lastReliefTick}` : ''}
                    </p>
                    <div className="space-y-1 border-t border-slate-800 pt-2">
                      <h4 className="font-semibold text-emerald-100">自愿入门 · 当前可招募 {eligible.length} 人</h4>
                      <p className="text-slate-400">宗门安家费：每位 {SETTLEMENT_RECRUIT_STIPEND} 灵石。</p>
                      {eligible.length === 0 ? <p className="text-slate-400">暂无符合当前招募条件的自愿者。</p> : (
                        <ul className="space-y-1">
                          {eligible.map((candidate) => <li className="break-words" key={candidate.id}>
                            {candidate.name} · {candidate.age} 岁 · 灵根：{candidate.spiritRoot} · 意愿 {candidate.willingness} · 资质 {candidate.aptitude}
                          </li>)}
                        </ul>
                      )}
                    </div>
                    <div className="space-y-1 border-t border-slate-800 pt-2">
                      <h4 className="font-semibold text-emerald-100">赈济</h4>
                      <p>每次成本：修士个人 {SETTLEMENT_RELIEF.stones} 灵石与 {SETTLEMENT_RELIEF.jade_leaf} 株翡翠灵叶。</p>
                      <p className="text-slate-400">{reliefAvailable ? '所选修士当前符合赈济条件。' : '所选修士当前不满足赈济条件。'}</p>
                    </div>
                    <div className="space-y-1 border-t border-slate-800 pt-2">
                      <h4 className="font-semibold text-emerald-100">最近实录 · {ledger.length} 条</h4>
                      {ledger.length === 0 ? <p className="text-slate-400">暂无已记录的变化。</p> : (
                        <ol className="space-y-1">
                          {ledger.map((entry) => (
                            <li key={entry.id} className="break-words rounded bg-slate-900/80 p-1.5">
                              <p>Tick #{entry.tick} · {KIND_LABELS[entry.kind]}
                                {entry.targetSettlementId ? ` → ${knownVillages.get(entry.targetSettlementId) ?? '未观测目的地'}` : ''}
                                {entry.sectId && sects.has(entry.sectId) ? ` · 宗门 ${sects.get(entry.sectId)}` : ''}
                                {entry.actorId && people.has(entry.actorId) ? ` · 经办 ${people.get(entry.actorId)}` : ''}
                              </p>
                              {(entry.people > 0 || entry.stones > 0 || entry.herbs > 0) && <p className="text-slate-400">
                                {entry.people > 0 ? `${PEOPLE_LABELS[entry.kind]} ${entry.people} 人` : ''}
                                {(entry.stones > 0 || entry.herbs > 0) &&
                                  `${entry.people > 0 ? ' · ' : ''}实际耗费 ${entry.stones} 灵石${entry.herbs > 0 ? `、${entry.herbs} 株翡翠灵叶` : ''}`}
                              </p>}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </div>
                ) : <p className="mt-2 text-xs text-slate-400">已知地名，但当前不在视野中，不显示实时人口、招募或账目。</p>}
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}
