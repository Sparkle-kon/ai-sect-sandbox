import type { WorldgenProfileId } from '../types/world';

export interface WorldgenProfile {
  label: string;
  description: string;
  climateLabel: string;
  factionLabel: string;
  scarcityLabel: string;
  weather: { tendency: number; amplitude: number };
  herbScale: number;
  qiScale: number;
  foundingFocus: 'balanced' | 'observatories' | 'frontier';
}

export const WORLDGEN_PROFILES: Record<WorldgenProfileId, WorldgenProfile> = {
  classic: {
    label: '万象初开', description: '沿用原初世界的山川、四宗格局和物产。',
    climateLabel: '四时流转', factionLabel: '四宗原有势力', scarcityLabel: '原有物产',
    weather: { tendency: 0, amplitude: 1 }, herbScale: 1, qiScale: 1, foundingFocus: 'balanced',
  },
  'spirit-bloom': {
    label: '灵潮丰年', description: '温润灵潮更盛，丹霞谷与天机阁新增开山弟子，灵草较丰。',
    climateLabel: '暖潮偏盛', factionLabel: '丹霞与天机兴盛', scarcityLabel: '灵草丰饶',
    weather: { tendency: .32, amplitude: .82 }, herbScale: 1.48, qiScale: 1.10, foundingFocus: 'observatories',
  },
  'fractured-frontier': {
    label: '裂土边荒', description: '罡风与冬霜更强，血月魔宗和剑宗驻守边地，物产紧俏。',
    climateLabel: '罡风与寒霜偏盛', factionLabel: '血月与剑宗增援', scarcityLabel: '灵材紧俏',
    weather: { tendency: -.28, amplitude: 1.26 }, herbScale: .48, qiScale: .79, foundingFocus: 'frontier',
  },
};

export function isWorldgenProfileId(value: unknown): value is WorldgenProfileId {
  return typeof value === 'string' && Object.hasOwn(WORLDGEN_PROFILES, value);
}

export function worldgenProfileOf(world: { worldgen?: { profileId: WorldgenProfileId } }): WorldgenProfileId {
  return world.worldgen?.profileId ?? 'classic';
}
