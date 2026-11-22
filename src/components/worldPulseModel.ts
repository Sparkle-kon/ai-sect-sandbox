import { REALM_ORDER } from '../data/initialWorld';
import { isSectActive } from '../engine/sectActivity';
import { isTribulationActive } from '../engine/tribulationEngine';
import { isUpperPassageEvent } from '../engine/upperPassageIsolation';
import { localQiWeather, type QiWeatherKind, type QiWeatherSeason } from '../engine/weatherEngine';
import type { Cultivator, LocationNode, WorldEvent, WorldState } from '../types/world';
import { mapTransitActorIds } from './mapConvoyView';
import { createTerrainMapView } from './terrainMapView';

export interface WorldPulseRisk {
  id: string;
  siteId: string;
  siteName: string;
  kind: 'trial' | 'siege' | 'clash';
  label: string;
}

export interface WorldPulseView {
  season: QiWeatherSeason;
  weather?: { kind: QiWeatherKind; siteName: string; intensity: number };
  righteous: { count: number; mean?: number };
  demonic: { count: number; mean?: number };
  champion?: { name: string; realm: string; power: number };
  coverage: 'world' | 'visible';
  risks: readonly WorldPulseRisk[];
  additionalRisks: number;
}

const seasons = ['春', '夏', '秋', '冬'] as const;
const riskWeight = { trial: 0, siege: 1, clash: 2 } as const;
const visibleLimit = 3;
const ascii = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const living = (actor: Cultivator) => actor.alive && actor.hp > 0;

// Same native ordering as the living Hall of Fame, without constructing a history or sorting the input.
function powerOrder(a: Cultivator, b: Cultivator): number {
  return b.combatPower - a.combatPower || REALM_ORDER.indexOf(b.realm) - REALM_ORDER.indexOf(a.realm) ||
    b.realmStage - a.realmStage || b.contribution - a.contribution || a.id.localeCompare(b.id);
}

function project(world: WorldState, viewerId: string | null, fog: boolean) {
  const viewer = viewerId === null ? undefined : world.cultivators.find(({ id }) => id === viewerId);
  const terrain = createTerrainMapView(world, viewer, fog);
  const sites = new Map(terrain.seenLocations.filter(({ id }) => terrain.isCurrentLocation(id)).map(site => [site.id, site]));
  const actors = terrain.liveActors.filter(living);
  const faction = new Map(world.sects.filter(isSectActive).map(({ id, alignment }) => [id, alignment]));
  let highest: Cultivator | undefined;
  let righteousCount = 0, righteousSum = 0, demonicCount = 0, demonicSum = 0;
  for (const actor of actors) {
    if (!highest || powerOrder(actor, highest) < 0) highest = actor;
    const alignment = faction.get(actor.sectId);
    if (alignment === '正道') { righteousCount++; righteousSum += actor.karma; }
    if (alignment === '魔道') { demonicCount++; demonicSum += actor.karma; }
  }
  const authorizedIds = new Set(actors.map(({ id }) => id));
  const complete = !fog && !terrain.current &&
    world.cultivators.every(actor => !living(actor) || authorizedIds.has(actor.id));

  // Weather differs across the map. Prefer the viewer's currently visible site; otherwise pick a
  // visible public landmark, not an explored-only point or a hidden gate.
  const sampledSite = (viewer ? sites.get(viewer.locationId) : undefined) ??
    [...sites.values()].filter(site => site.type === 'sect_hq' || site.type === 'market').sort((a, b) => ascii(a.id, b.id))[0];
  const sample = sampledSite ? localQiWeather(world, sampledSite) : undefined;
  const season = sample?.season ?? seasons[Math.floor(((world.month - 1) % 12 + 12) % 12 / 3)];

  const risks = new Map<string, WorldPulseRisk>();
  const append = (kind: WorldPulseRisk['kind'], sourceId: string, siteId: string, label: string) => {
    const site = sites.get(siteId);
    const id = kind + ':' + sourceId;
    if (site && !risks.has(id)) risks.set(id, { id, siteId, siteName: site.name, kind, label });
  };

  const travelling = mapTransitActorIds(world);
  for (const actor of actors) {
    const trial = actor.tribulation;
    if (trial && trial.startedTick <= world.tick && isTribulationActive(actor) &&
        !terrain.trailPositions.has(actor.id) && !travelling.has(actor.id)) {
      append('trial', trial.id, actor.locationId, actor.name + (trial.stage === 'heart_demon' ? '正在渡心魔劫' : '正在渡雷劫'));
    }
  }
  for (const siege of world.sieges) {
    if (siege.status === 'sieging' && siege.startedTick <= world.tick) {
      append('siege', siege.id, siege.destinationId, '宗门围攻中');
    }
  }

  if (world.mapPresentation.tick === world.tick) {
    const sourceById = new Map<string, WorldEvent | undefined>();
    // Check uniqueness before filtering; a duplicate participant record must not turn a
    // contested identity into public evidence just because it is filtered out first.
    for (const event of world.events) {
      sourceById.set(event.id, sourceById.has(event.id) ? undefined : event);
    }
    for (const effect of world.mapPresentation.effects) {
      if (effect.kind !== 'clash' || effect.tick !== world.tick || !effect.id.endsWith('-clash')) continue;
      // Native mapMotionEngine derives clash IDs from their source. Fail closed if the exact
      // public record is absent, or the claimed paint location contradicts its explicit site.
      const event = sourceById.get(effect.id.slice(0, -'-clash'.length));
      if (!event || event.tick !== world.tick || event.year !== world.year || event.month !== world.month ||
          event.witnessScope === 'participants' || isUpperPassageEvent(event) ||
          !(event.duelWinnerId || event.id.endsWith('-duel') || event.id.endsWith('-kill')) ||
          (event.locationId && event.locationId !== effect.locationId)) continue;
      append('clash', effect.id, effect.locationId, '本月交锋');
    }
  }
  const ordered = [...risks.values()].sort((a, b) => riskWeight[a.kind] - riskWeight[b.kind] ||
    ascii(a.siteId, b.siteId) || ascii(a.id, b.id));
  const view: WorldPulseView = {
    season,
    ...(sample && sampledSite ? { weather: { kind: sample.kind, siteName: sampledSite.name, intensity: sample.intensity } } : {}),
    righteous: { count: righteousCount, ...(righteousCount ? { mean: righteousSum / righteousCount } : {}) },
    demonic: { count: demonicCount, ...(demonicCount ? { mean: demonicSum / demonicCount } : {}) },
    ...(highest ? { champion: { name: highest.name, realm: highest.realm, power: highest.combatPower } } : {}),
    coverage: complete ? 'world' : 'visible',
    risks: ordered.slice(0, visibleLimit),
    additionalRisks: Math.max(0, ordered.length - visibleLimit),
  };
  return { view, sites };
}

export function projectWorldPulse(world: WorldState, viewerId: string | null, fog: boolean): WorldPulseView {
  return project(world, viewerId, fog).view;
}

export function resolveWorldPulseAlertSite(
  world: WorldState, viewerId: string | null, fog: boolean, riskId: string,
): LocationNode | undefined {
  const { view, sites } = project(world, viewerId, fog);
  const risk = view.risks.find(({ id }) => id === riskId);
  return risk ? sites.get(risk.siteId) : undefined;
}
