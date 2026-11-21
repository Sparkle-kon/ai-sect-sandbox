import { useState } from 'react';
import {
  scenarioObjectiveKey, SCENARIO_MAX_OBJECTIVES, SCENARIO_MAX_POPULATION_TARGET, SCENARIO_MAX_SITE_QI_TARGET, SCENARIO_MAX_TREASURY_TARGET,
} from '../engine/scenarioObjectiveEngine';
import { WORLDGEN_PROFILES } from '../engine/worldgenProfiles';
import type { ScenarioAudit, ScenarioObjective, WorldState } from '../types/world';

type ObjectiveKind = ScenarioObjective['kind'];
interface Target { id: string; name: string }
export interface ObjectiveCatalog { cultivators: Target[]; locations: Target[]; sects: Target[] }
const LABELS: Record<ObjectiveKind, string> = {
  cultivator_survives: '指定修士在世', living_population: '在世修士数', site_qi: '指定地点灵气', sect_treasury: '指定宗门公库',
};
const MAX: Record<Exclude<ObjectiveKind, 'cultivator_survives'>, number> = {
  living_population: SCENARIO_MAX_POPULATION_TARGET, site_qi: SCENARIO_MAX_SITE_QI_TARGET, sect_treasury: SCENARIO_MAX_TREASURY_TARGET,
};

const input = 'min-h-11 min-w-0 w-full rounded border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100';
const button = 'min-h-11 rounded border border-slate-700 bg-slate-900 px-2.5 text-xs font-semibold text-slate-100 disabled:opacity-40';
const label = 'grid min-w-0 gap-1 text-xs text-slate-300';

export function objectiveFromInputs(kind: ObjectiveKind, target: string, threshold: string, catalog?: ObjectiveCatalog): ScenarioObjective | undefined {
  if (!catalog) return undefined;
  if (kind === 'cultivator_survives') return catalog.cultivators.some(({ id }) => id === target) ? { kind, actorId: target } : undefined;
  const text = threshold.trim();
  const minimum = Number(text);
  const lower = kind === 'living_population' ? 1 : 0;
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(minimum) || minimum < lower || minimum > MAX[kind]) return undefined;
  if (kind === 'living_population') return { kind, minimum };
  if (kind === 'site_qi' && catalog.locations.some(({ id }) => id === target)) return { kind, locationId: target, minimum };
  if (kind === 'sect_treasury' && catalog.sects.some(({ id }) => id === target)) return { kind, sectId: target, minimum };
  return undefined;
}

function objectiveLabel(row: ScenarioObjective, catalog?: ObjectiveCatalog) {
  switch (row.kind) {
    case 'cultivator_survives':
      return `${catalog?.cultivators.find(({ id }) => id === row.actorId)?.name ?? '修士未详'}在末回合仍在世`;
    case 'living_population': return `在世修士 ≥ ${row.minimum} 人`;
    case 'site_qi': return `${catalog?.locations.find(({ id }) => id === row.locationId)?.name ?? '地点未详'}灵气 ≥ ${row.minimum}`;
    case 'sect_treasury': return `${catalog?.sects.find(({ id }) => id === row.sectId)?.name ?? '宗门未详'}公库 ≥ ${row.minimum} 灵石`;
  }
}

export function ScenarioObjectiveEditor({ objectives, catalog, onChange }: {
  objectives: readonly ScenarioObjective[]; catalog?: ObjectiveCatalog; onChange: (values: ScenarioObjective[]) => void;
}) {
  const [kind, setKind] = useState<ObjectiveKind>('cultivator_survives');
  const [target, setTarget] = useState('');
  const [threshold, setThreshold] = useState('1');
  const pool = kind === 'cultivator_survives' ? catalog?.cultivators : kind === 'site_qi' ? catalog?.locations
    : kind === 'sect_treasury' ? catalog?.sects : undefined;
  const candidate = objectiveFromInputs(kind, target, threshold, catalog);
  const duplicate = candidate && objectives.some((value) => scenarioObjectiveKey(value) === scenarioObjectiveKey(candidate));
  return (
    <details className="min-w-0 space-y-2 rounded-lg border border-slate-800 bg-slate-950/45 p-2.5">
      <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-cyan-100">纪元目标 · {objectives.length}/{SCENARIO_MAX_OBJECTIVES}</summary>
      <p className="text-xs text-slate-400">每项目标只在剧本末回合核定。加入或移除目标后须重新预演；未加入的表单内容不计入。没有目标时仍可复演普通剧本。</p>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <label className={label}>目标条件
          <select className={input} value={kind} onChange={(event) => {
            const value = event.currentTarget.value;
            if (Object.hasOwn(LABELS, value)) { setKind(value as ObjectiveKind); setTarget(''); }
          }}>
            {Object.entries(LABELS).map(([value, name]) => <option value={value} key={value}>{name}</option>)}
          </select>
        </label>
        {kind !== 'living_population' && <label className={label}>核定对象
          <select className={input} value={target} onChange={(event) => setTarget(event.currentTarget.value)}>
            <option value="">请选择</option>
            {pool?.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
          </select>
        </label>}
        {kind !== 'cultivator_survives' && <label className={label}>目标下限（{kind === 'living_population' ? 1 : 0}–{MAX[kind]}）
          <input className={input} inputMode="numeric" value={threshold} onChange={(event) => setThreshold(event.currentTarget.value)} />
        </label>}
      </div>
      {duplicate && <p className="text-xs text-amber-200">同一对象的同类条件已加入，不重复核定。</p>}
      <button type="button" className={button} disabled={!candidate || duplicate || objectives.length >= SCENARIO_MAX_OBJECTIVES}
        onClick={() => { if (candidate && !duplicate && objectives.length < SCENARIO_MAX_OBJECTIVES) onChange([...objectives, candidate]); }}>加入目标</button>
      {objectives.length > 0 && <ol aria-label="已加入的纪元目标" className="max-h-52 space-y-1.5 overflow-y-auto">
        {objectives.map((value, index) => <li key={scenarioObjectiveKey(value)} className="flex min-w-0 flex-wrap items-center justify-between gap-1.5 rounded bg-slate-900 p-2 text-xs">
          <span className="min-w-0 break-words">目标 {index + 1} · {objectiveLabel(value, catalog)}</span>
          <button type="button" className={button} aria-label={`移除目标 ${index + 1}`} onClick={() => onChange(objectives.filter((_, entry) => entry !== index))}>移除</button>
        </li>)}
      </ol>}
    </details>
  );
}

function evidenceText(evidence: ScenarioAudit['cards'][number]['evidence']) {
  switch (evidence.kind) {
    case 'cultivator_survives': return evidence.found ? `在世：${evidence.alive ? '是' : '否'} · 气血 ${evidence.hp}` : '末回合无对应修士记录';
    case 'living_population': return `实测在世 ${evidence.count} 人`;
    case 'site_qi': return evidence.found ? `末回合实测灵气 ${evidence.qi}` : '末回合无对应地点记录';
    case 'sect_treasury': return evidence.found ? `实测公库 ${evidence.total} 灵石（库中 ${evidence.atSite} · 流转中 ${evidence.inTransit}）` : '末回合无对应宗门记录';
  }
}

export function ScenarioAuditCards({ world, preview }: { world: WorldState; preview?: boolean }) {
  const audit = world.scenarioAudit;
  if (!audit) return null;
  const targets = { cultivators: world.cultivators, locations: world.locations, sects: world.sects };
  const passed = audit.cards.filter((card) => card.passed).length;
  return (
    <section aria-label="纪元目标凭证" className="min-w-0 space-y-2 rounded border border-emerald-400/25 bg-slate-950/65 p-2.5 text-xs">
      <h5 className="font-semibold text-emerald-100">纪元目标凭证 · 达成 {passed}/{audit.cards.length}</h5>
      <p className="break-words text-slate-300">种子 {audit.seed} · {WORLDGEN_PROFILES[audit.profileId].label} · 核定 Tick #{audit.evaluatedTick}</p>
      {preview ? <p className="text-slate-400">离线预演终点凭证，尚未载入当前世界。</p> : (
        <p className="text-slate-400">当前世界保存的复演终点凭证。{world.tick > audit.evaluatedTick ? `现为 Tick #${world.tick}；后续回合不改写已核定结果。` : '凭证仅作记录，不另发奖励。'}</p>
      )}
      <ol className="space-y-1.5" aria-label="逐项目标及实测依据">
        {audit.cards.map(({ id, objective, passed: hit, evidence }) => (
          <li key={id} className="min-w-0 space-y-0.5 break-words rounded border border-slate-800 p-2">
            <p className={hit ? 'text-emerald-200' : 'text-amber-200'}>{hit ? '达成' : '未达成'} · {objectiveLabel(objective, targets)}</p>
            <p className="text-slate-300">依据：{evidenceText(evidence)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
