import { describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import {
  ERA_CHECKPOINT_MANIFEST_BYTES, ERA_CHECKPOINT_MAX_BYTES, ERA_CHECKPOINT_NATIVE_JSON_BYTES,
  ERA_CHECKPOINT_PART_BYTES, prepareEraCheckpoint, verifyEraCheckpoint,
} from '../src/engine/eraCheckpointEngine';
import type { EraCheckpointCodec, EraInput, EraManifest } from '../src/engine/eraCheckpointEngine';
import { decodeWorldSave, encodeWorldSave, WORLD_SAVE_MAX_BYTES } from '../src/engine/storageEngine';

const digestAtBuild = '1'.repeat(64);
const build = { engineRuleVersion: digestAtBuild };
const source = { branchId: 'branch-7', timelineId: 'abcdef-1234', label: '七号旧支' };
const nativeCodec = { encode: encodeWorldSave, decode: decodeWorldSave };
const utf8 = (text: string) => new TextEncoder().encode(text);
const fromBytes = (bytes: Uint8Array): EraInput => ({
  size: bytes.byteLength,
  async arrayBuffer() { return bytes.slice().buffer; },
});
const fromText = (text: string) => fromBytes(utf8(text));
const decodeText = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
function largeCodec() {
  const original = createInitialWorld(2031);
  // Isolate container/framing tests from the native 8MiB check. Deliberately split the
  // bytes of a Chinese code point across first and second physical part boundaries.
  const text = 'a'.repeat(ERA_CHECKPOINT_PART_BYTES - 1) + '剑' + 'b'.repeat(ERA_CHECKPOINT_PART_BYTES) + '元';
  const encode = vi.fn(() => text);
  const decode = vi.fn((raw: string) => {
    if (raw !== text) throw new Error('bad reconstructed raw bytes');
    return structuredClone(original);
  });
  return { original, codec: { encode, decode } satisfies EraCheckpointCodec, text };
}
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error('missing deferred resolver'); };
  const promise = new Promise<T>(yes => { resolve = yes; });
  return {promise, resolve};
}
async function selfSeal(input: EraManifest): Promise<EraManifest> {
  const raw = [input.format, input.version, input.ruleset, input.engineRuleVersion,
    [input.source.timelineId ?? null, input.source.branchId, input.source.label ?? null],
    [input.tick, input.year, input.month], input.payloadBytes, input.payloadSha256,
    input.parts.map(part => [part.index, part.byteLength, part.sha256])];
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(JSON.stringify(raw))));
  return { ...input, id: Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('') };
}

describe('Era checkpoint file format', () => {
  it('uses unchanged native JSON for small worlds and verifies the exact portable metadata', async () => {
    const world = createInitialWorld(2031);
    const before = encodeWorldSave(world);
    const authored = await prepareEraCheckpoint(world, source, nativeCodec, build);
    expect(ERA_CHECKPOINT_NATIVE_JSON_BYTES).toBe(WORLD_SAVE_MAX_BYTES);
    expect(authored.parts).toHaveLength(1);
    expect(authored.manifestFile.name).toMatch(/\.era$/);
    expect(authored.parts[0].name).toMatch(/\.json$/);
    expect(decodeText(authored.parts[0].bytes)).toBe(before);
    expect(authored.manifest.payloadSha256).toBe(authored.manifest.parts[0].sha256);
    expect(authored.manifest).toMatchObject({ tick: world.tick, year: world.year, month: world.month, source, engineRuleVersion: digestAtBuild });
    const exact = async () => verifyEraCheckpoint(fromBytes(authored.manifestFile.bytes), authored.parts.map(p => fromBytes(p.bytes)), nativeCodec);
    const first = await exact();
    const second = await exact();
    expect(first.manifest).toEqual(second.manifest);
    expect(first.world).not.toBe(second.world);
    expect(encodeWorldSave(first.world)).toBe(before);
    expect(encodeWorldSave(decodeWorldSave(before))).toBe(before);
    // A file carries its declared build fingerprint; portable verification does not
    // assume the exported version is the reader's own build.
    const other = await prepareEraCheckpoint(world, source, nativeCodec, {engineRuleVersion: '2'.repeat(64)});
    expect(other.manifest.id).not.toBe(first.manifest.id);
    expect(other.manifest.payloadSha256).toBe(first.manifest.payloadSha256);
  });

  it('reconstructs physical parts in any chooser order, including split UTF-8', async () => {
    const {original, codec, text} = largeCodec();
    const result = await prepareEraCheckpoint(original, source, codec, build);
    expect(result.manifest.payloadBytes).toBe(utf8(text).byteLength);
    expect(result.manifest.parts.map(p => p.byteLength)).toEqual([ERA_CHECKPOINT_PART_BYTES, ERA_CHECKPOINT_PART_BYTES, 5]);
    expect(result.parts.every(part => part.name.endsWith('.era-part'))).toBe(true);
    const loaded = await verifyEraCheckpoint(fromBytes(result.manifestFile.bytes),
      [...result.parts].reverse().map(p => fromBytes(p.bytes)), codec);
    expect(loaded.world).toEqual(original);
    expect(codec.decode).toHaveBeenCalledTimes(1);
    expect(codec.decode).toHaveBeenCalledWith(text);
    expect(() => decodeWorldSave(text)).toThrow(expect.objectContaining({code: 'size'}));
  });

  it('refuses missing, duplicate, foreign, mutated, and mislabeled physical parts before native decode', async () => {
    const {original, codec} = largeCodec();
    const result = await prepareEraCheckpoint(original, source, codec, build);
    const foreign = await prepareEraCheckpoint(original, {...source, branchId: 'branch-8'}, codec, build);
    const manifest = fromBytes(result.manifestFile.bytes);
    const parts = result.parts.map(p => fromBytes(p.bytes));
    const rejected = (selection: readonly EraInput[], code: string) =>
      expect(verifyEraCheckpoint(manifest, selection, codec)).rejects.toMatchObject({code});
    await rejected(parts.slice(0, 2), 'missing_part');
    await rejected([parts[0], parts[0], parts[2]], 'duplicate_part');
    await rejected([parts[0], fromBytes(foreign.parts[1].bytes), parts[2]], 'wrong_part');
    const mutated = result.parts[1].bytes.slice();
    mutated[mutated.length - 1] ^= 1;
    await rejected([parts[0], fromBytes(mutated), parts[2]], 'integrity');
    const indexWrong = result.parts[1].bytes.slice();
    indexWrong[36] = 37;
    await rejected([parts[0], fromBytes(indexWrong), parts[2]], 'wrong_part');
    expect(codec.decode).not.toHaveBeenCalled();
  });

  it('rejects malformed or self-sealed but false metadata, and keeps native validation authoritative', async () => {
    const sourceWorld = createInitialWorld(2031);
    const result = await prepareEraCheckpoint(sourceWorld, source, nativeCodec, build);
    const manifest = result.manifest;
    const rawManifest = decodeText(result.manifestFile.bytes);
    const parts = result.parts.map(p => fromBytes(p.bytes));
    const verified = (man: EraInput, codec: EraCheckpointCodec = nativeCodec) => verifyEraCheckpoint(man, parts, codec);
    await expect(verified(fromText(rawManifest.replace('"tick":1', '"tick":2,"tick":1')))).rejects.toMatchObject({code:'format'});
    const badDigest = {...manifest, source: {...source, branchId:'main'}};
    await expect(verified(fromText(JSON.stringify(badDigest)))).rejects.toMatchObject({code:'integrity'});
    const falseDate = await selfSeal({...manifest, year:manifest.year + 1});
    await expect(verified(fromText(JSON.stringify(falseDate)))).rejects.toMatchObject({code:'integrity'});
    const falseRuleset = {...manifest,ruleset:'unknown-version'};
    await expect(verified(fromText(JSON.stringify(falseRuleset)))).rejects.toMatchObject({code:'ruleset'});
    await expect(prepareEraCheckpoint(sourceWorld, source, nativeCodec, {engineRuleVersion:'not-a-digest'})).rejects.toMatchObject({code:'ruleset'});
    await expect(verified(fromText(rawManifest), {...nativeCodec, decode: () => { throw Error('strict native reference checks failed'); }}))
      .rejects.toMatchObject({code:'invalid_world'});
  });

  it('bounds size before body reads and an aborted operation never reaches the strict reader', async () => {
    const sourceWorld = createInitialWorld(2031);
    const result = await prepareEraCheckpoint(sourceWorld, source, nativeCodec, build);
    const manifest = fromBytes(result.manifestFile.bytes);
    const decode = vi.fn(nativeCodec.decode);
    const codec = {...nativeCodec, decode};
    const readOversized = vi.fn(async () => new ArrayBuffer(0));
    await expect(verifyEraCheckpoint({size:ERA_CHECKPOINT_MANIFEST_BYTES + 1, arrayBuffer:readOversized}, [], codec)).rejects.toMatchObject({code:'size'});
    await expect(verifyEraCheckpoint(manifest, [{size:ERA_CHECKPOINT_NATIVE_JSON_BYTES + 1, arrayBuffer:readOversized}], codec)).rejects.toMatchObject({code:'size'});
    await expect(prepareEraCheckpoint(sourceWorld, source, {...codec, encode:() => 'a'.repeat(ERA_CHECKPOINT_MAX_BYTES + 1)}, build)).rejects.toMatchObject({code:'size'});
    expect(readOversized).not.toHaveBeenCalled();
    const part = result.parts[0].bytes;
    const barrier = deferred<ArrayBuffer>();
    const opened = deferred<undefined>();
    const controller = new AbortController();
    const checking = verifyEraCheckpoint(manifest, [{size:part.byteLength,arrayBuffer:() => {
      opened.resolve(undefined);
      return barrier.promise;
    }}], codec, {signal:controller.signal});
    await opened.promise;
    controller.abort();
    await expect(checking).rejects.toMatchObject({code:'aborted'});
    barrier.resolve(part.slice().buffer);
    expect(decode).not.toHaveBeenCalled();
  });
});
