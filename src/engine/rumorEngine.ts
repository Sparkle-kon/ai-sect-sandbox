import { captureChronicleErrataSource } from './chronicleErrataEngine';
import { capturePublicWitnessFact } from './witnessEngine';
import type { Cultivator, LLMDecisionPayload, Rumor, WorldEvent, WorldState } from '../types/world';

export const RUMOR_LIMIT = 18;
const RUMOR_LIFETIME = 24;
const MAX_HOPS = 4;

function byValue(a: Rumor, b: Rumor): number {
  return b.confidence - a.confidence || b.originTick - a.originTick || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function learn(cultivator: Cultivator, rumor: Rumor, tick: number): void {
  const active = cultivator.rumors.filter((item) => tick - item.originTick <= RUMOR_LIFETIME);
  const known = active.find((item) => item.id === rumor.id);
  if (!known || known.confidence < rumor.confidence) {
    cultivator.rumors = [...active.filter((item) => item.id !== rumor.id), rumor].sort(byValue).slice(0, RUMOR_LIMIT);
  }
}

export function witnessEvent(world: WorldState, event: WorldEvent): void {
  capturePublicWitnessFact(world, event);
  if (event.duelWinnerId || event.id.startsWith('evt-settlement-')) captureChronicleErrataSource(world, event);
  const involved = new Set(event.actorIds);
  for (const actor of world.cultivators) {
    const present = event.locationId !== undefined && actor.locationId === event.locationId;
    if (actor.alive && (involved.has(actor.id) || (present && event.witnessScope !== 'participants'))) {
      learn(actor, {
        id: `rumor-${event.id}`, subject: event.title, locationId: event.locationId,
        originTick: event.tick, learnedTick: event.tick, provenance: 'witness',
        confidence: 100, hops: 0, originEventId: event.id, originSourceCultivatorId: actor.id,
        witnessScope: event.witnessScope,
        lead: event.id.includes('-explore') || event.id.startsWith('evt-god-treasure-'),
      }, world.tick);
    }
  }
}

export function fabricateRumor(
  world: WorldState, actor: Cultivator, listener: Cultivator, intent: LLMDecisionPayload['rumorIntent']
): void {
  if (!intent || (actor.personality !== '阴险' && actor.personality !== '诡诈') ||
      !actor.alive || !listener.alive || actor.id === listener.id || actor.locationId !== listener.locationId) return;
  const existing = intent === 'EXAGGERATE' && actor.rumors
    .filter((item) => item.locationId && item.witnessScope !== 'participants' && item.provenance !== 'fabricated' && world.tick - item.originTick <= RUMOR_LIFETIME)
    .sort(byValue)[0];
  const location = existing
    ? world.locations.find((item) => item.id === existing.locationId)
    : world.locations.find((item) => item.id !== actor.locationId && item.type === 'secret_realm') ??
      world.locations.find((item) => item.id !== actor.locationId);
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
  const live = world.cultivators.filter((item) => item.alive);
  const snapshot = new Map(live.map((item) => {
    item.rumors = item.rumors.filter((rumor) => world.tick - rumor.originTick <= RUMOR_LIFETIME);
    return [item.id, item.rumors.filter((rumor) => rumor.learnedTick < world.tick && rumor.hops < MAX_HOPS && rumor.witnessScope !== 'participants').sort(byValue)];
  }));
  // One packet per listener per month; a snapshot prevents same-month cascades.
  for (const listener of live) {
    const seen = new Map(listener.rumors.map((item) => [item.id, item.confidence]));
    let best: Rumor | undefined;
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
      }
    }
    if (best) learn(listener, best, world.tick);
  }
}

export function knownRumorLead(cultivator: Cultivator, world: WorldState): string | undefined {
  return cultivator.rumors.filter((item) => item.lead && item.confidence >= 45 &&
    item.locationId !== cultivator.locationId && world.tick - item.originTick <= RUMOR_LIFETIME &&
    world.locations.some((location) => location.id === item.locationId)).sort(byValue)[0]?.locationId;
}
