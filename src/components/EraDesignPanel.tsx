import { useMemo, useState } from 'react';
import {
  createEraDesignDraft, eraDesignCatalog, ERA_DESIGN_PROFILE_LABELS, EraDesignError, previewEraDesignDraft,
  readEraDesignDraft, writeEraDesignDraft, type EraDesignCatalog, type EraDesignCondition, type EraDesignDraft,
} from '../engine/eraDesignDraft';
import { WORLDGEN_PROFILES } from '../engine/worldgenProfiles';
import type { WorldState } from '../types/world';

type Base = Pick<EraDesignDraft, 'seed' | 'profileId' | 'anchor'>;
export interface EraDesignBuffer extends Base {
  year: string;
  month: string;
  depletion?: { siteId: string; qi: string; jade: string };
  move?: { destinationId: string; memberIds: readonly string[]; stones: string };
  capacity?: { settlementId: string; number: string };
}
type Preview = ReturnType<typeof previewEraDesignDraft>;
const field = 'min-h-11 min-w-0 w-full rounded border border-slate-700 bg-slate-950 px-2 text-base text-slate-100';
const button = 'min-h-11 rounded border border-slate-700 bg-slate-900 px-2.5 text-xs font-semibold text-slate-100 disabled:opacity-40';
const dated = ({ year, month }: EraDesignDraft['anchor']) => `${year} 年 ${month} 月`;
const integer = (text: string, name: string, minimum: number, maximum: number): number => {
  const n = Number(text.trim());
  if (!/^\d+$/.test(text.trim()) || !Number.isSafeInteger(n) || n < minimum || n > maximum)
    throw new Error(`${name}须为 ${minimum} 至 ${maximum} 的整数。`);
  return n;
};

export function makeEraDesignBuffer(draft: Base & Partial<Pick<EraDesignDraft, 'target' | 'conditions'>>): EraDesignBuffer {
  const result: EraDesignBuffer = {
    seed: draft.seed, profileId: draft.profileId, anchor: { ...draft.anchor },
    year: draft.target ? String(draft.target.year) : '', month: draft.target ? String(draft.target.month) : '',
  };
  for (const row of draft.conditions ?? []) {
    if (row.kind === 'jade_vein_depleted') result.depletion = { siteId: row.siteId, qi: String(row.spiritQi), jade: String(row.jadeCapacity) };
    else if (row.kind === 'danxia_branch_moves_north') result.move = { destinationId: row.destinationId, stones: String(row.stones), memberIds: [...row.memberIds] };
    else result.capacity = { settlementId: row.settlementId, number: String(row.capacity) };
  }
  return result;
}

export function eraDesignDraftFromBuffer(buffer: EraDesignBuffer): EraDesignDraft {
  const { seed, profileId, anchor, depletion, move, capacity } = buffer;
  const target = { year: integer(buffer.year, '目标年', 1, Number.MAX_SAFE_INTEGER), month: integer(buffer.month, '目标月', 1, 12) };
  const conditions: EraDesignCondition[] = [];
  if (depletion) {
    if (!depletion.siteId) throw new Error('请选择要设定的寒玉灵脉。');
    conditions.push({ kind: 'jade_vein_depleted', siteId: depletion.siteId,
      spiritQi: integer(depletion.qi, '灵气', 5, 150), jadeCapacity: integer(depletion.jade, '灵叶承载', 0, 99) });
  }
  if (move) {
    if (!move.destinationId) throw new Error('请选择丹霞一支拟迁往的地点。');
    if (!move.memberIds.length) throw new Error('请勾选拟迁北的成员。');
    conditions.push({ kind: 'danxia_branch_moves_north', destinationId: move.destinationId,
      stones: integer(move.stones, '拟带灵石', 0, 50_000), memberIds: [...move.memberIds] });
  }
  if (capacity) {
    if (!capacity.settlementId) throw new Error('请选择要设定承载的村落。');
    conditions.push({ kind: 'village_capacity', settlementId: capacity.settlementId, capacity: integer(capacity.number, '村落承载', 1, 100_000) });
  }
  return createEraDesignDraft(seed, profileId, anchor, target, conditions);
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid min-w-0 gap-1">{label}<input className={field} inputMode="numeric" maxLength={16}
    value={value} onChange={(event) => onChange(event.currentTarget.value)} /></label>;
}

function SitePicker({ label, options, value, onChange }: {
  label: string; options: readonly { id: string; name: string }[]; value: string; onChange: (value: string) => void;
}) {
  const index = options.findIndex(row => row.id === value);
  return <label className="grid min-w-0 gap-1">{label}
    <select className={field} value={index < 0 ? '' : String(index)} onChange={(event) => {
      const ordinal = event.currentTarget.value;
      onChange(options.find((_, position) => String(position) === ordinal)?.id ?? '');
    }}>
      <option value="">{value && index < 0 ? '已存地点不在此种子的候选表' : '请选择'}</option>
      {options.map(({ id, name }, position) => <option key={id} value={position}>{name}</option>)}
    </select>
  </label>;
}

export function EraDesignFields({ buffer, catalog, onChange }: {
  buffer: EraDesignBuffer; catalog: EraDesignCatalog; onChange: (value: EraDesignBuffer) => void;
}) {
  const { depletion, move, capacity } = buffer;
  const counts = Number(Boolean(depletion)) + Number(Boolean(move)) + Number(Boolean(capacity));
  return <div className="min-w-0 space-y-2 text-xs leading-relaxed text-slate-300 [overflow-wrap:anywhere]">
    <p>草案起点：{dated(buffer.anchor)} · 种子 {buffer.seed} · {WORLDGEN_PROFILES[buffer.profileId].label}</p>
    <div className="grid min-w-0 gap-2 sm:grid-cols-2">
      <NumberField label="目标年" value={buffer.year} onChange={(year) => onChange({ ...buffer, year })} />
      <NumberField label="目标月（1–12）" value={buffer.month} onChange={(month) => onChange({ ...buffer, month })} />
    </div>
    <p>选择两至三项设定。已选 {counts} 项，尚未核验。候选来自草案种子，不代表这些人或地点在当前游玩世界的状态。</p>
    <fieldset className="min-w-0 space-y-1 rounded border border-slate-800 p-2">
      <legend className="px-1">寒玉灵脉</legend>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="h-4 w-4 shrink-0"
        checked={!!depletion} onChange={(event) => onChange({ ...buffer, depletion: event.currentTarget.checked ? { siteId: '', qi: '', jade: '' } : undefined })} />{ERA_DESIGN_PROFILE_LABELS.jade_vein_depleted}</label>
      {depletion && <div className="space-y-1.5">
        <SitePicker label="寒玉灵脉地点" options={catalog.depletionSites} value={depletion.siteId}
          onChange={(siteId) => onChange({ ...buffer, depletion: { ...depletion, siteId } })} />
        <div className="grid min-w-0 gap-1.5 sm:grid-cols-2">
          <NumberField label="目标灵气（5–150）" value={depletion.qi} onChange={(qi) => onChange({ ...buffer, depletion: { ...depletion, qi } })} />
          <NumberField label="灵叶承载（0–99）" value={depletion.jade} onChange={(jade) => onChange({ ...buffer, depletion: { ...depletion, jade } })} />
        </div>
      </div>}
    </fieldset>
    <fieldset className="min-w-0 space-y-1 rounded border border-slate-800 p-2">
      <legend className="px-1">丹霞一支</legend>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="h-4 w-4 shrink-0"
        checked={!!move} onChange={(event) => onChange({ ...buffer, move: event.currentTarget.checked ? { destinationId: '', memberIds: [], stones: '' } : undefined })} />{ERA_DESIGN_PROFILE_LABELS.danxia_branch_moves_north}</label>
      {move && <div className="space-y-1.5">
        <SitePicker label="拟迁往的北方地点" options={catalog.northSites} value={move.destinationId}
          onChange={(destinationId) => onChange({ ...buffer, move: { ...move, destinationId } })} />
        <NumberField label="拟带灵石（0–50000）" value={move.stones} onChange={(stones) => onChange({ ...buffer, move: { ...move, stones } })} />
        <p>拟迁成员：至少三人，且原宗要留下可行事的同门。已选 {move.memberIds.length} 人。</p>
        {move.memberIds.some(id => !catalog.danxiaMembers.some(candidate => candidate.id === id)) &&
          <button type="button" className={button} onClick={() => onChange({ ...buffer,
            move: { ...move, memberIds: move.memberIds.filter(id => catalog.danxiaMembers.some(candidate => candidate.id === id)) } })}>清除候选表已无的成员</button>}
        {catalog.danxiaMembers.length ? <ul aria-label="种子生成的丹霞成员候选" className="max-h-56 space-y-1 overflow-y-auto rounded bg-slate-950/60 p-1">
          {catalog.danxiaMembers.map(({ id, name, age }, index) => <li key={id}><label className="flex min-h-11 items-center gap-2 px-1">
            <input type="checkbox" className="h-4 w-4 shrink-0" checked={move.memberIds.includes(id)} onChange={(event) => {
              const memberIds = event.currentTarget.checked ? [...move.memberIds, id] : move.memberIds.filter(candidate => candidate !== id);
              onChange({ ...buffer, move: { ...move, memberIds } });
            }} />{name} · {age} 岁{catalog.danxiaMembers.filter(row => row.name === name).length > 1 && ` · 候选 ${index + 1}`}
          </label></li>)}
        </ul> : <p>该种子的候选表没有可选成员。</p>}
      </div>}
    </fieldset>
    <fieldset className="min-w-0 space-y-1 rounded border border-slate-800 p-2">
      <legend className="px-1">村落</legend>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="h-4 w-4 shrink-0"
        checked={!!capacity} onChange={(event) => onChange({ ...buffer, capacity: event.currentTarget.checked ? { settlementId: '', number: '' } : undefined })} />{ERA_DESIGN_PROFILE_LABELS.village_capacity}</label>
      {capacity && <div className="space-y-1.5">
        <SitePicker label="拟设定的村落" options={catalog.villages} value={capacity.settlementId}
          onChange={(settlementId) => onChange({ ...buffer, capacity: { ...capacity, settlementId } })} />
        <NumberField label="目标承载（1–100000）" value={capacity.number} onChange={(number) => onChange({ ...buffer, capacity: { ...capacity, number } })} />
      </div>}
    </fieldset>
  </div>;
}

export function EraDesignPreview({ preview }: { preview: Preview }) {
  return <section aria-label="纪元草案约束预览" className="min-w-0 space-y-1.5 rounded border border-slate-700 bg-slate-950/50 p-2 text-xs text-slate-300 [overflow-wrap:anywhere]">
    <h6 className="font-semibold text-cyan-100">{preview.ready ? '此草案通过约束检查' : '草案有冲突：不能用于开局，仍可保存草案'}</h6>
    <p>{dated(preview.draft.anchor)} → {dated(preview.draft.target)}（{preview.monthsAhead} 个月）。检查基于草案种子；没有发生这些事，也未运行模拟。</p>
    {!!preview.issues.length && <ul aria-label="草案冲突和提示" className="space-y-1">
      {preview.issues.map((issue,index) => <li key={index} className={issue.severity === 'conflict' ? 'text-rose-200' : 'text-amber-200'}>
        {issue.severity === 'conflict' ? '冲突' : '提示'}{issue.conditionIndex !== undefined ? ` · 第 ${issue.conditionIndex + 1} 项` : ''}：{issue.message}
      </li>)}
    </ul>}
    <ol aria-label="作者条件及来源" className="space-y-1.5">
      {preview.conditions.map((row,index) => {
        const claim = preview.draft.conditions[index];
        return <li key={index} className="rounded bg-slate-900 p-1.5">
        <p>作者设定 · {row.label}{row.targetName ? ` · ${row.targetName}` : ''}</p>
        {!!row.memberNames?.length && <p>拟迁：{row.memberNames.join('、')}</p>}
        {claim?.kind === 'jade_vein_depleted' && <p>设定剩余灵气 {claim.spiritQi}，灵叶承载 {claim.jadeCapacity}。</p>}
        {claim?.kind === 'village_capacity' && <p>设定村落承载 {claim.capacity} 人。</p>}
        {claim?.kind === 'danxia_branch_moves_north' && row.effectiveQi !== undefined && <p>合并同地设定后，拟址剩余灵气 {row.effectiveQi}。</p>}
        {row.quotedStones !== undefined && <p>拟带 {row.quotedStones} 灵石{row.baselineStones !== undefined ? `；种子基准公库 ${row.baselineStones} 灵石` : ''}。</p>}
        {row.baselinePopulation !== undefined && <p>种子基准实有人口 {row.baselinePopulation} 人。</p>}
      </li>; })}
    </ol>
  </section>;
}

export function EraDesignPanel({ world }: { world: Pick<WorldState, 'year' | 'month' | 'random' | 'worldgen'> }) {
  const [buffer, setBuffer] = useState<EraDesignBuffer>();
  const [report, setReport] = useState<{ preview: Preview; year: number; month: number }>();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const seed = buffer?.seed, profile = buffer?.profileId;
  const savable = useMemo(() => {
    if (!buffer) return undefined;
    try { return eraDesignDraftFromBuffer(buffer); } catch { return undefined; }
  }, [buffer]);
  const catalog = useMemo(() => seed === undefined || profile === undefined ? undefined : eraDesignCatalog(seed, profile), [seed, profile]);
  const update = (next: EraDesignBuffer | undefined) => { setBuffer(next); setReport(undefined); setNotice(''); setError(''); };
  const tell = (reason: unknown) => {
    const index = reason instanceof EraDesignError ? reason.conditionIndex : undefined;
    setError(reason instanceof Error ? `${index === undefined ? '' : `第 ${index + 1} 项：`}${reason.message}` : '草案操作未完成。');
  };
  const openSaved = () => {
    try {
      const saved = readEraDesignDraft();
      if (!saved) { setNotice('本机未读到可用的纪元草案。'); setError(''); return; }
      update(makeEraDesignBuffer(saved));
      setNotice('已打开本机草案，仍使用记录中的起点；当前世界未改动。');
    } catch (reason) { tell(reason); }
  };
  const inspect = () => {
    if (!buffer) return;
    setError(''); setNotice(''); setReport(undefined);
    try {
      const current = { year: world.year, month: world.month };
      setReport({ ...current, preview: previewEraDesignDraft(eraDesignDraftFromBuffer(buffer), current) });
    } catch (reason) { tell(reason); }
  };
  const save = () => {
    if (!savable) return;
    setError(''); setNotice('');
    try {
      if (!writeEraDesignDraft(savable)) throw new Error('本机草案未能保存。');
      setNotice('已保存本机草案，未改动当前世界。草案并不代表已通过约束检查。');
    } catch (reason) { tell(reason); }
  };
  const reportCurrent = report && report.year === world.year && report.month === world.month;
  const targetPast=!!savable&&(savable.target.year<world.year||savable.target.year===world.year&&savable.target.month<=world.month);
  return <details className="min-w-0 space-y-2 rounded-lg border border-slate-800 bg-slate-950/45 p-2.5 text-xs text-slate-300">
    <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-cyan-100">写下纪元条件</summary>
    <p>这些是作者设定，不是自然实录；这里不推进或改动当前世界。</p>
    {!buffer ? <div className="flex flex-wrap gap-1.5">
      <button type="button" className={button} onClick={() => update(makeEraDesignBuffer({ seed: world.random.seed,
        profileId: world.worldgen?.profileId ?? 'classic', anchor: { year: world.year, month: world.month } }))}>从当前年月新写草案</button>
      <button type="button" className={button} onClick={openSaved}>打开本机草案</button>
    </div> : catalog && <>
      <EraDesignFields buffer={buffer} catalog={catalog} onChange={update} />
      {(world.year !== buffer.anchor.year || world.month !== buffer.anchor.month) && <p className="text-amber-200">
        当前世界：{dated(world)}。草案仍以它写下时的年月为起点，不跟随当前日期。
      </p>}
      {targetPast&&!reportCurrent&&<p className="text-amber-200">当前世界已经抵达或超过草案目标。仍可修改或保存，未开启新纪元。</p>}
      <p className="text-slate-400">本机只保留一份独立草案。保存会更新该草案，不会替换世界存档，也不会验证草案无冲突。</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={button} onClick={inspect}>预览约束</button>
        <button type="button" className={button} disabled={!savable} onClick={save}>保存到本机草案</button>
        <button type="button" className={button} onClick={() => { update(undefined); setNotice('已退出编辑；本机已保存的草案和当前世界均未改动。'); }}>退出编辑，丢弃未保存改动</button>
      </div>
      {reportCurrent && <EraDesignPreview preview={report.preview} />}
      {report && !reportCurrent && <p className="text-amber-200">当前世界已推进，请重新预览；草案原有起点未变。</p>}
    </>}
    {!!notice && <p role="status" className="text-cyan-100">{notice}</p>}
    {!!error && <p role="alert" className="text-rose-200 [overflow-wrap:anywhere]">{error}</p>}
  </details>;
}
