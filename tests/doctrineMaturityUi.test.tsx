import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DoctrineMaturityView } from '../src/engine/doctrineMaturityEngine';
import { DoctrineMaturityConfirmation, DoctrineMaturityControls, type DoctrineMaturityChoice } from '../src/components/DoctrineMaturityControls';
import { DoctrineMaturityReceipt } from '../src/components/DoctrineMaturityReceipt';

const render = (view?: DoctrineMaturityView) => renderToStaticMarkup(<DoctrineMaturityReceipt view={view} />);
const proposed = {openedTick: 23, expiresTick: 29, status: 'offered' as const, memberCount: 4, memberConsents: 3,
  receivingLeaderSigned: true, agreedStones: 44};

describe('maturity in existing founding receipt', () => {
  it('reads actual historical severe months separately from present local recovery', () => {
    const html = render({status: 'past_support', support: {kind: 'sustained_hazard', observedTick: 21},
      lastObservation: {consecutiveSevereMonths: 0, observedTick: 28, recoveredFromHazard: true}});
    expect(html).toContain('第 21 轮记实：山门连续三个月遭严重灾势。');
    expect(html).toContain('第 28 轮未再记录同等严重灾势');
    expect(html).toContain('现不能仅按这条旧录发起并宗');
    expect(html).not.toMatch(/山门已全然恢复|正在持续严重|<button/);
  });

  it('separates independent signatures, subsequent actual settlement and dispersed history', () => {
    const draft = render({status: 'offered', offer: proposed});
    expect(draft).toContain('实记同意 3/4');
    expect(draft).toContain('接纳方掌门已另行同意');
    expect(draft).toContain('拟交割 44 灵石');
    expect(draft).not.toMatch(/实交 44|人改宗籍/);
    const closed = render({status: 'past_support', offer: {...proposed, status: 'declined'}});
    expect(closed).toContain('筹议已止');
    expect(closed).not.toMatch(/届期|拟交割/);
    const merged = render({status: 'merged', offer: {...proposed, status: 'merged'}, settlement: {
      kind: 'merged', tick: 27, memberCount: 4, transferredStones: 44, retainedStones: 5, scriptureAlreadyHeld: true,
    }});
    expect(merged).toContain('4 人改宗籍，未因此迁人');
    expect(merged).toContain('实交 44 灵石；原册保留 5 灵石');
    expect(merged).toContain('已有同一传承抄本，未重复增加');
    const dispersed = render({status: 'dispersed', settlement: {kind: 'dispersed', tick: 28, memberCount: 0,
      transferredStones: 0, retainedStones: 44}});
    expect(dispersed).toContain('已无在世同门，宗门散亡');
    expect(dispersed).toContain('无受领方，未交出库银');
    expect(dispersed).toContain('原册');
    expect(dispersed).not.toContain('实际并宗');
    expect(render()).toBe('');
  });
});

describe('maturity choices are only native and explicit', () => {
  const offer = {option: { action:'DOCTRINE_MATURITY', doctrineMaturityMove:'offer_merge', targetDoctrineFoundingId:'private-founding-id'},
    label: '已知别宗', proof: {kind:'title_lost', observedTick: 17}} satisfies DoctrineMaturityChoice;
  const onQueue = vi.fn(() => false);

  it('does not expose an illegal choice or a raw key and never autoqueues', () => {
    const control = (choices:readonly DoctrineMaturityChoice[]) =>
      renderToStaticMarkup(<DoctrineMaturityControls scopeKey="private-scope" choices={choices} onQueue={onQueue} />);
    expect(control([])).toBe('');
    expect(control([offer, offer])).toBe('');
    const html = control([offer]);
    expect(html).toContain('value="" selected="">请选择');
    expect(html).toContain('value="0">提出自愿并宗 · 已知别宗');
    expect(html).not.toMatch(/private-|确认排入|已签定/);
    expect(onQueue).not.toHaveBeenCalled();
  });

  it('requires confirmation, names only the authorized cause and states payment vs actual execution', () => {
    const html = renderToStaticMarkup(<DoctrineMaturityConfirmation choice={offer} onConfirm={() => {}} onCancel={() => {}}/>);
    expect(html).toContain('第 17 轮实记失去在册地权');
    expect(html).toContain('成功排入消耗 5 神识，不推进月份');
    expect(html).toContain('排入指令本身不算签字，也不算并宗');
    expect(html).not.toMatch(/private-|连续三个月的严重灾势/);
  });
});
