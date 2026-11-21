import { useEffect, useRef, useState } from 'react';
import type { WorldgenProfileId, WorldState } from '../types/world';
import {
  decodeWorldSave, encodeWorldSave, worldSaveByteCount, WORLD_SAVE_MAX_BYTES, WORLD_SAVE_MAX_SLOTS, worldSaveStore,
} from '../engine/storageEngine';
import type { SaveBranchSource, SavePointInfo, SaveSlotInspection, SaveSlotSummary } from '../engine/storageEngine';
import { isWorldgenProfileId, WORLDGEN_PROFILES } from '../engine/worldgenProfiles';

type Storage = Pick<typeof worldSaveStore, 'list' | 'inspect' | 'loadSelected' | 'save' | 'delete' | 'capabilities'>;
type Capabilities = Awaited<ReturnType<Storage['capabilities']>>;
type ContextStamp = { world: WorldState; version: number; branchId?: string; timelineId?: string };
type Confirmation =
  | { kind: 'overwrite'; review: SaveSlotInspection; label: string }
  | { kind: 'delete'; review: SaveSlotInspection }
  | { kind: 'restore'; info: SavePointInfo }
  | { kind: 'import'; world: WorldState }
  | { kind: 'new'; seed: number; profileId: WorldgenProfileId; expected: WorldState };
type Staged = { action: Confirmation; stamp: ContextStamp; store: Storage };

export interface WorldStoragePanelProps {
  world: WorldState;
  busy: boolean;
  readOnly?: boolean;
  sourceBranch?: SaveBranchSource;
  contextVersion?: number;
  canUseContext?: (world: WorldState, version: number) => boolean;
  onRestore: (incoming: WorldState, expected: WorldState, contextVersion?: number) => boolean;
  onNewWorld: (seed: number, profileId: WorldgenProfileId, expected: WorldState, contextVersion?: number) => boolean;
  store?: Storage;
}

const defaultSlots = Array.from({ length: WORLD_SAVE_MAX_SLOTS }, (_, index) => ({ id: `slot-${index + 1}`, label: `存档位 ${index + 1}` }));
const field = 'min-w-0 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 disabled:opacity-40';
const button = 'min-h-11 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 disabled:opacity-40';
const confirmButton = 'min-h-11 rounded border border-amber-400/60 bg-amber-700/50 px-2 py-1.5 text-xs font-medium text-amber-50 disabled:opacity-40';
const profileIds = Object.keys(WORLDGEN_PROFILES) as WorldgenProfileId[];
const profileName = (id: WorldgenProfileId | undefined) => id ? WORLDGEN_PROFILES[id].label : '谱系未记录';
const fileLimitMb = WORLD_SAVE_MAX_BYTES / (1024 * 1024);

export function parseWorldSeed(value: string): number | undefined {
  const trimmed = value.trim();
  const seed = Number(trimmed);
  return /^\d+$/.test(trimmed) && Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff ? seed : undefined;
}

export function stageWorldCreation(seedText: string, profileId: unknown, expected: WorldState): Extract<Confirmation, { kind: 'new' }> | undefined {
  const seed = parseWorldSeed(seedText);
  return seed !== undefined && isWorldgenProfileId(profileId) ? { kind: 'new', seed, profileId, expected } : undefined;
}

export async function importWorldFile(file: Pick<File, 'size' | 'text'>): Promise<WorldState> {
  if (file.size <= 0 || file.size > WORLD_SAVE_MAX_BYTES) throw new Error(`文件须大于 0 且不超过 ${fileLimitMb} MiB。`);
  return decodeWorldSave(await file.text());
}

/** Stop before destructive work if the reviewed slot was changed while the question was open. */
export function sameSaveSlotRevision(reviewed: SaveSlotSummary | undefined, current: SaveSlotSummary | undefined): boolean {
  if (!reviewed || !current) return reviewed === current;
  return reviewed.id === current.id && reviewed.savedAt === current.savedAt &&
    reviewed.tick === current.tick && reviewed.seed === current.seed && reviewed.label === current.label && reviewed.profileId === current.profileId;
}

export const sameStorageContext = (a: ContextStamp, b: ContextStamp) => a.world === b.world && a.version === b.version && a.branchId === b.branchId && a.timelineId === b.timelineId;
const pointLabel = (point: SavePointInfo['selection']['point']) => point === 'current' ? '当前版' : '恢复点';
const branchName = (source?: SaveBranchSource) => source ? source.label || source.branchId : '未记录来源分支';

export function describeConfirmation(action: Confirmation): string {
  switch (action.kind) {
    case 'overwrite': return `以所核对的世界保存到「${action.label}」？若当前版通过校验，会保留为恢复点；较早的恢复点可能被取代。`;
    case 'delete': return '删除此槽的当前版和恢复点（含已损坏的副本）？两份都将清除，不影响当前运行的世界。';
    case 'restore': {
      const { summary, selection } = action.info;
      return `载入「${summary.label}」的${pointLabel(selection.point)} · ${branchName(selection.sourceBranch)} · ${profileName(summary.profileId)} · Tick #${summary.tick}？未保存的当前进度会被替换；不会自动更改槽内副本。`;
    }
    case 'import': return `载入已校验文件中的种子 ${action.world.random.seed}、${profileName(action.world.worldgen?.profileId)}、Tick #${action.world.tick}？未保存的当前进度将被替换。`;
    case 'new': return `建立种子 ${action.seed} 的${profileName(action.profileId)}世界？未保存的当前进度将被替换。`;
  }
}

export function WorldStoragePanel({ world, busy, readOnly = false, sourceBranch, contextVersion = 0, canUseContext, onRestore, onNewWorld, store = worldSaveStore }: WorldStoragePanelProps) {
  const [slots, setSlots] = useState<SaveSlotSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities>();
  const [inspection, setInspection] = useState<{ review: SaveSlotInspection; stamp: ContextStamp; store: Storage }>();
  const [slotId, setSlotId] = useState(defaultSlots[0].id);
  const [label, setLabel] = useState('');
  const [seedText, setSeedText] = useState<string>();
  const [profileDraft, setProfileDraft] = useState<WorldgenProfileId>();
  const [staged, setStaged] = useState<Staged>();
  const [status, setStatus] = useState('');
  const [sizeInspection, setSizeInspection] = useState<{ world: WorldState; bytes: number | null }>();
  const [working, setWorking] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const oldDownload = useRef<string>();
  const chosen = slots.find(({ id }) => id === slotId);
  const choices = [...defaultSlots, ...slots.filter((slot) => !defaultSlots.some(({ id }) => id === slot.id))];
  const seedInput = seedText ?? String(world.random.seed);
  const seed = parseWorldSeed(seedInput);
  const generation = world.worldgen;
  const profileId = profileDraft ?? generation?.profileId ?? 'classic';
  const profile = WORLDGEN_PROFILES[profileId];
  const longestBirthPath = generation?.resources.reduce((limit, item) => Math.max(limit, item.pathSteps), 0) ?? 0;
  const context = { world, version: contextVersion, branchId: sourceBranch?.branchId, timelineId: sourceBranch?.timelineId };
  const observed = useRef({ ...context, store, slotId, busy, readOnly });
  observed.current = { ...context, store, slotId, busy, readOnly };
  const confirmation = staged && staged.store === store && sameStorageContext(staged.stamp, context) ? staged : undefined;
  const reviewed = inspection && inspection.store === store && inspection.review.id === slotId &&
    sameStorageContext(inspection.stamp, context) ? inspection.review : undefined;
  const blocked = busy || working || confirmation !== undefined;
  const writeAllowed = loaded && capabilities?.writable === true && !readOnly;
  const stillHere = (stamp: ContextStamp) => mounted.current && observed.current.store === store && sameStorageContext(stamp, observed.current);
  const authority = (stamp: ContextStamp) => stillHere(stamp) && !observed.current.busy && !observed.current.readOnly &&
    (canUseContext?.(stamp.world, stamp.version) ?? true);
  const stage = (action: Confirmation) => {
    if (authority(context)) setStaged({ action, stamp: context, store });
  };

  useEffect(() => {
    let ignore = false;
    setLoaded(false);
    setCapabilities(undefined);
    void Promise.all([store.capabilities(), store.list()]).then(([mode, items]) => {
      if (!ignore) { setCapabilities(mode); setSlots(items); setLoaded(true); }
    }).catch(() => {
      if (!ignore) setStatus(readOnly ? '浏览器存档不可用；仍可导出 JSON。' : '浏览器存档不可用；仍可导出或导入 JSON。');
    });
    return () => { ignore = true; };
  }, [store]);

  useEffect(() => {
    if (staged && !confirmation) {
      setStaged(undefined);
      setStatus('当前世界或分支已变化；旧确认失效，请重新核验。');
    }
  }, [staged, confirmation]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (oldDownload.current) URL.revokeObjectURL(oldDownload.current);
    };
  }, []);

  const work = async (operation: () => Promise<void>) => {
    if (busy || inFlight.current) return;
    inFlight.current = true;
    setWorking(true);
    setStatus('');
    try { await operation(); }
    catch (error) { setStatus(error instanceof Error ? error.message : '操作失败，当前世界未替换。'); }
    finally { inFlight.current = false; setWorking(false); }
  };

  const updateSlots = async () => {
    const next = await store.list();
    if (mounted.current && observed.current.store === store) { setSlots(next); setLoaded(true); }
    return next;
  };

  const summarizeWrite = async (success: string) => {
    try { await updateSlots(); setStatus(success); }
    catch { setStatus(`${success} 但暂不能刷新槽列表，请手动刷新。`); }
  };

  const verifySlot = () => {
    if (blocked || !loaded) return;
    setInspection(undefined);
    void work(async () => {
      const review = await store.inspect(slotId);
      if (!stillHere(context) || review.id !== slotId || observed.current.slotId !== slotId) {
        setStatus('核验期间世界、分支或存档槽已变化，旧结果未使用。');
        return;
      }
      setInspection({ review, stamp: context, store });
      setStatus(review.headRevision === null && !review.current && !review.previous && !review.currentDamaged && !review.previousDamaged
        ? '此槽没有可用的存档记录。' : '已检查两份副本。载入前仍需选择并确认。');
    });
  };

  const saveCurrent = () => {
    if (!writeAllowed || blocked || !reviewed || !authority(context)) return;
    const nextLabel = label.trim() || reviewed.current?.summary.label || reviewed.previous?.summary.label ||
      chosen?.label || choices.find(({ id }) => id === slotId)?.label || '存档';
    if (reviewed.headRevision !== null) {
      if (!reviewed.current) return;
      stage({ kind: 'overwrite', review: reviewed, label: nextLabel });
      return;
    }
    // Head absence is verified again by the storage transaction; never overwrite a racing insert.
    if (reviewed.current || reviewed.previous || reviewed.currentDamaged || reviewed.previousDamaged) {
      setStatus('此槽没有可写的已核验修订，未保存。请先导出游戏 JSON。');
      return;
    }
    void work(async () => {
      await store.save(slotId, nextLabel, context.world, null, sourceBranch);
      setInspection(undefined);
      await summarizeWrite(`已保存「${nextLabel}」。要载入时请重新核验。`);
    });
  };

  const confirm = () => {
    if (!confirmation || busy || inFlight.current) return;
    const { action, stamp } = confirmation;
    setStaged(undefined);
    if (!authority(stamp)) { setStatus('当前世界或分支已变化；未执行。'); return; }
    void work(async () => {
      if (action.kind === 'overwrite' || action.kind === 'delete') {
        if (!writeAllowed || action.review.headRevision === null) return;
        setInspection(undefined);
        if (action.kind === 'overwrite') {
          await store.save(action.review.id, action.label, stamp.world, action.review.headRevision, sourceBranch);
          await summarizeWrite(`已保存「${action.label}」。恢复点未被载入。`);
        } else {
          const removed = await store.delete(action.review.id, action.review.headRevision);
          await summarizeWrite(removed ? '已删除此槽的当前版和恢复点。' : '此槽已无存档。');
        }
        return;
      }
      const incoming = action.kind === 'restore' ? await store.loadSelected(action.info.selection) : action.kind === 'import' ? action.world : undefined;
      if (!authority(stamp)) { setStatus('世界或分支在读取期间变化，当前进度未覆盖。请重新核验。'); return; }
      const accepted = action.kind === 'new'
        ? onNewWorld(action.seed, action.profileId, stamp.world, stamp.version)
        : incoming !== undefined && onRestore(incoming, stamp.world, stamp.version);
      if (!accepted) {
        setStatus('当前世界已变化或正在推进，未覆盖。请暂停推演后重新核验。');
        return;
      }
      setSeedText(undefined);
      setProfileDraft(undefined);
      setInspection(undefined);
      setStatus(action.kind === 'new' ? `已创建种子 ${action.seed}、${profileName(action.profileId)}谱系的世界。`
        : action.kind === 'restore' ? `已载入${pointLabel(action.info.selection.point)}。存档槽未更改。` : '已从 JSON 文件载入世界。');
    });
  };

  useEffect(() => { setSizeInspection(undefined); }, [world]);

  const inspectSize = () => {
    if (blocked) return;
    try { setSizeInspection({ world, bytes: worldSaveByteCount(world) }); }
    catch { setSizeInspection({ world, bytes: null }); }
  };

  const downloadWorld = (snapshot: WorldState, prefix = 'ai-sect') => {
    const payload = encodeWorldSave(snapshot);
    if (oldDownload.current) URL.revokeObjectURL(oldDownload.current);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    oldDownload.current = url;
    const link = document.createElement('a');
    link.href = url;
    link.download = `${prefix}-seed-${snapshot.random.seed}-tick-${snapshot.tick}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const exportFile = () => {
    if (blocked) return;
    void work(async () => {
      downloadWorld(world);
      setStatus('已交给浏览器下载 JSON；请检查浏览器下载目录。');
    });
  };

  const exportPoint = (info: SavePointInfo) => {
    if (blocked) return;
    void work(async () => {
      const snapshot = await store.loadSelected(info.selection);
      if (!stillHere(context)) { setStatus('世界或分支在读取期间变化，未导出该副本。'); return; }
      downloadWorld(snapshot, info.selection.point === 'previous' ? 'ai-sect-recovery' : 'ai-sect-saved');
      setStatus(`已交给浏览器下载${pointLabel(info.selection.point)} JSON；槽内副本未更改。`);
    });
  };

  return (
    <section aria-label="存档与世界种子" className="min-w-0 space-y-3 rounded-xl border border-sky-400/25 bg-slate-900/70 p-3 text-slate-100 sm:p-4">
      <header>
        <h3 className="text-sm font-semibold text-sky-100">存档与世界种子</h3>
        <p className="text-xs text-slate-400">当前世界：种子 {world.random.seed} · Tick #{world.tick} · 仙历 {world.year} 年 {world.month} 月</p>
      </header>
      <details className="rounded border border-slate-800 bg-slate-950/50">
        <summary className="min-h-11 cursor-pointer break-words px-2 py-3 text-xs font-semibold text-sky-100">
          创世记录 · {generation ? profileName(generation.profileId) : '旧档未记录谱系'}
        </summary>
        <div className="space-y-1.5 border-t border-slate-800 px-2 py-2 text-xs text-slate-300">
          {generation ? (
            <>
              <p>出生种子 {generation.seed} · Tick #{generation.birthTick} · 生成器 v{generation.algorithm}</p>
              <p>起步资源通达检核：{generation.resources.length ? `记录 ${generation.resources.length} 位初始修士，最长 ${longestBirthPath} 步地格路径。` : '没有记录初始修士的通达路径。'}</p>
              <p className="text-slate-400">只记录诞生时的种子、谱系和可达路径。后来的灵脉改动、灾害、迁徙和资源消耗不在这份检核中。</p>
            </>
          ) : <p>此世界没有创世检核记录，不能用现在的地形或资源倒推出初生通达性。</p>}
        </div>
      </details>
      <button type="button" className={button} disabled={blocked} onClick={() => {
        setInspection(undefined);
        void work(async () => {
          const mode = await store.capabilities();
          await updateSlots();
          setCapabilities(mode);
          setStatus('已刷新本机存档槽；副本尚需单独核验。');
        });
      }}>刷新存档槽</button>
      {capabilities && <p className="text-xs break-words text-slate-400">{capabilities.backend === 'indexeddb'
        ? '浏览器数据库' : capabilities.backend === 'localstorage' ? '旧浏览器本地存储' : '临时内存'} · {capabilities.writable && !readOnly ? '可写' : '只读'}
        {capabilities.recovery ? ' · 支持独立恢复点' : ' · 不保证保留恢复点'}{capabilities.backend === 'memory' && ' · 关闭此页不保证保留。'}</p>}
      <fieldset disabled={blocked || !loaded} className="min-w-0 space-y-2 rounded border border-slate-800 p-2">
        <legend className="px-1 text-xs font-semibold text-slate-200">本机存档槽（{slots.length}/{WORLD_SAVE_MAX_SLOTS}）</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1 text-xs text-slate-300">选择存档槽
            <select className={field} value={slotId} onChange={(event) => { setSlotId(event.currentTarget.value); setLabel(''); setInspection(undefined); }}>
              {choices.map((slot) => {
                const info = slots.find(({ id }) => id === slot.id);
                return <option key={slot.id} value={slot.id}>{info ? `${slot.label} · ${info.label}（Tick #${info.tick}）` : `${slot.label} · 未列出`}</option>;
              })}
            </select>
          </label>
          <label className="grid min-w-0 gap-1 text-xs text-slate-300">存档名称（可选）
            <input className={field} value={label} maxLength={60} placeholder={chosen?.label ?? '留空使用默认名称'}
              onChange={(event) => setLabel(event.currentTarget.value)} />
          </label>
        </div>
        {chosen && <p className="break-words text-xs text-slate-400">
          列表元数据（未核验）：{chosen.label} · 种子 {chosen.seed} · {profileName(chosen.profileId)} · 仙历 {chosen.year} 年 {chosen.month} 月 · Tick #{chosen.tick}
        </p>}
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={button} onClick={verifySlot}>核验此槽</button>
          <button type="button" className={button} disabled={!writeAllowed || !reviewed ||
            (reviewed.headRevision !== null ? !reviewed.current : Boolean(reviewed.currentDamaged || reviewed.previousDamaged || reviewed.current || reviewed.previous))}
            onClick={saveCurrent}>{reviewed?.headRevision ? '覆盖保存' : '保存到此槽'}</button>
          <button type="button" className={button} disabled={!writeAllowed || !reviewed?.headRevision}
            onClick={() => { if (reviewed?.headRevision) stage({ kind: 'delete', review: reviewed }); }}>删除存档</button>
        </div>
        {!reviewed && <p className="text-xs text-slate-400">请先核验此槽，再选择要读取的存档副本。</p>}
        {reviewed?.currentDamaged && <p className="text-xs text-amber-200">当前版损坏，此槽不得直接覆盖。请先导出已校验的恢复点或载入后另存新槽。</p>}
        {reviewed && <SavePointRows review={reviewed} recoverySupported={capabilities?.recovery === true}
          readOnly={readOnly} onLoad={(info) => stage({ kind: 'restore', info })} onExport={exportPoint} />}
      </fieldset>
      <fieldset disabled={blocked} className="min-w-0 space-y-2 rounded border border-slate-800 p-2">
        <legend className="px-1 text-xs font-semibold text-slate-200">JSON 文件</legend>
        <p className="text-xs leading-relaxed text-amber-200">存档与导出的 JSON 可能包含私密游戏对话。不会导出应用中的模型服务凭证或配置，但聊天原文会保留，请勿在对话中写入密钥；分享前请检查。</p>
        <div className="flex flex-wrap items-end gap-2">
          <button type="button" className={button} onClick={exportFile}>导出当前世界 JSON</button>
          <button type="button" className={`${button} min-h-11`} onClick={inspectSize}>测量当前存档大小</button>
          <label className="grid min-w-0 gap-1 text-xs text-slate-300">
            选择导入文件（最大 {fileLimitMb} MiB）
            <input type="file" accept=".json,application/json" disabled={readOnly} className={`${field} max-w-full`} onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (!file || !authority(context)) return;
              void work(async () => {
                const incoming = await importWorldFile(file);
                if (!authority(context)) { setStatus('世界或分支在校验文件期间变化，请重新选择。'); return; }
                stage({ kind: 'import', world: incoming });
              });
            }} />
          </label>
        </div>
        <p className="text-xs text-slate-400">测量的是导出 JSON 的 UTF-8 字节数，不下载文件，也不是浏览器内存占用。</p>
        {sizeInspection?.world === world && <p className="text-xs text-sky-100" role="status">
          {sizeInspection.bytes === null ? '当前存档大小暂不可测。' :
            `Tick #${world.tick} · ${sizeInspection.bytes.toLocaleString('zh-CN')} 字节${sizeInspection.bytes > WORLD_SAVE_MAX_BYTES ? '，超过单个 JSON 文件上限' : ''}。`}
        </p>}
      </fieldset>
      <fieldset disabled={blocked || readOnly} className="min-w-0 space-y-2 rounded border border-slate-800 p-2">
        <legend className="px-1 text-xs font-semibold text-slate-200">建立新世界</legend>
        <form className="grid min-w-0 gap-2" onSubmit={(event) => {
          event.preventDefault();
          const staged = stageWorldCreation(seedInput, profileId, world);
          if (!blocked && staged) stage(staged);
        }}>
          <label className="grid min-w-0 gap-1 text-xs text-slate-300">世界种子（0 至 4294967295）
            <input type="text" inputMode="numeric" className={field} value={seedInput}
              onChange={(event) => setSeedText(event.currentTarget.value)} />
          </label>
          <label className="grid min-w-0 gap-1 text-xs text-slate-300">世界生成谱系
            <select className={`${field} min-h-11 w-full`} value={profileId} onChange={(event) => {
              if (isWorldgenProfileId(event.currentTarget.value)) setProfileDraft(event.currentTarget.value);
            }}>
              {profileIds.map((id) => <option key={id} value={id}>{WORLDGEN_PROFILES[id].label}</option>)}
            </select>
          </label>
          <div className="min-w-0 space-y-1 rounded border border-slate-800 bg-slate-950/50 p-2 text-xs text-slate-300">
            <p className="break-words">{profile.description}</p>
            <p className="break-words text-slate-400">气候：{profile.climateLabel} · 势力：{profile.factionLabel} · 资源：{profile.scarcityLabel}</p>
          </div>
          <button type="submit" className={`${button} min-h-11 justify-self-start`} disabled={seed === undefined}>按种子创建世界</button>
        </form>
      </fieldset>
      {confirmation && (
        <section aria-label="确认存档操作" className="space-y-2 rounded border border-amber-500/60 bg-amber-950/50 p-2 text-xs text-amber-100">
          <p>{describeConfirmation(confirmation.action)}</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={confirmButton} disabled={busy || readOnly || working} onClick={confirm}>确认执行</button>
            <button type="button" className={button} disabled={working} onClick={() => setStaged(undefined)}>取消</button>
          </div>
        </section>
      )}
      <p role="status" className="break-words text-xs text-sky-200">{working ? '处理中…' : status}</p>
    </section>
  );
}

export function SavePointRows({ review, recoverySupported, readOnly, onLoad, onExport }: {
  review: SaveSlotInspection; recoverySupported: boolean; readOnly: boolean;
  onLoad: (info: SavePointInfo) => void; onExport: (info: SavePointInfo) => void;
}) {
  return <div className="grid min-w-0 gap-2 sm:grid-cols-2" aria-label="核验后的存档副本">
    {(['current', 'previous'] as const).map((point) => {
      const info = review[point];
      const damaged = point === 'current' ? review.currentDamaged : review.previousDamaged;
      const title = pointLabel(point);
      return <section key={point} className="min-w-0 space-y-1 rounded border border-slate-800 p-2 text-xs text-slate-300">
        <h4 className="font-semibold text-sky-100">{title} · {info ? '已校验' : damaged ? '完整性校验失败' : point === 'previous' && !recoverySupported ? '后端不提供' : '未保存'}</h4>
        {info ? <>
          <p className="break-words">{info.summary.label} · Tick #{info.summary.tick} · 种子 {info.summary.seed} · {profileName(info.summary.profileId)}</p>
          <p className="break-words">来源分支：{branchName(info.selection.sourceBranch)}</p>
          <div className="flex flex-wrap gap-1">
            <button type="button" className={button} disabled={readOnly} onClick={() => onLoad(info)}>读取{title}</button>
            <button type="button" className={button} onClick={() => onExport(info)}>导出{title} JSON</button>
          </div>
        </> : damaged ? <p>不读取、不自动替换。可另选通过校验的副本。</p> : null}
      </section>;
    })}
  </div>;
}
