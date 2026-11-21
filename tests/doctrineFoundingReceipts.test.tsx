import { renderToStaticMarkup } from 'react-dom/server';
import { SectDoctrinePanel } from '../src/components/SectDoctrinePanel';
import type { DoctrineFoundingMove } from '../src/types/world';
import { foundActor, foundingFixture, foundPayload, foundTurn, preparedDoctrineFounding } from './fixtures/doctrineFoundingNativeFixture';
import { describe, expect, it } from 'vitest';
import { DoctrineFoundingReceipts } from '../src/components/DoctrineFoundingReceipts';
import type { DoctrineFoundingView } from '../src/engine/doctrineFoundingEngine';

const pending: DoctrineFoundingView = {
  id: 'internal-charter-key', role: 'school_member', status: 'proposed', proposedTick: 14, expiresTick: 20,
  independentName: '青云·问心别宗', oldSiteName: '太虚旧坛', founderName: '顾青',
  schoolTreasury: 33, consentCount: 2, joins: [{ tick: 15, own: true }, { tick: 16, withdrawnTick: 17 }],
};

const render = (row?: DoctrineFoundingView) => renderToStaticMarkup(<DoctrineFoundingReceipts rows={row ? [row] : []} />);

describe('scoped doctrine founding receipts', () => {
  it('does not equate separate signatures and the previously autonomous treasury with a new faction', () => {
    const html = render(pending);
    expect(html).toContain('议立中，尚未成宗');
    expect(html).toContain('学舍账面 33 灵石，尚未交割');
    expect(html).toContain('第 15 轮 · 你本人');
    expect(html).toContain('第 17 轮撤回');
    expect(html).toContain('尚无原宗掌门在迁后山门允议的记录');
    expect(html).not.toMatch(/实交|实有 1 人入|<button|internal-charter-key/);
  });

  it('distinguishes the known old site, parent authorization and real endowment, and preserves founder when succeeding', () => {
    const html = render({ ...pending, role: 'independent_member', status: 'established',
      authorizedTick: 18, authorizationSiteName: '寒玉新门', establishedTick: 19, confirmedMemberCount: 3,
      transferredStones: 33, scriptureName: '照心卷', continuity: { tick: 31, successorName: '宋行之' } });
    expect(html).toContain('发起人：顾青');
    expect(html).toContain('立宗所据原宗旧址：太虚旧坛');
    expect(html).toContain('迁后的山门（寒玉新门）');
    expect(html).toContain('实有 3 人入别宗');
    expect(html).toContain('学舍公库实交 33 灵石');
    expect(html).toContain('《照心卷》');
    expect(html).toContain('未划转原宗公库、旧宗器物或旧债');
    expect(html).toContain('掌门：宋行之');
    expect(html).not.toMatch(/internal-charter-key|尚未交割|<button/);
  });

  it('has no empty extra section or fabricated authority for a cancelled charter', () => {
    expect(render()).toBe('');
    const html = render({ ...pending, status: 'invalidated', founderName: undefined, joins: undefined });
    expect(html).toContain('条件已变，未成宗');
    expect(html).not.toMatch(/顾青|实交|岂知|<button/);
  });
});

it('keeps the archived old school distinct after actual independent actions and scopes the same record to named roles', () => {
  const prep = preparedDoctrineFounding();
  const f = foundingFixture;
  let world = foundTurn(prep.world, { [f.authorId]: foundPayload('DOCTRINE_FOUNDING', {
    doctrineFoundingMove: 'propose', targetDoctrineSchoolId: prep.schoolId, targetRelocationId: prep.relocationId,
  }) });
  const actual = world.doctrineFoundings.foundings[0];
  expect(actual.status).toBe('proposed');
  const see = (actorId: string) => renderToStaticMarkup(<SectDoctrinePanel world={world} cultivator={foundActor(world, actorId)} />);
  expect(see(f.authorId)).toContain('议立中，尚未成宗');
  expect(see(prep.stayedId)).not.toContain('别宗立宗实录');
  const act = (doctrineFoundingMove: DoctrineFoundingMove) => foundPayload('DOCTRINE_FOUNDING', {
    doctrineFoundingMove, targetDoctrineFoundingId: actual.id,
  });
  world = foundTurn(world, {
    [f.leaderId]: act('authorize'),
    ...Object.fromEntries(f.members.filter(id => id !== f.authorId).map(id => [id, act('join')])),
  });
  expect(world.doctrineFoundings.foundings[0].status).toBe('proposed');
  expect(see(f.leaderId)).toContain('原宗迁后的山门');
  expect(see(f.members[1])).toContain('你本人');
  world = foundTurn(world, { [f.authorId]: act('establish') });
  expect(world.doctrineFoundings.foundings[0].status).toBe('established');
  expect(see(f.authorId)).toContain('别宗已立');
  expect(see(f.leaderId)).toContain('已另立宗门');
  expect(see(f.leaderId)).not.toContain('自治学舍有独立公库');
  expect(see(f.authorId)).not.toContain(actual.id);
  expect(see(prep.stayedId)).not.toContain('别宗立宗实录');
});
