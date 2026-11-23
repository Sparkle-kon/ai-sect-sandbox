import type { WorldgenProfileId, WorldState } from '../../types/world';
import { isWorldgenProfileId } from '../worldgenProfiles';
import { sameGeneratedWorld } from '../worldIdentity';
import { VERSION, WorldSaveError, FORMAT, WORLD_SAVE_MAX_SLOTS } from './primitives';
import { decodeWorldSave, encodeWorldSave } from './worldCodec';

export interface SaveSlotSummary { id: string; label: string; savedAt: number; tick: number; year: number; month: number; seed: number; profileId?: WorldgenProfileId }
export interface SaveBranchSource { branchId: string; label?: string; timelineId?: string }
export type SaveSlotRevision = string;
export type SaveSlotExpected = SaveSlotRevision | null;
export type SavePointKind = 'current' | 'previous';
export interface SavePointSelection {
  slotId: string;
  headRevision: SaveSlotExpected;
  point: SavePointKind;
  revision: SaveSlotRevision;
  formatVersion: typeof VERSION;
  sourceBranch?: SaveBranchSource;
  seal: string;
}
export interface SavePointInfo { summary: SaveSlotSummary; selection: SavePointSelection }
export interface SaveSlotInspection {
  id: string;
  headRevision: SaveSlotExpected;
  current?: SavePointInfo;
  previous?: SavePointInfo;
  currentDamaged: boolean;
  previousDamaged: boolean;
}
export interface SaveResumeAddress { readonly slotId: string; readonly point: SavePointKind }
export type SaveResumeSide = 'left' | 'right';
export type SaveResumeRelation = 'same_branch' | 'same_timeline_other_branch' | 'separate_timelines' |
  'same_generation_unverified_lineage' | 'different_origins' | 'unavailable';
export interface SaveResumeAncestry {
  readonly seed: number;
  readonly profileId?: WorldgenProfileId;
  readonly algorithm?: number;
  readonly birthTick?: number;
  readonly scenarioOrigin?: Readonly<Pick<NonNullable<WorldState['scenarioOrigin']>,'id'|'version'|'ruleset'|'endTick'>>;
}
export type SaveResumeCandidate =
  | { readonly address: SaveResumeAddress; readonly status: 'available'; readonly info: SavePointInfo; readonly ancestry: SaveResumeAncestry }
  | { readonly address: SaveResumeAddress; readonly status: 'absent' | 'damaged' | 'unsupported' };
export interface SaveResumePairReview {
  readonly left: SaveResumeCandidate;
  readonly right: SaveResumeCandidate;
  readonly relation: SaveResumeRelation;
}
export interface SaveCapabilities { backend: 'indexeddb' | 'localstorage' | 'memory'; writable: boolean; recovery: boolean; crossTab: boolean }

interface SaveJournal { revision: SaveSlotRevision; formatVersion: typeof VERSION; sourceBranch?: SaveBranchSource; seal: string }
interface SaveSlot { summary: SaveSlotSummary; content: string; journal?: SaveJournal }
interface SealedSlot extends SaveSlot { journal: SaveJournal }
interface SaveIndexRow extends SaveSlotSummary { revision: SaveSlotRevision }
interface RawSlotSnapshot { index: unknown; current: unknown; previous: unknown }
type SaveCommit = { id: string; inspected: RawSlotSnapshot } &
  ({ kind: 'write'; current: SealedSlot; previous?: SealedSlot } | { kind: 'remove' });
export interface SaveBackend {
  capabilities: SaveCapabilities;
  list(): Promise<unknown[]>;
  read(id: string): Promise<RawSlotSnapshot>;
  /** Optional only when both snapshots come from one atomic read operation. */
  readPair?(leftId: string, rightId: string): Promise<readonly [RawSlotSnapshot, RawSlotSnapshot]>;
  commit(change: SaveCommit): Promise<void>;
}

const PREFIX = 'ai-sect-sandbox:saves:v1:';
const SAVE_DATABASE = 'ai-sect-sandbox-saves';
const DATABASE_VERSION = 2;
const storageError = () => new WorldSaveError('storage', '无法访问浏览器存档。存储可能被禁用或已满，已有存档未清除。');
const conflictError = () => new WorldSaveError('slot_conflict', '此槽已在另一操作中变化，未执行。请刷新后重新选择。');
const limitError = () => new WorldSaveError('slot_limit', '存档位已满。');
const readOnlyError = () => new WorldSaveError('storage_read_only', '当前存档方式只能读取旧档，无法覆盖、删除或建立恢复点。可以用 JSON 文件备份。');
const integrityError = () => new WorldSaveError('integrity', '此存档版本无法通过完整性校验。不会自动改读其他版本或替换当前世界。');
const blockedError = () => new WorldSaveError('storage_blocked', '浏览器存档正在切换版本；请关闭其他旧游戏标签后刷新重试。');
const rightId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(id);
const goodRevision = (revision: unknown): revision is SaveSlotRevision => typeof revision === 'string' &&
  /^(?:r:[0-9a-f]{32}|legacy:[0-9a-f]{64})$/.test(revision);
const validSeal = (seal: unknown): seal is string => typeof seal === 'string' && /^[0-9a-f]{64}$/.test(seal);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const ownsOnly = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));
function checkId(id: unknown): asserts id is string {
  if (!rightId(id)) throw new WorldSaveError('invalid_slot', '存档位编号无效。');
}

function checkSummary(summary: unknown): SaveSlotSummary {
  if (!isRecord(summary)) throw integrityError();
  const { id, label, savedAt, tick, year, month, seed, profileId } = summary;
  const safeNumber = (value: unknown, lo: number, hi = Number.MAX_SAFE_INTEGER): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= lo && value <= hi;
  if (!rightId(id) || typeof label !== 'string' || !label || label.length > 60 ||
      !safeNumber(savedAt, 0) || !safeNumber(tick, 0) || !safeNumber(year, 0) || !safeNumber(month, 1, 12) ||
      !safeNumber(seed, 0, 0xffffffff) || (profileId !== undefined && !isWorldgenProfileId(profileId))) throw integrityError();
  return { id, label, savedAt, tick, year, month, seed, ...(profileId === undefined ? {} : { profileId }) };
}

function checkBranch(source: unknown): SaveBranchSource | undefined {
  if (source === undefined) return undefined;
  const safeKey = (key: unknown): key is string => typeof key === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(key);
  if (!isRecord(source) || !ownsOnly(source, ['branchId','label','timelineId']) || !safeKey(source.branchId) ||
      (source.timelineId !== undefined && !safeKey(source.timelineId)) ||
      (source.label !== undefined && (typeof source.label !== 'string' || !source.label.trim() || source.label.length > 80 ||
        /[\u0000-\u001f\u007f]/.test(source.label)))) throw integrityError();
  const { branchId, label, timelineId } = source;
  return { branchId, ...(label === undefined ? {} : { label }), ...(timelineId === undefined ? {} : { timelineId }) };
}

function indexRevision(raw: unknown, id: string): SaveSlotRevision | undefined {
  if (!isRecord(raw) || !goodRevision(raw.revision)) return undefined;
  try { return checkSummary(raw).id === id ? raw.revision : undefined; } catch { return undefined; }
}
const summaryKey = (s: SaveSlotSummary) => [s.id,s.label,s.savedAt,s.tick,s.year,s.month,s.seed,s.profileId ?? null];
const branchKey = (branch?: SaveBranchSource) => branch ? [branch.branchId,branch.label ?? null,branch.timelineId ?? null] : null;
const sameSummary = (left: SaveSlotSummary, right: SaveSlotSummary) => JSON.stringify(summaryKey(left)) === JSON.stringify(summaryKey(right));
const sameBranch = (left?: SaveBranchSource, right?: SaveBranchSource) => JSON.stringify(branchKey(left)) === JSON.stringify(branchKey(right));
const toHex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const createRevision = () => `r:${toHex(globalThis.crypto.getRandomValues(new Uint8Array(16)))}`;
const validStorageCrypto = () => Boolean(globalThis.crypto?.subtle && globalThis.crypto?.getRandomValues);
async function digest(value: unknown) {
  if (!validStorageCrypto()) throw storageError();
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return toHex(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)));
}
const legacyDigest = (summary: SaveSlotSummary, content: string) =>
  digest([FORMAT,VERSION,'legacy',summaryKey(summary),content]);
const slotSeal = (summary: SaveSlotSummary, content: string, revision: SaveSlotRevision, sourceBranch?: SaveBranchSource) =>
  digest([FORMAT,VERSION,'journal',summaryKey(summary),revision,branchKey(sourceBranch),content]);

interface ValidPoint {
  summary: SaveSlotSummary;
  content: string;
  world: WorldState;
  revision: SaveSlotRevision;
  seal: string;
  sourceBranch?: SaveBranchSource;
  legacy: boolean;
}
async function readPoint(raw: unknown, id: string, point: SavePointKind): Promise<ValidPoint | undefined> {
  if (raw === undefined) return undefined;
  if (!isRecord(raw) || !ownsOnly(raw, ['summary','content','journal']) || typeof raw.content !== 'string' ||
      !isRecord(raw.summary) || !ownsOnly(raw.summary, ['id','label','savedAt','tick','year','month','seed','profileId'])) throw integrityError();
  const summary = checkSummary(raw.summary);
  if (summary.id !== id) throw integrityError();
  const world = decodeWorldSave(raw.content);
  if (summary.tick !== world.tick || summary.year !== world.year || summary.month !== world.month || summary.seed !== world.random.seed ||
      (summary.profileId !== undefined && summary.profileId !== world.worldgen?.profileId)) throw integrityError();
  if (raw.journal === undefined) {
    if (point === 'previous') throw integrityError();
    const seal = await legacyDigest(summary, raw.content);
    return { summary, content: raw.content, world, revision: `legacy:${seal}`, seal, legacy: true };
  }
  const j = raw.journal;
  if (!isRecord(j) || !ownsOnly(j, ['formatVersion','revision','sourceBranch','seal']) ||
      j.formatVersion !== VERSION || !goodRevision(j.revision) || !validSeal(j.seal)) throw integrityError();
  const sourceBranch = checkBranch(j.sourceBranch);
  const legacy = j.revision.startsWith('legacy:');
  if (!legacy && summary.profileId !== world.worldgen?.profileId) throw integrityError();
  if (legacy && (point !== 'previous' || sourceBranch || j.revision !== `legacy:${await legacyDigest(summary, raw.content)}`)) throw integrityError();
  if (j.seal !== await slotSeal(summary, raw.content, j.revision, sourceBranch)) throw integrityError();
  return { summary, content: raw.content, world, revision: j.revision, seal: j.seal, sourceBranch, legacy };
}

function requireCurrentIndex(raw: RawSlotSnapshot, validated: ValidPoint, id: string) {
  if (indexRevision(raw.index, id) === validated.revision && sameSummary(checkSummary(raw.index), validated.summary)) return;
  if (!validated.legacy) throw integrityError();
  // An actual v1 IndexedDB slot always has an index. The legacy local fallback also exposes the same view.
  if (!isRecord(raw.index) || Object.hasOwn(raw.index, 'revision') || !sameSummary(checkSummary(raw.index), validated.summary)) throw integrityError();
}
function rawEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    // Payloads can be 8 MiB; compare their original bytes as strings, without serializing
    // another full pair inside an active write transaction.
    if (isRecord(a) && isRecord(b) && Object.hasOwn(a, 'content') && Object.hasOwn(b, 'content')) {
      const { content: left, ...aMeta } = a;
      const { content: right, ...bMeta } = b;
      return left === right && JSON.stringify(aMeta) === JSON.stringify(bMeta);
    }
    return JSON.stringify(a) === JSON.stringify(b);
  }
  catch { return false; }
}
function sameRawSnapshot(left: RawSlotSnapshot, right: RawSlotSnapshot) {
  return rawEqual(left.index,right.index) && rawEqual(left.current,right.current) && rawEqual(left.previous,right.previous);
}
const emptySnapshot = (row: RawSlotSnapshot) => row.current === undefined && row.index === undefined && row.previous === undefined;
const getIndex = (slot: SealedSlot): SaveIndexRow => ({ ...slot.summary, revision: slot.journal.revision });

export function createMemorySaveBackend(): SaveBackend {
  const rows = new Map<string, RawSlotSnapshot>();
  const lookup = (id: string): RawSlotSnapshot => rows.get(id) ?? { index: undefined, current: undefined, previous: undefined };
  return {
    capabilities: { backend: 'memory', writable: true, recovery: true, crossTab: false },
    list: async () => [...rows.values()].map(row => structuredClone(row.index)).filter(index => index !== undefined),
    read: async (id) => structuredClone(lookup(id)),
    readPair: async (left,right) => {
      const first = structuredClone(lookup(left));
      return [first, left === right ? first : structuredClone(lookup(right))] as const;
    },
    commit: async (change) => {
      const current = lookup(change.id);
      if (!sameRawSnapshot(current, change.inspected)) throw conflictError();
      if (change.kind === 'remove') { rows.delete(change.id); return; }
      if (emptySnapshot(current) && rows.size >= WORLD_SAVE_MAX_SLOTS) throw limitError();
      rows.set(change.id, structuredClone({ index: getIndex(change.current), current: change.current, previous: change.previous }));
    },
  };
}

function localBackend(storage: Storage): SaveBackend {
  const get = (id: string): unknown => {
    const raw = storage.getItem(PREFIX + id);
    if (raw === null) return undefined;
    try { return JSON.parse(raw) as unknown; } catch { return null; }
  };
  return {
    capabilities: { backend: 'localstorage', writable: false, recovery: false, crossTab: false },
    list: async () => {
      const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
      return keys.flatMap(key => {
        if (!key?.startsWith(PREFIX)) return [];
        const row = get(key.slice(PREFIX.length));
        return isRecord(row) ? [row.summary] : [];
      });
    },
    read: async (id) => {
      const current = get(id);
      return { index: isRecord(current) ? current.summary : undefined, current, previous: undefined };
    },
    commit: async () => { throw readOnlyError(); },
  };
}

const SAVE_TABLES = ['worlds','summaries','recoveries'];
function readIndexedSlot(tx: IDBTransaction, id: string, got: (row: RawSlotSnapshot) => void) {
  const index = tx.objectStore('summaries').get(id);
  const current = tx.objectStore('worlds').get(id);
  const previous = tx.objectStore('recoveries').get(id);
  let remaining = 3;
  index.onsuccess = current.onsuccess = previous.onsuccess = () => {
    if (--remaining === 0) got({ index: index.result as unknown, current: current.result as unknown, previous: previous.result as unknown });
  };
}

function indexedBackend(db: IDBDatabase): SaveBackend {
  return {
    capabilities: { backend: 'indexeddb', writable: true, recovery: true, crossTab: true },
    list: () => new Promise((resolve, reject) => {
      const tx = db.transaction('summaries', 'readonly');
      const req = tx.objectStore('summaries').getAll();
      tx.oncomplete = () => resolve(req.result as unknown[]);
      tx.onabort = () => reject(storageError());
    }),
    read: (id) => new Promise((resolve, reject) => {
      const tx = db.transaction(SAVE_TABLES, 'readonly');
      let result: RawSlotSnapshot;
      readIndexedSlot(tx, id, row => { result = row; });
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(storageError());
    }),
    readPair: (left,right) => new Promise((resolve,reject) => {
      const tx = db.transaction(SAVE_TABLES,'readonly');
      let first: RawSlotSnapshot | undefined, second: RawSlotSnapshot | undefined;
      readIndexedSlot(tx,left,row=>{ first=row; if (left===right) second=row; });
      if (left!==right) readIndexedSlot(tx,right,row=>{ second=row; });
      tx.oncomplete = () => first && second ? resolve([first,second]) : reject(storageError());
      tx.onabort = () => reject(storageError());
    }),
    commit: (change) => new Promise((resolve, reject) => {
      const tx = db.transaction(SAVE_TABLES, 'readwrite');
      const world = tx.objectStore('worlds');
      const index = tx.objectStore('summaries');
      const recovery = tx.objectStore('recoveries');
      let failure: WorldSaveError | undefined;
      const abort = (error: WorldSaveError) => { failure = error; tx.abort(); };
      const put = () => {
        try {
          if (change.kind === 'remove') { world.delete(change.id); index.delete(change.id); recovery.delete(change.id); }
          else {
            if (change.previous) recovery.put(change.previous);
            world.put(change.current);
            index.put(getIndex(change.current));
          }
        } catch { abort(storageError()); }
      };
      readIndexedSlot(tx, change.id, row => {
        // No promises in the write transaction: the completed preflight is compared to the exact three rows
        // observed now, then all mutations and the capacity check remain inside this transaction.
        if (!sameRawSnapshot(row, change.inspected)) { abort(conflictError()); return; }
        if (change.kind === 'write' && emptySnapshot(row)) {
          const count = world.count();
          count.onsuccess = () => { if (count.result >= WORLD_SAVE_MAX_SLOTS) abort(limitError()); else put(); };
        } else put();
      });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(failure ?? storageError());
    }),
  };
}

async function browserBackend(): Promise<SaveBackend> {
  // Do not mistake an upgrade-blocked or denied open for a separate, empty namespace.
  if (typeof indexedDB !== 'undefined') {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      let finished = false;
      const req = indexedDB.open(SAVE_DATABASE, DATABASE_VERSION);
      const finish = (db?: IDBDatabase, error?: WorldSaveError) => {
        if (finished) { db?.close(); return; }
        finished = true;
        clearTimeout(timer);
        if (db) resolve(db); else reject(error ?? storageError());
      };
      const timer = setTimeout(() => finish(undefined, blockedError()), 3000);
      req.onupgradeneeded = () => {
        if (finished) { req.transaction?.abort(); return; }
        if (!req.result.objectStoreNames.contains('worlds')) req.result.createObjectStore('worlds', { keyPath: 'summary.id' });
        if (!req.result.objectStoreNames.contains('summaries')) req.result.createObjectStore('summaries', { keyPath: 'id' });
        if (!req.result.objectStoreNames.contains('recoveries')) req.result.createObjectStore('recoveries', { keyPath: 'summary.id' });
      };
      req.onsuccess = () => {
        req.result.onversionchange = () => req.result.close();
        finish(req.result);
      };
      req.onerror = () => finish(undefined, req.error?.name === 'VersionError' ? blockedError() : storageError());
      req.onblocked = () => finish(undefined, blockedError());
    });
    return indexedBackend(db);
  }
  try {
    if (typeof localStorage !== 'undefined') {
      void localStorage.length;
      return localBackend(localStorage);
    }
  } catch { /* a browser may deny even read access */ }
  throw storageError();
}

const infoFor = (id: string, headRevision: SaveSlotExpected, point: SavePointKind, value: ValidPoint): SavePointInfo => ({
  summary: value.summary,
  selection: {
    slotId: id, headRevision, point, revision: value.revision, seal: value.seal, formatVersion: VERSION,
    ...(value.sourceBranch === undefined ? {} : { sourceBranch: value.sourceBranch }),
  },
});

async function pointOrDamage(raw: RawSlotSnapshot, id: string, kind: SavePointKind) {
  try {
    const validated = await readPoint(raw[kind], id, kind);
    if (kind === 'current' && validated) requireCurrentIndex(raw, validated, id);
    return { validated, damaged: kind === 'current' && !validated && raw.index !== undefined };
  } catch { return { validated: undefined, damaged: true }; }
}
const headFor = (raw: RawSlotSnapshot, id: string, current?: ValidPoint): SaveSlotExpected =>
  indexRevision(raw.index, id) ?? current?.revision ?? null;

const freezeResumePoint = (selection: SavePointSelection): SavePointSelection => Object.freeze({
  ...selection, ...(selection.sourceBranch ? { sourceBranch: Object.freeze({ ...selection.sourceBranch }) } : {}),
});
const freezeResumeAddress = (address: SaveResumeAddress): SaveResumeAddress => Object.freeze({ ...address });
function checkedResumeAddress(address: SaveResumeAddress): SaveResumeAddress {
  checkId(address?.slotId);
  if (address.point !== 'current' && address.point !== 'previous') throw integrityError();
  return freezeResumeAddress({ slotId: address.slotId, point: address.point });
}
type ResumeEvidence = { raw:readonly [RawSlotSnapshot,RawSlotSnapshot]; points:{left:SaveResumeCandidate;right:SaveResumeCandidate} };
type VerifiedResumeCandidate = { view: SaveResumeCandidate; verified?: ValidPoint };

async function previewResumeCandidate(raw: RawSlotSnapshot, address: SaveResumeAddress, recovery: boolean): Promise<VerifiedResumeCandidate> {
  const { slotId, point } = address;
  const state = (status: 'absent' | 'damaged' | 'unsupported') => ({ view: Object.freeze({ address, status }) });
  if (point === 'previous' && !recovery) return state('unsupported');
  try {
    const valid = await readPoint(raw[point], slotId, point);
    if (!valid) return state(point === 'current' && raw.index !== undefined ? 'damaged' : 'absent');
    if (point === 'current') requireCurrentIndex(raw, valid, slotId);
    const head = headFor(raw, slotId, point === 'current' ? valid :
      !indexRevision(raw.index,slotId) ? (await pointOrDamage(raw,slotId,'current')).validated : undefined);
    const info = infoFor(slotId, head, point, valid);
    const world = valid.world;
    const ancestry: SaveResumeAncestry = Object.freeze({
      seed: world.random.seed,
      ...(world.worldgen ? { profileId: world.worldgen.profileId, algorithm: world.worldgen.algorithm, birthTick: world.worldgen.birthTick } :
        { profileId: undefined, algorithm: undefined, birthTick: undefined }),
      ...(world.scenarioOrigin ? { scenarioOrigin: Object.freeze({
        id: world.scenarioOrigin.id, version: world.scenarioOrigin.version,
        ruleset: world.scenarioOrigin.ruleset, endTick: world.scenarioOrigin.endTick,
      }) } : {}),
    });
    return { verified: valid, view: Object.freeze({ address, status: 'available', info: Object.freeze({
      summary: Object.freeze({ ...info.summary }), selection: freezeResumePoint(info.selection),
    }), ancestry }) };
  } catch(error) {
    return state(error instanceof WorldSaveError && (error.code === 'version' || error.code === 'storage') ? 'unsupported' : 'damaged');
  }
}

function resumeRelation(a?: ValidPoint, b?: ValidPoint): SaveResumeRelation {
  if (!a || !b) return 'unavailable';
  const leftBirth = a.world.worldgen?.birthTick, rightBirth = b.world.worldgen?.birthTick;
  if (!sameGeneratedWorld(a.world,b.world) || (leftBirth !== undefined && rightBirth !== undefined && leftBirth !== rightBirth))
    return 'different_origins';
  const left = a.sourceBranch, right = b.sourceBranch;
  if (leftBirth === undefined || rightBirth === undefined || !left?.timelineId || !right?.timelineId)
    return 'same_generation_unverified_lineage';
  if (left.timelineId !== right.timelineId) return 'separate_timelines';
  return left.branchId === right.branchId ? 'same_branch' : 'same_timeline_other_branch';
}

/** Native slot rows are plain records with opaque content strings. Corrupt exotic records fail closed, never alias JSON encodings. */
function equalResumeValue(left: unknown, right: unknown, depth = 0): boolean {
  if (Object.is(left,right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || depth >= 16) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  } else {
    const ordinary = (value: object) => Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null;
    if (!ordinary(left) || !ordinary(right) || Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false;
  }
  const leftRecord = left as Record<string, unknown>, rightRecord = right as Record<string, unknown>;
  const keys = Object.keys(leftRecord), other = Object.keys(rightRecord);
  return keys.length === other.length && keys.every((key, index) =>
    key === other[index] && equalResumeValue(leftRecord[key],rightRecord[key],depth + 1));
}
function sameResumeSnapshot(left: RawSlotSnapshot, right: RawSlotSnapshot) {
  return equalResumeValue(left.index,right.index) && equalResumeValue(left.current,right.current) &&
    equalResumeValue(left.previous,right.previous);
}

export function createSaveStore(backend?: SaveBackend, now: () => number = Date.now) {
  const privateResumeReviews = new WeakMap<SaveResumePairReview,ResumeEvidence>();
  let opened: Promise<SaveBackend> | undefined;
  const pick = () => backend ? Promise.resolve(backend) : (opened ??= browserBackend().catch((error) => { opened = undefined; throw error; }));
  let tail: Promise<unknown> = Promise.resolve();
  function operations<T>(work: (store: SaveBackend) => Promise<T>): Promise<T> {
    const run = tail.then(() => pick()).then(work).catch((error: unknown) => { throw error instanceof WorldSaveError ? error : storageError(); });
    tail = run.catch(() => undefined);
    return run;
  }
  return {
    capabilities: () => operations(async (store) => ({ ...store.capabilities,
      writable: store.capabilities.writable && validStorageCrypto(), recovery: store.capabilities.recovery && validStorageCrypto() })),
    list: () => operations(async (store) => (await store.list()).flatMap(row => {
      try { return [checkSummary(row)]; } catch { return []; }
    }).sort((a, b) => b.savedAt - a.savedAt || a.id.localeCompare(b.id))),
    inspect: (id: string) => operations(async (store): Promise<SaveSlotInspection> => {
      checkId(id);
      const raw = await store.read(id);
      const [current, previous] = await Promise.all([pointOrDamage(raw,id,'current'),pointOrDamage(raw,id,'previous')]);
      const headRevision = headFor(raw, id, current.validated);
      return { id, headRevision, currentDamaged: current.damaged, previousDamaged: previous.damaged,
        ...(current.validated ? { current: infoFor(id,headRevision,'current',current.validated) } : {}),
        ...(previous.validated ? { previous: infoFor(id,headRevision,'previous',previous.validated) } : {}) };
    }),
    reviewResumePair: (left: SaveResumeAddress, right: SaveResumeAddress): Promise<SaveResumePairReview> => {
      let first: SaveResumeAddress, second: SaveResumeAddress;
      try {
        first = checkedResumeAddress(left); second = checkedResumeAddress(right);
        if (first.slotId === second.slotId && first.point === second.point)
          throw new WorldSaveError('invalid_slot','请分别选择两个不同的存档位置。');
      } catch(error) { return Promise.reject(error); }
      return operations(async store => {
        if (!store.readPair)
          return Object.freeze({ left:Object.freeze({address:first,status:'unsupported' as const}),
            right:Object.freeze({address:second,status:'unsupported' as const}),relation:'unavailable' as const });
        const raw = structuredClone(await store.readPair(first.slotId,second.slotId));
        const [a,b] = await Promise.all([
          previewResumeCandidate(raw[0],first,store.capabilities.recovery),
          previewResumeCandidate(raw[1],second,store.capabilities.recovery),
        ]);
        const result: SaveResumePairReview = Object.freeze({left:a.view,right:b.view,relation:resumeRelation(a.verified,b.verified)});
        privateResumeReviews.set(result,{raw,points:structuredClone({left:a.view,right:b.view})});
        return result;
      });
    },
    loadReviewedResume: (review:SaveResumePairReview,side:SaveResumeSide):Promise<{world:WorldState;selection:SavePointSelection}> => {
      const before = typeof review === 'object' && review ? privateResumeReviews.get(review) : undefined;
      if (!before || side!=='left'&&side!=='right') return Promise.reject(conflictError());
      const choice = before.points[side];
      if (choice.status !== 'available') return Promise.reject(choice.status==='absent' ?
        new WorldSaveError('not_found','这个存档位置确实没有副本。') : choice.status==='unsupported' ?
          new WorldSaveError('version','这个存档位置无法用于安全比较。') : integrityError());
      return operations(async store => {
        if(!store.readPair || privateResumeReviews.get(review)!==before)throw conflictError();
        const fresh=await store.readPair(before.points.left.address.slotId,before.points.right.address.slotId);
        if(!sameResumeSnapshot(before.raw[0],fresh[0])||!sameResumeSnapshot(before.raw[1],fresh[1]))throw conflictError();
        const row=fresh[side==='left'?0:1][choice.address.point];
        if(!isRecord(row)||typeof row.content!=='string')throw integrityError();
        // Both raw slots and their selected metadata matched in one transaction. No await
        // goes between the fresh exact comparison, strict decode of the chosen bytes, and returning the world.
        const result={world:decodeWorldSave(row.content),selection:structuredClone(choice.info.selection)};
        privateResumeReviews.delete(review);
        return result;
      });
    },
    load: (id: string) => operations(async (store) => {
      checkId(id);
      const raw = await store.read(id);
      const current = await readPoint(raw.current, id, 'current');
      if (!current) { if (!emptySnapshot(raw)) throw integrityError(); throw new WorldSaveError('not_found', '这个存档位是空的。'); }
      requireCurrentIndex(raw, current, id);
      return current.world;
    }),
    loadSelected: (selection: SavePointSelection) => {
      // Clone the reviewed selector before asynchronous browser work; callers cannot mutate it while queued.
      let wanted: SavePointSelection;
      try { wanted = structuredClone(selection); } catch { return Promise.reject<WorldState>(integrityError()); }
      return operations(async (store) => {
        checkId(wanted?.slotId);
        if ((wanted.point !== 'current' && wanted.point !== 'previous') || wanted.formatVersion !== VERSION ||
          !goodRevision(wanted.revision) || !validSeal(wanted.seal) || (wanted.headRevision !== null && !goodRevision(wanted.headRevision))) throw integrityError();
        const sourceBranch = checkBranch(wanted.sourceBranch);
        const raw = await store.read(wanted.slotId);
        let current: ValidPoint | undefined;
        if (!indexRevision(raw.index, wanted.slotId) || wanted.point === 'current') {
          current = (await pointOrDamage(raw,wanted.slotId,'current')).validated;
        }
        if (headFor(raw,wanted.slotId,current) !== wanted.headRevision) throw conflictError();
        const value = wanted.point === 'current' ? current : (await pointOrDamage(raw,wanted.slotId,'previous')).validated;
        if (!value) {
          if (raw[wanted.point] === undefined) throw conflictError();
          throw integrityError();
        }
        if (value.revision !== wanted.revision || value.seal !== wanted.seal || !sameBranch(value.sourceBranch, sourceBranch)) throw conflictError();
        if (!sameRawSnapshot(raw, await store.read(wanted.slotId))) throw conflictError();
        return value.world;
      });
    },
    save: (id: string, label: string, world: WorldState, expected: SaveSlotExpected = null, source?: SaveBranchSource) => {
      let content: string;
      let summary: SaveSlotSummary;
      let sourceBranch: SaveBranchSource | undefined;
      try {
        checkId(id);
        if (expected !== null && !goodRevision(expected)) throw conflictError();
        const name = typeof label === 'string' ? label.trim() : '';
        if (!name || name.length > 60) throw new WorldSaveError('invalid_slot', '存档名称须为 1 至 60 个字符。');
        sourceBranch = checkBranch(source);
        // Snapshot at call time, not after waiting for a backend operation or SHA-256.
        content = encodeWorldSave(world);
        summary = checkSummary({ id, label: name, savedAt: now(), tick: world.tick, year: world.year, month: world.month, seed: world.random.seed, profileId: world.worldgen?.profileId });
      } catch (error) { return Promise.reject<SaveSlotSummary>(error); }
      return operations(async (store) => {
        if (!store.capabilities.writable || !validStorageCrypto()) throw readOnlyError();
        const raw = await store.read(id);
        let previous: SealedSlot | undefined;
        if (expected === null) { if (!emptySnapshot(raw)) throw conflictError(); }
        else {
          const current = await readPoint(raw.current,id,'current');
          if (!current || current.revision !== expected) throw conflictError();
          requireCurrentIndex(raw,current,id);
          summary.savedAt = Math.max(summary.savedAt, current.summary.savedAt + 1);
          checkSummary(summary);
          const seal = current.legacy ? await slotSeal(current.summary,current.content,current.revision) : current.seal;
          previous = {
            summary: current.summary, content: current.content,
            journal: { revision: current.revision, formatVersion: VERSION, seal,
              ...(current.sourceBranch === undefined ? {} : { sourceBranch: current.sourceBranch }) },
          };
        }
        const revision = createRevision();
        const seal = await slotSeal(summary,content,revision,sourceBranch);
        const current: SealedSlot = { summary, content, journal: { revision, formatVersion: VERSION, seal,
          ...(sourceBranch === undefined ? {} : { sourceBranch }) } };
        await store.commit({ kind: 'write', id, inspected: raw, current, previous });
        return { ...summary };
      });
    },
    delete: (id: string, expected: SaveSlotRevision) => operations(async (store) => {
      checkId(id);
      if (!goodRevision(expected)) throw conflictError();
      if (!store.capabilities.writable || !validStorageCrypto()) throw readOnlyError();
      const raw = await store.read(id);
      const current = indexRevision(raw.index,id) ? undefined : (await pointOrDamage(raw,id,'current')).validated;
      if (headFor(raw,id,current) !== expected) throw conflictError();
      await store.commit({ kind: 'remove', id, inspected: raw });
      return true;
    }),
  };
}

export const worldSaveStore = createSaveStore();
