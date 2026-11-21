import type {DanxiaMedicineControlsProps} from './DanxiaMedicineControls';
import type { Cultivator, FacilityKind, Sect, WorldState } from '../types/world';
import { FACILITY_RULES, facilityBuildCost, isGuardAssignmentActive } from '../engine/sectEconomyEngine';
import { RelicExhibitsPanel } from './RelicExhibitsPanel';
import { SharedCommonsPanel } from './SharedCommonsPanel';
import { TerritorialLeasePanel } from './TerritorialLeasePanel';
import { FormationNetworkPanel } from './FormationNetworkPanel';
import { InfirmaryPanel } from './InfirmaryPanel';
import { isGuardOnDuty } from './mapStatusLabels';
export { isGuardOnDuty } from './mapStatusLabels';

const FACILITY_KINDS = Object.keys(FACILITY_RULES) as FacilityKind[];

export function signedStones(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

interface SectEconomyPanelProps {
  medicineControls?:DanxiaMedicineControlsProps;
  cultivator: Cultivator;
  sect: Sect | undefined;
  world: WorldState;
}

export function SectEconomyPanel({ cultivator, sect, world, medicineControls }: SectEconomyPanelProps) {
  const assignment = cultivator.guardAssignment;
  const guardSite = assignment ? world.locations.find(({ id }) => id === assignment.locationId) : undefined;
  const guardStatus = !cultivator.alive ? '陨落留档'
    : assignment && world.tick >= assignment.expiresTick ? '已到期'
      : assignment && world.tick < assignment.assignedTick ? '尚未生效'
        : isGuardOnDuty(cultivator, world) ? '在岗'
          : isGuardAssignmentActive(cultivator, world) ? '尚未到岗' : '任务已失效';
  const snapshot = sect?.monthlyEconomy;
  const overflow = snapshot ? snapshot.taxes + snapshot.mining - snapshot.upkeep - snapshot.net : 0;
  return (
    <section className="space-y-2 pt-2 border-t border-slate-800" aria-label="宗门建筑与收支">
      <h4 className="text-xs font-semibold text-slate-200">宗门建筑与收支</h4>
      {sect ? (
        <>
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            <div className="flex gap-1"><dt className="text-slate-400">宗门公库：</dt><dd className="text-slate-200">{sect.spiritStones} 灵石</dd></div>
            <div className="flex flex-wrap items-center gap-1">
              <dt className="text-slate-400">护山阵耐久：</dt>
              <dd className="inline-flex items-center gap-1.5 text-slate-200">
                {sect.arrayMaxHp > 0 ? (
                  <>
                    <span>{sect.arrayHp}/{sect.arrayMaxHp}</span>
                    <meter aria-label="护山阵耐久" className="h-2 w-14" min={0} max={sect.arrayMaxHp} value={sect.arrayHp} />
                  </>
                ) : '未建成'}
              </dd>
            </div>
          </dl>
          <details className="rounded border border-slate-800/80 bg-slate-950/50 px-2 py-1.5">
            <summary className="cursor-pointer text-xs text-slate-200">建筑与月度账本</summary>
            <dl className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
              {FACILITY_KINDS.map((kind) => {
                const level = sect.facilities[kind];
                const rule = FACILITY_RULES[kind];
                return (
                  <div className="flex gap-1" key={kind}>
                    <dt>{rule.name}：</dt>
                    <dd>
                      <span className={level > 0 ? 'text-slate-200' : undefined}>{level > 0 ? `${level} 阶` : '未建'}</span>
                      {level < rule.maxLevel && <span> · 升至 {level + 1} 阶需 {facilityBuildCost(sect, kind)} 灵石</span>}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {snapshot ? (
              <div className="mt-2 space-y-1 border-t border-slate-800/80 pt-2 text-[11px] text-slate-400">
                <p>最近月结 · Tick #{snapshot.tick}</p>
                <dl className="flex flex-wrap gap-x-3 gap-y-1">
                  <div className="flex gap-1"><dt>税收</dt><dd className="text-emerald-300">{signedStones(snapshot.taxes)}</dd></div>
                  <div className="flex gap-1"><dt>矿产</dt><dd className="text-emerald-300">{signedStones(snapshot.mining)}</dd></div>
                  <div className="flex gap-1"><dt>维护</dt><dd className="text-rose-300">{signedStones(-snapshot.upkeep)}</dd></div>
                  {overflow > 0 && <div className="flex gap-1"><dt>库容溢出</dt><dd className="text-rose-300">{signedStones(-overflow)}</dd></div>}
                  <div className="flex gap-1"><dt>净收支</dt><dd className="text-slate-200">{signedStones(snapshot.net)}</dd></div>
                </dl>
              </div>
            ) : (
              <p className="mt-2 border-t border-slate-800/80 pt-2 text-[11px] text-slate-400">尚无月结记录。</p>
            )}
          </details>
        </>
      ) : (
        <p className="text-[11px] text-slate-400">散修，无所属宗门的账本。</p>
      )}
      {assignment ? (
        <p className="text-[11px] text-slate-300">
          驻守：{guardSite?.name ?? '地点未详'} · {guardStatus} · 派驻 Tick #{assignment.assignedTick} · 至 Tick #{assignment.expiresTick}
        </p>
      ) : (
        <p className="text-[11px] text-slate-400">无驻守任务。</p>
      )}
      <InfirmaryPanel world={world} cultivator={cultivator} medicineControls={medicineControls} />
      <FormationNetworkPanel world={world} cultivator={cultivator} />
      <TerritorialLeasePanel world={world} cultivator={cultivator} />
      <SharedCommonsPanel world={world} cultivator={cultivator} />
      <RelicExhibitsPanel world={world} cultivator={cultivator} />
    </section>
  );
}
