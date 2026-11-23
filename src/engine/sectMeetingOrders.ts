import type {SectJobAssignment,SectJobEvidence,SectJobObservation,SectJobPlan} from '../types/sectJobs';
import type {Cultivator,WorldEvent,WorldState} from '../types/world';
import {SECT_JOB_IDS} from './sectQuirkCatalog';
import {eligibleSectDisciples,observeSectJob,quoteSectJob,settleSectJobChore} from './sectJobs';
import {sectFestivalForJob} from './sectFestivals';
import {canFinishSectPairBlame} from './sectPairDrama';
import type {SectPairDramaPlan} from '../types/sectPairDrama';

/** Read and copy the player's whole board at once. A duplicate or foreign disciple voids that board. */
export function quoteSectMeetingOrders(world:WorldState, rows:readonly SectJobAssignment[]):readonly SectJobAssignment[]|undefined {
  if(!world.sectManagement||!Array.isArray(rows))return undefined;
  const eligible=new Map(eligibleSectDisciples(world).map(actor=>[actor.id,actor]));
  const seen=new Set<string>(),orders:SectJobAssignment[]=[];
  for(const row of rows){
    if(!row||typeof row!=='object'||Object.keys(row).length!==2||!Object.hasOwn(row,'discipleId')||!Object.hasOwn(row,'jobId')||
      !eligible.has(row.discipleId)||!SECT_JOB_IDS.includes(row.jobId)||seen.has(row.discipleId))return undefined;
    const actor=eligible.get(row.discipleId);
    if(!actor||sectFestivalForJob(row.jobId)&&quoteSectJob(world,actor,row.jobId).kind==='blocked')return undefined;
    seen.add(row.discipleId);
    orders.push(Object.freeze({discipleId:row.discipleId,jobId:row.jobId}));
  }
  return Object.freeze(orders);
}

type ChorePlan=Extract<SectJobPlan,{kind:'chore'}>;
interface DeferredChore {
  readonly actor:Cultivator;
  readonly job:SectJobAssignment;
  readonly plan:ChorePlan;
  readonly before:SectJobEvidence;
}

export interface SectMeetingTurn {
  readonly byDisciple:ReadonlyMap<string,SectJobAssignment>;
  readonly observations:Map<string,SectJobObservation>;
  readonly deferredChores:Map<string,DeferredChore>;
  pairDrama?:SectPairDramaPlan;
}

export function openSectMeetingTurn(world:WorldState,rows:readonly SectJobAssignment[]|undefined):SectMeetingTurn|undefined {
  if(rows===undefined)return undefined;
  const validated=quoteSectMeetingOrders(world,rows);
  if(!validated)return undefined;
  return {byDisciple:new Map(validated.map(row=>[row.discipleId,row])),observations:new Map(),deferredChores:new Map()};
}

export function readSettledSectMeeting(turn:SectMeetingTurn,tick:number):readonly SectJobObservation[] {
  return Object.freeze([...turn.byDisciple.values()].map(row=>Object.freeze(turn.observations.get(row.discipleId)??{
    ...row,tick,phase:'unavailable' as const,line:'本月没能执行这件差事。',
  })));
}


/** This only stages the chore after the exact native REST was admitted; it never cancels another native action. */
export function deferSectPairChore(turn:SectMeetingTurn,actor:Cultivator,job:SectJobAssignment,
  plan:ChorePlan,before:SectJobEvidence):boolean{
  const pair=turn.pairDrama;
  if(!pair||pair.kind!=='blame'||pair.tick!==before.tick||pair.jobId!==job.jobId||pair.siteId!==plan.siteId||
      !pair.pair.includes(actor.id)||job.discipleId!==actor.id||turn.deferredChores.has(actor.id))return false;
  turn.deferredChores.set(actor.id,{actor,job,plan,before});
  return true;
}

export function finishSectPairChores(world:WorldState,turn:SectMeetingTurn,emit:(event:WorldEvent)=>void):boolean {
  if(!turn.deferredChores.size)return false;
  const pair=turn.pairDrama;
  const held=[...turn.deferredChores.values()];
  turn.deferredChores.clear();
  if(pair?.kind==='blame'&&held.length===2&&pair.pair.every(id=>held.some(row=>row.actor.id===id))&&
      canFinishSectPairBlame(world,pair)){
    for(const row of held)turn.observations.set(row.actor.id,{
      ...row.job,tick:world.tick,phase:'unavailable',line:'两人都没接过差事，这件活没做成。',
    });
    return true;
  }
  // A duty, move or lost partner cannot cost the other disciple a valid job. Settle only what is still physically possible.
  for(const row of held){
    const event=settleSectJobChore(world,row.actor,row.plan);
    if(event)emit(event);
    turn.observations.set(row.actor.id,observeSectJob(world,row.actor,row.job,row.plan,row.before,event,!!event));
  }
  return false;
}
