import { availableCalamityArrayChoices, type CalamityArrayOption } from '../engine/calamityArray';
import { calamityArrayCommand, exactCalamityArrayDecision } from '../engine/calamityArrayCognition';
import type { WorldState } from '../types/world';

export interface GuidedCalamityArrayTurn {
  readonly kind: 'calamity-array';
  readonly world: WorldState;
  readonly branchId: string;
  readonly revision: number;
  readonly actorId: string;
  readonly option: CalamityArrayOption;
}

export function resolveGuidedCalamityArrayTurn(order: GuidedCalamityArrayTurn, world: WorldState, branchId: string, revision: number) {
  if (order.world !== world || order.branchId !== branchId || order.revision !== revision || order.option.action !== 'CALAMITY_ARRAY') return;
  const actors = world.cultivators.filter(row => row.id === order.actorId);
  if (actors.length !== 1) return;
  const decision = exactCalamityArrayDecision(calamityArrayCommand(order.option), availableCalamityArrayChoices(world, actors[0]));
  return decision ? { actorId: order.actorId, decision } : undefined;
}
