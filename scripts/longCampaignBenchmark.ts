import {createInitialWorld} from '../src/data/initialWorld';
import {decodeWorldSave,encodeWorldSave,worldSaveByteCount,WorldSaveError,WORLD_SAVE_MAX_BYTES} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {WorldgenProfileId,WorldState} from '../src/types/world';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const nativeRuleVersion=()=>typeof __SECT_UTILITY_RULE_VERSION__==='string'&&/^[0-9a-f]{64}$/.test(__SECT_UTILITY_RULE_VERSION__)?
  __SECT_UTILITY_RULE_VERSION__:null;
export const CAMPAIGN_BENCHMARK_VERSION=1;
export const CAMPAIGN_BENCHMARK_MAX_MONTHS=1200;
export const CAMPAIGN_BENCHMARK_MONTHS=[120,300,600] as const;
const validProfile=(raw:string):raw is WorldgenProfileId=>raw==='classic'||raw==='spirit-bloom'||raw==='fractured-frontier';
const rounded=(n:number)=>Number(n.toFixed(2));
const nonnegativeInt=(n:number)=>Number.isSafeInteger(n)&&n>=0;

export interface CampaignBenchmarkOptions {
  readonly seed:number;
  readonly months:readonly number[];
  readonly profile:WorldgenProfileId;
  /** Caller supplies the exact source revision, not a guessed engine version. */
  readonly revision:string;
}
export function parseCampaignBenchmarkArgs(flags:readonly string[]):CampaignBenchmarkOptions {
  const values=new Map<string,string>();
  for(const flag of flags){
    const match=/^--(seed|months|profile|revision)=([^\r\n]+)(?![\s\S])/.exec(flag);
    if(!match||values.has(match[1]))throw new RangeError('参数：--seed=2031 --months=120,300,600 --profile=classic --revision=<提交编号>');
    values.set(match[1],match[2]);
  }
  const seedRaw=values.get('seed')??'2031',monthsRaw=values.get('months');
  if(!/^(?:0|[1-9][0-9]{0,9})(?![\s\S])/.test(seedRaw))throw new RangeError('种子须为 32 位无符号整数。');
  const seed=Number(seedRaw),profile=values.get('profile')??'classic',revision=values.get('revision')??'unrecorded';
  if(seed>0xffff_ffff||!validProfile(profile)||!/^(?:[0-9a-f]{7,40}|unrecorded)(?![\s\S])/.test(revision))
    throw new RangeError('种子、世界谱系或提交编号无效。');
  if(monthsRaw!==undefined&&!/^[1-9][0-9]{0,3}(?:,[1-9][0-9]{0,3})*(?![\s\S])/.test(monthsRaw))
    throw new RangeError('取样月数须为逗号分隔的正整数。');
  const months=monthsRaw?.split(',').map(Number)??[...CAMPAIGN_BENCHMARK_MONTHS];
  validateCampaignOptions({seed,months,profile,revision});
  return {seed,months,profile,revision};
}
function validateCampaignOptions(options:CampaignBenchmarkOptions){
  if(!nonnegativeInt(options.seed)||options.seed>0xffff_ffff||!validProfile(options.profile)||
      !/^(?:[0-9a-f]{7,40}|unrecorded)(?![\s\S])/.test(options.revision)||
      options.months.length<1||options.months.length>24||options.months.some((month,index,list)=>
        !nonnegativeInt(month)||month<1||month>CAMPAIGN_BENCHMARK_MAX_MONTHS||index>0&&month<=list[index-1]))
    throw new RangeError(`请提供递增且不重复的取样月数（1–${CAMPAIGN_BENCHMARK_MAX_MONTHS}，最多 24 个）。`);
}

export function campaignPopulation(world:WorldState,founderIds:ReadonlySet<string>){
  const living=new Set(world.cultivators.filter(row=>row.alive&&row.hp>0).map(row=>row.id));
  return {livingCultivators:living.size,registeredCultivators:new Set(world.cultivators.map(row=>row.id)).size,
    survivingFounders:[...living].filter(id=>founderIds.has(id)).length,
    registeredMortals:world.settlements.villages.reduce((n,village)=>n+village.population,0)};
}
interface CampaignLeader {id:string;name:string|null}
export interface CampaignLeaderChange {
  tick:number;year:number;month:number;sectId:string;sectName:string;
  from?:CampaignLeader;to?:CampaignLeader;
  kind:'succession'|'vacancy'|'appointment'|'sect_formed'|'sect_ended';
  method?:NonNullable<WorldState['sects'][number]['succession']>['method'];
}
export function campaignLeaderChanges(before:WorldState,after:WorldState):CampaignLeaderChange[]{
  const old=new Map(before.sects.map(row=>[row.id,row])),current=new Map(after.sects.map(row=>[row.id,row]));
  const actors=new Map([...before.cultivators,...after.cultivators].map(row=>[row.id,row.name]));
  const who=(id:string|undefined)=>id?{id,name:actors.get(id)??null}:undefined;
  const ids=[...new Set([...old.keys(),...current.keys()])].sort();
  return ids.flatMap(sectId=>{
    const previous=old.get(sectId),next=current.get(sectId);
    if(previous&&next&&previous.leaderId===next.leaderId)return [];
    const kind:CampaignLeaderChange['kind']=!previous?'sect_formed':!next?'sect_ended':
      !next.leaderId?'vacancy':!previous.leaderId?'appointment':'succession';
    const from=who(previous?.leaderId),to=who(next?.leaderId),signed=next?.succession;
    const method=signed&&signed.tick===after.tick&&signed.leaderId===to?.id&&signed.previousLeaderId===from?.id?signed.method:undefined;
    return [{tick:after.tick,year:after.year,month:after.month,sectId,sectName:(next??previous)!.name,kind,
      ...(from?{from}:{}),...(to?{to}:{}),...(method?{method}:{})}];
  });
}
type SaveStage='size_measure'|'export'|'read'|'roundtrip'|'continue';
interface CampaignSaveFailure {stage:SaveStage;code:string;message:string}
export interface CampaignSaveResult {
  envelopeBytes:number|null;budgetBytes:number;exportAccepted:boolean;parsed:boolean;roundTripExact:boolean;continuedExact:boolean;
  failure?:CampaignSaveFailure;
}
function failure(stage:SaveStage,error:unknown):CampaignSaveFailure{
  return {stage,code:error instanceof WorldSaveError?error.code:'check_failed',message:error instanceof Error?error.message:'未知错误'};
}
function verifyCampaignSave(world:WorldState,now:()=>number){
  const save:CampaignSaveResult={envelopeBytes:null,budgetBytes:WORLD_SAVE_MAX_BYTES,exportAccepted:false,parsed:false,
    roundTripExact:false,continuedExact:false};
  const elapsed={sizeMeasureMs:0,exportMs:0,readBackMs:0,roundTripMs:0,continueProbeMs:0};
  let started=now(),stage:SaveStage='size_measure';
  try{
    save.envelopeBytes=worldSaveByteCount(world);
    elapsed.sizeMeasureMs=rounded(now()-started);
    stage='export';started=now();
    const raw=encodeWorldSave(world);
    if(new TextEncoder().encode(raw).byteLength!==save.envelopeBytes)throw Error('正式 JSON 编码字节与信封计数不一致。');
    save.exportAccepted=true;elapsed.exportMs=rounded(now()-started);
    stage='read';started=now();
    const reloaded=decodeWorldSave(raw);
    save.parsed=true;elapsed.readBackMs=rounded(now()-started);
    stage='roundtrip';started=now();
    if(encodeWorldSave(reloaded)!==raw)throw Error('读回后重新导出字节与原档不同。');
    save.roundTripExact=true;elapsed.roundTripMs=rounded(now()-started);
    stage='continue';started=now();
    const continuing=advanceWorldTick(world,undefined,undefined,'utility');
    const restored=advanceWorldTick(reloaded,undefined,undefined,'utility');
    if(continuedMonthWrong(continuing,world)||continuedMonthWrong(restored,world)||JSON.stringify(continuing)!==JSON.stringify(restored)){
      throw Error('读回世界再推一个月，和原取样节点再推一个月不一致。');
    }
    save.continuedExact=true;elapsed.continueProbeMs=rounded(now()-started);
  }catch(error){
    save.failure=failure(stage,error);
    const field={size_measure:'sizeMeasureMs',export:'exportMs',read:'readBackMs',roundtrip:'roundTripMs',continue:'continueProbeMs'}[stage] as keyof typeof elapsed;
    elapsed[field]=rounded(now()-started);
  }
  return {save,elapsed};
}
function continuedMonthWrong(next:WorldState,previous:WorldState){
  return next.tick!==previous.tick+1||next.month!==previous.month%12+1||
    next.year!==previous.year+(previous.month===12?1:0);
}

/** Advances a single coalesced campaign per seed. Readback probes never seed later checkpoints. */
export function* collectCampaignBenchmark(options:CampaignBenchmarkOptions,{now=()=>performance.now()}:{now?:()=>number}={}){
  validateCampaignOptions(options);
  const months=[...options.months];
  let world=createInitialWorld(options.seed,options.profile),month=0,tickVariationMs=0,simulationMs=0,leaderChangesTotal=0;
  const founderIds=new Set(world.cultivators.map(row=>row.id)),start={tick:world.tick,year:world.year,month:world.month};
  for(const target of months){
    const leaderChanges:CampaignLeaderChange[]=[];
    for(;month<target;month++){
      const started=now();
      const next=advanceWorldTick(world,undefined,undefined,'utility');
      const duration=now()-started;
      if(continuedMonthWrong(next,world))throw Error(`无头推演未连续前进到第 ${month+1} 月。`);
      simulationMs+=duration;
      tickVariationMs=Math.max(tickVariationMs,duration);
      leaderChanges.push(...campaignLeaderChanges(world,next));
      world=next;
    }
    leaderChangesTotal+=leaderChanges.length;
    const {save,elapsed}=verifyCampaignSave(world,now);
    yield {benchmarkVersion:CAMPAIGN_BENCHMARK_VERSION,sourceRevision:options.revision,utilityRuleVersion:nativeRuleVersion(),
      seed:options.seed,profile:options.profile, interventionCount:0,
      measurementScope:'local headless Node elapsed time; no browser render, Worker transfer or model',
      branchId:'main' as const,engine:'native_utility' as const,leaderChangeScope:'monthly_boundary_net' as const,
      start,months:target,checkpoint:{tick:world.tick,year:world.year,month:world.month},
      population:campaignPopulation(world,founderIds),leaderChanges,leaderChangesTotal,save,
      timingMs:{simulationTotal:rounded(simulationMs),maximumSingleTick:rounded(tickVariationMs),...elapsed}};
  }
}
