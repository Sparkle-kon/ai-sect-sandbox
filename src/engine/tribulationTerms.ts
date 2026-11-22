import type { CultivationRealm, TribulationStance } from '../types/world';

export const STORMS: Partial<Record<CultivationRealm, { waves: number; strength: number; heart: number }>> = {
  金丹: { waves: 3, strength: .14, heart: 30 }, 元婴: { waves: 4, strength: .15, heart: 35 },
  化神: { waves: 5, strength: .16, heart: 42 }, 渡劫: { waves: 6, strength: .17, heart: 50 },
};
export const STANCES: Record<TribulationStance, { damage: number; pressure: number; will: number; name: string }> = {
  guard: { damage: .62, pressure: 4, will: 0, name: '御雷护体' },
  focus: { damage: .87, pressure: -5, will: 12, name: '凝神守心' },
  defy: { damage: 1.2, pressure: -9, will: 5, name: '逆雷砺心' },
};
