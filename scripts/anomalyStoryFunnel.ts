import { validateAnomalyRelaySave } from '../src/engine/anomalyRelay';
import { isScopedExpeditionGate } from '../src/engine/expeditionOmenTerms';
import { isGrandSiegeFighterPresent } from '../src/engine/grandSiegePresence';
import { RUMOR_LIMIT } from '../src/engine/rumorEngine';
import type { AnomalyRelayReceipt } from '../src/types/anomalyRelay';
import type { Rumor } from '../src/types/world';
import type { StoryAuditTurn } from './storyTriggerAuditTerms';

const key = (eventId: string, actorId: string) => JSON.stringify([eventId, actorId]);
const order = (a: Rumor, b: Rumor) => b.confidence - a.confidence || b.originTick - a.originTick ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function createAnomalyStoryFunnel() {
  const totals = {
    nativeTides: 0, originsWitnessed: 0, originsReachedTwoSites: 0, originsReachedThreeSites: 0,
    diagnosticNewSiteContactOriginMonths: 0, diagnosticThirdSiteContactOriginMonths: 0,
  };
  const maxSitesSeen = new Map<string, number>();
  let lastTick = -1;
  function observe({ before, after, events }: StoryAuditTurn) {
    if (after.tick !== before.tick + 1 || after.tick <= lastTick) return;
    lastTick = after.tick;
    const state = after.anomalyRelays;
    if (!state) return;
    try {
      validateAnomalyRelaySave(after, path => { throw new Error(path); });
    } catch {
      return; // A disputed origin or broken lineage is not a counted fact.
    }

    // Native validation above confirms identity, chronology, confidence, scope and complete ancestry.
    const receipts = new Map(state.receipts.map(row => [key(row.eventId, row.actorId), row]));
    const sitesOf = (leaf: AnomalyRelayReceipt) => {
      const sites = new Set<string>();
      let step: AnomalyRelayReceipt | undefined = leaf;
      for (let hop = 0; step && hop <= 4; hop++) {
        sites.add(step.siteId); // senderSiteId is not a scene or a recipient receipt.
        step = step.senderId ? receipts.get(key(step.eventId, step.senderId)) : undefined;
      }
      return sites;
    };
    const publicSites = new Map(after.locations.filter(site => site.type !== 'secret_realm' &&
      !isScopedExpeditionGate(site) && after.locations.filter(row => row.id === site.id).length === 1)
      .map(site => [site.id, site]));
    const people = after.cultivators.filter(actor => publicSites.has(actor.locationId) &&
      after.cultivators.filter(row => row.id === actor.id).length === 1 &&
      isGrandSiegeFighterPresent(after, actor, actor.locationId));
    const nextTick = after.tick + 1;

    for (const origin of state.origins) {
      if (origin.tick === after.tick && events.filter(event => event.id === origin.eventId).length === 1 &&
          events.some(event => event.id === origin.eventId && event.tick === after.tick &&
            event.year === after.year && event.month === after.month && event.locationId === origin.siteId &&
            event.category === 'heavenly' && event.witnessScope === undefined && event.actorIds.length === 0 &&
            event.title === '凶兽引动兽潮') &&
          after.mapHazards.some(hazard => hazard.id === origin.hazardId &&
            hazard.tileId === origin.tileId && hazard.kind === 'beast_tide' && hazard.intensity === 1 &&
            hazard.createdTick === origin.tick && hazard.expiresTick === origin.tick + 4) &&
          publicSites.has(origin.siteId) && !before.anomalyRelays?.origins.some(row => row.eventId === origin.eventId))
        totals.nativeTides++;

      const siteCount = state.receipts.filter(row => row.eventId === origin.eventId && row.tick === after.tick)
        .reduce((max, row) => Math.max(max, sitesOf(row).size), 0);
      const previous = maxSitesSeen.get(origin.eventId) ??
        (before.anomalyRelays?.receipts ?? []).filter(row => row.eventId === origin.eventId)
          .reduce((max, row) => {
            const retained = receipts.get(key(row.eventId, row.actorId));
            return retained && retained.tick < after.tick ? Math.max(max, sitesOf(retained).size) : max;
          }, 0);
      if (previous < 1 && siteCount >= 1) totals.originsWitnessed++;
      if (previous < 2 && siteCount >= 2) totals.originsReachedTwoSites++;
      if (previous < 3 && siteCount >= 3) totals.originsReachedThreeSites++;
      maxSitesSeen.set(origin.eventId, Math.max(previous, siteCount));

      // Diagnostic only: use true month-end body positions to ask whether the *next* post-turn
      // would admit this packet if positions and allegiances stayed unchanged. No claim that
      // sender/listener stayed in place, the slot was won, or receipt was delivered.
      if (nextTick - origin.tick > 24) continue;
      let newSite = false, thirdSite = false;
      const packetId = `rumor-${origin.eventId}`;
      for (const sender of people) {
        const parent = receipts.get(key(origin.eventId, sender.id));
        if (!parent || parent.tick >= nextTick || parent.hops >= 4) continue;
        const matching = sender.rumors.filter(row => row.id === packetId);
        const packet = matching.length === 1 ? matching[0] : undefined;
        if (!packet || packet.originEventId !== origin.eventId || packet.originTick !== origin.tick ||
            packet.locationId !== origin.siteId || packet.subject !== '凶兽引动兽潮' || packet.lead ||
            packet.witnessScope !== undefined || packet.learnedTick !== parent.tick || packet.hops !== parent.hops ||
            packet.confidence !== parent.confidence || packet.provenance !== parent.channel ||
            packet.sourceCultivatorId !== parent.senderId || packet.originSourceCultivatorId !== parent.originalWitnessId)
          continue;
        const priorSites = sitesOf(parent);
        for (const listener of people) {
          if (listener === sender || priorSites.has(listener.locationId) || receipts.has(key(origin.eventId, listener.id))) continue;
          const local = sender.locationId === listener.locationId;
          if (!local && (nextTick % 3 !== 0 || !sender.sectId || sender.sectId !== listener.sectId)) continue;
          const confidence = Math.floor(packet.confidence * (local ? .84 : .7));
          const active = listener.rumors.filter(row => nextTick - row.originTick <= 24);
          if (confidence < 25 || active.some(row => row.id === packetId && row.confidence >= confidence)) continue;
          const prospective = { ...packet, confidence };
          if (![...active.filter(row => row.id !== packetId), prospective].sort(order).slice(0, RUMOR_LIMIT).includes(prospective))
            continue;
          newSite = true;
          if (priorSites.size === 2) thirdSite = true;
        }
        if (thirdSite) break;
      }
      if (newSite) totals.diagnosticNewSiteContactOriginMonths++;
      if (thirdSite) totals.diagnosticThirdSiteContactOriginMonths++;
    }
    for (const id of maxSitesSeen.keys()) {
      if (!state.origins.some(origin => origin.eventId === id)) maxSitesSeen.delete(id);
    }
  }
  return { observe, summary: () => ({ ...totals }) };
}
