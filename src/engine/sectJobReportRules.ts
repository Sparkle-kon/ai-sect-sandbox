import {REALM_ORDER} from '../data/initialWorld';
import {SECT_JOB_TIERS,type SectJobObservation,type SectJobReportEffect,type SectJobReportRow,type SectJobTier} from '../types/sectJobs';
import type {ManagementBuildingId} from '../types/sectManagement';
import type {Cultivator,SpiritRoot,WorldState} from '../types/world';
import {effectiveSectQuirks} from './sectQuirkAssignment';
import {combineSectJobModifiers,type SectJobId} from './sectQuirkCatalog';

type Odds=Readonly<Record<SectJobTier,number>>;
type JobProfile={readonly base:Odds;readonly building:ManagementBuildingId;readonly roots:readonly SpiritRoot[]};
function odds(success:number,windfall:number,mishap:number,disaster:number):Odds{
  return {success,windfall,mishap,disaster};
}
const PROFILES:Readonly<Record<SectJobId,JobProfile>>={
  gather:{base:odds(57,20,18,5),building:'hall',roots:['木','水']},
  explore:{base:odds(52,19,22,7),building:'trainingGround',roots:['雷','水']},
  cultivate:{base:odds(72,12,14,2),building:'library',roots:['天灵根']},
  stall:{base:odds(60,18,18,4),building:'hall',roots:['土']},
  kitchen:{base:odds(62,20,14,4),building:'kitchen',roots:['火','木']},
  guard:{base:odds(64,14,17,5),building:'gate',roots:['土','金']},
  deliver:{base:odds(63,16,16,5),building:'gate',roots:['雷','水']},
  recruit:{base:odds(66,15,16,3),building:'hall',roots:['木']},
  challenge:{base:odds(53,19,18,10),building:'trainingGround',roots:['金','雷']},
  matchmaking:{base:odds(60,17,20,3),building:'hall',roots:['水']},
};
const safeQi=(actor:Cultivator)=>Number.isFinite(actor.qiProgress)&&actor.qiProgress>=0&&actor.qiProgress<=100;
const hpLoss=(actor:Cultivator)=>Math.max(0,Math.min(60,Math.ceil(actor.maxHp*.12),Math.floor(actor.hp-1)));
const contributionRoom=(actor:Cultivator)=>Number.isSafeInteger(actor.contribution)&&actor.contribution>=0&&actor.contribution<9999;
const canWindfall=(actor:Cultivator)=>safeQi(actor)&&actor.qiProgress<100||contributionRoom(actor);
const canMishap=(actor:Cultivator)=>safeQi(actor)&&actor.qiProgress>0;
const canDisaster=(actor:Cultivator)=>Number.isFinite(actor.hp)&&Number.isFinite(actor.maxHp)&&hpLoss(actor)>0;

/** Integer weights, not percentages. A consequence with no actual room has zero weight. */
export function sectJobOutcomeOdds(world:WorldState,actor:Cultivator,job:SectJobId):Odds{
  const settings=PROFILES[job];
  const level=Math.max(0,Math.min(6,world.sectManagement?.buildings[settings.building]??0));
  const skill=Math.max(0,REALM_ORDER.indexOf(actor.realm))*2+Math.floor(actor.realmStage/3);
  const root=settings.roots.includes(actor.spiritRoot)?4:0;
  const composure=actor.personality==='苟道'||actor.personality==='刚正'?2:0;
  const bravado=actor.personality==='狂傲'||actor.personality==='嗜血'?2:0;
  const mod=combineSectJobModifiers(effectiveSectQuirks(world,actor),job);
  return odds(
    Math.max(1,settings.base.success+mod.success+skill+root+level*3+composure),
    canWindfall(actor)?Math.max(1,settings.base.windfall+mod.windfall+root+level):0,
    canMishap(actor)?Math.max(1,settings.base.mishap+mod.mishap-level*2+bravado):0,
    canDisaster(actor)?Math.max(1,settings.base.disaster-Math.floor(level/2)-composure+bravado):0,
  );
}

export function pickSectJobTier(weights:Odds,roll:number):SectJobTier{
  const all=SECT_JOB_TIERS.map(tier=>({tier,weight:Number.isFinite(weights[tier])?Math.max(0,weights[tier]):0}));
  const sum=all.reduce((total,row)=>total+row.weight,0);
  if(sum<=0||!Number.isFinite(roll))return 'success';
  let remainder=Math.min(1-Number.EPSILON,Math.max(0,roll))*sum;
  for(const row of all){
    if(remainder<row.weight)return row.tier;
    remainder-=row.weight;
  }
  return all.filter(row=>row.weight>0).at(-1)?.tier??'success';
}

function followUp(actor:Cultivator,tier:SectJobTier):SectJobReportEffect|undefined{
  if(tier==='windfall'){
    if(safeQi(actor)&&actor.qiProgress<100){
      const before=actor.qiProgress;
      actor.qiProgress=Math.min(100,before+6);
      return {kind:'qi',amount:actor.qiProgress-before,stage:'follow_up'};
    }
    if(contributionRoom(actor)){
      actor.contribution++;
      return {kind:'contribution',amount:1,stage:'follow_up'};
    }
  }
  if(tier==='mishap'&&canMishap(actor)){
    const before=actor.qiProgress;
    actor.qiProgress=Math.max(0,before-5);
    return {kind:'qi',amount:actor.qiProgress-before,stage:'follow_up'};
  }
  if(tier==='disaster'&&canDisaster(actor)){
    const loss=hpLoss(actor);
    actor.hp-=loss;
    return {kind:'hp',amount:-loss,stage:'follow_up'};
  }
}

/** Only the trusted completed meeting hands us a native observation, once per assigned disciple. */
export function settleSectJobReportRow(world:WorldState,observation:SectJobObservation,rng:()=>number):SectJobReportRow{
  const base:Omit<SectJobReportRow,'effects'>={discipleId:observation.discipleId,jobId:observation.jobId,phase:observation.phase,
    ...(observation.siteId?{siteId:observation.siteId}:{}),...(observation.sourceEventId?{sourceEventId:observation.sourceEventId}:{})};
  if(observation.phase!=='performed')return {...base,effects:[]};
  const effects=[...observation.nativeEffects??[]];
  const candidates=world.cultivators.filter(actor=>actor.id===observation.discipleId);
  const actor=candidates.length===1?candidates[0]:undefined,managed=world.sectManagement;
  if(!managed||observation.tick!==world.tick||!actor||!actor.alive||actor.hp<=0||
    actor.sectId!==managed.sectId||actor.id===managed.leaderId||actor.positionPlane!==undefined||
    actor.locationId!==observation.siteId)return {...base,tier:'success',effects};
  const picked=pickSectJobTier(sectJobOutcomeOdds(world,actor,observation.jobId),rng());
  const extra=followUp(actor,picked);
  if(extra?.amount)effects.push(extra);
  return {...base,tier:extra?.amount?picked:'success',effects};
}
