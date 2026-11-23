import {prepareAnomalyPriority,stampAnomalyRelay,stampAnomalyWitness} from './anomalyRelay';
import {sealedHeartDemonEventId} from './heartDemonPrivacy';
import { IMMORTAL_AUCTION_SITE } from './immortalAuctionTerms';
import { daoPathEventId } from './daoPathTerms';
import {isUpperPassageEvent,onLowerPlane} from './upperPassageIsolation';
import { captureHeritageRelay } from './eraHeritageCapture';
import { isScopedExpeditionGate } from './expeditionOmenTerms';
import { courierCheckpoint } from './sealedCourierEngine';
import { captureChronicleErrataSource } from './chronicleErrataEngine';
import { capturePublicWitnessFact } from './witnessEngine';
import type { Cultivator, LLMDecisionPayload, Rumor, WorldEvent, WorldState } from '../types/world';

export const RUMOR_LIMIT = 18;
const RUMOR_LIFETIME = 24;
const MAX_HOPS = 4;

function byValue(a: Rumor, b: Rumor): number {
  return b.confidence - a.confidence || b.originTick - a.originTick || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function learn(cultivator: Cultivator, rumor: Rumor, tick: number): boolean {
  const active = cultivator.rumors.filter((item) => tick - item.originTick <= RUMOR_LIFETIME);
  const known = active.find((item) => item.id === rumor.id);
  if (!known || known.confidence < rumor.confidence) {
    cultivator.rumors = [...active.filter((item) => item.id !== rumor.id), rumor].sort(byValue).slice(0, RUMOR_LIMIT);
    return cultivator.rumors.includes(rumor);
  }
  return false;
}

export function witnessEvent(world: WorldState, event: WorldEvent): void {
  if (event.witnessScope==='participants'&&event.id.startsWith('evt-beast-duel-'))return;
  if (isUpperPassageEvent(event) || event.witnessScope==='participants'&&sealedHeartDemonEventId(event.id)) return;
  // The Dao ledger is private even to the generic self-witness buffer. Replaying a local receipt as a rumor
  // would disclose the actual path/prepared intent outside the scoped read; true DUEL remains ordinary news.
  if (event.witnessScope === 'participants' && event.category === 'breakthrough' && event.actorIds.length === 1 &&
      (['choose', 'practice', 'ready', 'cancel'] as const).some(move =>
        event.id === daoPathEventId(event.actorIds[0], event.tick, move))) return;
  // Scoped auction receipts have their own actual on-site reader. No generic witness or flying-sword copy.
  if (event.witnessScope === 'participants' && event.category === 'diplomacy' && event.locationId === IMMORTAL_AUCTION_SITE &&
      /^evt-[1-9]\d*-auction-lot-[1-9]\d*-(?:consign-.+|bid-.+|sold|withdrawn|no_bid|unavailable)$/.test(event.id)) return;
  // Family assent, refusal, and the waiting/newborn ledger are never public rumor or even generic self-rumor.
  if (event.witnessScope === 'participants' && event.category === 'diplomacy' &&
      /^evt-[1-9]\d*-clan-union-[1-9]\d*-(?:propose|accept|refuse|ceremony_offer|family_offer|family_accept|family_refuse|birth|lost|expired)$/.test(event.id)) return;
  if (event.witnessScope === 'participants' && event.category === 'heavenly' &&
      /^evt-[1-9]\d*-.+-ascension-interrupted$/u.test(event.id)) return;
  capturePublicWitnessFact(world, event);
  if (event.duelWinnerId || event.id.startsWith('evt-settlement-')) captureChronicleErrataSource(world, event);
  const involved = new Set(event.actorIds);
  for (const actor of world.cultivators) {
    if (!onLowerPlane(actor)) continue;
    const present = event.locationId !== undefined && actor.locationId === event.locationId && !courierCheckpoint(world, actor);
    if (actor.alive && (involved.has(actor.id) || (present && event.witnessScope !== 'participants'))) {
      const packet:Rumor={
        id: `rumor-${event.id}`, subject: event.title, locationId: event.locationId,
        originTick: event.tick, learnedTick: event.tick, provenance: 'witness',
        confidence: 100, hops: 0, originEventId: event.id, originSourceCultivatorId: actor.id,
        witnessScope: event.witnessScope,
        lead: event.id.includes('-explore') || event.id.startsWith('evt-god-treasure-'),
      };
      if(learn(actor,packet,world.tick))stampAnomalyWitness(world,actor,event,packet);
    }
  }
}

export function fabricateRumor(
  world: WorldState, actor: Cultivator, listener: Cultivator, intent: LLMDecisionPayload['rumorIntent']
): void {
  if (!onLowerPlane(actor) || !onLowerPlane(listener) || !intent || (actor.personality !== '阴险' && actor.personality !== '诡诈') ||
      !actor.alive || !listener.alive || actor.id === listener.id || actor.locationId !== listener.locationId) return;
  const publicSites = world.locations.filter(location=>!isScopedExpeditionGate(location));
  const existing = intent === 'EXAGGERATE' && actor.rumors
    .filter((item) => item.locationId && publicSites.some(site=>site.id===item.locationId) && item.witnessScope !== 'participants' && item.provenance !== 'fabricated' && world.tick - item.originTick <= RUMOR_LIFETIME)
    .sort(byValue)[0];
  const location = existing
    ? publicSites.find((item) => item.id === existing.locationId)
    : publicSites.find((item) => item.id !== actor.locationId && item.type === 'secret_realm') ??
      publicSites.find((item) => item.id !== actor.locationId);
  if (!location) return;
  const subject = existing
    ? `「${existing.subject.slice(0, 80)}」另有隐情：传说【${location.name}】地底还藏着未取走的秘宝。`
    : `据称【${location.name}】出现了无人看守的上古宝匣。`;
  const seed: Rumor = {
    id: `rumor-forged-${world.tick}-${actor.id}-${listener.id}`,
    subject, locationId: location.id, originTick: world.tick, learnedTick: world.tick,
    provenance: 'fabricated', confidence: 65, hops: 0, sourceCultivatorId: actor.id, originSourceCultivatorId: actor.id, lead: true,
  };
  learn(actor, seed, world.tick);
  learn(listener, { ...seed, provenance: 'conversation', confidence: 55, hops: 1 }, world.tick);
}

export function spreadRumors(world: WorldState): void {
  const live = world.cultivators.filter((item) => item.alive && onLowerPlane(item));
  const privateSites=new Set(world.locations.filter(isScopedExpeditionGate).map(({id})=>id));
  const snapshot = new Map(live.map((item) => {
    item.rumors = item.rumors.filter((rumor) => world.tick - rumor.originTick <= RUMOR_LIFETIME);
    return [item.id, item.rumors.filter((rumor) => rumor.learnedTick < world.tick && rumor.hops < MAX_HOPS && rumor.witnessScope !== 'participants' && (!rumor.locationId || !privateSites.has(rumor.locationId))).sort(byValue)];
  }));
  const prioritizeAnomaly=prepareAnomalyPriority(world);
  const usedAnomalyOrigins=new Set<string>();
  // Build from exactly the existing immutable pre-spread packets. A narrow scan avoids changing ordinary early breaks.
  const anomalyPackets=prioritizeAnomaly&&new Map(live.flatMap(sender=>{
    const packets=(snapshot.get(sender.id)??[]).filter(packet=>packet.originEventId?.startsWith('evt-')&&
      packet.subject==='凶兽引动兽潮');
    return packets.length?[[sender,packets] as const]:[];
  }));
  // One packet per listener per month; a snapshot prevents same-month cascades.
  for (const listener of live) {
    const seen = new Map(listener.rumors.map((item) => [item.id, item.confidence]));
    let best: Rumor | undefined;
    let source: {actor:Cultivator;packet:Rumor} | undefined;
    for (const sender of live) {
      if (sender.id === listener.id) continue;
      const conversation = sender.locationId === listener.locationId;
      const flyingSword = !conversation && world.tick % 3 === 0 && sender.sectId === listener.sectId;
      if (!conversation && !flyingSword) continue;
      for (const item of snapshot.get(sender.id) ?? []) {
        const confidence = Math.floor(item.confidence * (conversation ? 0.84 : 0.7));
        // The source packet is sorted by confidence, so weaker remaining candidates cannot win.
        if (confidence < 25 || (best && confidence < best.confidence)) break;
        if (confidence <= (seen.get(item.id) ?? 0)) continue;
        if (best && confidence === best.confidence &&
            (item.originTick < best.originTick || (item.originTick === best.originTick && item.id >= best.id))) continue;
        best = { ...item, confidence, learnedTick: world.tick, hops: item.hops + 1,
          provenance: conversation ? 'conversation' : 'flying_sword', sourceCultivatorId: sender.id };
        source={actor:sender,packet:item};
      }
    }
    let exceptionalOrigin:string|undefined;
    if(prioritizeAnomaly&&anomalyPackets?.size){
      let priority:{incoming:Rumor;actor:Cultivator;packet:Rumor;sites:number}|undefined;
      for(const [sender,packets] of anomalyPackets){
        if(sender===listener)continue;
        const local=sender.locationId===listener.locationId;
        if(!local&&(world.tick%3!==0||!sender.sectId||sender.sectId!==listener.sectId))continue;
        for(const packet of packets){
          if(!packet.originEventId||usedAnomalyOrigins.has(packet.originEventId))continue;
          const confidence=Math.floor(packet.confidence*(local?.84:.7));
          if(confidence<25||confidence<=(seen.get(packet.id)??0))continue;
          const incoming:Rumor={...packet,confidence,learnedTick:world.tick,hops:packet.hops+1,
            provenance:local?'conversation':'flying_sword',sourceCultivatorId:sender.id};
          const sites=prioritizeAnomaly(sender,listener,packet,incoming);
          if(!sites||priority&&(sites<priority.sites||sites===priority.sites&&byValue(incoming,priority.incoming)>=0)||
            ![...listener.rumors.filter(row=>row.id!==incoming.id),incoming].sort(byValue).slice(0,RUMOR_LIMIT).includes(incoming))
            continue;
          priority={incoming,actor:sender,packet,sites};
        }
      }
      // If the same delivery would already win, keep it ordinary and don't spend the exceptional origin slot.
      if(priority&&(best?.id!==priority.incoming.id||best.sourceCultivatorId!==priority.incoming.sourceCultivatorId)){
        best=priority.incoming;
        source={actor:priority.actor,packet:priority.packet};
        exceptionalOrigin=priority.packet.originEventId;
      }
    }
    if (best) {
      if(learn(listener,best,world.tick)&&source){
        stampAnomalyRelay(world,listener,best,source.actor,source.packet);
        if(exceptionalOrigin)usedAnomalyOrigins.add(exceptionalOrigin);
      }
      captureHeritageRelay(world, listener, best);
    }
  }
}

export function knownRumorLead(cultivator: Cultivator, world: WorldState): string | undefined {
  if (!onLowerPlane(cultivator)) return undefined;
  return cultivator.rumors.filter((item) => item.lead && item.confidence >= 45 &&
    item.locationId !== cultivator.locationId && world.tick - item.originTick <= RUMOR_LIFETIME &&
    world.locations.some((location) => location.id === item.locationId&&!isScopedExpeditionGate(location))).sort(byValue)[0]?.locationId;
}
