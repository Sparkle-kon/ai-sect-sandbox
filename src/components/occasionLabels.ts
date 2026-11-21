import type { WorldState } from '../types/world';

type Occasion = WorldState['occasions'][number];

export const OCCASION_KIND: Record<Occasion['kind'], string> = {
  tournament: '宗门大比',
  expedition: '秘境远征',
};

export const OCCASION_STATUS: Record<Occasion['status'], string> = {
  registration: '报名中',
  running: '进行中',
  completed: '已结束',
  cancelled: '已取消',
};

export function isOpenOccasion(occasion: Occasion): boolean {
  return occasion.status === 'registration' || occasion.status === 'running';
}
