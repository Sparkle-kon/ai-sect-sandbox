import type { WorldState } from '../types/world';
import {
  expeditionOmenId,
  EXPEDITION_OMEN_MEASURE_INTENSITY,
  EXPEDITION_OMEN_OPEN_INTENSITY,
  EXPEDITION_OMEN_QI,
  EXPEDITION_OMEN_RETENTION,
  EXPEDITION_OMEN_WINDOW_FIRST,
  EXPEDITION_OMEN_WINDOW_LAST,
} from './expeditionOmenEngine';
import { OBSERVATORY_LEAD_TICKS } from './fieldObservatoryEngine';

const OMEN_PREFIX = 'expedition-omen-';
const NATIVE_EXPEDITION_EVENT = /^evt-(\d+)-(occasion-\d+-expedition)-/;

export function validateExpeditionOmenHistory(world: WorldState, actorIds: ReadonlySet<string>, fail: (path: string) => never): void {
  const { lastCalendarTick, rows } = world.expeditionOmens;
  if (lastCalendarTick !== undefined && (lastCalendarTick === 0 || lastCalendarTick % 60 !== 0 || lastCalendarTick > world.tick)) {
    fail('expeditionOmens.lastCalendarTick');
  }
  // A malformed file must not turn a linked gate into an ordinary legacy
  // calendar expedition simply by deleting its two link fields.
  const linkedOccasionIds = new Set<string>();
  for (const occasion of world.occasions) {
    if (occasion.omenId !== undefined || occasion.anchorSiteId !== undefined) linkedOccasionIds.add(occasion.id);
    else if (occasion.kind === 'expedition' && /^occasion-\d+-expedition$/.test(occasion.id) &&
        (occasion.startedTick % 60 !== 0 || world.events.some(event => event.id ===
          `evt-${occasion.startedTick}-${occasion.id}-open` && event.witnessScope === 'participants'))) {
      fail('occasions.expeditionOmen.missingLink');
    }
  }
  if (!rows.length && !linkedOccasionIds.size && !world.locations.some(site => site.expeditionOmenId !== undefined)) return;
  const sites = new Map(world.locations.map(site => [site.id, site]));
  const occasions = new Map(world.occasions.map(o => [o.id, o]));
  // Relocation can change a genuine former spirit vein into the sect's HQ.
  // Its identity and coordinates remain stable; don't apply today's title to an old receipt.
  const isAnchor = (site: WorldState['locations'][number] | undefined) =>
    site?.type === 'spirit_vein' || site?.type === 'sect_hq';
  const evidence = new Map<string, typeof rows[number]>();
  const openingIds = new Set<string>();
  const gates = new Set<string>();
  const unique = (ids: string[]) => ids.length === new Set(ids).size;
  const isTide = (reading: {kind: string; intensity: number}, minimum: number) => reading.kind === '灵潮' &&
    reading.intensity >= minimum && Math.abs(reading.intensity * 100 - Math.round(reading.intensity * 100)) <= 1e-8;
  for (const row of rows) {
    const {id, siteId, operatorId, openedTick, measuredTick, measuredQi, reading, relay, opening} = row;
    const records = world.fieldObservatories.byActor;
    const run = Object.hasOwn(records, operatorId) ? records[operatorId].runs.find(entry => entry.openedTick === openedTick) : undefined;
    if (evidence.has(id) || id !== expeditionOmenId(operatorId, openedTick) || !actorIds.has(operatorId) ||
        !isAnchor(sites.get(siteId)) || openedTick < 1 || measuredTick > world.tick ||
        world.tick > measuredTick + EXPEDITION_OMEN_RETENTION || measuredTick !== openedTick + OBSERVATORY_LEAD_TICKS ||
        row.windowStartsTick !== measuredTick + EXPEDITION_OMEN_WINDOW_FIRST || row.windowEndsTick !== measuredTick + EXPEDITION_OMEN_WINDOW_LAST ||
        measuredQi < EXPEDITION_OMEN_QI || !isTide(reading, EXPEDITION_OMEN_MEASURE_INTENSITY) ||
        run?.status !== 'measured' || run.station !== undefined || run.locationId !== siteId || run.targetTick !== measuredTick ||
        run.reading.kind !== reading.kind || run.reading.intensity !== reading.intensity) {
      fail('expeditionOmens.rows.source');
    }
    // A real ordinary weather relay may be too late to qualify for the separate omen entitlement.
    if (relay && (!actorIds.has(relay.recipientId) || relay.recipientId === operatorId || relay.tick <= measuredTick ||
        relay.tick > world.tick || relay.tick > (opening ? opening.tick + 2 : row.windowEndsTick) ||
        run?.status !== 'measured' || run.relay?.recipientId !== relay.recipientId || run.relay.relayedTick !== relay.tick)) {
      fail('expeditionOmens.rows.relay');
    }
    if (opening) {
      const occasion = occasions.get(opening.occasionId);
      if (openingIds.has(opening.occasionId) || opening.tick < row.windowStartsTick || opening.tick > row.windowEndsTick ||
          opening.tick > world.tick || opening.qi < EXPEDITION_OMEN_QI || !isTide(opening.reading, EXPEDITION_OMEN_OPEN_INTENSITY) ||
          occasion?.omenId !== id || occasion.anchorSiteId !== siteId || occasion.startedTick !== opening.tick) {
        fail('expeditionOmens.rows.opening');
      }
      openingIds.add(opening.occasionId);
    }
    evidence.set(id, row);
  }
  const relevantEvents = new Map<string, WorldState['events'][number]>();
  for (const event of world.events) {
    const match = NATIVE_EXPEDITION_EVENT.exec(event.id);
    if (!match || !linkedOccasionIds.has(match[2])) continue;
    if (relevantEvents.has(event.id) || event.witnessScope !== 'participants' || event.tick !== Number(match[1]) ||
        event.tick > world.tick || event.actorIds.some(id => !actorIds.has(id))) fail('expeditionOmens.events.scope');
    relevantEvents.set(event.id, event);
  }
  const isLinkedEvent = ({id}: {id: string}) => {
    const match = NATIVE_EXPEDITION_EVENT.exec(id);
    return !!match && linkedOccasionIds.has(match[2]);
  };
  if (world.chronicleArchive.anchors.some(isLinkedEvent) ||
      world.chronicleArchive.chapters.some(chapter => chapter.anchors.some(isLinkedEvent)) ||
      world.coldHistory.chapters.some(chapter => chapter.anchors.some(isLinkedEvent))) fail('expeditionOmens.publicArchive');
  let activeExpeditions = 0;
  for (const occasion of world.occasions) {
    const active = occasion.status === 'registration' || occasion.status === 'running';
    if (active && occasion.kind === 'expedition') activeExpeditions++;
    if (occasion.omenId === undefined && occasion.anchorSiteId === undefined) continue;
    const omenId = occasion.omenId;
    const site = sites.get(occasion.anchorSiteId ?? '');
    const gate = sites.get(occasion.locationId);
    if (!omenId || !omenId.startsWith(OMEN_PREFIX) || !site || !isAnchor(site) || occasion.kind !== 'expedition' ||
        occasion.id !== `occasion-${occasion.startedTick}-expedition` || occasion.locationId !== `${occasion.id}-gate` ||
        occasion.registrationClosesTick !== occasion.startedTick + 3 || occasion.expiresTick !== occasion.startedTick + 12 ||
        occasion.startedTick > world.tick || occasion.lastResolvedTick === undefined ||
        occasion.lastResolvedTick < occasion.startedTick || occasion.lastResolvedTick > Math.min(world.tick, occasion.expiresTick) ||
        (active && world.tick >= occasion.expiresTick) ||
        (occasion.status === 'registration' && (world.tick >= occasion.registrationClosesTick || occasion.remainingIds.length || occasion.expeditions.length)) ||
        (occasion.status === 'running' && world.tick < occasion.registrationClosesTick) || (!active && occasion.remainingIds.length) ||
        occasion.bouts.length || occasion.championId !== undefined || occasion.round !== occasion.expeditions.length ||
        !unique(occasion.expeditions.map(item => item.cultivatorId)) ||
        occasion.participantIds.length > 2 || !unique(occasion.participantIds) || !unique(occasion.remainingIds) ||
        occasion.participantIds.some(id => !actorIds.has(id)) ||
        occasion.remainingIds.some(id => !occasion.participantIds.includes(id)) ||
        occasion.expeditions.some(item => !occasion.participantIds.includes(item.cultivatorId) ||
          item.tick <= occasion.registrationClosesTick || item.tick > occasion.lastResolvedTick!)) {
      fail('occasions.expeditionOmen.references');
    }
    const row = evidence.get(omenId);
    const separator = omenId.lastIndexOf('-');
    const operatorId = omenId.slice(OMEN_PREFIX.length, separator);
    const openedTick = Number(omenId.slice(separator + 1));
    const measuredTick = openedTick + OBSERVATORY_LEAD_TICKS;
    if (row ? row.opening?.occasionId !== occasion.id : active || !actorIds.has(operatorId) ||
        !Number.isSafeInteger(openedTick) || openedTick < 1 || omenId !== expeditionOmenId(operatorId, openedTick) ||
        world.tick <= measuredTick + EXPEDITION_OMEN_RETENTION ||
        occasion.startedTick < measuredTick + EXPEDITION_OMEN_WINDOW_FIRST || occasion.startedTick > measuredTick + EXPEDITION_OMEN_WINDOW_LAST) {
      fail('occasions.expeditionOmen.source');
    }
    if (row && occasion.participantIds.some(id => id !== row.operatorId && (id !== row.relay?.recipientId ||
        row.relay.tick >= occasion.registrationClosesTick))) fail('occasions.expeditionOmen.participants');
    if (active) {
      if (!gate || gate.type !== 'secret_realm' || gate.expeditionOmenId !== omenId ||
          gate.x !== site.x || gate.y !== site.y || gates.has(gate.id)) fail('occasions.expeditionOmen.gate');
      gates.add(gate.id);
    } else if (gate) fail('occasions.expeditionOmen.closedGate');

    const event = relevantEvents.get(`evt-${occasion.startedTick}-${occasion.id}-open`);
    if (event && (event.witnessScope !== 'participants' || event.tick !== occasion.startedTick ||
        event.category !== 'heavenly' || event.locationId !== site.id || !unique(event.actorIds) ||
        event.actorIds.length > 2 ||
        (row && event.actorIds.some(id => id !== operatorId &&
          (id !== row.relay?.recipientId || row.relay.tick > occasion.startedTick))))) {
      fail('occasions.expeditionOmen.openEvent');
    }
  }
  if (activeExpeditions > 1) fail('occasions.expeditionOmen.active');
  for (const site of world.locations) {
    if (site.expeditionOmenId !== undefined && !gates.has(site.id)) fail('locations.expeditionOmenId');
  }
}
