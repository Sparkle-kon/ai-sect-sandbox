import type { WorldState } from '../types/world';

type Siege = WorldState['sieges'][number];

export const SIEGE_LABELS: Record<Siege['status'], string> = {
  marching: '行军', sieging: '围攻', victory: '攻方胜利', repelled: '攻方遭击退', withdrawn: '停战撤军（非战败）',
};
export function isActiveCampaign(siege: Siege): boolean {
  return siege.status === 'marching' || siege.status === 'sieging';
}
