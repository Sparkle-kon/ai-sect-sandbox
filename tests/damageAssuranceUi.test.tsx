import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FurnaceReservationPanel } from '../src/components/FurnaceReservationPanel';
import { advanceDamageAssurance } from '../src/engine/damageAssuranceEngine';
import type { WorldState } from '../src/types/world';
import {
  applyNativeAssuranceSafety, assuranceChoice, assurancePerson, assuranceTurn, damagedAssuranceFacility,
  nativeSafetyChoice, paidDamageAssurance, sealedDamageAssurance,
} from './fixtures/damageAssuranceFixture';

const html = (world: WorldState, actorId: string) =>
  renderToStaticMarkup(<FurnaceReservationPanel world={world} cultivator={assurancePerson(world, actorId)} />);

describe('private furnace damage repair receipts in the existing furnace fold', () => {
  it('shows original verified initial condition but neither pays at sealing nor discloses to the ordinary observer', () => {
    const damage = damagedAssuranceFacility();
    expect(html(damage.world, damage.actorId)).not.toContain('炉损核验与实修');
    const f = sealedDamageAssurance();
    const claim = f.world.damageAssurance.claims[0];
    const sealed = html(f.world, f.actorId);
    expect(sealed).toMatch(/<details class="[^"]+"><summary class="[^"]+">同刻炉位与预约/);
    expect(sealed).toContain('炉损初记，后修另录');
    expect(sealed).toContain('核验账仍开放 · 原损 40 点');
    expect(sealed).toContain(`第 ${claim.damagedTick} 轮炉体完好度 100 → 60`);
    expect(sealed).toContain(`第 ${claim.inspectionTick} 轮查验，第 ${claim.sealedTick} 轮封存初记`);
    expect(sealed).toContain('实修入账 +0 点，补偿账尚缺 40 点');
    expect(sealed).toContain('尚无计入本案的实修凭据');
    expect(sealed).not.toContain('这次实际耗用');
    expect(sealed).not.toContain('<button');
    for (const sensitive of [f.claimId, f.caseId, claim.hazardId, f.actorId, claim.inspectorId]) expect(sealed).not.toContain(sensitive);
    expect(html(f.world, f.outsiderId)).not.toContain('炉损核验与实修');
  });

  it('records one real +30 with actual parts, retains the remaining 10 after genuine reopening, and keeps native work independent', () => {
    const f = paidDamageAssurance();
    const separate = paidDamageAssurance();
    const paid = html(f.world, f.actorId);
    expect(paid).toContain('实修入账 +30 点，补偿账尚缺 10 点');
    expect(paid).toContain('本人实修 +30 点');
    expect(paid).toContain('完好度 60 → 90，本账计入 30 点');
    expect(paid).toContain('这次实际耗用 8 灵石、玄土根 2 株');
    expect(paid.match(/这次实际耗用/g)).toHaveLength(1);
    expect(paid).toContain('炉点停用，本回合不分配炉位');
    expect(paid).not.toContain('已走原炉务流程签署复炉');

    f.world.tick++;
    expect(applyNativeAssuranceSafety(f.world, f.actorId, f.caseId, 'reopen')).not.toBeNull();
    advanceDamageAssurance(f.world);
    const reopening = html(f.world, f.actorId);
    expect(reopening).toContain('已走原炉务流程签署复炉');
    expect(reopening).toContain('已签署复炉，本回合仍停用');
    expect(reopening).toContain('补偿账尚缺 10 点');
    expect(html(separate.world, separate.actorId)).not.toContain('已走原炉务流程签署复炉');

    const initial = sealedDamageAssurance();
    const nativeOnly = assuranceTurn(initial.world, { [initial.actorId]: nativeSafetyChoice('repair', initial.caseId) });
    const distinct = html(nativeOnly, initial.actorId);
    expect(distinct).toContain('补偿账尚缺 40 点');
    expect(distinct).toContain('现场炉体距受损前尚差 10 点');
    expect(distinct).not.toContain('这次实际耗用');
  });

  it('keeps former participants’ history without remote live integrity and never opens a fully credited case', () => {
    const f = paidDamageAssurance(3);
    const filled = assuranceTurn(f.world, { [f.actorId]: assuranceChoice('make_good', f.claimId) });
    const enough = html(filled, f.actorId);
    expect(enough).toContain('原损的补偿账已补足 · 原损 50 点');
    expect(enough).toContain('实修入账 +50 点，补偿账尚缺 0 点');
    expect(enough).toContain('本账计入 20 点');
    expect(enough.match(/这次实际耗用/g)).toHaveLength(2);
    expect(enough).toContain('炉点停用');
    expect(enough).not.toContain('已走原炉务流程签署复炉');

    const actor = assurancePerson(filled, f.actorId);
    actor.locationId = 'loc-market';
    const differentFurnace = html(filled, f.actorId);
    expect(differentFurnace).toContain('当前可查炉点');
    expect(differentFurnace).not.toContain('现场炉体距受损前');
    actor.locationId = filled.locations.find(({ furnaceGrade }) => furnaceGrade === 0)!.id;
    const away = html(filled, f.actorId);
    expect(away).toContain('仅显示已获准查阅的历史凭据');
    expect(away).toContain('补偿账尚缺 0 点');
    expect(away).not.toContain('现场炉体距受损前');
    expect(away).not.toContain('当前可查炉点');
  });
});
