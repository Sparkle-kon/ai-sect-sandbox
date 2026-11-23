import { createInitialWorld } from '../src/data/initialWorld';
import { cloneWorldWithColdHistory } from '../src/engine/coldHistoryEngine';
import { configureStoryteller, projectStoryteller } from '../src/engine/storytellerDirector';
import { isHighlight, projectDirectorHighlight, resolveDirectorHighlight } from '../src/engine/director/directorHighlights';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldEvent, WorldState } from '../src/types/world';
import type { AuditedStoryTask, StoryAuditMode, StoryAuditProbe, StoryAuditTurn } from './storyTriggerAuditTerms';

export interface StoryAuditRunOptions {
  readonly seed: number;
  readonly ticks: number;
  readonly probes: readonly StoryAuditProbe[];
  /** An already chosen source is used as it is; only a fresh standard world gets the player-facing default director. */
  readonly initialWorld?: WorldState;
  /** Optional deterministic legal orders. This measures a scripted policy, not human play. */
  readonly guidedPolicy?: (before: WorldState) => Record<string, LLMDecisionPayload> | undefined;
  /** Play the current native highlight only. The four routine actions are never scripted by this policy. */
  readonly playHighlights?: boolean;
  /** Read-only heartbeat from completed native months, not prospective simulated ticks. */
  readonly onProgress?: (snapshot: StoryAuditProgress) => void;
  /** Optional read-only diagnostics over the same exact completed native book as every probe. */
  readonly onCompletedTurn?: (turn: StoryAuditTurn) => void;
}

export interface StoryAuditProgress {
  readonly tick: number;
  readonly completedTicks: number;
  readonly totalTicks: number;
  readonly registered: number;
}
export interface StoryAuditCounter {
  readonly id: AuditedStoryTask;
  readonly title: string;
  readonly mode: StoryAuditMode;
  readonly evidence: string;
  /** Interface/acceptance tasks have no gameplay occurrence to count. */
  readonly count: number | null;
  readonly firstTick?: number;
  readonly lastTick?: number;
}

export interface StoryAuditResult {
  readonly seed: number;
  readonly mode: 'autonomous' | 'scripted';
  readonly startTick: number;
  readonly endTick: number;
  readonly completedTicks: number;
  /** Count before the ordinary live-feed retention cap; no prose or model transcript is exported. */
  readonly rawEvents: number;
  readonly counters: readonly StoryAuditCounter[];
  /** Quiet scenes are retained for baseline replay; these counts are never called highlights. */
  readonly opportunities: Readonly<{
    scheduled: number;
    monthsWithLegalDirectorMenu: number;
    distinctLegalDirectorOffers: number;
    acceptedDirectorOffers: number;
  }>;
  readonly highlights: Readonly<{
    offered: number;
    kinds: readonly string[];
    chosen: number;
    settled: number;
    maxGapMonths: number | null;
  }>;
  /** Non-cryptographic replay check over ordered month/event/episode identities and a final state summary. */
  readonly fingerprint: string;
  readonly final: {
    readonly year: number;
    readonly month: number;
    readonly registered: number;
    readonly living: number;
  };
}

interface CounterState {
  readonly probe: StoryAuditProbe;
  readonly seen: Set<string>;
  firstTick?: number;
  lastTick?: number;
}

function monthBook(before: WorldState, after: WorldState): void {
  const expectedMonth = before.month % 12 + 1;
  if (after.tick !== before.tick + 1 || after.month !== expectedMonth ||
      after.year !== before.year + Number(expectedMonth === 1)) {
    throw new Error(`Native audit did not complete exactly one month at tick ${before.tick}`);
  }
}

/** Run the real offline monthly dispatcher and observe completed batches, never the 120-entry world feed. */
export function runStoryTriggerAudit({
  seed, ticks, probes, initialWorld, guidedPolicy, playHighlights = false, onProgress, onCompletedTurn,
}: StoryAuditRunOptions): StoryAuditResult {
  if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(ticks) || ticks < 0) {
    throw new Error('Story audit requires an integer seed and nonnegative integer month count');
  }
  if (guidedPolicy && playHighlights) throw new Error('Choose one scripted audit policy');
  const counters = new Map<AuditedStoryTask, CounterState>();
  for (const probe of probes) {
    if (counters.has(probe.id)) throw new Error(`Duplicate story audit probe: ${probe.id}`);
    if (probe.mode === 'interface' ? probe.observe !== undefined : typeof probe.observe !== 'function') {
      throw new Error(`Story audit mode and observer disagree for ${probe.id}`);
    }
    counters.set(probe.id, { probe, seen: new Set<string>() });
  }

  let world = initialWorld ? cloneWorldWithColdHistory(initialWorld) : createInitialWorld(seed);
  if (!initialWorld && !configureStoryteller(world, 'wandering_jianghu')) {
    throw new Error('Story audit could not initialize the default director');
  }
  if (world.terrain.seed !== seed || !Number.isSafeInteger(world.tick + ticks)) {
    throw new Error('Story audit source does not match the requested seed or calendar range');
  }
  const startTick = world.tick;
  const mode = guidedPolicy || playHighlights ? 'scripted' : 'autonomous';
  let rawEvents = 0;
  let monthsWithLegalDirectorMenu = 0;
  const scheduled = new Set<string>();
  const shown = new Set<string>();
  const accepted = new Set<string>();
  const highpointTicks: number[] = [];
  const highpointSeen = new Set<string>();
  const highpointKinds = new Set<string>();
  const highpointSelections = new Set<string>();
  const highpointSettlements = new Set<string>();
  const identify = (row: {kind:string; sourceId:string; actorId:string}) => JSON.stringify([row.kind,row.sourceId,row.actorId]);
  let hash = 0x811c9dc5;
  const fingerprint = (value: readonly unknown[]) => {
    // JSON array framing keeps tuple boundaries distinct; ids are never returned in the result.
    for (const char of JSON.stringify(value)) hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 0x01000193);
  };
  fingerprint(['start', seed, startTick, world.random.algorithm, world.random.state, world.storyteller?.style, mode]);

  for (let month = 0; month < ticks; month++) {
    const offered=playHighlights&&projectDirectorHighlight(world);
    if(offered&&isHighlight(offered)){
      const chosen=offered.options.find(option=>option.consequences.length>0);
      const next=chosen&&resolveDirectorHighlight(world,offered.key,chosen.id);
      if(next&&next!==world){
        highpointSelections.add(identify(offered));
        if(next.storyteller?.highlights?.at(-1)?.resolutionEventId) highpointSettlements.add(identify(offered));
        world=next;
      }
    }
    const before = world;
    const observed: { events?: readonly WorldEvent[] } = {};
    world = advanceWorldTick(before, guidedPolicy?.(before), undefined, 'utility', undefined, {
      captureTrace: false, capturePresentation: false,
      onCompletedEvents(events) {
        if (observed.events !== undefined) throw new Error(`Repeated native audit month at tick ${before.tick + 1}`);
        observed.events = events;
      },
    });
    monthBook(before, world);
    const events = observed.events;
    if (!events) throw new Error(`Missing native audit month at tick ${world.tick}`);
    rawEvents += events.length;
    const d=world.storyteller, proposal=d?.offer, outcome=d?.lastOutcome;
    if(proposal?.openedTick===world.tick)scheduled.add(proposal.id);
    if(outcome?.tick===world.tick)accepted.add(outcome.offerId);
    const highlight=projectDirectorHighlight(world);
    if(highlight&&isHighlight(highlight)&&!highpointSeen.has(identify(highlight))){
      highpointSeen.add(identify(highlight));
      highpointKinds.add(highlight.kind);
      highpointTicks.push(world.tick);
    }
    for(const row of d?.highlights?.slice(-3)??[]){
      if(row.resolutionEventId&&row.resolutionTick===world.tick&&highpointSelections.has(identify(row)))highpointSettlements.add(identify(row));
    }
    const menu=projectStoryteller(world);
    if(menu?.options.length){
      monthsWithLegalDirectorMenu++;
      shown.add(menu.options[0].decision.storytellerOfferId);
    }
    fingerprint(['month', world.tick, world.year, world.month, world.random.state, events.length]);
    for (const row of events) fingerprint(['event', row.tick, row.id, row.category]);
    const turn: StoryAuditTurn = { before, after: world, events };

    for (const counter of counters.values()) {
      const { probe, seen } = counter;
      for (const identity of probe.observe?.(turn) ?? []) {
        if (typeof identity !== 'string' || !identity.trim()) {
          throw new Error(`Invalid story episode identity for ${probe.id} at tick ${world.tick}`);
        }
        if (seen.has(identity)) continue;
        seen.add(identity);
        counter.firstTick ??= world.tick;
        counter.lastTick = world.tick;
        fingerprint(['episode', probe.id, world.tick, identity]);
      }
    }
    onCompletedTurn?.(turn);
    const completedTicks=month+1;
    if(onProgress&&(completedTicks%100===0||completedTicks===ticks)){
      onProgress(Object.freeze({tick:world.tick,completedTicks,totalTicks:ticks,registered:world.cultivators.length}));
    }
  }

  const final = Object.freeze({
    year: world.year, month: world.month,
    registered: world.cultivators.length,
    living: world.cultivators.filter(actor => actor.alive && actor.hp > 0).length,
  });
  fingerprint(['end', world.tick, world.interventionSequence, world.random.state, final.registered, final.living,
    world.storyteller?.lastOfferTick]);
  for (const actor of world.cultivators) {
    fingerprint(['actor', actor.id, actor.locationId, actor.positionPlane, actor.realm, actor.realmStage, actor.hp, actor.currentAction]);
  }

  const completedTicks = world.tick - startTick;
  return Object.freeze({
    seed, mode, startTick, endTick: world.tick, completedTicks, rawEvents,
    opportunities:Object.freeze({scheduled:scheduled.size,monthsWithLegalDirectorMenu,
      distinctLegalDirectorOffers:shown.size,acceptedDirectorOffers:accepted.size}),
    highlights:Object.freeze({offered:highpointSeen.size,kinds:[...highpointKinds].sort(),chosen:highpointSelections.size,
      settled:highpointSettlements.size,maxGapMonths:highpointTicks.length===0?null:
        [...highpointTicks,world.tick].reduce((max,tick,index)=>Math.max(max,tick-(index===0?startTick:highpointTicks[index-1])),0)}),
    counters: Object.freeze([...counters.values()].map(({ probe, seen, firstTick, lastTick }) => Object.freeze({
      id: probe.id, title: probe.title, mode: probe.mode, evidence: probe.evidence,
      count: probe.mode === 'interface' ? null : seen.size,
      ...(firstTick !== undefined && lastTick !== undefined ? { firstTick, lastTick } : {}),
    }))),
    fingerprint: `fnv1a32-${(hash >>> 0).toString(16).padStart(8, '0')}`,
    final,
  });
}
