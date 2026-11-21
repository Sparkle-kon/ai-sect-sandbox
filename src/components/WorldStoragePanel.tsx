import { useEffect, useRef, useState } from 'react';
import type { WorldState } from '../types/world';
import {
  decodeWorldSave, encodeWorldSave, WORLD_SAVE_MAX_BYTES, WORLD_SAVE_MAX_SLOTS, worldSaveStore,
} from '../engine/storageEngine';
import type { SaveSlotSummary } from '../engine/storageEngine';

type Storage = Pick<typeof worldSaveStore, 'list' | 'load' | 'save' | 'delete'>;
type Confirmation =
  | { kind: 'overwrite'; slot: SaveSlotSummary; label: string }
  | { kind: 'delete' | 'restore'; slot: SaveSlotSummary }
  | { kind: 'import'; world: WorldState }
  | { kind: 'new'; seed: number };

export interface WorldStoragePanelProps {
  world: WorldState;
  busy: boolean;
  onRestore: (incoming: WorldState, expected: WorldState) => boolean;
  onNewWorld: (seed: number, expected: WorldState) => boolean;
  store?: Storage;
}

const defaultSlots = Array.from({ length: WORLD_SAVE_MAX_SLOTS }, (_, index) => ({ id: `slot-${index + 1}`, label: `存档位 ${index + 1}` }));
const field = 'min-w-0 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 disabled:opacity-40';
const button = 'rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 disabled:opacity-40';
const confirmButton = 'rounded border border-amber-400/60 bg-amber-700/50 px-2 py-1.5 text-xs font-medium text-amber-50 disabled:opacity-40';
const fileLimitMb = WORLD_SAVE_MAX_BYTES / (1024 * 1024);

export function parseWorldSeed(value: string): number | undefined {
  const trimmed = value.trim();
  const seed = Number(trimmed);
  return /^\d+$/.test(trimmed) && Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff ? seed : undefined;
}

export async function importWorldFile(file: Pick<File, 'size' | 'text'>): Promise<WorldState> {
  if (file.size <= 0 || file.size > WORLD_SAVE_MAX_BYTES) throw new Error(`文件须大于 0 且不超过 ${fileLimitMb} MiB。`);
  return decodeWorldSave(await file.text());
}

/** Stop before destructive work if the reviewed slot was changed while the question was open. */
export function sameSaveSlotRevision(reviewed: SaveSlotSummary | undefined, current: SaveSlotSummary | undefined): boolean {
  if (!reviewed || !current) return reviewed === current;
  return reviewed.id === current.id && reviewed.savedAt === current.savedAt &&
    reviewed.tick === current.tick && reviewed.seed === current.seed && reviewed.label === current.label;
}

function describeConfirmation(action: Confirmation): string {
  switch (action.kind) {
    case 'overwrite': return `以当前世界覆盖「${action.slot.label}」的 Tick #${action.slot.tick} 存档？旧版本将被替换。`;
    case 'delete': return `删除「${action.slot.label}」的 Tick #${action.slot.tick} 存档？仅删除本机此槽，不影响当前世界。`;
    case 'restore': return `读入「${action.slot.label}」的 Tick #${action.slot.tick} 存档？未保存的当前进度将被替换。`;
    case 'import': return `载入已校验文件中的种子 ${action.world.random.seed}、Tick #${action.world.tick}？未保存的当前进度将被替换。`;
    case 'new': return `用种子 ${action.seed} 建立新世界？未保存的当前进度将被替换，存档槽保留。`;
  }
}

export function WorldStoragePanel({ world, busy, onRestore, onNewWorld, store = worldSaveStore }: WorldStoragePanelProps) {
  const [slots, setSlots] = useState<SaveSlotSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [slotId, setSlotId] = useState(defaultSlots[0].id);
  const [label, setLabel] = useState('');
  const [seedText, setSeedText] = useState<string>();
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const [status, setStatus] = useState('');
  const [working, setWorking] = useState(false);
  const inFlight = useRef(false);
  const oldDownload = useRef<string>();
  const chosen = slots.find(({ id }) => id === slotId);
  const choices = [...defaultSlots, ...slots.filter((slot) => !defaultSlots.some(({ id }) => id === slot.id))];
  const seed = parseWorldSeed(seedText ?? String(world.random.seed));
  const blocked = busy || working || confirmation !== undefined;

  useEffect(() => {
    let ignore = false;
    void store.list().then((items) => {
      if (!ignore) { setSlots(items); setLoaded(true); }
    }).catch(() => {
      if (!ignore) setStatus('浏览器存档不可用；仍可导出或导入 JSON。');
    });
    return () => { ignore = true; };
  }, [store]);

  useEffect(() => () => {
    if (oldDownload.current) URL.revokeObjectURL(oldDownload.current);
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
    setSlots(next);
    setLoaded(true);
    return next;
  };
  const saveCurrent = () => {
    const nextLabel = label.trim() || chosen?.label || choices.find(({ id }) => id === slotId)?.label || '存档';
    if (chosen) { setConfirmation({ kind: 'overwrite', slot: chosen, label: nextLabel }); return; }
    void work(async () => {
      const current = (await updateSlots()).find(({ id }) => id === slotId);
      if (current) { setStatus('此槽刚有新存档，须先确认覆盖。'); return; }
      await store.save(slotId, nextLabel, world);
      await updateSlots();
      setStatus(`已保存「${nextLabel}」。`);
    });
  };

  const confirm = () => {
    if (!confirmation || busy || inFlight.current) return;
    const action = confirmation;
    const expected = world;
    setConfirmation(undefined);
    void work(async () => {
      if (action.kind === 'new' || action.kind === 'import') {
        const accepted = action.kind === 'new' ? onNewWorld(action.seed, expected) : onRestore(action.world, expected);
        if (!accepted) {
          setConfirmation(action);
          setStatus('世界已变化或正在推进，未覆盖。请核对后再确认。');
        } else {
          setSeedText(undefined);
          setStatus(action.kind === 'new' ? `已创建种子 ${action.seed} 的世界。` : '已从 JSON 文件载入世界。');
        }
        return;
      }
      const latest = (await updateSlots()).find(({ id }) => id === action.slot.id);
      if (!sameSaveSlotRevision(action.slot, latest)) { setStatus('该槽已变化，未执行。请重新选择。'); return; }
      if (action.kind === 'overwrite') {
        await store.save(action.slot.id, action.label, expected);
        await updateSlots();
        setStatus(`已覆盖保存「${action.label}」。`);
      } else if (action.kind === 'delete') {
        const removed = await store.delete(action.slot.id);
        await updateSlots();
        setStatus(removed ? `已删除「${action.slot.label}」。` : '该槽已无存档。');
      } else {
        const incoming = await store.load(action.slot.id);
        const afterRead = (await updateSlots()).find(({ id }) => id === action.slot.id);
        if (!sameSaveSlotRevision(action.slot, afterRead)) { setStatus('该槽在读取期间已变化，未载入。'); return; }
        if (onRestore(incoming, expected)) { setSeedText(undefined); setStatus(`已载入「${action.slot.label}」。`); }
        else { setConfirmation(action); setStatus('世界已变化或正在推进，未覆盖。请核对后再确认。'); }
      }
    });
  };

  const exportFile = () => {
    if (blocked) return;
    void work(async () => {
      const payload = encodeWorldSave(world);
      if (oldDownload.current) URL.revokeObjectURL(oldDownload.current);
      const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
      oldDownload.current = url;
      const link = document.createElement('a');
      link.href = url;
      link.download = `ai-sect-seed-${world.random.seed}-tick-${world.tick}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setStatus('已交给浏览器下载 JSON；请检查浏览器下载目录。');
    });
  };

  return (
    <section aria-label="存档与世界种子" className="min-w-0 space-y-3 rounded-xl border border-sky-400/25 bg-slate-900/70 p-3 text-slate-100 sm:p-4">
      <header>
        <h3 className="text-sm font-semibold text-sky-100">存档与世界种子</h3>
        <p className="text-xs text-slate-400">当前世界：种子 {world.random.seed} · Tick #{world.tick} · 仙历 {world.year} 年 {world.month} 月</p>
      </header>
      <button type="button" className={button} disabled={blocked} onClick={() => void work(async () => {
        await updateSlots();
        setStatus('已刷新本机存档槽。');
      })}>刷新存档槽</button>
      <fieldset disabled={blocked || !loaded} className="min-w-0 space-y-2 rounded border border-slate-800 p-2">
        <legend className="px-1 text-xs font-semibold text-slate-200">本机存档槽（{slots.length}/{WORLD_SAVE_MAX_SLOTS}）</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1 text-xs text-slate-300">选择存档槽
            <select className={field} value={slotId} onChange={(event) => { setSlotId(event.currentTarget.value); setLabel(''); }}>
              {choices.map((slot) => {
                const info = slots.find(({ id }) => id === slot.id);
                return <option key={slot.id} value={slot.id}>{info ? `${slot.label} · ${info.label}（Tick #${info.tick}）` : `${slot.label} · 空`}</option>;
              })}
            </select>
          </label>
          <label className="grid min-w-0 gap-1 text-xs text-slate-300">存档名称（可选）
            <input className={field} value={label} maxLength={60} placeholder={chosen?.label ?? '留空使用默认名称'}
              onChange={(event) => setLabel(event.currentTarget.value)} />
          </label>
        </div>
        {chosen && <p className="break-words text-xs text-slate-400">
          槽内：{chosen.label} · 种子 {chosen.seed} · 仙历 {chosen.year} 年 {chosen.month} 月 · Tick #{chosen.tick}
        </p>}
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={button} onClick={saveCurrent}>{chosen ? '覆盖存档' : '保存到此槽'}</button>
          <button type="button" className={button} disabled={!chosen} onClick={() => { if (chosen) setConfirmation({ kind: 'restore', slot: chosen }); }}>读取存档</button>
          <button type="button" className={button} disabled={!chosen} onClick={() => { if (chosen) setConfirmation({ kind: 'delete', slot: chosen }); }}>删除存档</button>
        </div>
      </fieldset>
      <fieldset disabled={blocked} className="min-w-0 space-y-2 rounded border border-slate-800 p-2">
        <legend className="px-1 text-xs font-semibold text-slate-200">JSON 文件</legend>
        <p className="text-xs leading-relaxed text-amber-200">存档与导出的 JSON 可能包含私密游戏对话。不会导出应用中的模型服务凭证或配置，但聊天原文会保留，请勿在对话中写入密钥；分享前请检查。</p>
        <div className="flex flex-wrap items-end gap-2">
          <button type="button" className={button} onClick={exportFile}>导出当前世界 JSON</button>
          <label className="grid min-w-0 gap-1 text-xs text-slate-300">
            选择导入文件（最大 {fileLimitMb} MiB）
            <input type="file" accept=".json,application/json" className={`${field} max-w-full`} onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (!file) return;
              void work(async () => {
                const incoming = await importWorldFile(file);
                setConfirmation({ kind: 'import', world: incoming });
              });
            }} />
          </label>
        </div>
      </fieldset>
      <fieldset disabled={blocked} className="min-w-0 space-y-2 rounded border border-slate-800 p-2">
        <legend className="px-1 text-xs font-semibold text-slate-200">建立新世界</legend>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => {
          event.preventDefault();
          if (!blocked && seed !== undefined) setConfirmation({ kind: 'new', seed });
        }}>
          <label className="grid min-w-0 gap-1 text-xs text-slate-300">世界种子（0 至 4294967295）
            <input type="text" inputMode="numeric" className={field} value={seedText ?? String(world.random.seed)}
              onChange={(event) => setSeedText(event.currentTarget.value)} />
          </label>
          <button type="submit" className={button} disabled={seed === undefined}>按种子创建世界</button>
        </form>
      </fieldset>
      {confirmation && (
        <section aria-label="确认存档操作" className="space-y-2 rounded border border-amber-500/60 bg-amber-950/50 p-2 text-xs text-amber-100">
          <p>{describeConfirmation(confirmation)}</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={confirmButton} disabled={busy || working} onClick={confirm}>确认执行</button>
            <button type="button" className={button} disabled={working} onClick={() => setConfirmation(undefined)}>取消</button>
          </div>
        </section>
      )}
      <p role="status" className="break-words text-xs text-sky-200">{working ? '处理中…' : status}</p>
    </section>
  );
}
