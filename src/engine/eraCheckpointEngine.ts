import type { WorldState } from '../types/world';
import type { SaveBranchSource } from './storageEngine';

const MIB = 1024 ** 2;
export const ERA_CHECKPOINT_MAX_BYTES = 32 * MIB;
export const ERA_CHECKPOINT_PART_BYTES = 4 * MIB;
export const ERA_CHECKPOINT_NATIVE_JSON_BYTES = 8 * MIB;
export const ERA_CHECKPOINT_MANIFEST_BYTES = 8 * 1024;
export const ERA_CHECKPOINT_RULESET = 'sect-world-checkpoint-v1';
const MAX_PARTS = ERA_CHECKPOINT_MAX_BYTES / ERA_CHECKPOINT_PART_BYTES;
const FORMAT = 'ai-sect-era-checkpoint';
const VERSION = 1;
const MAGIC = new Uint8Array([0x45, 0x52, 0x41, 1]); // ERA, part framing version
const HEADER_BYTES = MAGIC.length + 32 + 1;
const PART_INDEX_OFFSET = HEADER_BYTES - 1;

export interface EraCheckpointCodec {
  encode(world: WorldState): string;
  decode(text: string): WorldState;
}
export interface EraPrepareOptions { readonly engineRuleVersion: string; readonly signal?: AbortSignal }
export interface EraVerifyOptions { readonly signal?: AbortSignal }
export interface EraInput {
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export interface EraOutputFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}
export interface EraPartInfo {
  readonly index: number;
  readonly byteLength: number;
  readonly sha256: string;
}
export interface EraManifest {
  readonly format: typeof FORMAT;
  readonly version: typeof VERSION;
  readonly ruleset: typeof ERA_CHECKPOINT_RULESET;
  /** Packaging build fingerprint; not authorship or proof of how the world was simulated. */
  readonly engineRuleVersion: string;
  readonly id: string;
  readonly source: Readonly<SaveBranchSource>;
  readonly tick: number;
  readonly year: number;
  readonly month: number;
  readonly payloadBytes: number;
  readonly payloadSha256: string;
  readonly parts: readonly EraPartInfo[];
}
export interface PreparedEraCheckpoint {
  readonly manifest: EraManifest;
  readonly manifestFile: EraOutputFile;
  readonly parts: readonly EraOutputFile[];
}
export interface VerifiedEraCheckpoint {
  readonly manifest: EraManifest;
  readonly world: WorldState;
}
export type EraCheckpointErrorCode = 'aborted' | 'size' | 'format' | 'ruleset' | 'missing_part' |
  'duplicate_part' | 'wrong_part' | 'integrity' | 'invalid_world' | 'crypto' | 'read';
export class EraCheckpointError extends Error {
  constructor(public readonly code: EraCheckpointErrorCode, detail: string) {
    super(detail); this.name = 'EraCheckpointError';
  }
}
type ManifestBody = Omit<EraManifest, 'id'>;
const fail = (code: EraCheckpointErrorCode, text: string): never => { throw new EraCheckpointError(code, text); };
const interrupted = () => new EraCheckpointError('aborted', '已取消年代检查点操作；当前世界和原存档未改变。');
const abort = (signal?: AbortSignal) => { if (signal?.aborted) throw interrupted(); };
function cancellable<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  // Browser file reads and crypto do not have a cancellation parameter. Reject the
  // caller immediately, while safely ignoring the result if the native work finishes.
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(interrupted());
    if (signal.aborted) stop();
    else signal.addEventListener('abort', stop, {once: true});
    void pending.then(value => {
      signal.removeEventListener('abort', stop);
      resolve(value);
    }, error => {
      signal.removeEventListener('abort', stop);
      reject(error);
    });
  });
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const keysAre = (record: Record<string, unknown>, names: readonly string[]) =>
  Object.keys(record).every(key => names.includes(key));
const int = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}(?![\s\S])/.test(value);
const isHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}(?![\s\S])/.test(value);
const utf8 = (text: string) => new TextEncoder().encode(text);
const usesNativeJSON = (bytes: number) => bytes <= ERA_CHECKPOINT_NATIVE_JSON_BYTES;
const totalParts = (bytes: number) => usesNativeJSON(bytes) ? 1 : Math.ceil(bytes / ERA_CHECKPOINT_PART_BYTES);
function expectedPartBytes(total: number, index: number): number {
  return usesNativeJSON(total) ? total : Math.min(ERA_CHECKPOINT_PART_BYTES, total - index * ERA_CHECKPOINT_PART_BYTES);
}
function knownSource(source: unknown): Readonly<SaveBranchSource> {
  if (isRecord(source) && keysAre(source, ['branchId', 'label', 'timelineId']) && id(source.branchId) &&
      (source.timelineId === undefined || id(source.timelineId)) &&
      (source.label === undefined || typeof source.label === 'string' && source.label.trim() !== '' && source.label.length <= 80 &&
       !/[\u0000-\u001f\u007f]/.test(source.label))) {
    return Object.freeze({
      branchId: source.branchId,
      ...(source.timelineId !== undefined ? { timelineId: source.timelineId } : {}),
      ...(source.label !== undefined ? { label: source.label } : {}),
    });
  }
  return fail('format', '年代检查点的来源分支无效。');
}
async function sha256(bytes: Uint8Array, signal?: AbortSignal): Promise<string> {
  abort(signal);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return fail('crypto', '当前环境不能计算 SHA-256。');
  try {
    const result = await cancellable(subtle.digest('SHA-256', bytes), signal);
    abort(signal);
    return Array.from(new Uint8Array(result), b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    abort(signal);
    return fail('crypto', '无法计算年代检查点的 SHA-256。');
  }
}
function decodeUTF8(bytes: Uint8Array, code: 'format' | 'invalid_world'): string {
  try {
    // Do not silently remove a BOM or replace invalid bytes.
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch { return fail(code, '年代检查点包含不合法的 UTF-8。'); }
}
async function manifestId(body: ManifestBody, signal?: AbortSignal) {
  const {source, parts} = body;
  return sha256(utf8(JSON.stringify([FORMAT, VERSION, ERA_CHECKPOINT_RULESET, body.engineRuleVersion,
    [source.timelineId ?? null, source.branchId, source.label ?? null],
    [body.tick, body.year, body.month], body.payloadBytes, body.payloadSha256,
    parts.map(part => [part.index, part.byteLength, part.sha256])])), signal);
}
function sealedManifest(body: ManifestBody, manifestId: string): EraManifest {
  return Object.freeze({ ...body, id: manifestId });
}
function readManifest(text: string): EraManifest {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return fail('format', '无法读取年代清单。'); }
  if (!isRecord(raw) || raw.format !== FORMAT || raw.version !== VERSION ||
      !keysAre(raw, ['format', 'version', 'ruleset', 'engineRuleVersion', 'id', 'source', 'tick', 'year', 'month', 'payloadBytes', 'payloadSha256', 'parts'])) {
    return fail('format', '年代清单的格式或版本无效。');
  }
  if (raw.ruleset !== ERA_CHECKPOINT_RULESET) return fail('ruleset', '年代检查点的规则版本不受支持。');
  const {tick, year, month, payloadBytes, payloadSha256, parts, engineRuleVersion} = raw;
  if (!int(payloadBytes, 1, ERA_CHECKPOINT_MAX_BYTES)) return fail('size', '年代检查点超出整体字节限额。');
  if (!(isHash(raw.id) && isHash(payloadSha256) && isHash(engineRuleVersion) && int(tick, 0) && int(year, 0) && int(month, 1, 12) &&
      Array.isArray(parts) && parts.length === totalParts(payloadBytes))) return fail('format', '年代清单的日期、摘要或分块目录无效。');
  const normalized: readonly EraPartInfo[] = Object.freeze(parts.map((part: unknown, index) => {
    if (!isRecord(part) || !keysAre(part, ['index', 'byteLength', 'sha256']) || part.index !== index ||
        part.byteLength !== expectedPartBytes(payloadBytes, index) || !isHash(part.sha256)) return fail('format', '年代清单的分块目录无效。');
    return Object.freeze({ index, byteLength: part.byteLength, sha256: part.sha256 });
  }));
  const manifest = sealedManifest({ format: FORMAT, version: VERSION, ruleset: ERA_CHECKPOINT_RULESET, engineRuleVersion, source: knownSource(raw.source),
    tick, year, month, payloadBytes, payloadSha256, parts: normalized }, raw.id);
  // Generated manifests are canonical. In particular, reject shadowed/duplicate JSON keys.
  if (JSON.stringify(manifest) !== text) return fail('format', '年代清单不是原始标准格式。请勿手工编辑。');
  return manifest;
}
const hexByte = (hex: string, index: number) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
function frame(bytes: Uint8Array, manifest: EraManifest, index: number): Uint8Array {
  const framed = new Uint8Array(HEADER_BYTES + bytes.byteLength);
  framed.set(MAGIC);
  for (let n = 0; n < 32; n++) framed[MAGIC.length + n] = hexByte(manifest.id, n);
  framed[PART_INDEX_OFFSET] = index;
  framed.set(bytes, HEADER_BYTES);
  return framed;
}
function framedIndex(bytes: Uint8Array, expected: EraManifest): number {
  if (bytes.byteLength <= HEADER_BYTES || MAGIC.some((magic, n) => bytes[n] !== magic)) return fail('wrong_part', '选中的文件不是年代分块。');
  for (let n = 0; n < 32; n++) {
    if (bytes[MAGIC.length + n] !== hexByte(expected.id, n)) return fail('wrong_part', '分块属于其他检查点。');
  }
  const index = bytes[PART_INDEX_OFFSET];
  if (index >= expected.parts.length) return fail('wrong_part', '分块编号不在当前清单内。');
  return index;
}

async function readFile(file: EraInput, limit: number, signal?: AbortSignal): Promise<Uint8Array> {
  abort(signal);
  const advertised = file?.size;
  if (!int(advertised, 1, limit)) return fail('size', '年代文件为空或超出限额。');
  let result: ArrayBuffer;
  try { result = await cancellable(file.arrayBuffer(), signal); } catch { abort(signal); return fail('read', '无法读取选中的年代文件。'); }
  abort(signal);
  if (!(result instanceof ArrayBuffer) || result.byteLength !== advertised) return fail('read', '读取到的年代文件字节数与所选文件不符。');
  return new Uint8Array(result);
}

export async function prepareEraCheckpoint(world: WorldState, source: SaveBranchSource, codec: EraCheckpointCodec,
  {engineRuleVersion, signal}: EraPrepareOptions): Promise<PreparedEraCheckpoint> {
  abort(signal);
  if (!isHash(engineRuleVersion)) return fail('ruleset', '打包版本须是 64 位小写十六进制摘要。');
  const normalized = knownSource(source);
  const {tick, year, month} = world;
  if (!(int(tick, 0) && int(year, 0) && int(month, 1, 12))) return fail('invalid_world', '当前世界日期无效。');
  // The codec is the app's validated native codec, not a parser supplied by a selected file.
  let raw: string;
  try { raw = codec.encode(world); }
  catch (error) {
    abort(signal);
    if (isRecord(error) && error.code === 'size') return fail('size', '原生世界超过年代检查点字节限额。');
    return fail('invalid_world', '当前世界未通过完整存档校验。');
  }
  abort(signal);
  if (raw.length < 1 || raw.length > ERA_CHECKPOINT_MAX_BYTES) return fail('size', '原生世界超过年代检查点字节限额。');
  const payload = utf8(raw);
  if (!int(payload.byteLength, 1, ERA_CHECKPOINT_MAX_BYTES)) return fail('size', '原生世界超过年代检查点字节限额。');
  const payloadSha256 = await sha256(payload, signal);
  const parts: EraPartInfo[] = [];
  const chunks: Uint8Array[] = [];
  for (let index = 0, offset = 0; index < totalParts(payload.byteLength); index++) {
    const byteLength = expectedPartBytes(payload.byteLength, index);
    const chunk = payload.subarray(offset, offset + byteLength);
    chunks.push(chunk);
    parts.push(Object.freeze({ index, byteLength, sha256: chunks.length === 1 && byteLength === payload.byteLength
      ? payloadSha256 : await sha256(chunk, signal) }));
    offset += byteLength;
  }
  const body: ManifestBody = {format: FORMAT, version: VERSION, ruleset: ERA_CHECKPOINT_RULESET, engineRuleVersion, source: normalized,
    tick, year, month, payloadBytes: payload.byteLength, payloadSha256, parts: Object.freeze(parts)};
  const digest = await manifestId(body, signal);
  abort(signal);
  const manifest = sealedManifest(body, digest);
  const stem = `era-${year}-${month}-${digest.slice(0, 12)}`;
  return {
    manifest,
    manifestFile: { name: `${stem}.era`, bytes: utf8(JSON.stringify(manifest)) },
    parts: chunks.map((chunk, index) => usesNativeJSON(payload.byteLength) ? { name: `${stem}.json`, bytes: chunk } :
      { name: `${stem}-${index + 1}.era-part`, bytes: frame(chunk, manifest, index) }),
  };
}

async function verifiedManifestFile(manifestFile:EraInput,signal?:AbortSignal):Promise<EraManifest> {
  const manifest=readManifest(decodeUTF8(await readFile(manifestFile,ERA_CHECKPOINT_MANIFEST_BYTES,signal),'format'));
  if(await manifestId(manifest,signal)!==manifest.id)return fail('integrity','年代清单的内容校验值不符。');
  return manifest;
}
async function verifiedNativePayload(manifest:EraManifest,payload:Uint8Array,codec:EraCheckpointCodec,
  signal?:AbortSignal):Promise<VerifiedEraCheckpoint> {
  if (await sha256(payload, signal) !== manifest.payloadSha256) return fail('integrity', '年代检查点的整档校验值不符。');
  abort(signal);
  const text = decodeUTF8(payload, 'invalid_world');
  let world: WorldState;
  try { world = codec.decode(text); }
  catch { abort(signal); return fail('invalid_world', '原生世界未通过完整存档校验。'); }
  abort(signal);
  if (world.tick !== manifest.tick || world.year !== manifest.year || world.month !== manifest.month) {
    return fail('integrity', '年代清单与原生世界的实际日期不符。');
  }
  return {manifest, world};
}

/**
 * Detached history may retain the exact native payload separately from its original .era
 * manifest. Recheck every original payload slice, full SHA, and actual native date without
 * fabricating transport headers that were never packaged as part of that detached archive.
 */
export async function verifyEraCheckpointPayload(manifestFile:EraInput,payload:Uint8Array,codec:EraCheckpointCodec,
  {signal}:EraVerifyOptions={}):Promise<VerifiedEraCheckpoint> {
  abort(signal);
  if(!(payload instanceof Uint8Array)||!int(payload.byteLength,1,ERA_CHECKPOINT_MAX_BYTES))
    return fail('size','年代检查点原始载荷超出限额。');
  const manifest=await verifiedManifestFile(manifestFile,signal);
  if(payload.byteLength!==manifest.payloadBytes)return fail('integrity','年代检查点的原始载荷长度不符。');
  // Native decoding and all asynchronous digests must observe the same private bytes.
  const original=Uint8Array.from(payload);
  for(const part of manifest.parts){
    const offset=part.index*ERA_CHECKPOINT_PART_BYTES;
    if(await sha256(original.subarray(offset,offset+part.byteLength),signal)!==part.sha256)
      return fail('integrity','年代分块字节数或内容校验值不符。');
  }
  return verifiedNativePayload(manifest,original,codec,signal);
}

export async function verifyEraCheckpoint(manifestFile: EraInput, partFiles: readonly EraInput[], codec: EraCheckpointCodec,
  {signal}: EraVerifyOptions = {}): Promise<VerifiedEraCheckpoint> {
  abort(signal);
  // Bound the picker before reading the manifest/body, and copy the list before an await.
  if (!Array.isArray(partFiles) || partFiles.length > MAX_PARTS) return fail('size', '选择的年代分块超过数量上限。');
  const files = [...partFiles];
  const manifest = await verifiedManifestFile(manifestFile, signal);
  if (files.length < manifest.parts.length) return fail('missing_part', '年代检查点缺少分块。');
  const nativeJSON = usesNativeJSON(manifest.payloadBytes);
  const fileLimit = nativeJSON ? ERA_CHECKPOINT_NATIVE_JSON_BYTES : ERA_CHECKPOINT_PART_BYTES + HEADER_BYTES;
  if (files.some(file => !int(file?.size, 1, fileLimit))) return fail('size', '年代分块为空或超出字节限额。');
  const payload = new Uint8Array(manifest.payloadBytes);
  const seen = new Set<number>();
  for (const file of files) {
    const data = await readFile(file, fileLimit, signal);
    const index = nativeJSON ? 0 : framedIndex(data, manifest);
    if (seen.has(index)) return fail('duplicate_part', '选择了重复的年代分块。');
    const chunk = nativeJSON ? data : data.subarray(HEADER_BYTES);
    const descriptor = manifest.parts[index];
    if (chunk.byteLength !== descriptor.byteLength || await sha256(chunk, signal) !== descriptor.sha256) {
      return fail('integrity', '年代分块字节数或内容校验值不符。');
    }
    payload.set(chunk, index * ERA_CHECKPOINT_PART_BYTES);
    seen.add(index);
  }
  if (seen.size !== manifest.parts.length) return fail('missing_part', '年代检查点缺少分块。');
  return verifiedNativePayload(manifest,payload,codec,signal);
}
