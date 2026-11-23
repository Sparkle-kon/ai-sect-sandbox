import { runEarlyActorAction } from './earlyActorAction';
import { runOrdinaryActorAction } from './ordinaryActorAction';
import type { TickActionPorts, WorldTickContext } from './tickContext';
import { defineTickPlugins, runTickPlugins } from './tickPlugins';

/** Each actor settles effects and witnesses before the next actor's turn. */
function settleActorWindow(context: WorldTickContext, ports: TickActionPorts): void {
  // Births and other roster changes made after iteration starts cannot join this batch.
  for (const cultivator of [...context.nextState.cultivators]) {
    if (runEarlyActorAction(cultivator, context, ports) === 'handled') continue;
    runOrdinaryActorAction(cultivator, context, ports);
  }
}

const actionAndCombatPlugins = defineTickPlugins<WorldTickContext, [TickActionPorts]>([
  // Snapshot, movement, settlement and witness publication must not become separate stage-wide passes.
  { id: 'settle-actor-window', run: settleActorWindow },
]);

export function runActionAndCombat(context: WorldTickContext, ports: TickActionPorts): void {
  runTickPlugins(context, actionAndCombatPlugins, ports);
}
