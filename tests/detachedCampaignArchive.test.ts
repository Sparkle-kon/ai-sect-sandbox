import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {prepareEraCheckpoint,verifyEraCheckpoint,verifyEraCheckpointPayload,type EraInput} from '../src/engine/eraCheckpointEngine';
import {DETACHED_ARCHIVE_FORMAT,DETACHED_ARCHIVE_VERSION,DETACHED_ARCHIVE_CHUNK_BYTES,DETACHED_ARCHIVE_WORLD_MAX_BYTES,
  DETACHED_ARCHIVE_TOTAL_MAX_BYTES,chunkDetachedArchiveBlob,decodeDetachedArchiveManifest,describeDetachedArchiveBlob,
  detachedArchiveCapacity,detachedArchiveSha256,encodeDetachedArchiveManifest,findDetachedArchiveSnapshot,
  readDetachedArchiveBlob,sealDetachedArchiveManifest,type DetachedArchiveBlob,type DetachedArchiveManifestBody,
  type DetachedArchiveSnapshot} from '../src/engine/detachedCampaignArchive';

const page=DETACHED_ARCHIVE_CHUNK_BYTES;
const utf8=(text:string)=>new TextEncoder().encode(text);
const text=(bytes:Uint8Array)=>new TextDecoder().decode(bytes);
const head=(snapshot:DetachedArchiveSnapshot,branchId='main')=>({branchId,tick:snapshot.tick,sha256:snapshot.world.sha256});
const snapshot=(tick:number,world:DetachedArchiveBlob):DetachedArchiveSnapshot=>({tick,year:1000+Math.floor((tick-1)/12),month:(tick-1)%12+1,world});
const body=(snapshots:readonly DetachedArchiveSnapshot[]):DetachedArchiveManifestBody=>({
  format:DETACHED_ARCHIVE_FORMAT,version:DETACHED_ARCHIVE_VERSION,sourceRuleVersion:'a'.repeat(64),writerRuleVersion:'b'.repeat(64),
  timelineId:'native-source',active:head(snapshots.at(-1)!),branches:[{id:'main',label:'原时间线',snapshots}],
});
function stored(bytes:Uint8Array,blob:DetachedArchiveBlob) {
  return new Map([...chunkDetachedArchiveBlob(bytes,blob)].map(({ref,bytes})=>[ref.sha256,Uint8Array.from(bytes)]));
}
const partFile=(bytes:Uint8Array):EraInput=>({size:bytes.byteLength,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});

describe('detached exact original bytes: fixed pages and portable format',()=>{
  it('pages UTF-8 bytes not UTF-16; reassembles and detects both individual and ordered-root corruption',async()=>{
    const bytes=utf8('a'.repeat(page-1)+'寒'+'b'.repeat(page-2)+'坊市');
    const blob=await describeDetachedArchiveBlob(bytes);
    expect(blob.chunks.map(row=>row.bytes)).toEqual([page,page,6]);
    expect(blob.sha256).toBe(await detachedArchiveSha256(bytes));
    const chunks=stored(bytes,blob);
    const got=await readDetachedArchiveBlob(blob,async ref=>chunks.get(ref.sha256)!);
    expect(text(got)).toBe(text(bytes));
    expect(await detachedArchiveSha256(got)).toBe(blob.sha256);
    const [first,second,tail]=blob.chunks;
    await expect(readDetachedArchiveBlob({...blob,chunks:[second,first,tail]},async ref=>chunks.get(ref.sha256)!))
      .rejects.toMatchObject({code:'integrity'});
    const missing=new Uint8Array(0);
    await expect(readDetachedArchiveBlob(blob, async ref=>ref.sha256===first.sha256?missing:chunks.get(ref.sha256)!))
      .rejects.toMatchObject({code:'integrity'});
    const corruption=chunks.get(second.sha256)!;
    corruption[0]^=255;
    await expect(readDetachedArchiveBlob(blob,async ref=>chunks.get(ref.sha256)!)).rejects.toMatchObject({code:'integrity'});
    expect(()=>[...chunkDetachedArchiveBlob(bytes.subarray(0,10),blob)]).toThrow(expect.objectContaining({code:'integrity'}));
  });

  it('keeps exact aliases distinct in ordered branch topology, and freezes the entire nested validated index',async()=>{
    const first=snapshot(12,await describeDetachedArchiveBlob(utf8('同一实体')));
    const second=snapshot(13,await describeDetachedArchiveBlob(utf8('某些行动')));
    const divergence=snapshot(13,await describeDetachedArchiveBlob(utf8('另一结果')));
    const input={...body([first,second]),nextBranchNumber:2,active:head(divergence,'branch-1'),branches:[
      {id:'main',label:'原线',snapshots:[first,second]},
      {id:'branch-1',label:'严格分支',parentBranchId:'main',forkTick:13,snapshots:[first,divergence]},
    ]};
    const sealed=await sealDetachedArchiveManifest(input);
    const decoded=await decodeDetachedArchiveManifest(encodeDetachedArchiveManifest(sealed));
    expect(decoded).toEqual(sealed);
    expect(findDetachedArchiveSnapshot(decoded,'main',12)).toEqual(first);
    expect(findDetachedArchiveSnapshot(decoded,'branch-1',12)).toEqual(first);
    expect(findDetachedArchiveSnapshot(decoded,'branch-1',13)).toEqual(divergence);
    for(const item of [decoded,decoded.branches,decoded.branches[1],decoded.branches[1].snapshots,
      decoded.branches[1].snapshots[0],decoded.branches[1].snapshots[0].world.chunks[0]])expect(Object.isFrozen(item)).toBe(true);
    expect(detachedArchiveCapacity(decoded)).toMatchObject({snapshotCount:4,uniqueBlobs:3,uniqueChunks:3,
      referencedBytes:first.world.bytes*2+second.world.bytes+divergence.world.bytes,
      uniqueChunkBytes:first.world.bytes+second.world.bytes+divergence.world.bytes});
    const str=text(encodeDetachedArchiveManifest(sealed));
    await expect(decodeDetachedArchiveManifest(utf8(str.replace('严格分支','任意改写')))).rejects.toMatchObject({code:'integrity'});
    await expect(decodeDetachedArchiveManifest(utf8(str.replace('"version":1','"version":1,"version":1')))).rejects.toMatchObject({code:'format'});
    await expect(decodeDetachedArchiveManifest(utf8(' '+str))).rejects.toMatchObject({code:'format'});
    expect(findDetachedArchiveSnapshot(decoded,'../main',12)).toBeUndefined();
  });

  it('rejects unknown keys, missing parent, illegal fork clock, unordered or conflicting native frame references', async()=>{
    const first=snapshot(1,await describeDetachedArchiveBlob(utf8('一')));
    const next=snapshot(2,await describeDetachedArchiveBlob(utf8('二')));
    const other=snapshot(1,await describeDetachedArchiveBlob(utf8('异')));
    const wrongMonth=snapshot(2,await describeDetachedArchiveBlob(utf8('异日期')));
    const valid=body([first,next]);
    await expect(sealDetachedArchiveManifest({...valid,ignored:true} as DetachedArchiveManifestBody)).rejects.toMatchObject({code:'format'});
    await expect(sealDetachedArchiveManifest({...valid,active:head(first)})).rejects.toMatchObject({code:'integrity'});
    for(const branch of [
      {id:'../bad',label:'坏钥',parentBranchId:'main',forkTick:2,snapshots:[first,next]},
      {id:'kid',label:'坏父',parentBranchId:'kid',forkTick:2,snapshots:[first,next]},
      {id:'kid',label:'祖先未知',parentBranchId:'missing',forkTick:2,snapshots:[first,next]},
      {id:'kid',label:'空分歧',parentBranchId:'main',snapshots:[first,next]},
      {id:'kid',label:'晚于存档',parentBranchId:'main',forkTick:3,snapshots:[first,next]},
      {id:'kid',label:'时序颠倒',parentBranchId:'main',forkTick:2,snapshots:[next,first]},
      {id:'kid',label:'月份错误',parentBranchId:'main',forkTick:2,snapshots:[first,{...wrongMonth,month:4}]},
      {id:'kid',label:'月份被换',parentBranchId:'main',forkTick:2,snapshots:[{...wrongMonth,month:4}]},
    ])await expect(sealDetachedArchiveManifest({...valid,branches:[...valid.branches,branch]})).rejects.toMatchObject({code:'format'});
    await expect(sealDetachedArchiveManifest({...valid,branches:[...valid.branches,
      {id:'kid',label:'旧段被改',parentBranchId:'main',forkTick:2,snapshots:[other,next]}]})).rejects.toMatchObject({code:'integrity'});
    await expect(sealDetachedArchiveManifest({...valid,branches:[...valid.branches,
      {id:'kid',label:'同档不同刻',snapshots:[snapshot(3,next.world)]}]})).rejects.toMatchObject({code:'integrity'});
  });

  it('bounds each native and cumulative descriptor without allocating the advertised total, and honors abort',async()=>{
    const large=(index:number,bytes=DETACHED_ARCHIVE_WORLD_MAX_BYTES):DetachedArchiveBlob=>{
      const chunks=Array.from({length:Math.ceil(bytes/page)},(_,i)=>({sha256:'0'.repeat(64),bytes:Math.min(page,bytes-i*page)}));
      return {sha256:index.toString(16).padStart(64,'0'),bytes,chunks};
    };
    const six=Array.from({length:6},(_,i)=>snapshot(i+1,large(i+1)));
    expect(detachedArchiveCapacity(body(six)).referencedBytes).toBe(DETACHED_ARCHIVE_TOTAL_MAX_BYTES);
    await expect(sealDetachedArchiveManifest(body([...six,snapshot(7,large(7))]))).rejects.toMatchObject({code:'size'});
    await expect(sealDetachedArchiveManifest(body([snapshot(1,large(1,DETACHED_ARCHIVE_WORLD_MAX_BYTES+1))])))
      .rejects.toMatchObject({code:'size'});
    const tiny=await describeDetachedArchiveBlob(utf8('原始'));
    await expect(sealDetachedArchiveManifest(body([snapshot(1,{...tiny,chunks:[]})]))).rejects.toMatchObject({code:'format'});
    const stop=new AbortController();stop.abort();
    await expect(describeDetachedArchiveBlob(utf8('停止'),{signal:stop.signal})).rejects.toMatchObject({code:'abort'});
    let reads=0;
    await expect(readDetachedArchiveBlob(tiny,async()=>{reads++;return utf8('原始');},{signal:stop.signal})).rejects.toMatchObject({code:'abort'});
    expect(reads).toBe(0);
  });

  it('verifies original portable source manifest and even original multi-part UTF-8 payload without re-encoding its source',async()=>{
    const world=createInitialWorld(1);
    const canonical=encodeEraWorldSave(world);
    const wire=' '.repeat(8*page)+canonical; // Larger but legal original native text; strict decoder consumes the exact raw bytes.
    const raw=utf8(wire);
    const codec={encode:()=>wire,decode:decodeEraWorldSave};
    const prepared=await prepareEraCheckpoint(world,{branchId:'native-direct'},codec,{engineRuleVersion:'c'.repeat(64)});
    expect(prepared.parts.length).toBeGreaterThan(1);
    const input=partFile(prepared.manifestFile.bytes);
    expect((await verifyEraCheckpointPayload(input,raw,codec)).world.tick).toBe(world.tick);
    expect((await verifyEraCheckpoint(input,prepared.parts.map(part=>partFile(part.bytes)),codec)).manifest).toEqual(prepared.manifest);
    expect(await detachedArchiveSha256(raw)).toBe(prepared.manifest.payloadSha256);
    raw[page+7]^=1;
    await expect(verifyEraCheckpointPayload(input,raw,codec)).rejects.toMatchObject({code:'integrity'});
  });
});
