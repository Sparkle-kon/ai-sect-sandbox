import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkshopPanel } from '../src/components/WorkshopPanel';
import { resolveToolLoanAction } from '../src/engine/toolLoanEngine';
import type { WorldState } from '../src/types/world';
import { acceptedToolLoan, offeredToolLoan, toolChoice, toolJob, toolPerson, toolTurn, usedToolLoan } from './fixtures/toolLoanFixture';

const html = (world: WorldState, viewer: string) =>
  renderToStaticMarkup(<WorkshopPanel world={world} cultivator={toolPerson(world, viewer)} />);

describe('one private actual work tool inside the existing workshop fold', () => {
  it('distinguishes pending and accepted custody, preserves authorization, and never shows a borrower loadout item', () => {
    const f = offeredToolLoan();
    const pending = html(f.world, f.lenderId);
    const { artifactName, initialDurability } = f.world.toolLoans.loans[0];
    expect(pending).toMatch(/<details class="[^"]+"><summary class="[^"]+">工坊委制与品质交割/);
    expect(pending).toContain('共器借用与磨损交割');
    expect(pending).toContain(artifactName + ' · 本人出借 · 邀约待同意，原件未转出');
    expect(pending).not.toContain('实磨');
    expect(pending).not.toContain('<button');
    expect(html(f.world, f.outsiderId)).toBe('');
    for (const secret of [f.id, f.artifactId, f.workshopId, f.lenderId, f.borrowerId]) expect(pending).not.toContain(secret);

    const a = acceptedToolLoan();
    const accepted = html(a.world, a.borrowerId);
    expect(accepted).toContain('本人借用 · 已同意，原件由工坊保管');
    expect(accepted).toContain('借用不转移所有权，不进入借用人的随身装备');
    expect(accepted).toContain('借出前耐久 ' + initialDurability);
    expect(accepted).not.toContain('实磨');
    expect(toolPerson(a.world, a.borrowerId).artifacts.some(({ id }) => id === a.artifactId)).toBe(false);
    const onlyToolHistory = structuredClone(a.world);
    onlyToolHistory.workshops.orders = [];
    expect(html(onlyToolHistory, a.lenderId)).toContain('共器借用与磨损交割');
    expect(html(onlyToolHistory, a.lenderId)).not.toContain('本角色可查的工坊委制');
  });

  it('shows actual native finish scores and wear and does not imply the pending original was returned', () => {
    const f = usedToolLoan();
    const use = toolJob(f.world, f.workshopId).work.at(-1)!;
    const record = f.world.toolLoans.loans[0];
    const actual = html(f.world, f.lenderId);
    expect(actual).toContain('借用已结束，原件仍待领取');
    expect(actual).toContain('借用已停，器物等候交还');
    expect(actual).not.toContain('原物主已领回');
    expect(actual).toContain('对应工坊委制已结束');
    expect(actual).toContain(`耐久 ${record.wear!.durabilityBefore} → ${record.wear!.durabilityAfter}，实磨 2 点`);
    expect(actual).toContain(`名义评分 +2；实测 ${use.toolUse!.baseScore} → ${use.qualityScore}，实际增加 ${use.qualityScore! - use.toolUse!.baseScore} 分`);

    const onlyLoan = structuredClone(f.world);
    onlyLoan.workshops.orders = onlyLoan.workshops.orders.filter(({ id }) => id !== f.workshopId);
    const retained = html(onlyLoan, f.lenderId);
    expect(retained).toContain('实磨 2 点');
    expect(retained).toContain('未见可核对的实际评分增幅');
    expect(retained).not.toContain('实际增加');
  });

  it('renders confirmed physical original return and probate as separate end conditions', () => {
    const f = usedToolLoan();
    const original = f.world.toolLoans.loans[0].custody!;
    const future = structuredClone(f.world);
    f.world.tick++;
    const lender = toolPerson(f.world, f.lenderId);
    expect(resolveToolLoanAction(f.world, lender, toolChoice('reclaim', f.id))).not.toBeNull();
    expect(lender.artifacts.find(({ id }) => id === f.artifactId)).toBe(original);
    expect(html(f.world, f.lenderId)).toContain('由原物主现场领回同一原件；不代表如今仍持有');
    expect(html(f.world, f.lenderId)).not.toContain('原件仍待领取');

    const deceased = toolPerson(future, f.lenderId);
    deceased.alive = false;
    deceased.hp = 0;
    const probate = toolTurn(future);
    expect(probate.estates.entries.find(({ deceasedId }) => deceasedId === f.lenderId)?.holdings.artifacts
      .some(({ id }) => id === f.artifactId)).toBe(true);
    const recorded = html(probate, f.borrowerId);
    expect(recorded).toContain('同一原件已交原物主遗产流程');
    expect(recorded).toContain('不记作归还或借用人所得');
    expect(recorded).not.toContain('原物主已领回');
  });
});
