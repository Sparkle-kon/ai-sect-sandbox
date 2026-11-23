import { SECT_QUIRK_IDS, type SectQuirkId } from '../types/sectManagement';
import type { Cultivator, WorldState } from '../types/world';
import { isSectActive } from './sectActivity';

const none: readonly SectQuirkId[] = [];

function eligibleBody(actor: Cultivator): boolean {
  return actor.alive && actor.hp > 0 && actor.positionPlane !== 'immortal' &&
    !!actor.sectId && actor.sectRank !== '掌门';
}

function drawQuirks(seed: number, actorId: string): SectQuirkId[] {
  const roll = (salt: string) => {
    let hash = (seed ^ 0x811c9dc5) >>> 0;
    for (const code of `${salt}:${actorId}`) hash = Math.imul(hash ^ code.charCodeAt(0), 0x01000193);
    hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
    return (hash ^ (hash >>> 13)) >>> 0;
  };
  const length = SECT_QUIRK_IDS.length;
  const first = roll('sect-quirk-first') % length;
  const second = (first + 1 + roll('sect-quirk-second') % (length - 1)) % length;
  return roll('sect-quirk-pair') % 3 === 0 ? [SECT_QUIRK_IDS[first], SECT_QUIRK_IDS[second]] : [SECT_QUIRK_IDS[first]];
}

/** Read-only adapter for legacy managed snapshots; both minds can see the next genuine stable assignment. */
export function effectiveSectQuirks(world: WorldState, actor: Cultivator): readonly SectQuirkId[] {
  const management = world.sectManagement;
  if (!management) return none;
  if (actor.quirks?.length) return actor.quirks;
  if (!eligibleBody(actor) || actor.id === management.leaderId ||
      world.cultivators.find(row => row.id === actor.id) !== actor) return none;
  const sect = world.sects.find(row => row.id === actor.sectId);
  return isSectActive(sect) && sect.leaderId !== actor.id ? drawQuirks(world.random.seed, actor.id) : none;
}

/** Seed missing traits only; keeps authored draws and won't redraw on a transfer, promotion, or reload. */
export function ensureManagedSectQuirks(world: WorldState): void {
  const management = world.sectManagement;
  if (!management) return;
  const livingSects = new Map(world.sects.filter(isSectActive).map(sect => [sect.id, sect]));
  for (const actor of world.cultivators) {
    if (actor.quirks || !eligibleBody(actor) || actor.id === management.leaderId) continue;
    const sect = livingSects.get(actor.sectId);
    if (sect && sect.leaderId !== actor.id) actor.quirks = drawQuirks(world.random.seed, actor.id);
  }
}
