import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentInspector } from '../src/components/AgentInspector';
import { ScriptureLendingPanel } from '../src/components/ScriptureLendingPanel';
import { pavilionAct, pavilionActor, pavilionChoice, pavilionLoanCheckedOutFixture, pavilionMove, pavilionTurn }
  from './fixtures/pavilionLoanFixture';
import type { WorldState } from '../src/types/world';

const screen = (world: WorldState, id: string) => renderToStaticMarkup(
  <ScriptureLendingPanel world={world} cultivator={pavilionActor(world, id)} />);

describe('actual pavilion shelf and private book receipts', () => {
  it('keeps anonymous staffed shelf in the existing default-closed cultivation panel and does not equate a shift with availability', () => {
    const { world, clerk, borrower, rival, editionId, originalId, loanId } = pavilionLoanCheckedOutFixture();
    pavilionActor(world, borrower).name = '他人借者姓名不公开';
    pavilionActor(world, clerk).name = '他人当值姓名不公开';
    const anonymous = screen(world, rival);
    expect(anonymous).toMatch(/<details class="[^"]+"><summary class="min-h-11[^"]*">藏经阁借阅<\/summary>/);
    expect(anonymous).not.toMatch(/<details[^>]*\bopen|<button|本人借阅凭据/);
    expect(anonymous).toContain('本回合有经办人员；不保证仍有未用的受理名额');
    expect(anonymous).toContain('在架 0 份 · 借阅占用 1 份');
    expect(anonymous).toContain('借阅占用');
    expect(anonymous).toContain('不是另创版本或取得经书所有权');
    for (const value of [editionId, originalId, loanId, '他人借者姓名不公开', '他人当值姓名不公开']) expect(anonymous).not.toContain(value);
    const active = pavilionActor(world, rival);
    const html = (workspaceSection: 'cultivation' | 'profile') => renderToStaticMarkup(
      <AgentInspector world={world} cultivator={active} workspaceSection={workspaceSection} onSelectCultivator={() => undefined} />);
    expect(html('cultivation').indexOf('功法研习与传承')).toBeLessThan(html('cultivation').indexOf('藏经阁借阅'));
    expect(html('profile')).not.toContain('藏经阁借阅');

    const farFromDesk = structuredClone(world);
    pavilionActor(farFromDesk, rival).locationId = 'loc-market';
    expect(screen(farFromDesk, rival)).toBe('');
  });

  it('distinguishes real +2, repeated +0 and unread, and remote borrower sees only their own receipt', () => {
    const { world, siteId, clerk, borrower, rival, editionId, loanId } = pavilionLoanCheckedOutFixture();
    const unread = screen(world, borrower);
    expect(unread).toContain('本人借阅持有');
    expect(unread).toContain('没有实际研读凭据');
    expect(unread).not.toContain('熟练度 +0');

    const moved = pavilionTurn(world, { [borrower]: pavilionChoice('EXPLORE', { targetLocationId: 'loc-market' }) });
    const read = pavilionTurn(moved, { [borrower]: pavilionMove('read', loanId), [clerk]: pavilionMove('staff') });
    const remote = screen(read, borrower);
    expect(remote).toContain('本人借阅凭据');
    expect(remote).not.toContain('此地柜存与经办');
    expect(remote).toContain(`第 ${read.tick} 轮实际研读 · 熟练度 +2`);
    expect(remote).toContain('此部功法的一次性借阅研习已记录');
    expect(screen(read, rival)).not.toMatch(/熟练度|本人借阅凭据/);

    const home = pavilionTurn(read, { [borrower]: pavilionChoice('EXPLORE', { targetLocationId: siteId }) });
    const returned = pavilionTurn(home, { [clerk]: pavilionMove('staff'), [borrower]: pavilionMove('return', loanId) });
    const rebooked = pavilionTurn(returned, { [borrower]: pavilionMove('checkout', editionId) });
    const sameBookAgain = rebooked.pavilionLoans.loans.at(-1)!;
    const reread = pavilionTurn(rebooked, { [borrower]: pavilionMove('read', sameBookAgain.id) });
    const repeat = screen(reread, borrower);
    expect(repeat).toContain(`第 ${reread.tick} 轮实际研读 · 熟练度 +0`);
    expect(repeat).toContain('本次未获得新增研习收益');
  });

  it('shows due-but-held, actual late return and distinct unavailable cases, never inferring return from death or title closure', () => {
    const { world, clerk, borrower, rival, loanId, sectId } = pavilionLoanCheckedOutFixture();
    const due = world.pavilionLoans.loans[0].dueTick;
    let overdue = world;
    while (overdue.tick < due) overdue = pavilionTurn(overdue);
    const held = screen(overdue, borrower);
    expect(held).toContain('已逾期，仍处于借阅持有');
    expect(held).toContain(`第 ${due} 轮起算逾期`);
    expect(held).not.toContain('已在原柜实还');
    expect(screen(overdue, rival)).toContain('本回合未见经办人员');
    expect(pavilionAct(overdue, clerk, pavilionMove('staff'))).not.toBeNull();
    const late = pavilionTurn(overdue, { [borrower]: pavilionMove('return', loanId) });
    expect(screen(late, borrower)).toContain('已实际归还（逾期后）');
    expect(screen(late, borrower)).toContain(`第 ${late.tick} 轮已在原柜实还`);
    expect(screen(late, rival)).toContain('在架 1 份 · 借阅占用 0 份');

    const loss = structuredClone(world);
    const absent = pavilionActor(loss, borrower);
    absent.alive = false; absent.hp = 0;
    expect(screen(loss, borrower)).toContain('借者无法继续，未见实物归还');
    expect(screen(loss, rival)).toContain('借阅未结，未记归还');
    expect(screen(loss, rival)).not.toContain('原柜实还');
    const closed = structuredClone(world);
    closed.sects.find(({ id }) => id === sectId)!.facilities.scripture_pavilion = 0;
    expect(screen(closed, borrower)).toContain('原藏经阁的凭据已关闭，未见实物归还');
    expect(screen(closed, rival)).toBe('');
  });
});
