import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createScenarioFixture, decodeScenarioFixture, encodeScenarioFixture, replayScenarioAsync, scenarioInitialTargets,
  SCENARIO_MAX_BYTES, SCENARIO_MAX_COMMANDS, SCENARIO_MAX_TICKS, ScenarioError,
} from '../engine/scenarioEngine';
import { WORLDGEN_PROFILES, isWorldgenProfileId } from '../engine/worldgenProfiles';
import { EraDesignPanel } from './EraDesignPanel';
import { ScenarioAuditCards, ScenarioObjectiveEditor } from './ScenarioObjectives';
import type { ScenarioObjective, WorldgenProfileId, WorldState } from '../types/world';

type Fixture = ReturnType<typeof createScenarioFixture>;
type Scheduled = Fixture['commands'][number];
type Command = Scheduled['command'];
type Cue = Extract<Command, { type: 'WHISPER_MIND' }>['cue'];
type Targets = ReturnType<typeof scenarioInitialTargets>;
type Progress = { tick: number; endTick: number; completedCommands: number; totalCommands: number };
export interface ScenarioDraft { seed: string; profileId: WorldgenProfileId; endTick: string; commands: Scheduled[]; objectives?: ScenarioObjective[] }
export interface ScenarioPreview { result: WorldState; fixture: Fixture; authority: WorldState; revision: number }
const TYPES: Record<Command['type'], string> = { SPAWN_TREASURE: '赐下机缘', TRIBULATION_STRIKE: '落下天雷', DEMONIC_TIDE: '血月潮汐', WHISPER_MIND: '预设天机提示' };
const CUES: Record<Cue, string> = { focus: '凝神', rest: '调息', caution: '谨慎' };
const field = 'min-h-11 min-w-0 w-full rounded border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100';
const button = 'min-h-11 rounded border border-slate-700 bg-slate-900 px-2.5 text-xs font-semibold text-slate-100 disabled:opacity-40';
const panel = 'min-w-0 space-y-2 rounded-lg border border-slate-800 bg-slate-950/45 p-2.5';
const kb = SCENARIO_MAX_BYTES / 1024;

export function scenarioInteger(value: string, max: number, min = 0): number | undefined {
  const text = value.trim();
  const n = Number(text);
  return /^\d+$/.test(text) && Number.isSafeInteger(n) && n >= min && n <= max ? n : undefined;
}

export function fixtureFromScenarioDraft(draft: ScenarioDraft): Fixture {
  const seed = scenarioInteger(draft.seed, 0xffffffff);
  const endTick = scenarioInteger(draft.endTick, SCENARIO_MAX_TICKS, 1);
  if (seed === undefined) throw new Error('种子须为 0 至 4294967295 的整数。');
  if (endTick === undefined) throw new Error(`末回合须为 1 至 ${SCENARIO_MAX_TICKS} 的整数。`);
  return createScenarioFixture(seed, draft.profileId, endTick, draft.commands, draft.objectives ?? []);
}

export async function readScenarioFile(file: Pick<File, 'size' | 'text'>): Promise<Fixture> {
  if (file.size <= 0 || file.size > SCENARIO_MAX_BYTES) throw new Error(`文件须大于 0 且不超过 ${kb} KiB。`);
  return decodeScenarioFixture(await file.text());
}

export function canApplyScenario(preview: ScenarioPreview | undefined, authority: WorldState, revision: number, busy: boolean): boolean {
  return Boolean(preview && preview.authority === authority && preview.revision === revision && !busy);
}

function message(error: unknown) {
  if (error instanceof ScenarioError) {
    const at = error.commandIndex === undefined ? '' : `（第 ${error.commandIndex + 1} 条指令${error.tick === undefined ? '' : `，Tick #${error.tick}`}）`;
    return `${error.message}${at}`;
  }
  return error instanceof Error ? error.message : '操作未完成。';
}

function commandFor(kind: Command['type'], target: string, cue: Cue, catalog: Targets): Command | undefined {
  if (kind === 'DEMONIC_TIDE') return { type: kind };
  if (kind === 'SPAWN_TREASURE') return catalog.locations.some(({ id }) => id === target) ? { type: kind, targetLocationId: target } : undefined;
  if (!catalog.cultivators.some(({ id }) => id === target)) return undefined;
  return kind === 'WHISPER_MIND' ? { type: kind, targetCultivatorId: target, cue } : { type: kind, targetCultivatorId: target };
}

function commandLabel(command: Command, catalog: Targets | undefined): string {
  if (command.type === 'DEMONIC_TIDE') return TYPES[command.type];
  const target = command.type === 'SPAWN_TREASURE' ? catalog?.locations.find(({ id }) => id === command.targetLocationId)
    : catalog?.cultivators.find(({ id }) => id === command.targetCultivatorId);
  return `${TYPES[command.type]} · ${target?.name ?? '目标不在当前种子与谱系中'}${command.type === 'WHISPER_MIND' ? ` · ${CUES[command.cue]}` : ''}`;
}

export function ScenarioPanel({ world, busy, onApply }: { world: WorldState; busy: boolean; onApply: (result: WorldState, expected: WorldState) => boolean }) {
  const [draft, setDraft] = useState<ScenarioDraft>(() => ({ seed: String(world.random.seed), profileId: world.worldgen?.profileId ?? 'classic', endTick: '6', commands: [] }));
  const [preview, setPreview] = useState<ScenarioPreview>();
  const [pending, setPending] = useState<'import' | 'preview'>();
  const [progress, setProgress] = useState<Progress>();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [kind, setKind] = useState<Command['type']>('SPAWN_TREASURE');
  const [target, setTarget] = useState('');
  const [commandTick, setCommandTick] = useState('1');
  const [cue, setCue] = useState<Cue>('focus');
  const revision = useRef(0);
  const active = useRef<AbortController>();
  const downloadUrl = useRef<string>();
  const seed = scenarioInteger(draft.seed, 0xffffffff);
  const endTick = scenarioInteger(draft.endTick, SCENARIO_MAX_TICKS, 1);
  const catalog = useMemo(() => seed === undefined ? undefined : scenarioInitialTargets(seed, draft.profileId), [seed, draft.profileId]);
  const targetList = kind === 'SPAWN_TREASURE' ? catalog?.locations : catalog?.cultivators;
  const tick = scenarioInteger(commandTick, endTick ?? SCENARIO_MAX_TICKS, 1);
  const next = catalog && commandFor(kind, target, cue, catalog);
  const validPreview = canApplyScenario(preview, world, revision.current, busy || Boolean(pending));

  useEffect(() => () => {
    active.current?.abort();
    if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
  }, []);

  const cancelRun = () => {
    active.current?.abort();
    active.current = undefined;
    setPending(undefined);
    setProgress(undefined);
  };
  const updateDraft = (update: (previous: ScenarioDraft) => ScenarioDraft, detail = '') => {
    cancelRun();
    revision.current++;
    setDraft(update);
    setPreview(undefined);
    setConfirm(false);
    setNotice(detail);
    setError('');
  };
  const start = (mode: 'import' | 'preview') => {
    cancelRun();
    const job = new AbortController();
    active.current = job;
    setPending(mode);
    setNotice('');
    setError('');
    setConfirm(false);
    return job;
  };
  const stillActive = (job: AbortController) => active.current === job && !job.signal.aborted;
  const finish = (job: AbortController) => {
    if (!stillActive(job)) return;
    active.current = undefined;
    setPending(undefined);
    setProgress(undefined);
  };

  const run = async () => {
    if (active.current || confirm) return;
    const job = start('preview');
    const expected = world;
    const edit = revision.current;
    setPreview(undefined);
    try {
      const fixture = fixtureFromScenarioDraft(draft);
      const result = await replayScenarioAsync(fixture, { signal: job.signal, onProgress: (status) => {
        if (stillActive(job)) setProgress(status);
      } });
      if (stillActive(job) && edit === revision.current) {
        setPreview({ result, fixture, authority: expected, revision: edit });
        setNotice('离线复演完成，当前世界未改动。');
      }
    } catch (reason) {
      if (stillActive(job)) setError(message(reason));
    } finally { finish(job); }
  };

  const importFile = async (file: File) => {
    const job = start('import');
    revision.current++;
    setPreview(undefined);
    try {
      const incoming = await readScenarioFile(file);
      if (!stillActive(job)) return;
      setTarget('');
      updateDraft(() => ({ seed: String(incoming.seed), profileId: incoming.profileId, endTick: String(incoming.endTick), commands: incoming.commands, objectives: incoming.objectives ?? [] }),
        '剧本已校验并载入草稿；当前世界未改动，须重新离线预演。');
    } catch (reason) {
      if (stillActive(job)) setError(message(reason));
    } finally { finish(job); }
  };

  const exportDraft = () => {
    try {
      setError('');
      const fixture = fixtureFromScenarioDraft(draft);
      const encoded = encodeScenarioFixture(fixture);
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
      downloadUrl.current = URL.createObjectURL(new Blob([encoded], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = downloadUrl.current;
      link.download = `ai-sect-scenario-${fixture.seed}-t${fixture.endTick}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setNotice('剧本 JSON 已交给浏览器下载。');
    } catch (reason) { setError(message(reason)); }
  };

  const apply = () => {
    if (!confirm || !preview || !canApplyScenario(preview, world, revision.current, busy || Boolean(active.current))) return;
    setConfirm(false);
    setPreview(undefined);
    setNotice('');
    setError('');
    try {
      if (onApply(preview.result, preview.authority)) setNotice('已载入预演后的世界；本机存档和模型设置仍保留。');
      else setError('当前世界已变化或正在推进，未替换。请重新预演和确认。');
    } catch { setError('未能载入预演结果。请重新检查当前世界。'); }
  };

  return (
    <section aria-label="剧本编辑与复演" className="min-w-0 space-y-3 rounded-xl border border-cyan-400/25 bg-slate-900/70 p-3 text-slate-100 sm:p-4">
      <header className="space-y-1">
        <h4 className="text-sm font-semibold text-cyan-100">剧本编辑与复演</h4>
        <p className="text-xs text-slate-300">从种子和谱系重新开始，只按预设指令离线复演。先预览，再决定是否替换当前世界。</p>
      </header>
      <div className={`${panel} grid items-start sm:grid-cols-3`}>
        <label className="grid min-w-0 gap-1 text-xs text-slate-300">世界种子
          <input className={field} inputMode="numeric" value={draft.seed} onChange={(event) => {
            const value = event.currentTarget.value;
            setTarget(''); updateDraft((previous) => ({ ...previous, seed: value }));
          }} />
        </label>
        <label className="grid min-w-0 gap-1 text-xs text-slate-300">世界谱系
          <select className={field} value={draft.profileId} onChange={(event) => {
            const value = event.currentTarget.value;
            if (isWorldgenProfileId(value)) { setTarget(''); updateDraft((previous) => ({ ...previous, profileId: value })); }
          }}>
            {Object.entries(WORLDGEN_PROFILES).map(([id, profile]) => <option key={id} value={id}>{profile.label}</option>)}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-xs text-slate-300">复演至 Tick（1–{SCENARIO_MAX_TICKS}）
          <input className={field} inputMode="numeric" value={draft.endTick} onChange={(event) => {
            const value = event.currentTarget.value;
            updateDraft((previous) => ({ ...previous, endTick: value }));
          }} />
        </label>
      </div>
      <details className={panel}>
        <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-cyan-100">编排指令 · {draft.commands.length}/{SCENARIO_MAX_COMMANDS}</summary>
        <p className="text-xs text-slate-400">加入后按回合排序，同回合按加入顺序执行；尚未加入的编辑项不计入预演。</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1 text-xs text-slate-300">指令
            <select className={field} value={kind} onChange={(event) => {
              const value = event.currentTarget.value;
              if (Object.hasOwn(TYPES, value)) { setKind(value as Command['type']); setTarget(''); }
            }}>
              {Object.entries(TYPES).map(([id, label]) => <option value={id} key={id}>{label}</option>)}
            </select>
          </label>
          <label className="grid min-w-0 gap-1 text-xs text-slate-300">执行 Tick
            <input className={field} inputMode="numeric" value={commandTick} onChange={(event) => setCommandTick(event.currentTarget.value)} />
          </label>
          {kind !== 'DEMONIC_TIDE' && <label className="grid min-w-0 gap-1 text-xs text-slate-300">{kind === 'SPAWN_TREASURE' ? '目标地点' : '目标修士'}
            <select className={field} value={target} onChange={(event) => setTarget(event.currentTarget.value)}>
              <option value="">请选择</option>
              {targetList?.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
            </select>
          </label>}
          {kind === 'WHISPER_MIND' && <label className="grid min-w-0 gap-1 text-xs text-slate-300">预设提示
            <select className={field} value={cue} onChange={(event) => {
              const value = event.currentTarget.value;
              if (Object.hasOwn(CUES, value)) setCue(value as Cue);
            }}>{Object.entries(CUES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
          </label>}
        </div>
        <button type="button" className={button} disabled={!next || tick === undefined || endTick === undefined || draft.commands.length >= SCENARIO_MAX_COMMANDS}
          onClick={() => {
            if (next && tick !== undefined && draft.commands.length < SCENARIO_MAX_COMMANDS) updateDraft((previous) => ({ ...previous, commands: [...previous.commands, { tick, command: next }].sort((a, b) => a.tick - b.tick) }));
          }}>加入指令</button>
        {draft.commands.length > 0 && <ol className="max-h-56 space-y-1.5 overflow-y-auto" aria-label="已编排的指令">
          {draft.commands.map(({ tick: when, command }, index) => <li key={`${when}:${index}`} className="flex min-w-0 flex-wrap items-center justify-between gap-1.5 rounded bg-slate-900 p-2 text-xs">
            <span className="min-w-0 break-words">第 {index + 1} 条 · Tick #{when} · {commandLabel(command, catalog)}</span>
            <button type="button" className={button} aria-label={`移除第 ${index + 1} 条指令`} onClick={() => updateDraft((previous) => ({ ...previous,
              commands: previous.commands.filter((_, row) => row !== index) }))}>移除</button>
          </li>)}
        </ol>}
      </details>
      <ScenarioObjectiveEditor key={`${draft.seed}:${draft.profileId}`} objectives={draft.objectives ?? []} catalog={catalog}
        onChange={(objectives) => updateDraft((previous) => ({ ...previous, objectives }))} />
      <ScenarioAuditCards world={world} />
      <EraDesignPanel world={world} />
      <div className={`${panel} space-y-1.5`}>
        <p className="text-xs text-slate-400">剧本文件只有谱系、种子、时限、预设指令与可选目标，不含存档数据、聊天原文或模型服务凭证。</p>
        <label className="grid min-w-0 gap-1 text-xs text-slate-300">导入剧本 JSON（最大 {kb} KiB）
          <input className={`${field} max-w-full py-1.5`} type="file" accept=".json,application/json" onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void importFile(file);
          }} />
        </label>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={button} disabled={Boolean(pending) || confirm} onClick={() => void run()}>离线预演</button>
          <button type="button" className={button} disabled={Boolean(pending) || confirm} onClick={exportDraft}>导出剧本 JSON</button>
          {pending && <button type="button" className={button} onClick={() => { cancelRun(); setNotice('已取消，当前世界未改动。'); }}>取消{pending === 'import' ? '读取' : '预演'}</button>}
        </div>
        <p role="status" className="break-words text-xs text-cyan-100">{pending === 'import' ? '正在校验剧本文件…' : pending === 'preview' ?
          progress ? `复演 Tick #${progress.tick}/${progress.endTick} · 已执行 ${progress.completedCommands}/${progress.totalCommands} 条` : '正在离线复演…' : notice}</p>
        {error && <p role="alert" className="break-words text-xs text-rose-200">{error}</p>}
      </div>
      {preview && <ScenarioResult preview={preview} ready={validPreview} changed={preview.authority !== world} confirming={confirm}
        onConfirm={() => setConfirm(true)} onCancel={() => setConfirm(false)} onApply={apply} />}
    </section>
  );
}

export function ScenarioResult({ preview, ready, changed, confirming, onConfirm, onCancel, onApply }: {
  preview: ScenarioPreview; ready: boolean; changed: boolean; confirming: boolean; onConfirm: () => void; onCancel: () => void; onApply: () => void;
}) {
  const { result, fixture } = preview;
  const living = result.cultivators.filter(({ alive }) => alive).length;
  const publicEvents = result.events.filter(({ witnessScope }) => witnessScope !== 'participants').slice().sort((a, b) => b.tick - a.tick).slice(0, 5);
  return (
    <section aria-label="离线剧本预演结果" className={panel}>
      <h5 className="text-xs font-semibold text-cyan-100">离线剧本预演结果 · 尚未载入</h5>
      <p className="break-words text-xs text-slate-300">种子 {fixture.seed} · {WORLDGEN_PROFILES[fixture.profileId].label} · Tick #{result.tick} · 编排 {fixture.commands.length} 条</p>
      <p className="text-xs text-slate-300">在世 {living} · 已陨落 {result.cultivators.length - living}</p>
      {publicEvents.length > 0 && <ul className="space-y-1 text-xs text-slate-400" aria-label="最近可见的公开纪事">
        {publicEvents.map((event) => <li key={event.id} className="break-words">Tick #{event.tick} · {event.title}</li>)}
      </ul>}
      <ScenarioAuditCards world={result} preview />
      {changed && <p className="text-xs text-amber-200">当前世界自预演开始后已变化。请暂停推演后重新预演。</p>}
      {!confirming ? <button type="button" className={button} disabled={!ready} onClick={onConfirm}>载入预演后的世界</button> : (
        <div className="space-y-1.5 rounded border border-amber-700 bg-amber-950/40 p-2 text-xs text-amber-100" aria-label="确认替换当前世界">
          <p>确认以预演后的 Tick #{result.tick} 替换当前世界？未存档进度和当前时间线会被替换。本机存档槽与模型设置仍保留。</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={button} disabled={!ready} onClick={onApply}>确认替换当前世界</button>
            <button type="button" className={button} onClick={onCancel}>取消</button>
          </div>
        </div>)}
    </section>
  );
}
