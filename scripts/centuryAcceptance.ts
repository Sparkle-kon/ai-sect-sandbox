import {arch,cpus,existsSync,join,mkdir,open,platform,readFile,release,rename,totalmem,unlink,writeFile} from './centuryNodeRuntime';
declare const process:{argv:string[];pid:number;version:string;resourceUsage():{maxRSS:number}};
declare const setImmediate:(runner:()=>void)=>object;
declare const clearImmediate:(handle:object)=>void;
import {createInitialWorld} from '../src/data/initialWorld';
import {createCampaignJournal} from '../src/engine/campaignJournal';
import type {CampaignJournalBackend,CampaignJournalRecord} from '../src/engine/campaignJournal';
import {sealCampaignSource} from '../src/engine/campaignMemento';
import type {CampaignSourceMemento} from '../src/engine/campaignMemento';
import {createCampaignCheckpoint,createFastForwardCampaignController} from '../src/engine/fastForwardCampaignEngine';
import type {CampaignControllerState} from '../src/engine/fastForwardCampaignEngine';
import {createFastForwardWorkerController} from '../src/engine/fastForwardEngine';
import {createTimeline} from '../src/engine/timelineEngine';
import {encodeEraWorldSave,worldSaveByteCount} from '../src/engine/storageEngine';
import type {WorldState} from '../src/types/world';

declare const __SECT_UTILITY_RULE_VERSION__:string;
export const version=__SECT_UTILITY_RULE_VERSION__,seed=2031,sourceTimelineId='century-2031-classic';
type Disk={record:CampaignJournalRecord;source:CampaignSourceMemento};
const start=performance.now();
export const log=(name:string,detail:unknown={})=>console.log(JSON.stringify({name,elapsedMs:Math.round(performance.now()-start),detail}));
export const die=(text:string):never=>{throw Error(text);};
export function population(world:WorldState, original:WorldState){
 const founders=new Set(original.cultivators.map(x=>x.id));
 const alive=world.cultivators.filter(x=>x.alive&&x.hp>0);
 return {living:alive.length,registered:world.cultivators.length,livingFounders:alive.filter(x=>founders.has(x.id)).length,
  residents:world.settlements.villages.reduce((n,x)=>n+x.population,0)};
}
export function fileBackend(dir:string):CampaignJournalBackend{
 const file=join(dir,'campaign.json'),lock=join(dir,'campaign.lock');
 const load=async ():Promise<Disk|undefined>=>{
   try{return JSON.parse(await readFile(file,'utf8')) as Disk;}
   catch(error){if((error as {code?:string}).code==='ENOENT')return;throw error;}
 };
 return {
   async read(){return (await load())?.record;},
   async readSource(id){const row=await load();return row?.record.id===id?row.source:undefined;},
   async commit(change){
     const handle=await open(lock,'wx');
     let temp:string|undefined;
     try{
       const old=await load();
       let next:Disk;
       if(change.kind==='begin'){
         if(old)return false;
         next={record:change.next,source:change.source};
       }else{
         if(!old||old.record.id!==change.expected.id||old.record.revision!==change.expected.revision||
            old.record.generation!==change.expected.generation||old.record.seal!==change.expected.seal)return false;
         if(change.kind==='discard'){await unlink(file);const fd=await open(dir,'r');try{await fd.sync();}finally{await fd.close();}return true;}
         next={record:change.next,source:old.source};
       }
       temp=join(dir,`campaign-${process.pid}-${change.kind}.tmp`);
       const out=await open(temp,'wx');
       try{await out.writeFile(JSON.stringify(next));await out.sync();}finally{await out.close();}
       await rename(temp,file);temp=undefined;
       const fd=await open(dir,'r');try{await fd.sync();}finally{await fd.close();}
       return true;
     }finally{if(temp&&existsSync(temp))await unlink(temp);await handle.close();await unlink(lock);}
   },
 };
}
export async function runMain(mode:string,dir:string,horizon:number,pauseAt:number){
 await mkdir(dir,{recursive:true});
 const journal=createCampaignJournal(fileBackend(dir));
 let record:CampaignJournalRecord, source:WorldState, initial:ReturnType<typeof createCampaignCheckpoint>;
 if(mode==='start'){
   source=createInitialWorld(seed,'classic');initial=createCampaignCheckpoint(source,horizon);
   const base=await sealCampaignSource(createTimeline(source),sourceTimelineId,source);
   record=await journal.begin(base,horizon,version);
 }else if(mode==='resume'){
   const loaded=await journal.load()??die('No verified checkpoint to resume');
   if(loaded.record.status!=='pending'||loaded.record.completedTicks!==pauseAt||loaded.record.requestedTicks!==horizon)die('Unexpected durable resume state');
   source=loaded.source.world;initial=loaded.checkpoint;record=await journal.claim(loaded.record,version);
 }else return die('Expected start/resume');
 log(mode,{pid:process.pid,ruleVersion:version,node:process.version,os:[platform(),release(),arch()],cpus:cpus().length,
   cpu:cpus()[0]?.model,ramBytes:totalmem(),seed,branch:'main',tick:initial.world.tick,year:initial.world.year,
   month:initial.world.month,population:population(initial.world,source),record:{id:record.id,revision:record.revision,
   generation:record.generation,headSha256:record.head?.sha256,sourceSha256:record.source.sha256,topologySha256:record.topologySha256,timing:'native in-process Worker controller; actual distinct OS restart; atomic file CAS with exclusive lock/fsync/rename; not browser IDB'}});
 let controller:ReturnType<typeof createFastForwardCampaignController>;
 let finish:(value:CampaignControllerState)=>void=()=>{};
 const stable=new Promise<CampaignControllerState>(resolve=>{finish=resolve;});
 let workerCount=0;
 controller=createFastForwardCampaignController({runId:`century-${mode}-${process.pid}`,source,initial,
   createWorker(receive,fail){
     workerCount++;
     let open=true;
     const send=createFastForwardWorkerController({post:message=>{if(open)receive(message);},
       schedule:callback=>setImmediate(()=>{if(open)callback();}),cancelSchedule:handle=>clearImmediate(handle as ReturnType<typeof setImmediate>)});
     return {post(request){try{if(open)send(request);}catch{fail();}},terminate(){open=false;}};
   },
   async commit(previous,next){
     try{
       if(record.completedTicks!==previous.completedTicks)die('CAS current checkpoint mismatch');
       const at=performance.now();
       record=await journal.checkpoint(record,next);
       log('durable',{completed:record.completedTicks,tick:next.world.tick,year:next.world.year,month:next.world.month,
         pop:population(next.world,source),bytes:record.head?.bytes,sha256:record.head?.sha256,
         revision:record.revision,checkpointMs:Math.round(performance.now()-at)});
       return true;
     }catch(error){
       log('checkpoint_error',{name:(error as Error).name,message:(error as Error).message,code:(error as {code?:string}).code,
         completed:next.completedTicks});
       try{encodeEraWorldSave(next.world);}catch(native){
         log('native_codec_error',{message:(native as Error).message,code:(native as {code?:string}).code,
          bytes:worldSaveByteCount(next.world),tick:next.world.tick});
       }
       await writeFile(join(dir,'failed-candidate-raw.json'),JSON.stringify({format:'ai-sect-sandbox',version:1,world:next.world}));
       return false;
     }
   },
   discard:async()=>false,
   onState(state){
     if(mode==='start'&&state.phase==='checkpointing'&&state.completedTicks>=pauseAt){controller.pause();return;}
     if(state.phase==='ready'||state.phase==='error'||mode==='start'&&state.phase==='paused'&&state.durableTicks===pauseAt)finish(state);
   },
 });
 if(!controller.start())return die('Controller did not start');
 const state=await stable;
 controller.detach();
 log('finished',{state,workerCount,revision:record.revision,id:record.id,maxRssKiB:process.resourceUsage().maxRSS});
 if(state.phase==='error')return die(state.notice??'Campaign failed');
 if(mode==='start'&&state.durableTicks!==pauseAt)return die('Pause not at requested durable boundary');
 if(mode==='resume'&&(state.phase!=='ready'||state.durableTicks!==horizon))return die('Resume did not reach horizon');
}
if(process.argv[2]==='start'||process.argv[2]==='resume'){
 const [, , mode,dir,h,p]=process.argv;
 await runMain(mode,dir,Number(h),Number(p));
}
