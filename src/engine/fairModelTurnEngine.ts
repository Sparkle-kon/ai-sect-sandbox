/** Runtime turn bookkeeping, deliberately separate from a persisted world or provider budget. */
export interface FairModelTurnState {
  readonly waitByActor: ReadonlyMap<string, number>;
  readonly lastStartedActorId?: string;
}

export interface FairModelTurnCommit {
  eligibleActorIds: readonly string[];
  livingActorIds: readonly string[];
  plannedActorIds: readonly string[];
  /** In actual provider start order, not completion order. */
  startedActorIds: readonly string[];
}

export const createFairModelTurnState = (): FairModelTurnState => ({ waitByActor: new Map() });

const distinctIds = (ids: readonly string[]) => new Set(ids.filter(id => id.length > 0));
const asciiCompare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

function ringCompare(a: string, b: string, lastStartedActorId?: string) {
  if (lastStartedActorId !== undefined) {
    // Continue strictly after the last served identity, even if that actor has left the next roster.
    const aWraps = a <= lastStartedActorId;
    const bWraps = b <= lastStartedActorId;
    if (aWraps !== bWraps) return aWraps ? 1 : -1;
  }
  return asciiCompare(a, b);
}

/** Plan against the complete eligible roster; a slot cap never limits who can be considered. */
export function planFairModelTurn(state: FairModelTurnState, eligibleActorIds: readonly string[], slots: number): string[] {
  if (!Number.isFinite(slots) || slots < 1) return [];
  return [...distinctIds(eligibleActorIds)].sort((a, b) =>
    (state.waitByActor.get(b) ?? 0) - (state.waitByActor.get(a) ?? 0) || ringCompare(a,b,state.lastStartedActorId),
  ).slice(0,Math.floor(slots));
}

/** Only the authoritative committed turn reaches here. Queued or deferred offers do not reset wait age. */
export function commitFairModelTurn(state: FairModelTurnState, input: FairModelTurnCommit): FairModelTurnState {
  const living = distinctIds(input.livingActorIds);
  const eligible = distinctIds(input.eligibleActorIds);
  const planned = distinctIds(input.plannedActorIds);
  const started = new Set<string>();
  let lastStartedActorId = state.lastStartedActorId;
  for (const id of input.startedActorIds) {
    if (!eligible.has(id) || !planned.has(id) || started.has(id)) continue;
    started.add(id);
    lastStartedActorId = id;
  }

  const waitByActor = new Map<string, number>();
  for (const [id, remaining] of state.waitByActor) {
    if (living.has(id) && !eligible.has(id) && remaining > 0) waitByActor.set(id,remaining);
  }
  for (const id of eligible) {
    if (living.has(id) && !started.has(id)) waitByActor.set(id,Math.min(Number.MAX_SAFE_INTEGER,(state.waitByActor.get(id) ?? 0) + 1));
  }
  return { waitByActor, ...(lastStartedActorId === undefined ? {} : { lastStartedActorId }) };
}

export function longestModelWait(state: FairModelTurnState, eligibleActorIds?: readonly string[]): number {
  let longest = 0;
  if (eligibleActorIds === undefined) {
    for (const wait of state.waitByActor.values()) longest = Math.max(longest,wait);
  } else {
    for (const id of eligibleActorIds) longest = Math.max(longest,state.waitByActor.get(id) ?? 0);
  }
  return longest;
}
