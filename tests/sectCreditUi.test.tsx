import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { SectCreditPanel } from '../src/components/SectCreditPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import type { SectLoan } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.tick = 20;
  const [own, counterparty, outsider, offerTarget] = world.sects;
  own.name = '本宗玩家选中';
  counterparty.name = '同账簿相对方';
  outsider.name = '不可阅外宗报价的第三方';
  const viewer = world.cultivators.find(({ id }) => id === own.leaderId)!;
  viewer.sectId = own.id;
  const loan: SectLoan = {
    id: 'own-signed', lenderSectId: own.id, borrowerSectId: counterparty.id,
    lenderSignerId: viewer.id, borrowerSignerId: counterparty.leaderId!,
    openedTick: 12, offerExpiresTick: 15, status: 'active', principal: 120,
    fundedTick: 13, dueTick: 19, collectionUntilTick: 22, paidTotal: 17, writtenOff: 0,
    receipts: [{ tick: 18, kind: 'voluntary', amount: 12 }, { tick: 19, kind: 'collection', amount: 5 }], lastCollectionTick: 19,
  };
  const offer: SectLoan = {
    id: 'my-offer', lenderSectId: own.id, borrowerSectId: offerTarget.id,
    lenderSignerId: viewer.id, borrowerSignerId: offerTarget.leaderId!,
    openedTick: 19, offerExpiresTick: 22, status: 'offered', principal: 120,
    paidTotal: 0, writtenOff: 0, receipts: [],
  };
  world.credit.loans = [
    loan, offer, { ...offer, id: 'secret-offer-key', lenderSectId: outsider.id, lenderSignerId: outsider.leaderId! },
  ];
  const markup = () => renderToStaticMarkup(<SectCreditPanel world={world} cultivator={viewer} />);
  return { world, own, counterparty, outsider, viewer, loan, offer, markup };
}

describe('sect credit scoped financing display', () => {
  it('separates active principal from observed voluntary/collection payments and unaccepted offers', () => {
    const { markup } = fixture();
    const html = markup();
    expect(html).toContain('利率固定为 0%');
    expect(html).toContain('不计入坊市货款或天道契书押金');
    expect(html).toContain('出借应收本金');
    expect(html).toContain('本宗出借 · 同账簿相对方 · 逾期收取中');
    expect(html).toContain('实放本金：120 灵石 · Tick #13');
    expect(html).toContain('已实际归还：17 灵石 · 未清本金：103 灵石');
    expect(html).toContain('主动归还 12 灵石');
    expect(html).toContain('到期清收 5 灵石');
    expect(html).toContain('本金报价：120 灵石 · 此时点未放款，不记作未清欠款。');
    expect(html).not.toContain('不可阅外宗报价的第三方');
    expect(html).not.toContain('<button');
  });

  it('does not carry charged-off principal as receivable or misreport it as paid; historical data remains independent', () => {
    const { world, viewer, loan, markup } = fixture();
    const previous = structuredClone(world);
    world.tick = 22;
    loan.status = 'defaulted';
    loan.settledTick = 22;
    loan.writtenOff = 103;
    const html = markup();
    expect(html).toContain('逾期清算 · 已核销');
    expect(html).toContain('已实际归还：17 灵石 · 未清本金：0 灵石');
    expect(html).toContain('已核销本金：103 灵石 · 核销并非归还。');
    expect(html).toContain('实际结清／核销：Tick #22');
    const historical = renderToStaticMarkup(<SectCreditPanel world={previous} cultivator={viewer} />);
    expect(historical).toContain('未清本金：103 灵石');
    expect(historical).not.toContain('逾期清算 · 已核销');
  });

  it('labels the exclusive borrowing cooldown and does not describe a temporary blanket lending ban', () => {
    const { world, own, markup } = fixture();
    world.credit.restrictions.push({ sectId: own.id, untilTick: 21 });
    expect(markup()).toContain('本宗暂不得新借款 · 限制于 Tick #21 解除。');
    expect(markup()).toContain('借款限制不等于禁放贷款');
    world.tick = 21;
    expect(markup()).not.toContain('本宗暂不得新借款');
    expect(markup()).toContain('本宗当前无生效中的违约借款限制');
  });

  it('only mounts in the grouped sect workspace; unaffiliated or absent viewers see no ledger', () => {
    const { world, viewer, markup } = fixture();
    expect(renderToStaticMarkup(<App />)).not.toContain('宗门信贷与清算');
    expect(renderToStaticMarkup(<App initialWorkspace="sect" />)).toContain('宗门信贷与清算');
    viewer.sectId = 'wanderer';
    const html = markup();
    expect(html).toContain('散修无本宗信贷账簿');
    expect(html).not.toContain('实放本金');
    expect(renderToStaticMarkup(<SectCreditPanel world={world} />)).not.toContain('同账簿相对方');
  });
});
