import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { AgentInspector } from '../src/components/AgentInspector';
import { ProbationPanel } from '../src/components/ProbationPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import type { ProbationCase } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.tick = 15;
  const sect = world.sects[0];
  const sponsor = world.cultivators.find(({ id }) => id === sect.leaderId)!;
  const outsider = world.cultivators.find(({ sectId }) => sectId === world.sects[1].id)!;
  const applicant = world.cultivators.filter(({ sectId }) => sectId === sect.id).at(-1)!;
  const reviewer = world.cultivators.find(({ id, sectId }) => id !== sponsor.id && id !== applicant.id && sectId === sect.id)!;
  const [first, second] = world.settlements.villages;
  const [market, secondMarket] = world.locations.filter(({ type }) => type === 'market');
  first.locationId = market.id; second.locationId = secondMarket.id;
  first.name = '实际受惠甲村'; second.name = '实际受惠乙村';
  applicant.name = '本人愿意见习';
  sponsor.name = '实际担保者';
  reviewer.name = '独立核验官';
  applicant.locationId = market.id;
  applicant.sectId = 'wanderer';
  applicant.transgressions = 3;
  reviewer.sectRank = '长老';
  reviewer.locationId = sect.headquartersId;
  const anchor = { id: 'council-actual-exclusion-id', actorId: applicant.id, sectId: sect.id, tick: 9, transgressions: 3, disciplineRevision: 1 };
  world.probation.expulsions = [anchor];
  const entry: ProbationCase = {
    id: 'actual-case', expulsionId: anchor.id, actorId: applicant.id, sectId: sect.id, villageIds: [first.id, second.id],
    disciplineRevision: 1, status: 'requested', requestedTick: 12, requestExpiresTick: 16, relief: [], reviews: [],
  };
  world.probation.cases = [entry];
  const html = (actor = applicant) => renderToStaticMarkup(<ProbationPanel world={world} cultivator={actor} />);
  return { world, sect, applicant, sponsor, reviewer, outsider, first, second, entry, html };
}

describe('actual restorative probation with a separate voluntary decision', () => {
  it('shows only original personal sanction before a petition and one closed profile fold', () => {
    const { world, applicant, outsider, html } = fixture();
    world.probation.cases = [];
    const inspection = renderToStaticMarkup(<AgentInspector world={world} cultivator={applicant} workspaceSection="profile" onSelectCultivator={() => {}} />);
    expect(inspection).toMatch(/<details class="[^"]+"><summary class="[^"]+">赎责见习与宗籍复核/);
    expect(html()).toContain('原议会除名：');
    expect(html()).toContain('Tick #9 · 当时违纪 3 次');
    expect(html()).toContain('尚无可查的自愿见习申请');
    expect(html(outsider)).toBe('');
    expect(renderToStaticMarkup(<App />)).not.toContain('赎责见习与宗籍复核');
  });

  it('displays verified distinct service and independent review without claiming consent or revealing other claims', () => {
    const { world, applicant, sponsor, reviewer, first, second, outsider, entry, html } = fixture();
    expect(html()).toContain('本人已申请，等待宗门接纳');
    expect(html()).toContain('尚无宗门同意接纳的凭证');
    expect(html()).toContain('实际赈济：0/2');
    world.tick = 22;
    entry.status = 'active'; entry.sponsorId = sponsor.id; entry.admittedTick = 14; entry.deadlineTick = 26;
    entry.relief = [
      { sourceId: 'actual-1', actorId: applicant.id, settlementId: first.id, tick: 16, stones: 12, herbs: 2 },
      { sourceId: 'duplicate-same-site-not-distinct', actorId: applicant.id, settlementId: first.id, tick: 17, stones: 12, herbs: 2 },
    ];
    expect(html()).toContain('见习实际接纳 Tick #14 · 担保人 实际担保者');
    expect(html()).toContain('实际赈济：1/2');
    entry.relief[1] = { sourceId: 'actual-2', actorId: applicant.id, settlementId: second.id, tick: 19, stones: 12, herbs: 2 };
    entry.reviews = [{ reviewerId: reviewer.id, tick: 20, vote: 'support' }];
    expect(html()).toContain('实际赈济：2/2');
    expect(html()).toContain('Tick #19 · 实际受惠乙村 · 实付 12 灵石、翡翠灵叶 2 株');
    expect(html()).toContain('独立核验官 · 支持复籍');
    expect(html()).not.toContain('已由本人确认复籍');
    expect(html(outsider)).toBe('');
  });

  it('retains immutable discipline after actual final confirmation and keeps older branch eligible-but-unconfirmed', () => {
    const { world, sect, entry, applicant, sponsor, reviewer, first, second, html } = fixture();
    const secondReviewer = world.cultivators.find(({ id, sectId }) =>
      sectId === sect.id && id !== sponsor.id && id !== reviewer.id)!;
    world.tick = 22;
    entry.status = 'ready'; entry.sponsorId = sponsor.id; entry.admittedTick = 14; entry.deadlineTick = 26;
    entry.relief = [
      { sourceId: 'confirmed-a', actorId: applicant.id, settlementId: first.id, tick: 16, stones: 12, herbs: 2 },
      { sourceId: 'confirmed-b', actorId: applicant.id, settlementId: second.id, tick: 18, stones: 12, herbs: 2 },
    ];
    entry.reviews = [{ reviewerId: reviewer.id, tick: 20, vote: 'support' }, { reviewerId: secondReviewer.id, tick: 21, vote: 'support' }];
    expect(html()).toContain('复核通过，仍待本人确认');
    const frozen = structuredClone(world);
    world.tick = 23;
    entry.status = 'reinstated'; entry.settledTick = world.tick;
    applicant.sectId = sect.id;
    world.probation.expulsions[0].reinstatedTick = world.tick;
    expect(html()).toContain('已由本人确认复籍');
    expect(html()).toContain('本人最终确认 Tick #23');
    expect(html()).toContain('当时违纪 3 次 · 本人复籍 Tick #23，原处分不改');
    const before = renderToStaticMarkup(<ProbationPanel world={frozen} cultivator={frozen.cultivators.find(({ id }) => id === applicant.id)!} />);
    expect(before).toContain('复核通过，仍待本人确认');
    expect(before).not.toContain('本人最终确认 Tick #23');
  });
});
