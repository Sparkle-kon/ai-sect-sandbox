import type {
  Cultivator, FieldObservatoriesState, FieldObservatoryActorState, FieldObservatoryInboxEntry, FieldObservatoryRun, FieldObservatoryStation,
  FieldWeatherReading, LLMDecisionPayload, LocationNode, WorldEvent, WorldState,
} from '../types/world';
import { activeEscortForActor } from './escortEngine';
import { activePilgrimageForActor, pilgrimageActedThisTick } from './pilgrimageEngine';
import { activeRelocationForActor } from './relocationEngine';
import { flowActor, recordResourceFlow } from './resourceFlowEngine';
import { activeCourierForActor, courierActedThisTick } from './sealedCourierEngine';
import { currentVisibleTileIds, knownMapLocations, terrainTileAt } from './terrainEngine';
import { isTribulationActive } from './tribulationEngine';
import { localQiWeather } from './weatherEngine';
import { observatoryEdgeStation,observatoryStationValid } from './observatoryStation';
import { alignedWeatherPinnedRuns } from './alignedWeatherTerms';

import { expeditionOmenPinnedRuns, recordExpeditionOmen, recordExpeditionOmenRelay } from './expeditionOmenEngine';

export const OBSERVATORY_COST = 5;
export const OBSERVATORY_LEAD_TICKS = 2;
export const OBSERVATORY_RETENTION_TICKS = 8;
export const OBSERVATORY_TERMINAL_LIMIT = 4;
export const OBSERVATORY_INBOX_LIMIT = 3;

export const createFieldObservatoriesState = (): FieldObservatoriesState => ({ byActor: {} });

export type ObservatoryActionOption = { action: 'FIELD_OBSERVATORY'; targetLocationId: string } & (
  | { observatoryMove: 'fund'; targetObservatoryTick?: never; targetCultivatorId?: never;observatoryStation?:'edge' }
  | { observatoryMove: 'measure'; targetObservatoryTick: number; targetCultivatorId?: never;observatoryStation?:never }
  | { observatoryMove: 'relay'; targetObservatoryTick: number; targetCultivatorId: string;observatoryStation?:never }
);
export interface FieldObservatoryViewRun {
  locationId: string;
  locationName: string;
  openedTick: number;
  targetTick: number;
  baseline: FieldWeatherReading;
  forecast: FieldWeatherReading;
  status: FieldObservatoryRun['status'];
  reading?: FieldWeatherReading;
  kindHit?: boolean;
  intensityErrorPp?: number;
  relayTick?: number;
  station:'center'|'edge';
}
export interface FieldObservatoryViewReceipt {
  locationId: string;
  locationName: string;
  measuredTick: number;
  relayedTick: number;
  reading: FieldWeatherReading;
  ageTicks: number;
  stale: true;
}
export interface FieldObservatoryView {
  runs: FieldObservatoryViewRun[];
  received: FieldObservatoryViewReceipt[];
  metrics: { scored: number; kindHits: number; meanIntensityErrorPp?: number };
}

const actorBucket = (world: WorldState, id: string) => {
  const { byActor } = world.fieldObservatories;
  return Object.hasOwn(byActor, id) ? byActor[id] : undefined;
};
function ensureBucket(world: WorldState, id: string): FieldObservatoryActorState {
  const existing = actorBucket(world, id);
  if (existing) return existing;
  const created: FieldObservatoryActorState = { runs: [], inbox: [] };
  Object.defineProperty(world.fieldObservatories.byActor, id, {
    value: created, writable: true, enumerable: true, configurable: true,
  });
  return created;
}
const alive = (actor: Cultivator) => actor.alive && actor.hp > 0;
const at = (world: WorldState, id: string) => world.locations.find(location => location.id === id);
const isOnSite = (world: WorldState, actor: Cultivator, site: LocationNode, tick: number) =>
  alive(actor) && actor.locationId === site.id && !activePilgrimageForActor(world, actor) &&
  !activeCourierForActor(world, actor) && !activeEscortForActor(world, actor) &&
  !activeRelocationForActor(world, actor) && !isTribulationActive(actor) &&
  (tick !== world.tick || !pilgrimageActedThisTick(world, actor) && !courierActedThisTick(world, actor));
const retained = (row: FieldObservatoryRun, tick: number) =>
  row.openedTick <= tick && tick - row.targetTick <= OBSERVATORY_RETENTION_TICKS;
const actedAt = (runs: FieldObservatoryRun[], tick: number) => runs.some(row =>
  row.openedTick === tick || row.status === 'measured' && (row.targetTick === tick || row.relay?.relayedTick === tick));
const hasFunds = (actor: Cultivator) => Number.isFinite(actor.spiritStones) && actor.spiritStones >= OBSERVATORY_COST;
const canRelay = (row: FieldObservatoryRun, locationId: string, tick: number) =>
  row.status === 'measured' && !row.relay && row.locationId === locationId && row.targetTick < tick && retained(row, tick);
const choice = { action: 'FIELD_OBSERVATORY' } as const;
type MeasuredRun = Extract<FieldObservatoryRun, { status: 'measured' }>;

function validRecipient(world: WorldState, sender: Cultivator, site: LocationNode, recipient: Cultivator, tick: number) {
  if (sender.id === recipient.id || !isOnSite(world, recipient, site, tick)) return false;
  const tile = terrainTileAt(world, site.x, site.y);
  return Boolean(tile && (recipient.exploredTileIds.includes(tile.id) || currentVisibleTileIds(world, recipient).has(tile.id)));
}

function fundingChoices(world:WorldState,actor:Cultivator,site:LocationNode,runs:FieldObservatoryRun[]):ObservatoryActionOption[]{
  if(!hasFunds(actor)||runs.some(row=>row.status==='pending'))return [];
  const result:ObservatoryActionOption[]=[{...choice,observatoryMove:'fund',targetLocationId:site.id}];
  if(observatoryEdgeStation(world,site))result.push({...choice,observatoryMove:'fund',targetLocationId:site.id,observatoryStation:'edge'});
  return result;
}
export function availableObservatoryFundingActions(actor:Cultivator,world:WorldState,actionTick=world.tick):ObservatoryActionOption[]{
  if((actionTick!==world.tick&&actionTick!==world.tick+1)||!alive(actor)||!world.cultivators.includes(actor))return [];
  const site=at(world,actor.locationId);
  if(!site||!terrainTileAt(world,site.x,site.y)||!isOnSite(world,actor,site,actionTick))return [];
  const runs=actorBucket(world,actor.id)?.runs??[];
  return actedAt(runs,actionTick)?[]:fundingChoices(world,actor,site,runs);
}
/** Offers are private to the actor, with one local relay suggestion per run. A prospective next tick affects only dates. */
export function availableObservatoryActions(actor: Cultivator, world: WorldState, actionTick = world.tick): ObservatoryActionOption[] {
  if ((actionTick !== world.tick && actionTick !== world.tick + 1) || !alive(actor)) return [];
  const site = at(world, actor.locationId);
  if (!site || !terrainTileAt(world, site.x, site.y) || !isOnSite(world, actor, site, actionTick) || !world.cultivators.includes(actor)) return [];
  const runs = actorBucket(world, actor.id)?.runs ?? [];
  if (actedAt(runs, actionTick)) return [];
  const due = runs.find(row => row.status === 'pending' && row.targetTick === actionTick);
  if (due?.locationId === site.id) {
    return [{ ...choice, observatoryMove: 'measure', targetLocationId: site.id, targetObservatoryTick: due.openedTick }];
  }
  const results=fundingChoices(world,actor,site,runs);
  const shareable = runs.filter(row => canRelay(row, site.id, actionTick));
  if (shareable.length === 0) return results;
  let recipient: Cultivator | undefined;
  for (const candidate of world.cultivators) {
    if ((!recipient || candidate.id < recipient.id) && validRecipient(world, actor, site, candidate, actionTick)) recipient = candidate;
  }
  if (recipient) for (const row of shareable) {
    results.push({ ...choice, observatoryMove: 'relay', targetLocationId: site.id,
      targetObservatoryTick: row.openedTick, targetCultivatorId: recipient.id });
  }
  return results;
}

const weatherReading = (world: WorldState, site: LocationNode,station?:FieldObservatoryStation): FieldWeatherReading => {
  const { kind, intensity } = localQiWeather(world, station?{...site,x:station.x,y:station.y}:site);
  return { kind, intensity };
};
const referenceId = (operatorId: string, openedTick: number) => `field-observatory-${operatorId}-${openedTick}`;
function event(world: WorldState, actor: Cultivator, row: FieldObservatoryRun, move: string, title: string, recipient?: Cultivator): WorldEvent {
  return {
    id: `evt-${referenceId(actor.id, row.openedTick)}-${move}`, tick: world.tick, year: world.year, month: world.month,
    category: 'heavenly', title, description: title, actorIds: recipient ? [actor.id, recipient.id] : [actor.id],
    locationId: row.locationId, witnessScope: 'participants',
  };
}

/** No action can supply weather. Only a successful, actually on-site turn at the target samples the environment. */
export function resolveObservatoryAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'FIELD_OBSERVATORY' || !world.cultivators.includes(actor)) return null;
  const site = at(world, actor.locationId);
  if (!site || !terrainTileAt(world, site.x, site.y) || !isOnSite(world, actor, site, world.tick) ||
    decision.targetLocationId !== undefined && decision.targetLocationId !== site.id) return null;
  if(decision.observatoryStation!==undefined && (decision.observatoryMove!=='fund'||decision.observatoryStation!=='edge'))return null;
  const runs = actorBucket(world, actor.id)?.runs ?? [];
  if (actedAt(runs, world.tick)) return null;
  const due = runs.find(row => row.status === 'pending' && row.locationId === site.id && row.targetTick === world.tick);
  if (due && decision.observatoryMove !== 'measure') return null;
  if (decision.observatoryMove === 'fund') {
    if (decision.targetObservatoryTick !== undefined || decision.targetCultivatorId !== undefined ||
      !hasFunds(actor) || runs.some(row => row.status === 'pending')) return null;
    const station=decision.observatoryStation==='edge'?observatoryEdgeStation(world,site):undefined;
    if(decision.observatoryStation==='edge'&&!station)return null;
    const baseline = weatherReading(world, site,station);
    // A named persistence baseline: use only the local reading that exists on the funding turn.
    const row: FieldObservatoryRun = {
      locationId: site.id, openedTick: world.tick, targetTick: world.tick + OBSERVATORY_LEAD_TICKS,
      baseline, forecast: { ...baseline }, status: 'pending',...(station?{station}:{}),
    };
    actor.spiritStones -= OBSERVATORY_COST;
    ensureBucket(world, actor.id).runs.push(row);
    recordResourceFlow(world, {
      kind: 'consumption', from: flowActor(actor.id), mechanism: 'observatory', reason: 'observatory_instrument',
      refId: referenceId(actor.id, row.openedTick), good: 'stone', amount: OBSERVATORY_COST,
      visibility: { kind: 'participants', actorIds: [actor.id] },
    });
    return event(world, actor, row, 'fund', '出资布设临时观象站，封存本地预测');
  }
  const rowIndex = runs.findIndex(row => row.openedTick === decision.targetObservatoryTick && row.locationId === site.id);
  const row = runs[rowIndex];
  if (!row) return null;
  if (decision.observatoryMove === 'measure') {
    if (decision.targetCultivatorId !== undefined || row !== due || row.station&&!observatoryStationValid(world,site,row.station)) return null;
    const measured: MeasuredRun = { ...row, status: 'measured', reading: weatherReading(world, site,row.station) };
    runs[rowIndex] = measured;
    recordExpeditionOmen(world, actor, site, measured);
    return event(world, actor, measured, 'measure', '于约定月份实际读数，核对封存预测');
  }
  if (decision.observatoryMove !== 'relay' || row.status !== 'measured' || !canRelay(row, site.id, world.tick)) return null;
  const recipient = world.cultivators.find(candidate => candidate.id === decision.targetCultivatorId);
  if (!recipient || !validRecipient(world, actor, site, recipient, world.tick)) return null;
  row.relay = { recipientId: recipient.id, relayedTick: world.tick };
  recordExpeditionOmenRelay(world, actor, site, row);
  const inbox = ensureBucket(world, recipient.id).inbox;
  inbox.push({ operatorId: actor.id, openedTick: row.openedTick });
  if (inbox.length > OBSERVATORY_INBOX_LIMIT) inbox.shift();
  return event(world, actor, row, 'relay', '当面传阅已有实测，并注明原测量月份', recipient);
}

function sourceOf(world: WorldState, recipientId: string, entry: FieldObservatoryInboxEntry) {
  const row = actorBucket(world, entry.operatorId)?.runs.find(run => run.openedTick === entry.openedTick);
  if (row?.status !== 'measured' || row.relay?.recipientId !== recipientId ||
    row.relay.relayedTick > world.tick || !retained(row, world.tick)) return undefined;
  return { row, relayedTick: row.relay.relayedTick };
}

/** End of turn, after everyone had a chance to make the real target-month reading. */
export function advanceFieldObservatories(world: WorldState): void {
  const buckets = Object.entries(world.fieldObservatories.byActor);
  const pinned=alignedWeatherPinnedRuns(world);
  const omenPinned=expeditionOmenPinnedRuns(world);
  for (const [id, bucket] of buckets) {
    const fixed=pinned.get(id);
    const omenSources=omenPinned.get(id);
    const keep=(row:FieldObservatoryRun)=>row.status==='measured'&&!!(fixed?.has(row.openedTick)||omenSources?.has(row.openedTick));
    bucket.runs = bucket.runs.filter(row => keep(row)||retained(row, world.tick)).map(row =>
      row.status === 'pending' && row.targetTick <= world.tick ? { ...row, status: 'missed' } : row);
    const count = bucket.runs.filter(row => row.status !== 'pending'&&!keep(row)).length;
    let discard = Math.max(0, count - OBSERVATORY_TERMINAL_LIMIT);
    if (discard) bucket.runs = bucket.runs.filter(row => row.status === 'pending'||keep(row)||discard-- <=0);
  }
  for (const [id, bucket] of buckets) {
    bucket.inbox = bucket.inbox.filter(receipt => sourceOf(world, id, receipt)).slice(-OBSERVATORY_INBOX_LIMIT);
    if (!bucket.runs.length && !bucket.inbox.length) delete world.fieldObservatories.byActor[id];
  }
}

/** Private records are gated by canonical viewer and known geography. Relays are historical reports, never current data. */
export function projectFieldObservatory(world: WorldState, viewer?: Cultivator): FieldObservatoryView {
  const view: FieldObservatoryView = { runs: [], received: [], metrics: { scored: 0, kindHits: 0 } };
  const bucket = viewer && actorBucket(world, viewer.id);
  if (!viewer || !bucket || !alive(viewer) || !world.cultivators.includes(viewer)) return view;
  const known = new Map(knownMapLocations(world, viewer).map(site => [site.id, site]));
  let errorPpSum = 0;
  for (const row of bucket.runs) {
    const site = known.get(row.locationId);
    if (!site || !retained(row, world.tick)) continue;
    const detail: FieldObservatoryViewRun = {
      locationId: site.id, locationName: site.name, openedTick: row.openedTick, targetTick: row.targetTick,
      baseline: { ...row.baseline }, forecast: { ...row.forecast }, status: row.status,station:row.station?.kind??'center',
    };
    if (row.status === 'measured') {
      detail.reading = { ...row.reading };
      detail.kindHit = row.reading.kind === row.forecast.kind;
      detail.intensityErrorPp = Math.abs(Math.round(row.reading.intensity * 100) - Math.round(row.forecast.intensity * 100));
      if (row.relay) detail.relayTick = row.relay.relayedTick;
      view.metrics.scored++;
      view.metrics.kindHits += Number(detail.kindHit);
      errorPpSum += detail.intensityErrorPp;
    }
    view.runs.push(detail);
  }
  if (view.metrics.scored) view.metrics.meanIntensityErrorPp = errorPpSum / view.metrics.scored;
  for (const receipt of bucket.inbox) {
    const source = sourceOf(world, viewer.id, receipt);
    const site = source && known.get(source.row.locationId);
    if (source && site) view.received.push({
      locationId: site.id, locationName: site.name, measuredTick: source.row.targetTick, relayedTick: source.relayedTick,
      reading: { ...source.row.reading }, ageTicks: world.tick - source.row.targetTick, stale: true,
    });
  }
  return view;
}
