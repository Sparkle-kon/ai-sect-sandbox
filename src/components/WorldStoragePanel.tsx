import { useEffect, useRef, useState } from 'react';
import type { WorldgenProfileId, WorldState } from '../types/world';
import {
  decodeWorldSave, encodeWorldSave, WORLD_SAVE_MAX_BYTES, WORLD_SAVE_MAX_SLOTS, worldSaveStore,
} from '../engine/storageEngine';
import type {
  SaveBranchSource, SavePointInfo, SaveResumeAddress, SaveResumePairReview, SaveSlotInspection, SaveSlotSummary,
} from '../engine/storageEngine';
import { SaveResumeComparison } from './SaveResumeComparison';
import { measureSaveCapacity, prepareArchiveOptimization, type NarrativeArchivePlan, type SaveCapacityReport } from '../engine/saveCapacityEngine';
import {
  buildConfirmedShareSave, inspectShareSavePrivacy, prepareShareSavePrivacy,
  type ShareSavePrivacyInspection, type ShareSavePrivacyReview,
} from '../engine/shareSavePrivacy';
import type { WorldTimeline } from '../engine/timelineEngine';
import { isWorldgenProfileId, WORLDGEN_PROFILES } from '../engine/worldgenProfiles';

type Storage = Pick<typeof worldSaveStore, 'list' | 'inspect' | 'loadSelected' | 'save' | 'delete' | 'capabilities'> &
  Partial<Pick<typeof worldSaveStore, 'reviewResumePair' | 'loadReviewedResume'>>;
type ResumeSide = 'left' | 'right';
type Capabilities = Awaited<ReturnType<Storage['capabilities']>>;
type ContextStamp = { world: WorldState; version: number; branchId?: string; timelineId?: string };
type Confirmation =
  | { kind: 'overwrite'; review: SaveSlotInspection; label: string }
  | { kind: 'delete'; review: SaveSlotInspection }
  | { kind: 'restore'; info: SavePointInfo }
  | { kind: 'restore_compare'; review: SaveResumePairReview; side: ResumeSide }
  | { kind: 'import'; world: WorldState }
  | { kind: 'new'; seed: number; profileId: WorldgenProfileId; expected: WorldState };
type Staged = { action: Confirmation; stamp: ContextStamp; store: Storage };
type SnapshotReview<T> = { result: T; stamp: ContextStamp; timeline?: WorldTimeline };

export interface WorldStoragePanelProps {
  world: WorldState;
  busy: boolean;
  readOnly?: boolean;
  sourceBranch?: SaveBranchSource;
  contextVersion?: number;
  canUseContext?: (world: WorldState, version: number) => boolean;
  timeline?: WorldTimeline;
  onArchiveNarrative?: (plan: NarrativeArchivePlan, expected: WorldState, contextVersion: number, sourceBranch?: SaveBranchSource) => Promise<boolean>;
  onRestore: (incoming: WorldState, expected: WorldState, contextVersion?: number, verifiedSource?: SaveBranchSource) => boolean;
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
export const sameStorageReview = <T,>(review: SnapshotReview<T> | undefined, stamp: ContextStamp, timeline?: WorldTimeline): review is SnapshotReview<T> =>
  review !== undefined && review.timeline === timeline && sameStorageContext(review.stamp, stamp);
export const canDownloadPreparedSave = (report: SaveCapacityReport): boolean => report.withinLimit === true &&
  report.jsonBytes !== null && report.jsonBytes > 0 && report.jsonBytes <= report.limitBytes;
const bytes = (value: number | null) => value === null ? '暂不可测' : `${value.toLocaleString('zh-CN')} 字节`;
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
    case 'restore_compare': {
      const candidate = action.review[action.side];
      if (candidate.status !== 'available') return '所选候选尚不可载入。';
      const { summary, selection } = candidate.info;
      const slot = defaultSlots.find(({ id }) => id === selection.slotId)?.label ?? selection.slotId;
      return `续起 ${slot} 的${pointLabel(selection.point)}「${summary.label}」 · ${branchName(selection.sourceBranch)} · Tick #${summary.tick}？会重新核验两处。未保存的当前进度将被替换，两处原候选不改动。`;
    }
    case 'import': return `载入已校验文件中的种子 ${action.world.random.seed}、${profileName(action.world.worldgen?.profileId)}、Tick #${action.world.tick}？未保存的当前进度将被替换。`;
    case 'new': return `建立种子 ${action.seed} 的${profileName(action.profileId)}世界？未保存的当前进度将被替换。`;
  }
}

export function WorldStoragePanel({ world, busy, readOnly = false, sourceBranch, contextVersion = 0, canUseContext, timeline,
  onArchiveNarrative, onRestore, onNewWorld, store = worldSaveStore }: WorldStoragePanelProps) {
  const [slots, setSlots] = useState<SaveSlotSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities>();
  const [inspection, setInspection] = useState<{ review: SaveSlotInspection; stamp: ContextStamp; store: Storage }>();
  const [resumeAddresses, setResumeAddresses] = useState<Partial<Record<ResumeSide, Partial<SaveResumeAddress>>>>({});
  const [resumeReview, setResumeReview] = useState<{ result: SaveResumePairReview; stamp: ContextStamp; store: Storage; revision: number }>();
  const resumeRevision = useRef(0);
  const [slotId, setSlotId] = useState(defaultSlots[0].id);
  const [label, setLabel] = useState('');
  const [seedText, setSeedText] = useState<string>();
  const [profileDraft, setProfileDraft] = useState<WorldgenProfileId>();
  const [staged, setStaged] = useState<Staged>();
  const [status, setStatus] = useState('');
  const [preflight, setPreflight] = useState<SnapshotReview<{
    capacity: SaveCapacityReport; privacy?: ShareSavePrivacyInspection;
  }>>();
  const [shareReview, setShareReview] = useState<SnapshotReview<ShareSavePrivacyReview>>();
  const [archiveReview, setArchiveReview] = useState<SnapshotReview<NarrativeArchivePlan>>();
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
  const observed = useRef({ ...context, store, slotId, busy, readOnly, timeline });
  observed.current = { ...context, store, slotId, busy, readOnly, timeline };
  const confirmation = staged && staged.store === store && sameStorageContext(staged.stamp, context) ? staged : undefined;
  const paired = resumeReview && resumeReview.store === store && resumeReview.revision === resumeRevision.current &&
    sameStorageContext(resumeReview.stamp, context) ? resumeReview.result : undefined;
  const reviewed = inspection && inspection.store === store && inspection.review.id === slotId &&
    sameStorageContext(inspection.stamp, context) ? inspection.review : undefined;
  const blocked = busy || working || confirmation !== undefined;
  const currentPreflight = sameStorageReview(preflight, context, timeline) ? preflight : undefined;
  const currentShareReview = sameStorageReview(shareReview, context, timeline) ? shareReview : undefined;
  const currentArchive = sameStorageReview(archiveReview, context, timeline) ? archiveReview : undefined;
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

  const changeResumeAddress = (side: ResumeSide, address: Partial<SaveResumeAddress>) => {
    resumeRevision.current += 1;
    setResumeReview(undefined);
    setResumeAddresses((previous) => ({ ...previous, [side]: address }));
  };
  const verifyResumePair = () => {
    const complete = (value?: Partial<SaveResumeAddress>): SaveResumeAddress | undefined =>
      value?.slotId && value.point ? { slotId: value.slotId, point: value.point } : undefined;
    const left = complete(resumeAddresses.left), right = complete(resumeAddresses.right);
    if (blocked || !store.reviewResumePair || !left || !right || !stillHere(context) ||
        left.slotId === right.slotId && left.point === right.point) return;
    const revision = ++resumeRevision.current;
    setResumeReview(undefined);
    void work(async () => {
      const result = await store.reviewResumePair?.(left, right);
      if (!result || !stillHere(context) || resumeRevision.current !== revision) return;
      setResumeReview({ result, stamp: context, store, revision });
      setStatus(result.left.status === 'unsupported' && result.right.status === 'unsupported'
        ? '此存储不支持同时核验两处；没有载入或更改任何存档。'
        : '已检查两处；没有自动选档。请从可用候选中明确选择。');
    });
  };
  const chooseResume = (side: ResumeSide) => {
    if (paired?.[side].status === 'available' && store.loadReviewedResume && !blocked)
      stage({ kind: 'restore_compare', review: paired, side });
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
      let incoming: WorldState | undefined;
      let verifiedSource: SaveBranchSource | undefined;
      if (action.kind === 'restore') {
        incoming = await store.loadSelected(action.info.selection);
        verifiedSource = action.info.selection.sourceBranch;
      } else if (action.kind === 'import') incoming = action.world;
      else if (action.kind === 'restore_compare') {
        setResumeReview(undefined);
        const candidate = action.review[action.side];
        if (candidate.status !== 'available' || !store.loadReviewedResume) return;
        const compared = await store.loadReviewedResume(action.review, action.side);
        if (compared.selection.seal !== candidate.info.selection.seal ||
            compared.selection.headRevision !== candidate.info.selection.headRevision ||
            compared.selection.slotId !== candidate.info.selection.slotId || compared.selection.point !== candidate.info.selection.point) {
          setStatus('档位校验凭据已变化，未载入。请重新对照。');
          return;
        }
        incoming = compared.world;
        verifiedSource = compared.selection.sourceBranch;
      }
      if (!authority(stamp)) { setStatus('世界或分支在读取期间变化，当前进度未覆盖。请重新核验。'); return; }
      const accepted = action.kind === 'new'
        ? onNewWorld(action.seed, action.profileId, stamp.world, stamp.version)
        : incoming !== undefined && (verifiedSource ?
          onRestore(incoming, stamp.world, stamp.version, verifiedSource) : onRestore(incoming, stamp.world, stamp.version));
      if (!accepted) {
        setStatus('当前世界已变化或正在推进，未覆盖。请暂停推演后重新核验。');
        return;
      }
      setSeedText(undefined);
      setProfileDraft(undefined);
      setInspection(undefined);
      setResumeReview(undefined);
      if (action.kind === 'restore_compare') {
        const candidate = action.review[action.side];
        if (candidate.status === 'available') {
          const { summary, selection } = candidate.info;
          const slot = defaultSlots.find(({ id }) => id === selection.slotId)?.label ?? selection.slotId;
          setStatus(`已从 ${slot} 的${pointLabel(selection.point)}第 ${summary.tick} 轮续起。两处原候选均未更改。`);
        }
        return;
      }
      setStatus(action.kind === 'new' ? `已创建种子 ${action.seed}、${profileName(action.profileId)}谱系的世界。`
        : action.kind === 'restore' ? `已载入${pointLabel(action.info.selection.point)}。存档槽未更改。`
        : '已从 JSON 文件载入世界。');
    });
  };

  useEffect(() => {
    if (preflight && !currentPreflight) setPreflight(undefined);
    if (shareReview && !currentShareReview) setShareReview(undefined);
    if (archiveReview && !currentArchive) setArchiveReview(undefined);
  }, [preflight, currentPreflight, shareReview, currentShareReview, archiveReview, currentArchive]);

  const inspectCapacity = () => {
    if (blocked || inFlight.current || !stillHere(context)) return;
    const capacity = measureSaveCapacity(world, timeline);
    let privacy: ShareSavePrivacyInspection | undefined;
    try { privacy = inspectShareSavePrivacy(world); } catch { /* Ordinary export remains independent. */ }
    setShareReview(undefined);
    setPreflight({ stamp: context, timeline, result: { capacity, privacy } });
  };

  const downloadJson = (payload: string, filename: string, reviewedBytes?: number) => {
    const blob = new Blob([payload], { type: 'application/json' });
    if (reviewedBytes !== undefined && blob.size !== reviewedBytes) throw new Error('JSON 大小已变化，未下载。请重新预检。');
    if (oldDownload.current) URL.revokeObjectURL(oldDownload.current);
    const url = URL.createObjectURL(blob);
    oldDownload.current = url;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const downloadWorld = (snapshot: WorldState, prefix = 'ai-sect', reviewedBytes?: number) =>
    downloadJson(encodeWorldSave(snapshot), `${prefix}-seed-${snapshot.random.seed}-tick-${snapshot.tick}.json`, reviewedBytes);

  const exportFile = () => {
    if (blocked || !currentPreflight || !canDownloadPreparedSave(currentPreflight.result.capacity)) return;
    void work(async () => {
      if (!stillHere(currentPreflight.stamp) || !sameStorageReview(currentPreflight, observed.current, observed.current.timeline)) {
        setStatus('世界、分支或快照在预检后已变化，未下载。请重新预检。');
        return;
      }
      downloadWorld(currentPreflight.stamp.world, 'ai-sect', currentPreflight.result.capacity.jsonBytes ?? undefined);
      setStatus('已交给浏览器下载 JSON；请检查浏览器下载目录。');
    });
  };

  const exactShareReview = <T,>(review: SnapshotReview<T>) =>
    stillHere(review.stamp) && !observed.current.busy && sameStorageReview(review, observed.current, observed.current.timeline) &&
    (canUseContext?.(review.stamp.world, review.stamp.version) ?? true);

  const prepareShare = () => {
    if (blocked || !currentPreflight?.result.privacy || !exactShareReview(currentPreflight)) return;
    void work(async () => {
      try {
        const result = prepareShareSavePrivacy(currentPreflight.stamp.world);
        if (!exactShareReview(currentPreflight)) return;
        setShareReview({ stamp: currentPreflight.stamp, timeline: currentPreflight.timeline, result });
      } catch {
        setStatus('无法校验脱敏副本，未下载，也未更改原档。');
      }
    });
  };

  const confirmShare = () => {
    if (blocked || !currentShareReview || !canDownloadShareSave(currentShareReview.result) || !exactShareReview(currentShareReview)) return;
    void work(async () => {
      if (!exactShareReview(currentShareReview)) return;
      setShareReview(undefined);
      try {
        const { stamp, result } = currentShareReview;
        const payload = buildConfirmedShareSave(stamp.world, result);
        if (!payload || payload.bytes !== result.redactedBytes || !exactShareReview(currentShareReview)) {
          setStatus('副本或世界在确认前已变化，未下载。请重新预检。');
          return;
        }
        downloadJson(payload.json, `ai-sect-share-seed-${stamp.world.random.seed}-tick-${stamp.world.tick}.json`, payload.bytes);
        setStatus('已交给浏览器下载脱敏副本；未上传，也未更改原档。');
      } catch {
        setStatus('未能下载已校验的脱敏副本；未更改原档。');
      }
    });
  };

  const stageArchive = () => {
    if (blocked || inFlight.current || !onArchiveNarrative || !authority(context)) return;
    setArchiveReview(undefined);
    setStatus('');
    try { setArchiveReview({ stamp: context, timeline, result: prepareArchiveOptimization(context.world) }); }
    catch { setStatus('目前无法预览旧章归档；当前世界未改变。'); }
  };

  const confirmArchive = () => {
    if (blocked || !onArchiveNarrative || !currentArchive || currentArchive.result.movedCount <= 0 ||
      !authority(currentArchive.stamp) || !sameStorageReview(currentArchive, observed.current, observed.current.timeline)) return;
    const { result, stamp } = currentArchive;
    setArchiveReview(undefined);
    void work(async () => {
      const applied = await onArchiveNarrative(result, stamp.world, stamp.version, sourceBranch);
      setStatus(applied ? `已移动 ${result.movedCount} 章到本分支远纪档案，没有删除章节。重新预检可查看当前文件大小。`
        : '世界、分支或归档候选已变化，未迁移。请重新预览。');
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
      {store.reviewResumePair && store.loadReviewedResume && <SaveResumeComparison slots={choices} left={resumeAddresses.left}
        right={resumeAddresses.right} review={paired} disabled={blocked || !loaded}
        readOnly={readOnly} onAddress={changeResumeAddress} onReview={verifyResumePair} onChoose={chooseResume} />}
      <fieldset disabled={blocked} className="min-w-0 space-y-2 rounded border border-slate-800 p-2">
        <legend className="px-1 text-xs font-semibold text-slate-200">JSON 文件</legend>
        <p className="text-xs leading-relaxed text-amber-200">存档与完整导出的 JSON 可能包含私密游戏对话。不会导出应用中的模型服务凭证或配置，但完整副本保留聊天原文，请勿在对话中写入密钥；分享前请检查。</p>
        <div className="flex flex-wrap items-end gap-2">
          <button type="button" className={button} onClick={inspectCapacity}>预检当前世界 JSON</button>
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
        <p className="text-xs text-slate-400">预检测量导出 JSON 的 UTF-8 字节数，不下载文件，也不是浏览器内存占用。</p>
        {currentPreflight && <>
          <SaveCapacityResult report={currentPreflight.result.capacity} onDownload={exportFile} />
          {currentPreflight.result.privacy
            ? <ShareSavePrivacySummary inspection={currentPreflight.result.privacy} onPrepare={currentShareReview ? undefined : prepareShare} />
            : <p className="text-xs text-slate-400">暂无法统计隐私字段；未显示原文，也不提供脱敏副本。</p>}
          {currentShareReview && <ShareSavePrivacyConfirmation review={currentShareReview.result}
            onConfirm={confirmShare} onCancel={() => setShareReview(undefined)} />}
        </>}
        {onArchiveNarrative && !readOnly && <div className="space-y-2 border-t border-slate-800 pt-2">
          <button type="button" className={button} onClick={stageArchive}>预览旧章归档</button>
          {currentArchive && <ArchiveOptimizationReview plan={currentArchive.result} onApply={confirmArchive}
            onCancel={() => setArchiveReview(undefined)} />}
        </div>}
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

export function SaveCapacityResult({ report, onDownload }: { report: SaveCapacityReport; onDownload: () => void }) {
  return <div aria-label="当前 JSON 预检结果" className="min-w-0 space-y-1.5 rounded border border-slate-800 p-2 text-xs text-slate-300">
    <p className="break-words text-sky-100" role="status">Tick #{report.tick} · JSON {bytes(report.jsonBytes)} · 上限 {bytes(report.limitBytes)}。
      {report.withinLimit === false && ' 超过单个 JSON 文件上限，不提供下载。'}
      {report.withinLimit === null && ' 当前无法完成预检，不提供下载。'}
    </p>
    {report.timeline && <p className="break-words">
      时间线仅计引用：{report.timeline.branchCount} 条分支 · {report.timeline.snapshotReferences} 条快照引用，指向 {report.timeline.uniqueSnapshots} 个不同快照（其中 {report.timeline.sharedReferences} 条为共享引用）。不是内存测量。
    </p>}
    {canDownloadPreparedSave(report) && <button type="button" className={button} onClick={onDownload}>下载已预检 JSON</button>}
  </div>;
}

const privacyLabels: Record<keyof ShareSavePrivacyInspection['counts'], string> = {
  privateNotes: '地图私密批注',
  avatarTranscriptFields: '化身私聊字段',
  actorThoughtFields: '角色心声与私人目标字段',
  whisperMemoryFields: '传音记忆字段',
  participantEventFields: '仅参与者可见的事件字段',
  eventDialogueBlocks: '事件对话块',
  archiveDialogueBlocks: '史库对话块',
  councilDialogueFields: '议事发言字段',
  chapterProseFields: '热、冷档章节正文',
};

export function ShareSavePrivacySummary({ inspection, onPrepare }: {
  inspection: ShareSavePrivacyInspection; onPrepare?: () => void;
}) {
  return <div aria-label="分享隐私计数" className="min-w-0 space-y-1.5 rounded border border-slate-800 p-2 text-xs text-slate-300">
    <h4 className="font-semibold text-slate-100">分享隐私 · 只看数量</h4>
    <p>不显示原文。世界 JSON 不含时间线分支名称；本机存档槽可以另有来源标签。</p>
    <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
      {(Object.keys(privacyLabels) as Array<keyof typeof privacyLabels>).map((key) =>
        <div key={key} className="flex min-w-0 flex-wrap gap-x-1.5">
          <dt>{privacyLabels[key]}：</dt><dd>{inspection.counts[key]}</dd>
        </div>)}
    </dl>
    <p>脱敏副本只处理以上项目，不是匿名档。人物名称、流言、封缄记录、章节标题及其他叙事文字可能仍在；分享前请检查。它也不保证复演出相同行动。</p>
    {onPrepare && <button type="button" className={button} onClick={onPrepare}>准备脱敏分享副本</button>}
  </div>;
}

export const canDownloadShareSave = (review: ShareSavePrivacyReview): boolean =>
  review.status === 'ready' && review.protectedStateVerified && review.redactedBytes !== null &&
  review.redactedBytes > 0 && review.redactedBytes <= review.limitBytes;

export function ShareSavePrivacyConfirmation({ review, onConfirm, onCancel }: {
  review: ShareSavePrivacyReview; onConfirm: () => void; onCancel: () => void;
}) {
  const ready = canDownloadShareSave(review);
  const protectedCounts = review.protectedCounts;
  return <section aria-label="确认脱敏分享副本" className="min-w-0 space-y-1.5 rounded border border-amber-500/50 p-2 text-xs text-amber-100">
    <h4 className="font-semibold">脱敏副本预览（不显示原文）</h4>
    <p className="break-words">第 {review.tick} 轮 · 原档 {bytes(review.originalBytes)} · 脱敏副本 {bytes(review.redactedBytes)} · 上限 {bytes(review.limitBytes)}。</p>
    {ready ? <>
      <p>已校验人物、地点、宗门、村镇计数，以及化身绑定、待执行指令和仍在托管的款物均未改变。</p>
      <p>{protectedCounts.cultivators} 人（在世 {protectedCounts.livingCultivators}） · {protectedCounts.locations} 处地点 · {protectedCounts.sects} 个宗门 · {protectedCounts.settlements} 个村镇。</p>
      <p>化身绑定：{protectedCounts.avatarBound ? '有' : '无'} · 待执行指令：{protectedCounts.avatarOrderPending ? '有' : '无'}。</p>
      <p>只下载新副本到本机，不上传，也不更改当前世界、存档槽或分支。</p>
    </> : <p role="status">{review.status === 'invalid_source' ? '原档未通过校验，未生成可下载副本。'
      : review.redactedBytes !== null && review.redactedBytes > review.limitBytes ? '副本超过文件上限，不提供下载。'
        : '副本未通过完整性或隐私核验，不提供下载。'}</p>}
    <div className="flex flex-wrap gap-1.5">
      {ready && <button type="button" className={confirmButton} onClick={onConfirm}>确认并下载脱敏副本</button>}
      <button type="button" className={button} onClick={onCancel}>取消脱敏副本预览</button>
    </div>
  </section>;
}

export function ArchiveOptimizationReview({ plan, onApply, onCancel }: { plan: NarrativeArchivePlan; onApply: () => void; onCancel: () => void }) {
  const measured = plan.beforeBytes !== null && plan.afterBytes !== null;
  return <div aria-label="旧章归档预览" className="min-w-0 space-y-1.5 rounded border border-amber-500/50 p-2 text-xs text-amber-100">
    <p role="status">Tick #{plan.tick} · {plan.movedCount > 0 ? `本次可移动 ${plan.movedCount} 章。` : measured ? '此时没有可移动的章节。' : '无法核算本次文件大小，不会移动章节。'}</p>
    <p>近期章目 {plan.hotBefore} → {plan.hotAfter} 章 · 远纪档案 {plan.coldBefore} → {plan.coldAfter} 章。</p>
    <p>候选 {plan.eligibleCount} 章 · 远纪档案可用位置 {plan.availableColdRoom}。</p>
    <p className="break-words">JSON：{bytes(plan.beforeBytes)} → {bytes(plan.afterBytes)}。
      {measured && plan.beforeBytes === plan.afterBytes && ' 导出大小不变。'}
      {plan.afterBytes !== null && plan.afterBytes > plan.limitBytes && ' 移动后仍超过单个 JSON 文件上限。'}</p>
    <p>只把旧公开章节移到当前分支的远纪档案。不会删除章节、人物或原始凭据，也不会载入或重置世界。</p>
    <div className="flex flex-wrap gap-1.5">
      {measured && plan.movedCount > 0 && <button type="button" className={confirmButton} onClick={onApply}>确认仅迁移旧章</button>}
      <button type="button" className={button} onClick={onCancel}>关闭预览</button>
    </div>
  </div>;
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
