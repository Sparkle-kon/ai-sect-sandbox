import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {eligibleSectDisciples,quoteSectJob} from '../src/engine/sectJobs';
import {BASE_SECT_JOB_IDS} from '../src/engine/sectQuirkCatalog';
import {projectSectComicMoment} from '../src/engine/sectComedy';
import {projectSectComedyContinuations,applySectComedyChoice} from '../src/engine/sectComedyContinuations';
import {comedyFollowUpKey,comedyIdentity} from '../src/engine/sectComedyTerms';
import {COMEDY_RECRUIT_IDS} from '../src/types/sectComedy';
import {encodeEraWorldSave,decodeEraWorldSave} from '../src/engine/storageEngine';
import {STARTER_SECT_IDS,type StarterSectId} from '../src/types/sectManagement';
import type {SectJobAssignment} from '../src/types/sectJobs';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

declare const process:{argv:readonly string[]};
export const H6_ROTATION_SEEDS=[1,42,1729,13071,50261,65537];
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'在庭院听诸位回来交差。'};
export function simulateH6Rotation(seed:number,starter:StarterSectId,offset=0,saveMidway=false,interim?:(world:WorldState)=>void){
  let world=createManagedSectWorld(seed,'classic',starter,0)!;
  const original=world.sectManagement!;
  const months=[];
  for(let index=0;index<12;index++){
    const used=new Set<SectJobAssignment['jobId']>();
    const disciples=eligibleSectDisciples(world);
    const assignments=disciples.flatMap((actor,i):SectJobAssignment[]=>{
      const turn=(index+i*3+offset)%BASE_SECT_JOB_IDS.length;
      const rotated=[...BASE_SECT_JOB_IDS.slice(turn),...BASE_SECT_JOB_IDS.slice(0,turn)];
      const legal=rotated.filter(job=>quoteSectJob(world,actor,job).kind!=='blocked');
      const jobId=legal.find(job=>!used.has(job))??legal[0];
      if(!jobId)return [];
      used.add(jobId);
      return [{discipleId:actor.id,jobId}];
    });
    world=advanceWorldTick(world,{[original.leaderId]:rest},undefined,'utility',undefined,{
      sectJobAssignments:assignments,captureTrace:false,capturePresentation:false,
    });
    const m=world.sectManagement!,comic=projectSectComicMoment(world);
    const arrivals=m.comedy?.pending?.filter(row=>row.arrival?.tick===world.tick)??[];
    const stage=projectSectComedyContinuations(world);
    for(const story of stage){
      const option=story.choices.find(choice=>choice.available);
      if(option)applySectComedyChoice(world,{id:story.id,choiceId:option.id});
    }
    const reports=m.latestReport?.settledTick===world.tick?m.latestReport.rows:[];
    months.push({tick:world.tick,year:world.year,month:world.month,roster:disciples.length,
      assigned:assignments.map(row=>row.jobId),reports:reports.map(row=>[row.jobId,row.phase,row.tier,row.errand?.outcome]),
      comic:comic?.moment.tick===world.tick?{template:comic.templateId,report:comic.report,effects:comic.effects}:undefined,
      arrivals:arrivals.map(row=>({kind:row.kind,voiced:stage.find(view=>view.id===comedyFollowUpKey(row))?.line})),
      newRecruits:m.comedy?.moments.at(-1)?.tick===world.tick?(comic?.effects.flatMap(effect=>effect.kind==='recruit'?[effect.actorId]:[])??[]):[],
    });
    interim?.(world);
    if(saveMidway&&index===5)world=decodeEraWorldSave(encodeEraWorldSave(world));
  }
  return {months,managed:world.sectManagement?.growth?.failure===undefined,material:months.filter(row=>row.comic?.effects.some(effect=>effect.kind!=='qi')).length,
    visitors:months.reduce((sum,row)=>sum+row.arrivals.filter(arrival=>arrival.kind==='visit'&&arrival.voiced).length,0),
    followUps:months.reduce((sum,row)=>sum+row.arrivals.length,0),
    recruits:COMEDY_RECRUIT_IDS.filter(template=>world.cultivators.some(actor=>actor.id===comedyIdentity(original.sectId,'recruit',template))).length};
}
if(process.argv.includes('--scan')){
  for(const seed of H6_ROTATION_SEEDS)for(const start of STARTER_SECT_IDS){
    const {months:_,...summary}=simulateH6Rotation(seed,start);
    console.log(JSON.stringify({seed,start,...summary}));
  }
} else if(process.argv.includes('--sample')){
  console.log(JSON.stringify(simulateH6Rotation(Number(process.argv[process.argv.indexOf('--sample')+1]),
    process.argv.includes('--qingyun')?'qingyun-odd-jobs':'drunken-sword-hermitage',0,true),null,2));
}
