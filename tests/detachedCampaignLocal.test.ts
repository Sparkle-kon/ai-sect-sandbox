import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {campaignSHA256} from '../src/engine/campaignMemento';
import {detachedArchiveCapacity} from '../src/engine/detachedCampaignArchive';
import {prepareEraCheckpoint,type EraOutputFile} from '../src/engine/eraCheckpointEngine';
import {createFastForwardRunner} from '../src/engine/fastForwardEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceDetachedArchive,auditDetachedArchive,createDetachedArchive,readDetachedArchiveOriginal}
  from '../scripts/detachedCampaignLocal';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const nodeModules='node:fs/promises';
const {mkdtemp,rm,readFile,writeFile}=await import(nodeModules) as {
  mkdtemp(prefix:string):Promise<string>;
  rm(path:string,options:{recursive:boolean;force:boolean}):Promise<void>;
  readFile(path:string):Promise<Uint8Array>;
  writeFile(path:string,bytes:Uint8Array):Promise<void>;
};
const encode=(text:string)=>new TextEncoder().encode(text);
const input=(file:EraOutputFile)=>({size:file.bytes.length,arrayBuffer:async()=>Uint8Array.from(file.bytes).buffer});

describe('actual detached archive retains original bytes and native next month',()=>{
  it('strictly imports two refs to one world, preserves original .era, and commits only one checked next revision',async()=>{
    const temp=await mkdtemp('/tmp/sect-detached-native-test-');
    try{
      const directory=temp+'/archive',rule=__SECT_UTILITY_RULE_VERSION__;
      const world=createInitialWorld(),payload=encode(encodeEraWorldSave(world)),sha256=await campaignSHA256(payload);
      const {tick,year,month}=world,expected={tick,year,month,bytes:payload.length,sha256};
      const packed=await prepareEraCheckpoint(world,{branchId:'old',timelineId:'native-test'},
        {encode:encodeEraWorldSave,decode:decodeEraWorldSave},{engineRuleVersion:rule});
      const {manifest,head}=await createDetachedArchive({directory,sourceRuleVersion:rule,writerRuleVersion:rule,
        timelineId:'native-test',active:{branchId:'old',tick,sha256},branches:[
          {id:'old',label:'旧世界',frames:[{manifestFile:input(packed.manifestFile),partFiles:packed.parts.map(input),expected}]},
          {id:'other',label:'独立阅读',parentBranchId:'old',forkTick:tick,frames:[{payload,expected}]},
        ]});
      const stats=detachedArchiveCapacity(manifest);
      expect(stats.snapshotCount).toBe(2);
      expect(stats.uniqueBlobs).toBe(2); // Exact native world once and exact original manifest once.
      expect(stats.referencedBytes-stats.uniqueChunkBytes).toBe(payload.length);
      const first=await readDetachedArchiveOriginal(directory,'old',tick);
      expect(first.payload).toEqual(payload);
      expect(first.sourceManifest).toEqual(packed.manifestFile.bytes);
      expect((await readDetachedArchiveOriginal(directory,'other',tick)).payload).toEqual(payload);

      const native=createFastForwardRunner(world,1);
      native.advanceChunk();
      const next=native.checkpoint()!;
      const committed=await advanceDetachedArchive(directory,{writerRuleVersion:rule,months:1,expected:head.token});
      expect(committed.token.revision).toBe(head.token.revision+1);
      expect(committed.value.worldSha256).toBe(await campaignSHA256(encode(encodeEraWorldSave(next.world))));
      const latest=await auditDetachedArchive(directory);
      expect(latest.world.tick).toBe(tick+1);
      expect(latest.retainedBytes).toBe(stats.referencedBytes+encode(encodeEraWorldSave(next.world)).length);
      await expect(advanceDetachedArchive(directory,{writerRuleVersion:rule,months:1,expected:head.token})).rejects.toThrow(/版本/u);
      expect((await auditDetachedArchive(directory)).head.token).toEqual(committed.token);
      expect((await readDetachedArchiveOriginal(directory,'old',tick)).payload).toEqual(payload);
    }finally{await rm(temp,{recursive:true,force:true});}
  });
  it('does not read damaged worlds for stale authorization but strictly rejects the same damaged bytes with the live token',async()=>{
    const temp=await mkdtemp('/tmp/sect-detached-preflight-test-');
    try{
      const directory=temp+'/archive',rule=__SECT_UTILITY_RULE_VERSION__;
      const world=createInitialWorld(),payload=encode(encodeEraWorldSave(world)),sha256=await campaignSHA256(payload);
      const {tick,year,month}=world;
      const {head}=await createDetachedArchive({directory,sourceRuleVersion:rule,writerRuleVersion:rule,
        timelineId:'native-test',active:{branchId:'original',tick,sha256},branches:[{id:'original',label:'原线',
          frames:[{payload,expected:{tick,year,month,bytes:payload.length,sha256}}]}]});
      const advanced=await advanceDetachedArchive(directory,{writerRuleVersion:rule,months:1,expected:head.token});
      if(advanced.value.kind!=='advance')throw Error('No native published successor');
      const object=directory+'/objects/'+advanced.value.snapshot.world.chunks[0].sha256;
      const same=Uint8Array.from(await readFile(object));
      const damaged=same.slice();
      damaged[Math.floor(damaged.length/2)]^=1;
      await writeFile(object,damaged);
      await expect(advanceDetachedArchive(directory,{writerRuleVersion:rule,months:1,expected:head.token}))
        .rejects.toMatchObject({code:'conflict'});
      await expect(advanceDetachedArchive(directory,{writerRuleVersion:rule,months:1,expected:advanced.token}))
        .rejects.toThrow(/SHA-256/u);
      await expect(auditDetachedArchive(directory)).rejects.toThrow(/SHA-256/u);
      expect(Uint8Array.from(await readFile(object))).toEqual(damaged);
      await writeFile(object,same); // Restore only this test's disposable object, never auto repair in production.
      expect((await auditDetachedArchive(directory)).head.token).toEqual(advanced.token);
    }finally{await rm(temp,{recursive:true,force:true});}
  });
});
