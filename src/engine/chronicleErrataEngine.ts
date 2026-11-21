import type { ChronicleCorrection, ChronicleErrataMove, ChronicleErrataState, ChronicleReading, ChronicleReliefReading, ChronicleRetelling,
  ChronicleSourceFact, Cultivator, LLMDecisionPayload, WorldEvent, WorldState } from '../types/world';
import { pilgrimageCheckpoint } from './pilgrimageEngine';
import { SETTLEMENT_RELIEF } from './settlementEngine';

export const CHRONICLE_ERRATA_WINDOW = 24;
export const CHRONICLE_ERRATA_MAX_RETELLINGS = 4;
const SOURCES_PER_KIND_TICK = 6;
const RETAIN_TERMINAL_SOURCES = 64;
const SOURCE_OPTIONS_PER_ACTOR = 3;
const live = (actor: Cultivator) => actor.alive && actor.hp > 0;

export interface ChronicleErrataOption {
  action: 'CHRONICLE_ERRATA';
  chronicleErrataMove: ChronicleErrataMove;
  targetChronicleSourceId: string;
  targetCultivatorId?: string;
  chronicleReliefReading?: ChronicleReliefReading;
}
export interface ChronicleErrataView {
  source: Pick<ChronicleSourceFact, 'sourceEventId' | 'tick' | 'locationId' | 'kind'>;
  retellings: ChronicleRetelling[];
  conflict: boolean;
  correction?: ChronicleCorrection;
}

export const createChronicleErrataState = (): ChronicleErrataState => ({ sources: [], retellings: [], corrections: [], nextId: 1 });
const isPublicHub = (world: WorldState, locationId: string) => world.locations.some((site) => site.id === locationId &&
  (site.type === 'market' || site.type === 'sect_hq' ||
    (site.type !== 'secret_realm' && world.sects.some((sect) => sect.headquartersId === locationId))));
const shadowedByPrivate = (world: WorldState, source: ChronicleSourceFact) => world.events.some((row) =>
  row.id === source.sourceEventId && (row.witnessScope === 'participants' || row.tick !== source.tick));
const sourceIsLive = (world: WorldState, fact: ChronicleSourceFact) => fact.tick <= world.tick && world.tick - fact.tick < CHRONICLE_ERRATA_WINDOW;
const isSubject = (source: ChronicleSourceFact, actorId: string) =>
  source.kind === 'duel' ? source.participantIds.includes(actorId) : source.actorId === actorId;
const canonicalReading = (source: ChronicleSourceFact): ChronicleReading => source.kind === 'duel' ?
  { kind: 'duel', winnerId: source.winnerId } : { kind: 'relief', delivery: 'full_supplies' };
const readingKey = (reading: ChronicleReading) => reading.kind === 'duel' ? `duel:${reading.winnerId}` : `relief:${reading.delivery}`;
const hasConflict = (rows: ChronicleRetelling[]) => new Set(rows.map((row) => readingKey(row.reading))).size > 1;

function verifiedDuel(world: WorldState, event: WorldEvent, locationId: string): ChronicleSourceFact | undefined {
  if (event.category !== 'combat' && event.category !== 'death') return undefined;
  const [attacker, defender] = event.actorIds;
  if (event.actorIds.length !== 2 || attacker === defender || (event.duelWinnerId !== attacker && event.duelWinnerId !== defender) ||
      event.id !== `evt-${event.tick}-${attacker}-${event.category === 'death' ? 'kill' : 'duel'}`) return undefined;
  const fact = world.witnesses.facts.find((row) => row.eventId === event.id && row.tick === event.tick && row.locationId === locationId);
  if (!fact || fact.winnerId !== event.duelWinnerId || fact.participantIds.length !== 2 ||
      !fact.participantIds.includes(attacker) || !fact.participantIds.includes(defender)) return undefined;
  return { kind: 'duel', sourceEventId: event.id, tick: event.tick, locationId, participantIds: [attacker, defender], winnerId: fact.winnerId };
}

function verifiedRelief(world: WorldState, event: WorldEvent, locationId: string): ChronicleSourceFact | undefined {
  if (event.category !== 'diplomacy' || event.actorIds.length !== 1 || !world.locations.some((site) => site.id === locationId && site.type === 'market')) return undefined;
  const [actorId] = event.actorIds;
  const receipt = world.settlements.records.find((row) => `evt-${row.id}` === event.id && row.tick === event.tick &&
    row.kind === 'relief' && row.actorId === actorId && row.people === 0 && row.stones === SETTLEMENT_RELIEF.stones &&
    row.herbs === SETTLEMENT_RELIEF.jade_leaf);
  if (!receipt || !world.cultivators.some((actor) => actor.id === actorId) ||
      !world.settlements.villages.some((village) => village.id === receipt.settlementId && village.locationId === locationId &&
        village.lastReliefTick === world.tick)) return undefined;
  if (receipt.id !== `settlement-${event.tick}-relief-${receipt.settlementId}-${actorId}`) return undefined;
  return { kind: 'relief', sourceEventId: event.id, tick: event.tick, locationId, actorId,
    settlementId: receipt.settlementId, stones: receipt.stones, herbs: receipt.herbs };
}

/** Use only typed, public simulation evidence at emission, never narration, headlines, dialogue or a rumor's text. */
export function captureChronicleErrataSource(world: WorldState, event: WorldEvent): boolean {
  const state = world.chronicleErrata;
  if (event.witnessScope === 'participants' || event.tick !== world.tick || !event.locationId || !isPublicHub(world, event.locationId) ||
      state.sources.some(({ sourceEventId }) => sourceEventId === event.id) ||
      world.events.some((row) => row.id === event.id && (row.witnessScope === 'participants' || row.tick !== event.tick ||
        row.locationId !== event.locationId || row.category !== event.category || row.duelWinnerId !== event.duelWinnerId ||
        row.actorIds.length !== event.actorIds.length || row.actorIds.some((id, index) => id !== event.actorIds[index])))) return false;
  const source = event.duelWinnerId ? verifiedDuel(world, event, event.locationId) : verifiedRelief(world, event, event.locationId);
  if (!source || state.sources.filter((row) => row.kind === source.kind && row.tick === world.tick).length >= SOURCES_PER_KIND_TICK) return false;
  state.sources.push(source);
  return true;
}

function visibleBoard(world: WorldState, actor?: Cultivator): ChronicleSourceFact[] {
  const selected = actor && world.cultivators.find((person) => person.id === actor.id);
  if (!selected || !live(selected) || !isPublicHub(world, selected.locationId) || pilgrimageCheckpoint(world, selected) ||
      world.relocations.plans.some((plan) => plan.status === 'in_transit' && plan.garrisonIds.includes(selected.id)) ||
      world.escorts.contracts.some((contract) => contract.status === 'active' && contract.escortId === selected.id)) return [];
  return world.chronicleErrata.sources.filter((source) => source.tick <= world.tick && source.locationId === selected.locationId &&
    !shadowedByPrivate(world, source));
}

export function visibleChronicleErrata(world: WorldState, actor?: Cultivator): ChronicleErrataView[] {
  const { retellings, corrections } = world.chronicleErrata;
  return visibleBoard(world, actor).map(({ sourceEventId, tick, locationId, kind }) => {
    const readings = retellings.filter((row) => row.sourceEventId === sourceEventId && row.tick <= world.tick);
    const resolved = corrections.find((row) => row.sourceEventId === sourceEventId && row.tick <= world.tick);
    return { source: { sourceEventId, tick, locationId, kind }, retellings: readings.map((row) => ({ ...row, reading: { ...row.reading } })),
      conflict: hasConflict(readings), correction: resolved && { ...resolved, reading: { ...resolved.reading }, contestedRetellingIds: [...resolved.contestedRetellingIds] } };
  });
}

function optionReading(option: ChronicleErrataOption): ChronicleReading | undefined {
  if (option.targetCultivatorId) return { kind: 'duel', winnerId: option.targetCultivatorId };
  if (option.chronicleReliefReading) return { kind: 'relief', delivery: option.chronicleReliefReading };
  return undefined;
}

export function availableChronicleErrataActions(actor: Cultivator, world: WorldState, includeRetellings = true): ChronicleErrataOption[] {
  if (!live(actor) || !world.cultivators.includes(actor)) return [];
  const { sources, retellings, corrections } = world.chronicleErrata;
  if (!sources.length || (retellings.some((row) => row.authorId === actor.id && row.tick === world.tick) ||
    corrections.some((row) => row.editorId === actor.id && row.tick === world.tick))) return [];
  const options: ChronicleErrataOption[] = [];
  let retoldSources = 0, correctionOptions = 0;
  for (const source of visibleBoard(world, actor).filter((row) => sourceIsLive(world, row))
    .sort((a, b) => b.tick - a.tick || a.sourceEventId.localeCompare(b.sourceEventId))) {
    const { sourceEventId } = source;
    if (corrections.some((row) => row.sourceEventId === sourceEventId)) continue;
    const readings = retellings.filter((row) => row.sourceEventId === sourceEventId);
    const authored = readings.some((row) => row.authorId === actor.id);
    if (correctionOptions < SOURCE_OPTIONS_PER_ACTOR && !authored && !isSubject(source, actor.id) && readings.every((row) => row.tick < world.tick) && hasConflict(readings)) {
      options.push({ action: 'CHRONICLE_ERRATA', chronicleErrataMove: 'correct', targetChronicleSourceId: sourceEventId });
      correctionOptions++;
    }
    if (!includeRetellings || authored || readings.length >= CHRONICLE_ERRATA_MAX_RETELLINGS ||
      hasConflict(readings) || retoldSources >= SOURCE_OPTIONS_PER_ACTOR) continue;
    const common = { action: 'CHRONICLE_ERRATA' as const, chronicleErrataMove: 'retell' as const, targetChronicleSourceId: sourceEventId };
    if (source.kind === 'duel') {
      for (const id of [...source.participantIds].sort()) options.push({ ...common, targetCultivatorId: id });
    } else {
      options.push({ ...common, chronicleReliefReading: 'full_supplies' }, { ...common, chronicleReliefReading: 'unfunded' });
    }
    retoldSources++;
  }
  return options;
}

function independentlyKnows(world: WorldState, actor: Cultivator, source: ChronicleSourceFact): boolean {
  return isSubject(source, actor.id) || (source.kind === 'duel' && world.witnesses.facts.some((fact) =>
    fact.eventId === source.sourceEventId && fact.witnessIds.includes(actor.id))) ||
    actor.rumors.some((rumor) => rumor.originEventId === source.sourceEventId && rumor.originTick === source.tick &&
      rumor.learnedTick <= world.tick && rumor.hops === 0 && rumor.provenance === 'witness' && rumor.witnessScope !== 'participants' &&
      rumor.originSourceCultivatorId === actor.id);
}

/** Utility selects a correction when eligible. Only firsthand actors may rely on the archived proof before adjudication. */
export function pickChronicleReading(world: WorldState, actor: Cultivator, options: ChronicleErrataOption[]): ChronicleErrataOption | undefined {
  const legal = availableChronicleErrataActions(actor, world, options.some((option) => option.chronicleErrataMove === 'retell'));
  const choices = options.filter((option) => legal.some((candidate) => candidate.chronicleErrataMove === option.chronicleErrataMove &&
    candidate.targetChronicleSourceId === option.targetChronicleSourceId && candidate.targetCultivatorId === option.targetCultivatorId &&
    candidate.chronicleReliefReading === option.chronicleReliefReading));
  const correction = choices.find((option) => option.chronicleErrataMove === 'correct');
  if (correction) return correction;
  const deceptive = actor.personality === '阴险' || actor.personality === '诡诈';
  for (const option of choices) {
    const source = world.chronicleErrata.sources.find((row) => row.sourceEventId === option.targetChronicleSourceId);
    const reading = optionReading(option);
    if (!source || !reading) continue;
    const hearsay = world.chronicleErrata.retellings.find((row) => row.sourceEventId === source.sourceEventId && row.tick <= world.tick);
    const basis = independentlyKnows(world, actor, source) ? canonicalReading(source) : hearsay?.reading;
    if (basis && (readingKey(reading) === readingKey(basis)) !== deceptive) return option;
  }
  return undefined;
}

export function resolveChronicleErrataAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'CHRONICLE_ERRATA') return null;
  const option = availableChronicleErrataActions(actor, world, decision.chronicleErrataMove === 'retell').find((candidate) =>
    candidate.chronicleErrataMove === decision.chronicleErrataMove && candidate.targetChronicleSourceId === decision.targetChronicleSourceId &&
    candidate.targetCultivatorId === decision.targetCultivatorId && candidate.chronicleReliefReading === decision.chronicleReliefReading);
  if (!option) return null;
  const state = world.chronicleErrata, source = state.sources.find((row) => row.sourceEventId === option.targetChronicleSourceId)!;
  const correct = option.chronicleErrataMove === 'correct';
  const id = `chronicle-${correct ? 'correction' : 'retelling'}-${state.nextId++}`;
  const oldRows = state.retellings.filter((row) => row.sourceEventId === source.sourceEventId);
  if (correct) {
    state.corrections.push({ id, sourceEventId: source.sourceEventId, editorId: actor.id, tick: world.tick, reading: canonicalReading(source),
      contestedRetellingIds: oldRows.map((row) => row.id) });
  } else {
    state.retellings.push({ id, sourceEventId: source.sourceEventId, authorId: actor.id, tick: world.tick, reading: optionReading(option)! });
  }
  return { id: `evt-${id}`, tick: world.tick, year: world.year, month: world.month, locationId: source.locationId, actorIds: [actor.id],
    category: 'diplomacy', title: correct ? '公开史牍追加勘误' : '公开史牍收录异闻',
    description: correct ? '独立校勘者依据本地原始证据追加一条判读；旧有说法、纪事和实际世界结果保持不变。' :
      '记事板收录一条有署名的判读；这仍是说法，不是新的原始证据。' };
}

export function advanceChronicleErrata(world: WorldState): void {
  const state = world.chronicleErrata;
  const terminal = new Set(state.sources.filter((source) => !sourceIsLive(world, source) || !isPublicHub(world, source.locationId))
    .filter((source) => source.tick <= world.tick).slice(-RETAIN_TERMINAL_SOURCES).map((row) => row.sourceEventId));
  state.sources = state.sources.filter((source) => !shadowedByPrivate(world, source) && (terminal.has(source.sourceEventId) ||
    (sourceIsLive(world, source) && isPublicHub(world, source.locationId))));
  const kept = new Set(state.sources.map((row) => row.sourceEventId));
  state.retellings = state.retellings.filter((row) => kept.has(row.sourceEventId));
  state.corrections = state.corrections.filter((row) => kept.has(row.sourceEventId));
}
