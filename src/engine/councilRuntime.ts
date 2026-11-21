import { cloneWorldWithColdHistory } from './coldHistoryEngine';
import type { CouncilPlan, LLMConfig, WorldState } from '../types/world';
import { annualCouncilPlans, resolveCouncil } from './councilEngine';
import { collectCouncilBallots } from './councilModel';

export function selectAnnualCouncil(world: WorldState): CouncilPlan | undefined {
  const plans = annualCouncilPlans(world);
  return plans.length ? plans[Math.floor((world.tick - 1) / 12) % plans.length] : undefined;
}

export async function settleCouncilSnapshot(world: WorldState, plan: CouncilPlan, config: LLMConfig): Promise<WorldState> {
  const replacements = await collectCouncilBallots(world, plan, config);
  const next = cloneWorldWithColdHistory(world);
  return resolveCouncil(next, plan, replacements) ? next : world;
}

export function settleAnnualCouncilOffline(world: WorldState): WorldState {
  const plan = selectAnnualCouncil(world);
  if (plan) resolveCouncil(world, plan);
  return world;
}

export async function settleAnnualCouncilOnline(world: WorldState, config: LLMConfig): Promise<WorldState> {
  const plan = selectAnnualCouncil(world);
  return plan ? settleCouncilSnapshot(world, plan, config) : world;
}

// The accepted world snapshot is the final authority, not the completion of an async debate.
export function commitCouncilSnapshot(current: WorldState, startedFrom: WorldState, proposed: WorldState): WorldState {
  return current === startedFrom ? proposed : current;
}
