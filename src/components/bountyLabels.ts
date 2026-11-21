import type { WorldState } from '../types/world';

type Bounty = WorldState['bounties'][number];

export const BOUNTY_STATUS: Record<Bounty['status'], string> = {
  open: '悬赏中',
  claimed: '已领取',
  withdrawn: '已撤销',
};

export function relevantBounty(bounties: Bounty[], cultivatorId: string): Bounty | undefined {
  return bounties.reduce<Bounty | undefined>((best, entry) => {
    if (entry.targetCultivatorId !== cultivatorId) return best;
    if (!best) return entry;
    if (entry.status === 'open' && best.status !== 'open') return entry;
    if (entry.status !== 'open' && best.status === 'open') return best;
    return (entry.settledTick ?? entry.issuedTick) > (best.settledTick ?? best.issuedTick) ? entry : best;
  }, undefined);
}
