import {openSectMeetingTurn,readSettledSectMeeting} from '../sectMeetingOrders';
import {settleSectJobReportRow} from '../sectJobReportRules';
import type { WorldState } from '../../types/world';
import { cloneWorldWithColdHistory } from '../coldHistoryEngine';
import { worldRandom } from '../worldRandom';
import { runActionAndCombat } from './actionAndCombat';
import { runChronicleAndPostTurn } from './chronicleAndPostTurn';
import { runInstitutionAndWorld } from './institutionAndWorld';
import { runMovementAndEncounter } from './movementAndEncounter';
import { runPreTurn } from './preTurn';
import type {
  PreTurnContext, TickActionPorts, TickBaseContext, TickInputs, WorldTickContext,
} from './tickContext';

type Stage<Id extends string, Args extends unknown[], Output> =
  Readonly<{ id: Id; run: (...args: Args) => Output }>;

export type TickStagePipeline = readonly [
  Stage<'PreTurn', [TickBaseContext], PreTurnContext>,
  Stage<'MovementAndEncounter', [PreTurnContext], WorldTickContext>,
  Stage<'ActionAndCombat', [WorldTickContext, TickActionPorts], void>,
  Stage<'InstitutionAndWorld', [WorldTickContext, Pick<TickActionPorts, 'closeInterruptedTrial'>], void>,
  Stage<'ChronicleAndPostTurn', [WorldTickContext], void>,
];

function stage<Name extends string, Args extends unknown[], Output>(
  name: Name, run: (...args: Args) => Output,
): Stage<Name, Args, Output> {
  return Object.freeze({ id: name, run });
}

/** Stage functions can internally register ordered native plugins without changing turn boundaries. */
export const tickStagePipeline = Object.freeze([
  stage('PreTurn', runPreTurn),
  stage('MovementAndEncounter', runMovementAndEncounter),
  stage('ActionAndCombat', runActionAndCombat),
  stage('InstitutionAndWorld', runInstitutionAndWorld),
  stage('ChronicleAndPostTurn', runChronicleAndPostTurn),
] as const satisfies TickStagePipeline);

export type TickStageName = TickStagePipeline[number]['id'];

/** Each stage sees the same cloned world, random stream and original turn options. */
export function runTickStagePipeline(inputs: TickInputs, ports: TickActionPorts): WorldState {
  const nextState: WorldState = cloneWorldWithColdHistory(inputs.prevState);
  const rng = inputs.injectedRandom ?? worldRandom(nextState);
  const sectMeeting=openSectMeetingTurn(inputs.prevState,inputs.traceOptions?.sectJobAssignments);
  const precomputedDecisions=sectMeeting?.byDisciple.size&&inputs.precomputedDecisions?
    Object.fromEntries(Object.entries(inputs.precomputedDecisions).filter(([id])=>!sectMeeting.byDisciple.has(id))):
    inputs.precomputedDecisions;
  const context: TickBaseContext = { ...inputs, precomputedDecisions, nextState, rng, sectMeeting };
  const [preTurn, movement, actions, institutions, chronicle] = tickStagePipeline;
  const preTurnContext = preTurn.run(context);
  const turnContext = movement.run(preTurnContext);
  actions.run(turnContext, ports);
  const observed=sectMeeting&&readSettledSectMeeting(sectMeeting,nextState.tick);
  const managed=nextState.sectManagement;
  if(managed&&observed?.length){
    // Dice belong to a dated native meeting, not to portrait order, UI skips or optional model prose.
    const resolved=new Map([...observed].sort((a,b)=>a.discipleId<b.discipleId?-1:a.discipleId>b.discipleId?1:0)
      .map(row=>[row.discipleId,settleSectJobReportRow(nextState,row,rng)]));
    managed.latestReport={openedTick:inputs.prevState.tick,settledTick:nextState.tick,sectId:managed.sectId,leaderId:managed.leaderId,
      rows:observed.map(row=>resolved.get(row.discipleId)!)};
  }
  institutions.run(turnContext, ports);
  chronicle.run(turnContext);
  if(observed)inputs.traceOptions?.onSectJobsSettled?.(observed);
  return turnContext.nextState;
}
