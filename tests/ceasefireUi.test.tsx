import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { CeasefirePanel } from '../src/components/CeasefirePanel';
import { SectDiplomacyPanel } from '../src/components/SectDiplomacyPanel';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { isActiveCampaign } from '../src/components/siegeLabels';
import { createInitialWorld } from '../src/data/initialWorld';
import type { SectCeasefire } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.tick = 15;
  const [own, other, foreign, unrelated] = world.sects;
  const viewer = world.cultivators.find(({ sectId }) => sectId === own.id)!;
  const counterpart = world.cultivators.find(({ sectId }) => sectId === other.id)!;
  own.name = '本宗甲'; other.name = '缔约乙'; foreign.name = '外宗私案丙'; unrelated.name = '外宗私案丁';
  viewer.name = '本宗署名人'; counterpart.name = '对方署名人';
  const site = world.locations.find(({ id }) => id === other.headquartersId)!;
  const active: SectCeasefire = { id: 'peace-deal-actual', proposerSectId: own.id, targetSectId: other.id, proposerId: viewer.id,
    targetLeaderId: counterpart.id, openedTick: 10, offerExpiresTick: 13, status: 'active', signedTick: 12, endsTick: 24,
    terms: { duration: 12, bondPerSide: 60, aidAmount: 45, aidPayerSectId: own.id, aidRecipientSectId: other.id },
    escrow: { proposerBond: 60, targetBond: 60, aid: 45 }, withdrawnSiegeIds: ['army-stood-down'] };
  world.ceasefires.agreements = [active, { ...active, id: 'private-foreign-proposal', proposerSectId: foreign.id, targetSectId: unrelated.id,
    status: 'offered', terms: { ...active.terms, aidAmount: 888 } }];
  const army = { id: 'army-stood-down', attackerSectId: own.id, defenderSectId: other.id, destinationId: site.id, participantIds: [viewer.id],
    status: 'withdrawn' as const, startedTick: 9, rounds: 1, lastResolvedTick: 12, outcome: '双方签署后撤军。' };
  world.sieges = [army];
  const markup = () => renderToStaticMarkup(<CeasefirePanel world={world} cultivator={viewer} />);
  return { world, viewer, own, other, army, active, markup };
}

describe('ceasefire, actual settlement, and inactive withdrawal presentation', () => {
  it('shows permitted terms, named parties, and real escrow without inventing a disbursement', () => {
    const { active, markup } = fixture();
    const html = markup();
    expect(html).toContain('本宗甲 ↔ 缔约乙 · 停战生效');
    expect(html).toContain('本宗署名人、对方署名人');
    expect(html).toContain('双方各 60 灵石保证金');
    expect(html).toContain('实际托管保证金：本宗甲 60，缔约乙 60 灵石');
    expect(html).toContain('约定 本宗甲 → 缔约乙 45 灵石');
    expect(html).toContain('当前托管援助 45 灵石 · 尚无已拨付记录');
    expect(html).not.toContain('实际拨付 45');
    expect(html).not.toContain('外宗私案');
    expect(html).not.toContain('888 灵石');
    expect(html).not.toContain('<button');
    active.aidReleasedTick = 15;
    active.escrow.aid = 0;
    expect(markup()).toContain('当前托管援助 0 灵石 · 实际拨付 45 灵石（Tick #15）');
  });

  it('reports a no-fault withdrawal apart from an actual breach and never marks it as a live siege', () => {
    const { world, own, other, viewer, army, active, markup } = fixture();
    active.status = 'breached';
    active.settledTick = 15;
    active.escrow = { proposerBond: 0, targetBond: 0, aid: 0 };
    active.breach = { offenderSectId: other.id, tick: 15, kind: 'hostile_damage', forfeitedBond: 60, eventId: 'internal-proof-id' };
    expect(markup()).toContain('停战撤军 · 1 支');
    expect(markup()).toContain('已撤军（非战败）');
    expect(markup()).toContain('缔约乙 · 已核实的敌对伤害 · Tick #15 · 扣缴违约方保证金 60 灵石');
    expect(markup()).toContain('扣缴款转交本宗甲；违约时恢复敌对，违约方声望下降');
    expect(markup()).not.toContain('internal-proof-id');
    expect(isActiveCampaign(army)).toBe(false);
    const diplomacy = renderToStaticMarkup(<SectDiplomacyPanel sect={own} world={world} />);
    expect(diplomacy).toContain('停战撤军（非战败）');
    expect(diplomacy).toContain('进行中战役 0 场');
    const map = renderToStaticMarkup(<WorldMapCanvas world={world} selectedCultivatorId={viewer.id} onSelectCultivator={() => undefined} />);
    expect(map).not.toContain('参与战役：');
    expect(map).not.toContain('· 围攻中');
  });

  it('appears only in the secondary sect workspace and supports empty affiliation', () => {
    expect(renderToStaticMarkup(<App />)).not.toContain('停战与重建');
    expect(renderToStaticMarkup(<App initialWorkspace="sect" />)).toContain('停战与重建');
    const { world, viewer, markup } = fixture();
    world.ceasefires.agreements = [];
    expect(markup()).toContain('本宗暂无可阅停战协定');
    viewer.sectId = 'wanderer';
    expect(markup()).toContain('散修无本宗协定');
  });
});
