import type { Cultivator } from '../types/world';
import { interruptHeartDemon } from './heartDemonEngine';

/** An interrupted life cannot leave a playable choice or manufacture a completed scene. */
export function interruptStoryChoicesOnDeath(actor: Cultivator, tick: number, reason: string): void {
  if (actor.alive && actor.hp > 0) return;
  const progress = actor.destinyTraits;
  if (progress?.pending) {
    delete progress.pending;
    if (!progress.earned.length) delete actor.destinyTraits;
  }
  const trial = actor.tribulation;
  if (!trial || (trial.stage !== 'lightning' && trial.stage !== 'heart_demon')) return;
  interruptHeartDemon(trial, tick);
  trial.stage = 'failed';
  trial.resolvedTick = tick;
  trial.lastOutcome = reason;
}
