import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkshopPanel } from '../src/components/WorkshopPanel';
import type { WorldState } from '../src/types/world';
import {
  workshopCapacityActor as actor, workshopCapacityChoice as choice, workshopCapacityFixture,
  workshopCapacityMove as move, workshopCapacityTurn as turn,
} from './fixtures/workshopCapacityFixture';

const html = (world: WorldState, actorId: string) =>
  renderToStaticMarkup(<WorkshopPanel world={world} cultivator={actor(world, actorId)} />);

describe('workshop capacity receipt', () => {
  it('keeps the existing fold private and distinguishes actual damage, offer and later consent', () => {
    const { world, payer, maker, orderId, originalDeadline, blankTick, caseId, supervisor, hit } = workshopCapacityFixture();
    const pending = html(world, payer);
    expect(pending).toMatch(/<details class="[^"]+"><summary class="[^"]+">工坊委制与品质交割/);
    expect(pending).toContain('原约 2 件 · 原截止 Tick #' + originalDeadline);
    expect(pending).toContain('先于 Tick #' + blankTick + ' 实制首坯');
    expect(pending).toContain('最早下一轮由原委托方同意，生效前不会据此退款、减件或延长工期');
    expect(pending).toContain('已实退 0 灵石与玄土根 0 株');
    expect(pending).not.toContain('补签截止');
    expect(pending).not.toContain(caseId);
    expect(pending).not.toContain(orderId);
    expect(html(world, supervisor)).toBe('');
    expect(html(hit, payer)).not.toContain('停炉改约');
    expect(pending).not.toContain('<button');

    const accepted = turn(world, { [payer]: move('accept', orderId) });
    const proposerView = html(accepted, maker);
    const patronView = html(accepted, payer);
    expect(patronView).toContain('原约 2 件 · 原截止 Tick #' + originalDeadline);
    expect(patronView).toContain('补签截止 Tick #' + (originalDeadline + 4) + '（仅首件延后 4 轮');
    expect(patronView).toContain('退回本人 55 灵石、玄土根 2 株（已计入累计实退）');
    expect(proposerView).toContain('退给原委托方 55 灵石、玄土根 2 株（已计入累计实退）');
    expect(proposerView).not.toContain('退回本人');
    expect(patronView).toContain('当前托管 38 灵石与玄土根 1 株 · 已实退 55 灵石与玄土根 2 株');
    expect(patronView).toContain('按原约已交割 0/2 件；补签保留件已交割 0/1 件');
    expect(patronView).not.toContain('结案另实退');
  });

  it('shows only actual post-original-deadline delivery, still one of the original two', () => {
    const { world, payer, maker, supervisor, orderId, caseId, originalDeadline, work } = workshopCapacityFixture();
    let state = turn(world, { [payer]: move('accept', orderId) });
    const hazardEnds = state.mapHazards.find(({ kind }) => kind === 'beast_tide')!.expiresTick;
    while (state.tick + 1 < hazardEnds) state = turn(state);
    for (const furnaceSafetyMove of ['inspect', 'repair', 'reopen'] as const) {
      state = turn(state, { [supervisor]: choice('FURNACE_SAFETY', { furnaceSafetyMove, targetFurnaceSafetyId: caseId }), [maker]: work });
    }
    expect(html(state, payer)).toContain('补签保留件已交割 0/1 件');
    state = turn(state, { [maker]: work });
    expect(state.tick).toBeGreaterThanOrEqual(originalDeadline);
    const completed = html(state, payer);
    expect(completed).toContain('按原约已交割 1/2 件；补签保留件已交割 1/1 件');
    expect(completed).toContain('已验收入库，当前仍持有');
    expect(completed).not.toContain('结案另实退');
  });

  it('itemizes only additional retained-piece returns after expiry and leaves chartered work unchanged', () => {
    const { world, payer, orderId, originalDeadline } = workshopCapacityFixture();
    let unaccepted = world;
    while (unaccepted.tick < originalDeadline) unaccepted = turn(unaccepted);
    expect(html(unaccepted, payer)).toContain('结案前未见原委托方同意');
    expect(html(unaccepted, payer)).not.toContain('补签截止');

    let expired = turn(world, { [payer]: move('accept', orderId) });
    while (expired.tick < originalDeadline + 4) expired = turn(expired);
    const result = html(expired, payer);
    expect(result).toContain('按原约已交割 0/2 件；补签保留件已交割 0/1 件');
    expect(result).toContain('已实退 93 灵石与玄土根 3 株');
    expect(result).toContain('结案另实退首件未耗余料：38 灵石、玄土根 1 株');
    const chartered = workshopCapacityFixture(true);
    expect(html(chartered.world, chartered.payer)).not.toContain('停炉改约');
  });
});
