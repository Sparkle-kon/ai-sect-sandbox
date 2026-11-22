import { regionalModelPassiveActorIds } from './regionalSimulationEngine';
import { availableUpperPassageProviderActions,availableFrontierProviderActions,requiredBeforeOrdinaryDecision } from './llmBrain';
import { activeDestinyTraitOffer } from './destinyTraitEngine';
import { activeRoguelikeEncounter } from './roguelikeEncounterEngine';
import {activeDanxiaMedicineEscort} from './danxiaMedicineTerms';
import type { Cultivator, LLMDecisionPayload, WorldState } from '../types/world';
import { activeAvatar } from './avatarEngine';
import { activeSiegeForActor } from './diplomacyEngine';
import { activeEscortForActor } from './escortEngine';
import { activeOccasionForActor } from './occasionEngine';
import { availableExpeditionRescueActions } from './expeditionRescueEngine';
import { availableBoundaryReliefActions } from './boundaryReliefEngine';
import { boundaryReliefCheckpoint } from './boundaryReliefCheckpoint';
import { activeRelocationForActor } from './relocationEngine';
import { availablePilgrimageActions, pilgrimageCheckpoint } from './pilgrimageEngine';
import { activeCourierForActor, availableCourierHandoffActions } from './sealedCourierEngine';
import { planFairModelTurn } from './fairModelTurnEngine';
import type { FairModelTurnState } from './fairModelTurnEngine';
import type { LLMDecisionAdmission } from './llmScheduler';

export const MODEL_DECISION_TURN_DEADLINE_MS = 8_000;

export interface FairModelCoverage {
  tick: number;
  eligible: number;
  planned: number;
  started: number;
  validated: number;
  applied: number;
  utility: number;
  longestWait: number;
  limit?: 'budget' | 'queue' | 'backoff' | 'deadline';
}

interface ModelDecisionTurnRequest {
  state: FairModelTurnState;
  eligible: readonly Cultivator[];
  admission: LLMDecisionAdmission;
  currentAdmission?: () => LLMDecisionAdmission;
  signal: AbortSignal;
  request: (actor: Cultivator, signal: AbortSignal, onStart: () => void) => Promise<LLMDecisionPayload | undefined>;
  deadlineMs?: number;
}
interface ModelDecisionTurnResult {
  eligibleActorIds: string[];
  plannedActorIds: string[];
  startedActorIds: string[];
  orders: ReadonlyMap<string, LLMDecisionPayload>;
  stale: boolean;
  limit?: FairModelCoverage['limit'];
}

/** Scope is a starting snapshot. Eligibility is not a claim that every planned action survives canonical simulation. */
export function modelDecisionCandidates(world: WorldState): Cultivator[] {
  const passive=regionalModelPassiveActorIds(world,actor=>!!requiredBeforeOrdinaryDecision(actor,world));
  const avatar = activeAvatar(world);
  const pending = world.playerAvatar.pendingOrder;
  const nextTick = world.tick + 1;
  const commandedId = pending?.queuedTick === world.tick && (world.playerAvatar.possessionUntilTick ?? 0) > nextTick &&
    avatar?.id === pending.actorId ? pending.actorId : undefined;
  return world.cultivators.filter(actor=>{
    if(!actor.alive||actor.hp<=0||actor.id===commandedId||(world.month===12&&actor.age+1>=actor.lifespan))return false;
    if(actor.positionPlane==='frontier')return availableFrontierProviderActions(actor,world,nextTick).length>0;
    if(actor.positionPlane!==undefined)return availableUpperPassageProviderActions(actor,world,nextTick).length>0;
    const encounter = activeRoguelikeEncounter(world, actor);
    if (encounter && (encounter.guided || encounter.openedTick !== world.tick)) return false;
    const destiny = encounter ? undefined : activeDestinyTraitOffer(world, actor);
    if (destiny && avatar === actor) return false;
    // Genuine autonomous offers wake only the normal admission guard below, never an invalid body or action lane.
    return (!passive.has(actor.id) || !!encounter || !!destiny) &&
    (!activeCourierForActor(world, actor) || availableCourierHandoffActions(actor, world, nextTick).some(({ courierHandoffMove }) => courierHandoffMove === 'offer')) &&
    !activeDanxiaMedicineEscort(world,actor)&&!activeEscortForActor(world, actor) && !activeRelocationForActor(world, actor) &&
    !activeSiegeForActor(world, actor) && isEligibleForOccasionDecision(world, actor, nextTick) &&
    (!boundaryReliefCheckpoint(world, actor) || availableBoundaryReliefActions(actor, world, nextTick).length > 0) &&
    (!pilgrimageCheckpoint(world, actor) || availablePilgrimageActions(actor, world, false, nextTick).length > 0);
  });
}

function isEligibleForOccasionDecision(world: WorldState, actor: Cultivator, nextTick: number): boolean {
  const occasion = activeOccasionForActor(world, actor);
  return !occasion || occasion.kind === 'expedition' && availableExpeditionRescueActions(actor, world, nextTick).length > 0;
}

/** The whole batch expires together; late callbacks cannot write orders, fairness or world state. */
export async function runModelDecisionTurn(options: ModelDecisionTurnRequest): Promise<ModelDecisionTurnResult> {
  const { signal, admission } = options;
  const actors = new Map(options.eligible.map((actor) => [actor.id, actor]));
  const eligibleActorIds = [...actors.keys()];
  const plannedActorIds = signal.aborted ? [] : planFairModelTurn(options.state, eligibleActorIds, admission.slots);
  const started = new Set<string>();
  const orders = new Map<string, LLMDecisionPayload>();
  let limit = plannedActorIds.length < actors.size ? admission.reason : undefined;
  let deadlineReached = false;
  if (plannedActorIds.length && !signal.aborted) {
    const batch = new AbortController();
    let stop!: () => void;
    const stopped = new Promise<void>((resolve) => { stop = resolve; });
    const interrupt = () => { batch.abort(); stop(); };
    signal.addEventListener('abort', interrupt, { once: true });
    const configuredDeadline = options.deadlineMs ?? MODEL_DECISION_TURN_DEADLINE_MS;
    const timeout = setTimeout(() => {
      deadlineReached = true;
      interrupt();
    }, Number.isFinite(configuredDeadline) && configuredDeadline >= 0 ? configuredDeadline : MODEL_DECISION_TURN_DEADLINE_MS);
    let open = true;
    try {
      await Promise.race([
        stopped,
        Promise.all(plannedActorIds.map(async (id) => {
          const actor = actors.get(id);
          if (!actor || signal.aborted || batch.signal.aborted) return;
          try {
            const order = await options.request(actor, batch.signal, () => {
              if (open && !signal.aborted && !batch.signal.aborted) started.add(id);
            });
            if (order && started.has(id) && open && !signal.aborted && !batch.signal.aborted) orders.set(id, order);
          } catch {
            // Provider failure leaves no proposed order; the canonical Utility path will decide.
          }
        })),
      ]);
    } finally {
      open = false;
      clearTimeout(timeout);
      signal.removeEventListener('abort', interrupt);
      batch.abort();
    }
  }
  if (signal.aborted) orders.clear();
  if (plannedActorIds.length && !signal.aborted && options.currentAdmission?.().reason === 'backoff') limit = 'backoff';
  return { eligibleActorIds, plannedActorIds, startedActorIds: [...started], orders,
    stale: signal.aborted, limit: deadlineReached ? 'deadline' : limit };
}
