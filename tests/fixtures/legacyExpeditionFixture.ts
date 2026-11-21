import type { WorldOccasion, WorldState } from '../../src/types/world';

/** Representation of an already-open legacy expedition from a pre-omen save.
 * The current runtime no longer rolls a calendar-only opening. */
export function restoreLegacyExpeditionFixture(world: WorldState): WorldOccasion {
  const stage = world.locations.find(site => site.type === 'market')!;
  const id = `occasion-${world.tick}-expedition`;
  const locationId = `${id}-gate`;
  world.locations.push({ id: locationId, name: '星门浮域', type: 'secret_realm',
    x: Math.min(990, Math.max(10, stage.x + 48)), y: Math.min(590, Math.max(10, stage.y + 55)),
    description: '限时洞天，机缘与灵灾同在；关闭后遗卷将流落至外界。',
    spiritRoot: '雷', spiritQi: 96, furnaceGrade: 0, inheritanceScrolls: [],
    herbs: { jade_leaf: 1, earth_root: 0, star_bloom: 5, shadow_moss: 2 },
    herbCapacity: { jade_leaf: 1, earth_root: 0, star_bloom: 5, shadow_moss: 2 } });
  const occasion: WorldOccasion = { id, kind: 'expedition', title: '星门秘境远征', locationId,
    startedTick: world.tick, registrationClosesTick: world.tick + 3,
    expiresTick: world.tick + 12, status: 'registration', participantIds: [], remainingIds: [], bouts: [],
    expeditions: [], round: 0, lastResolvedTick:world.tick };
  world.occasions.push(occasion);
  return occasion;
}
