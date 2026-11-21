import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentInspector } from '../src/components/AgentInspector';
import { FurnaceQueueReceipt, FurnaceReservationPanel } from '../src/components/FurnaceReservationPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import type { getFurnaceView } from '../src/engine/furnaceReservationEngine';

type View = NonNullable<ReturnType<typeof getFurnaceView>>;
const noOp = () => undefined;

describe('observed atomic furnace queue presentation', () => {
  it('bounds 526 queue rows to an eight-entry page without truncating count or replacing the real order', () => {
    const longSiteName = '狭长炉点名称'.repeat(30);
    const view: View = {
      siteId: 'private-site-id', tick: 20, capacity: 2,
      slots: [{ slot: 1, status: 'used', isOwn: false }, { slot: 2, status: 'reserved', isOwn: true }],
      queue: Array.from({ length: 526 }, (_, index) => ({ position: index + 1,
        requestedTick: index % 2 === 0 ? 18 : 19, expiresTick: 22, isOwn: index === 1 })),
      ownReservations: [],
      ownUses: [],
    };
    const html = renderToStaticMarkup(<FurnaceQueueReceipt view={view} siteName={longSiteName} />);
    expect(html).toMatch(/<details class="[^"]+"><summary class="[^"]+">同刻炉位与预约/);
    expect(html).toContain(`<p class="break-words">当前可查炉点：${longSiteName}`);
    expect(html).toContain('当前实际队列 · 526 位');
    expect(html).toContain('第 1/66 页');
    expect(html).toContain('第 2 位（本人）');
    expect(html).toContain('第 8 位');
    expect(html).not.toMatch(/第 9 位|private-site-id/);
    expect(html).toContain('炉位 1 · 本回合已用');
    expect(html).toContain('炉位 2 · 已留位 · 本人');
    expect(html).toContain('不托管灵石、药材或器物');
    expect(html).toContain('委托原料仍由原委托独立托管');
  });

  it('shows only observed local slot receipt and own lifecycle, without embedding hidden identifiers or real custody amounts', () => {
    const world = createInitialWorld(38);
    world.tick = 21;
    const [actor, other] = world.cultivators;
    const located = world.locations.find(({ id }) => id === actor.locationId)!;
    const unseen = world.locations.find(({ id }) => id !== located.id && id !== other.locationId)!;
    actor.name = '持有预约修士';
    other.name = '旁人绝不显示';
    located.furnaceGrade = 2;
    unseen.furnaceGrade = 3;
    world.furnaceReservations.reservations = [
      { id: 'old-own-hidden-id', actorId: actor.id, siteId: located.id, requestedTick: 14, expiresTick: 17,
        status: 'cancelled', assignedTick: 16, slot: 1, closedTick: 16, reason: 'owner_cancelled', workshopOrderId: 'private-work-order' },
      { id: 'other-hidden-id', actorId: other.id, siteId: located.id, requestedTick: 20, expiresTick: 23, status: 'queued' },
      { id: 'current-own-hidden-id', actorId: actor.id, siteId: located.id, requestedTick: 20, expiresTick: 23,
        status: 'used', assignedTick: 21, slot: 1, closedTick: 21 },
    ];
    world.furnaceReservations.uses = [{ siteId: located.id, actorId: actor.id, kind: 'workshop', tick: 21, slot: 1,
      workshopOrderId: 'private-work-order', reservationId: 'current-own-hidden-id' }];
    const html = renderToStaticMarkup(<FurnaceReservationPanel world={world} cultivator={actor} />);
    expect(html).toContain('本回合已用 · 本人');
    expect(html).toContain('预约已取消 · Tick #16 · 本人取消 · 已解除实际留位');
    expect(html).toContain('实际作业：工坊委制');
    expect(html).not.toMatch(/旁人绝不显示|private-work-order|old-own-hidden-id|other-hidden-id|current-own-hidden-id/);
    const inspector = (workspaceSection: 'cultivation' | 'profile') => renderToStaticMarkup(
      <AgentInspector world={world} cultivator={actor} onSelectCultivator={noOp} workspaceSection={workspaceSection} />);
    expect(inspector('cultivation')).toContain('同刻炉位与预约');
    expect(inspector('profile')).not.toContain('同刻炉位与预约');
    located.furnaceGrade = 0;
    expect(renderToStaticMarkup(<FurnaceReservationPanel world={world} cultivator={actor} />)).toBe('');
  });
});
