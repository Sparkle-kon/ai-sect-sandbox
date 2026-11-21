import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SeasonalHousingReceipts } from '../src/components/SeasonalHousingReceipts';
import type { projectSeasonalHousing } from '../src/engine/seasonalHousingEngine';

type Claim = ReturnType<typeof projectSeasonalHousing>[number];
const guestId = 'secret-guest';
const hostId = 'secret-host';
const base = { id: 'secret-claim', householdId: 'secret-household', hostId, guestId, settlementId:'secret-settlement',
  siteId: 'secret-shelter-site', shelterProjectId: 'secret-project', offeredTick: 10, expiresTick: 13, seasonStartTick: 11,
  seasonEndTick: 22, status: 'offered' } satisfies Claim;
const arrival = { tick: 12, fromSiteId: 'secret-origin', toSiteId: base.siteId };
const departure = { tick: 16, fromSiteId: base.siteId, toSiteId: 'secret-destination' };
const render = (row: Claim, viewerId = guestId) => renderToStaticMarkup(<SeasonalHousingReceipts rows={[row]} viewerId={viewerId} />);

describe('party-scoped seasonal housing within the existing register', () => {
  it('distinctly presents an offer, reserved room, actual arrival and later check-in', () => {
    expect(render(base)).toContain('借住邀约，尚未留房');
    const reserved = { ...base, status: 'reserved', acceptedTick: 11, arriveByTick: 14 } as const;
    expect(render(reserved)).toContain('已留房，尚无实到凭证');
    const arrived = render({ ...reserved, arrival });
    expect(arrived).toContain('已实到，尚未登记入住');
    expect(arrived).toContain('实际抵达 Tick #12');
    const occupied = render({ ...reserved, status: 'occupied', arrival, checkedInTick: 13 }, hostId);
    expect(occupied).toContain('本人为主家 · 已有实际入住凭证');
    expect(occupied).toContain('登记入住 Tick #13');
    expect(occupied).toContain('不把客人计入本村人口');
    expect(occupied).not.toMatch(/secret-|<button|<details/);
  });

  it('never treats a closed legal claim as actual departure without native proof', () => {
    const past = { ...base, acceptedTick: 11, arrival, checkedInTick: 13 };
    const closed = render({ ...past, status: 'closed', endedTick: 22, reason: 'season_ended' });
    expect(closed).toContain('借住结记 Tick #22 · 借住季期已终');
    expect(closed).toContain('仅有借住结束记录，未有实际离舍凭证');
    expect(closed).not.toContain('实际离舍 Tick');
    const exited = render({ ...past, status: 'moved_out', endedTick: 16, departure });
    expect(exited).toContain('已有实际离舍凭证');
    expect(exited).toContain('实际离舍 Tick #16');
    expect(exited).not.toContain('secret-destination');
  });

  it('omits the entire section when neither actual party is selected', () => {
    expect(render(base, 'apart-from-both')).toBe('');
  });
});
