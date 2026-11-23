import type {SectJobAssignment,SectJobObservation} from '../types/sectJobs';
import type {WorldState} from '../types/world';
import {SECT_JOB_IDS} from './sectQuirkCatalog';
import {eligibleSectDisciples} from './sectJobs';

/** Read and copy the player's whole board at once. A duplicate or foreign disciple voids that board. */
export function quoteSectMeetingOrders(world:WorldState, rows:readonly SectJobAssignment[]):readonly SectJobAssignment[]|undefined {
  if(!world.sectManagement||!Array.isArray(rows))return undefined;
  const eligible=new Set(eligibleSectDisciples(world).map(actor=>actor.id));
  const seen=new Set<string>(),orders:SectJobAssignment[]=[];
  for(const row of rows){
    if(!row||typeof row!=='object'||Object.keys(row).length!==2||!Object.hasOwn(row,'discipleId')||!Object.hasOwn(row,'jobId')||
      !eligible.has(row.discipleId)||!SECT_JOB_IDS.includes(row.jobId)||seen.has(row.discipleId))return undefined;
    seen.add(row.discipleId);
    orders.push(Object.freeze({discipleId:row.discipleId,jobId:row.jobId}));
  }
  return Object.freeze(orders);
}

export interface SectMeetingTurn {
  readonly byDisciple:ReadonlyMap<string,SectJobAssignment>;
  readonly observations:Map<string,SectJobObservation>;
}

export function openSectMeetingTurn(world:WorldState,rows:readonly SectJobAssignment[]|undefined):SectMeetingTurn|undefined {
  if(rows===undefined)return undefined;
  const validated=quoteSectMeetingOrders(world,rows);
  if(!validated)return undefined;
  return {byDisciple:new Map(validated.map(row=>[row.discipleId,row])),observations:new Map()};
}

export function readSettledSectMeeting(turn:SectMeetingTurn,tick:number):readonly SectJobObservation[] {
  return Object.freeze([...turn.byDisciple.values()].map(row=>Object.freeze(turn.observations.get(row.discipleId)??{
    ...row,tick,phase:'unavailable' as const,line:'本月没能执行这件差事。',
  })));
}
