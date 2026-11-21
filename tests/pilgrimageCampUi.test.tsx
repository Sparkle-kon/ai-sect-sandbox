import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PilgrimagePanel } from '../src/components/PilgrimagePanel';
import { createInitialWorld } from '../src/data/initialWorld';
import type { PilgrimageCamp, PilgrimageJourney } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(91);
  world.tick = 23;
  const [organizer, companion, outsider] = world.cultivators;
  const [origin, first, last] = world.locations;
  organizer.locationId = companion.locationId = origin.id;
  const camp: PilgrimageCamp = {
    legIndex: 0, pathIndex: 1, tileId: 'raw-camp-tile', point: { x: 932.11, y: 577.65 },
    openedTick: 23, payerId: organizer.id, status: 'pitched',
  };
  const journey: PilgrimageJourney = {
    id: 'raw-journey-camp', organizerId: organizer.id, companionId: companion.id,
    stopIds: [origin.id, first.id, last.id], stopsVisited: [{ locationId: origin.id, tick: 18 }],
    status: 'active', proposedTick: 17, offerExpiresTick: 20, startedTick: 18, expiresTick: 34,
    legIndex: 0, pathIndex: 1, lastMovedTick: 23, path: [{ x: origin.x, y: origin.y }, camp.point, { x: first.x, y: first.y }],
    spentByEach: 8, aid: [], camps: [camp],
  };
  world.pilgrimages.journeys = [journey];
  const view = (who = organizer) => renderToStaticMarkup(<PilgrimagePanel world={world} cultivator={who} />);
  return { world, organizer, companion, outsider, camp, journey, view };
}

describe('private journey camp receipts', () => {
  it('shows one real provision and no destination or coordinates for the two participants only', () => {
    const { companion, outsider, view } = fixture();
    const html = view();
    expect(html).toMatch(/<details class="[^"]+"><summary class="[^"]+">途中夜宿营地凭证/);
    expect(html).toContain('第 1 段途中 · 已搭营');
    expect(html).toContain('搭营 Tick #23 · 本人已实用 1 株玄土根');
    expect(html).toContain('尚未过夜');
    expect(html).toContain('实际已到检查站：0/2');
    expect(html).toContain('不新增目的地，也不取得地权');
    expect(html).not.toMatch(/raw-camp-tile|raw-journey-camp|932.11|577.65|实际恢复|已核验接续/);
    expect(view(companion)).toContain('搭营 Tick #23 · 同行者已实用 1 株玄土根');
    expect(view(outsider)).toBe('');
  });

  it('separates resumed, dismantled, expired and interrupted, and labels only actual dated recovery', () => {
    const { world, organizer, companion, camp, journey, view } = fixture();
    world.tick = 24;
    expect(view()).toContain('已过一夜');
    expect(view()).not.toContain('结案 Tick');
    camp.status = 'resumed';
    camp.closedTick = 24;
    camp.recovery = [{ actorId: organizer.id, hp: 12 }, { actorId: companion.id, hp: 2 }];
    expect(view()).toContain('已核验接续并撤营');
    expect(view()).toContain('结案 Tick #24');
    expect(view()).toContain('本人实际恢复 12 点气血');
    expect(view()).toContain('同行者实际恢复 2 点气血');
    world.tick = 23;
    expect(view()).not.toContain('已核验接续');
    expect(view()).not.toContain('实际恢复');
    world.tick = 25;
    camp.status = 'dismantled';
    expect(view()).toContain('已撤营，未记接续');
    expect(view()).not.toContain('实际恢复');
    camp.status = 'expired';
    camp.closedTick = 25;
    expect(view()).toContain('营地已过期，未记接续');
    camp.status = 'interrupted';
    expect(view()).toContain('行程中断，未记接续');
    expect(view()).not.toContain('已核验接续');
    delete journey.camps;
    expect(view()).not.toContain('途中夜宿营地凭证');
  });
});
