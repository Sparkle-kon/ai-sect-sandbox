import { isScopedExpeditionGate } from '../engine/expeditionOmenTerms';
import { isSectActive } from '../engine/sectActivity';
import { terrainTileAt } from '../engine/terrainEngine';
import type { LocationNode, Sect, WorldState } from '../types/world';
import type { MapCombatVfxPlan } from './mapCombatVfxView';
import type { createTerrainMapView } from './terrainMapView';

export interface ProtectiveArrayDome {
  id: string;
  sectId: string;
  location: LocationNode;
  hp: number;
  maxHp: number;
  integrity: number;
  impacted: boolean;
  besieged: boolean;
}

function uniqueById<T extends { id: string }>(rows: readonly T[]) {
  const indexed = new Map<string, T | undefined>();
  for (const row of rows) indexed.set(row.id, indexed.has(row.id) ? undefined : row);
  return indexed;
}

/** Fixed defensive installations at actual, currently visible headquarters only. */
export function buildProtectiveArrayDomes(
  world: WorldState, view: ReturnType<typeof createTerrainMapView>, combat: MapCombatVfxPlan,
): readonly ProtectiveArrayDome[] {
  const sites = uniqueById(world.locations);
  const sects = uniqueById(world.sects);
  const headquarters = new Map<string, Sect | undefined>();
  for (const sect of world.sects) if (isSectActive(sect)) {
    const id = sect.headquartersId;
    headquarters.set(id, headquarters.has(id) ? undefined : sect);
  }

  const sieges = uniqueById(world.sieges);
  const rawEvents = uniqueById(world.events);
  const siegeAt = new Map<string, { defenderId: string; impacted: boolean }>();
  for (const row of uniqueById(combat.sieges).values()) {
    if (!row) continue;
    const siege = sieges.get(row.id);
    const location = sites.get(row.location.id);
    if (!siege || siege.status !== 'sieging' || !location || location !== row.location ||
        siege.destinationId !== location.id || siege.startedTick >= world.tick ||
        siege.lastResolvedTick === undefined || siege.lastResolvedTick <= siege.startedTick ||
        siege.lastResolvedTick > world.tick || siege.attackerSectId === siege.defenderSectId ||
        !isSectActive(sects.get(siege.attackerSectId)) || !isSectActive(sects.get(siege.defenderSectId))) continue;
    // A same-month change in the raw event index must not leave an old paired plan authorized.
    const event = rawEvents.get(`evt-${world.tick}-dip-${siege.id}`);
    const impacted = row.impact && siege.lastResolvedTick === world.tick && siege.rounds > 0 &&
      event?.tick === world.tick && event.year === world.year && event.month === world.month &&
      event.witnessScope !== 'participants' && event.category === 'diplomacy' && event.title === '护山阵接战' &&
      event.locationId === location.id && event.actorIds.some(id => siege.participantIds.includes(id));
    const existing = siegeAt.get(location.id);
    // Native campaigns are exclusive. Ambiguous different defenders cannot authorize either here.
    if (!existing) siegeAt.set(location.id, { defenderId: siege.defenderSectId, impacted });
    else if (existing.defenderId !== siege.defenderSectId) siegeAt.set(location.id, { defenderId: '', impacted: false });
    else if (impacted) existing.impacted = true;
  }

  const domes: ProtectiveArrayDome[] = [];
  const shown = new Set<string>();
  for (const location of view.seenLocations) {
    // Headquarters is a reference, not a biome/type: Bloodmoon's real headquarters is an abyss.
    if (shown.has(location.id) || sites.get(location.id) !== location ||
        isScopedExpeditionGate(location) || !view.isCurrentLocation(location.id)) continue;
    const tile = terrainTileAt(world, location.x, location.y);
    if (!tile || view.tileState(tile) !== 'visible' || (view.current && !view.current.has(tile.id))) continue;
    const sect = headquarters.get(location.id);
    if (!isSectActive(sect) || sects.get(sect.id) !== sect || (location.ownerSectId && location.ownerSectId !== sect.id)) continue;
    const { arrayHp: hp, arrayMaxHp: maxHp } = sect;
    const level = sect.facilities.defense_array;
    if (!Number.isSafeInteger(level) || level < 1 || level > 3 ||
        !Number.isFinite(hp) || !Number.isFinite(maxHp) || hp < 0 || maxHp <= 0 || hp > maxHp) continue;
    const attacking = siegeAt.get(location.id);
    const besieged = attacking?.defenderId === sect.id;
    shown.add(location.id);
    domes.push({ id: sect.id, sectId: sect.id, location, hp, maxHp, integrity: hp / maxHp,
      impacted: besieged && !!attacking?.impacted, besieged });
  }
  return domes;
}
