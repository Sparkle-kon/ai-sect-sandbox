import type {SectJobAssignment,SectJobObservation} from '../../types/sectJobs';
import type {SectMeetingTurn} from '../sectMeetingOrders';
import type { Cultivator, DecisionTraceCandidate, LLMDecisionPayload, WorldEvent, WorldState } from '../../types/world';
import type { BeastDuelContact } from '../../types/beastDuelProtection';
import type { ForbiddenDuelContact, NativeDuelRolls } from '../../types/forbiddenArt';
import type { maintainAlchemy } from '../alchemyEngine';
import type { consumeAvatarOrder } from '../avatarEngine';
import type { DecisionReplayTape } from '../decisionTraceEngine';
import type { ForbiddenArtActivation } from '../forbiddenArtEngine';
import type { NativeDuelModifier } from '../nativeDuelRules';
import type { beginRegionalSimulationTurn } from '../regionalSimulationEngine';

export interface TickTraceOptions {
  tape?: DecisionReplayTape;
  sectJobAssignments?:readonly SectJobAssignment[];
  onSectJobsSettled?:(rows:readonly SectJobObservation[])=>void;
  modelActors?: ReadonlySet<string>;
  /** An attempted online choice that did not validate cannot become an offline assent. */
  suppressAutoClanConsent?: ReadonlySet<string>;
  captureTrace?: boolean;
  capturePresentation?: boolean;
  onWatchBatch?: (events: readonly WorldEvent[]) => void;
  onCompletedEvents?: (events: readonly WorldEvent[]) => void;
  replayDraws?: Readonly<Record<string, number>>;
  replayHeartModelActors?: ReadonlySet<string>;
  replayForbiddenModelActors?: ReadonlySet<string>;
  replayGrandSiegeModelActors?: ReadonlySet<string>;
  onActor?: (actorId: string, candidates: DecisionTraceCandidate[], applied: boolean) => void;
}

/** Transient input for one turn. None of this is written into the save. */
export interface TickInputs {
  readonly prevState: WorldState;
  readonly precomputedDecisions?: Record<string, LLMDecisionPayload>;
  readonly injectedRandom?: () => number;
  readonly councilMode: 'utility' | 'deferred';
  readonly recordDecisionEffect?: (actorId: string, applied: boolean) => void;
  readonly traceOptions?: TickTraceOptions;
}

export interface TickBaseContext extends TickInputs {
  readonly nextState: WorldState;
  readonly rng: () => number;
  readonly sectMeeting?:SectMeetingTurn;
}

export interface PendingGateEffect {
  decision: LLMDecisionPayload;
  model: boolean;
  avatar: boolean;
  supplied: boolean;
}

export interface PreTurnContext extends TickBaseContext {
  readonly avatarOrder: ReturnType<typeof consumeAvatarOrder>;
  readonly pendingGateEffects: Map<string, PendingGateEffect>;
  readonly danxiaRegrowth: ReturnType<typeof maintainAlchemy>;
}

export interface WorldTickContext extends PreTurnContext {
  /** The same uncapped ordered event array is shared from transit through presentation. */
  readonly newEvents: WorldEvent[];
  readonly regionalTurn: ReturnType<typeof beginRegionalSimulationTurn>;
  readonly finishedDuelActors: Set<string>;
}

export interface ForbiddenDuelSettlement {
  contact: ForbiddenDuelContact;
  activation: ForbiddenArtActivation;
}

/** Native settlement ports keep standalone decision application out of the tick dependency graph. */
export interface TickActionPorts {
  readonly closeInterruptedTrial: (actor: Cultivator, tick: number) => void;
  readonly applyCultivatorBrainDecision: (
    world: WorldState,
    cultivator: Cultivator,
    decision: LLMDecisionPayload,
    rng?: () => number,
    authorizedBountyTargetId?: string,
    emit?: (event: WorldEvent) => void,
    explicitAvatarDecision?: LLMDecisionPayload,
    modelInput?: boolean,
    allowForbiddenDuel?: boolean,
  ) => WorldEvent | null;
  readonly settleNativeDuel: (
    world: WorldState,
    cultivator: Cultivator,
    defender: Cultivator,
    decision: LLMDecisionPayload,
    rolls: NativeDuelRolls,
    authorizedBountyTargetId?: string,
    emit?: (event: WorldEvent) => void,
    context?: ForbiddenDuelSettlement,
    beastGuardContact?: BeastDuelContact,
    formModifier?: NativeDuelModifier,
  ) => WorldEvent;
}
