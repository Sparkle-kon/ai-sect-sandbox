import type { Cultivator, HerbId, WorldState } from '../types/world';
import { HERB_LABELS } from '../engine/alchemyEngine';
import { isGuardAssignmentActive } from '../engine/sectEconomyEngine';

type Scheme = NonNullable<Cultivator['activeScheme']>;

export const SCHEME_STATUS: Record<Scheme['status'], { label: string; color: string }> = {
  active: { label: '进行中', color: 'text-amber-300' },
  completed: { label: '已完成', color: 'text-emerald-300' },
  failed: { label: '已失败', color: 'text-rose-300' },
};

export function countCompletedSchemeSteps(scheme: Scheme): number {
  return scheme.steps.filter((step) => step.completedTick !== undefined).length;
}

type Trial = NonNullable<Cultivator['tribulation']>;

export const TRIAL_STAGE: Record<Trial['stage'], { label: string; color: string }> = {
  lightning: { label: '雷劫', color: 'text-sky-300' },
  heart_demon: { label: '心魔劫', color: 'text-violet-300' },
  passed: { label: '已渡过', color: 'text-emerald-300' },
  failed: { label: '渡劫失败', color: 'text-rose-300' },
};

export function isActiveTrial(trial: Trial | undefined): boolean {
  return trial?.stage === 'lightning' || trial?.stage === 'heart_demon';
}

export function countHerbs(inventory: Record<HerbId, number>): number {
  return (Object.keys(HERB_LABELS) as HerbId[]).reduce((total, id) => total + inventory[id], 0);
}

export function isGuardOnDuty(actor: Cultivator, world: WorldState): boolean {
  return Boolean(actor.guardAssignment && actor.locationId === actor.guardAssignment.locationId &&
    isGuardAssignmentActive(actor, world));
}
