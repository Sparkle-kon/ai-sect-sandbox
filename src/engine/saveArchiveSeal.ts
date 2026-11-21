import type { WorldState } from '../types/world';
import type { NarrativeArchivePlan } from './saveCapacityEngine';

type Apply = (world:WorldState)=>WorldState|undefined;
const prepared=new WeakMap<NarrativeArchivePlan,{base:WorldState;apply:Apply}>();

/** Accept only the exact in-memory review object produced by the manual preview. */
export function sealNarrativeArchiveReview(base:WorldState,review:NarrativeArchivePlan,apply:Apply):void {
  prepared.set(review,{base,apply});
}

/** The caller separately binds branch identity/generation before invoking this side-effect-free move. */
export function applyArchiveOptimization(world:WorldState,review:NarrativeArchivePlan):WorldState|undefined {
  const seal=prepared.get(review);
  if(!seal || seal.base!==world || review.tick!==world.tick) return undefined;
  const result=seal.apply(world);
  if(result) prepared.delete(review);
  return result;
}
