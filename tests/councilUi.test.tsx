import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SectCouncilModal } from '../src/components/SectCouncilModal';
import { SectDiplomacyPanel } from '../src/components/SectDiplomacyPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import type { CouncilRecord } from '../src/types/world';

const ignore = () => undefined;

function createCouncilFixture() {
  const world = createInitialWorld();
  const [sect] = world.sects;
  const [elder, second, third, recipient] = world.cultivators;
  world.tick = 10;
  sect.leaderId = elder.id;
  for (const actor of [elder, second, third, recipient]) {
    actor.sectId = sect.id;
    actor.locationId = sect.headquartersId;
    actor.transgressions = 0;
    actor.pills.foundation = 0;
  }
  elder.sectRank = '掌门';
  second.sectRank = '太上长老';
  third.sectRank = '长老';
  recipient.sectRank = '内门弟子';
  recipient.realm = '练气';
  recipient.pillToxicity = 0;
  elder.pills.foundation = 1;
  const record: CouncilRecord = {
    id: 'prior-council', tick: 9, sectId: sect.id, proposal: { kind: 'allocate_pill', donorId: elder.id, targetCultivatorId: recipient.id },
    voterIds: [elder.id, second.id, third.id], title: '旧丹药议案', summary: '上月的议程',
    rounds: [
      { round: 1, turns: [{ voterId: elder.id, text: '<首轮>先论功劳', source: 'utility' }] },
      { round: 2, turns: [{ voterId: second.id, text: '我认为照此办理', source: 'llm' }] },
    ],
    ballots: [
      { voterId: elder.id, vote: 'support', reason: '贡献已核对', source: 'utility' },
      { voterId: second.id, vote: 'support', reason: '符合用途', source: 'llm' },
      { voterId: third.id, vote: 'abstain', reason: '证据不足', source: 'utility' },
    ],
    tally: { support: 2, oppose: 0, abstain: 1, required: 2 }, status: 'passed', outcome: '筑基丹已移交。',
  };
  world.councils = [record];
  const modal = (open: boolean, busy: boolean, notice?: string) => renderToStaticMarkup(
    <SectCouncilModal world={world} open={open} busy={busy} notice={notice} onClose={ignore} onConvene={ignore} />
  );
  return { world, sect, elder, recipient, modal };
}

describe('sect council presentation', () => {
  it('shows the real available proposals, eligible people, and a manual submit control', () => {
    const { recipient, elder, modal } = createCouncilFixture();
    expect(modal(false, false)).toBe('');
    const markup = modal(true, false);
    expect(markup).toContain('<dialog aria-labelledby=');
    expect(markup).toContain('aria-label="关闭长老议事厅"');
    expect(markup).toContain(`是否拨给${recipient.name}筑基丹`);
    expect(markup).toContain(elder.name);
    expect(markup).toContain('召开并表决');
    expect(markup).not.toContain('<button type="submit" disabled=""');
  });

  it('shares saved outcomes across diplomacy and council views, escaping all generated lines', () => {
    const { world, sect, modal } = createCouncilFixture();
    const markup = modal(true, true, '场景已变，旧结果没有写入。');
    expect(markup).toContain('议事处理中…');
    expect(markup).toContain('<button type="submit" disabled=""');
    expect(markup).toContain('旧丹药议案 · 已通过并执行 · Tick #9');
    expect(markup).toContain('第 1 轮议事');
    expect(markup).toContain('第 2 轮议事');
    expect(markup).toContain('&lt;首轮&gt;先论功劳');
    expect(markup).toContain('赞成 2 · 反对 0 · 弃权 1 · 通过需 2 票');
    expect(markup).toContain('模型：符合用途');
    expect(markup).toContain('结果：筑基丹已移交。');
    expect(markup).toContain('场景已变，旧结果没有写入。');
    const diplomacy = renderToStaticMarkup(<SectDiplomacyPanel sect={sect} world={world} />);
    expect(diplomacy).toContain('最近议事：旧丹药议案 · 已通过并执行');
  });

  it('does not permit submission without a valid agenda', () => {
    const { world, modal } = createCouncilFixture();
    for (const actor of world.cultivators) actor.alive = false;
    world.councils = [];
    const markup = modal(true, false);
    expect(markup).toContain('当前无可召开议案');
    expect(markup).toContain('<button type="submit" disabled=""');
    expect(markup).toContain('尚无议事记录。');
  });
});
