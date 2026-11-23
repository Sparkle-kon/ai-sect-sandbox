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
  const context: TickBaseContext = { ...inputs, nextState, rng };
  const [preTurn, movement, actions, institutions, chronicle] = tickStagePipeline;
  const preTurnContext = preTurn.run(context);
  const turnContext = movement.run(preTurnContext);
  actions.run(turnContext, ports);
  institutions.run(turnContext, ports);
  chronicle.run(turnContext);
  return turnContext.nextState;
}
