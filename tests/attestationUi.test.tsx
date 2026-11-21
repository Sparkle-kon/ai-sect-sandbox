import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AttestationPanel } from '../src/components/AttestationPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import type { Cultivator, WorldState } from '../src/types/world';

type Claim = WorldState['witnesses']['claims'][number];
const SUBJECT = '获知的比斗修士';
const HIDDEN_SUBJECT = '不可见案卷中的修士';

function fixture() {
  const world = createInitialWorld();
  world.tick = 8;
  const [viewer, claimant, subject, first, second, hiddenSubject, outsider, unrecordedWitness] = world.cultivators;
  viewer.name = '所选修士';
  claimant.name = '原呈报者';
  subject.name = SUBJECT;
  first.name = '第一位亲历者';
  second.name = '第二位亲历者';
  hiddenSubject.name = HIDDEN_SUBJECT;
  outsider.locationId = world.locations.find(({ id }) => id !== viewer.locationId)!.id;
  subject.locationId = viewer.locationId;
  unrecordedWitness.name = '尚未出面的现场目击者';
  const claim: Claim = {
    id: 'visible-claim', sourceEventId: 'original-source', publicationEventId: 'public-notice',
    claimantId: claimant.id, subjectId: subject.id, locationId: viewer.locationId, filedTick: 4,
    deadlineTick: 12, challengeUntilTick: 9, status: 'disputed',
    attestations: [
      { actorId: claimant.id, tick: 4, verdict: 'supports' },
      { actorId: first.id, tick: 5, verdict: 'supports' },
      { actorId: first.id, tick: 6, verdict: 'supports' },
      { actorId: second.id, tick: 6, verdict: 'contradicts' },
    ],
    reputationPenalty: 3, reputationRestored: 0, reason: '不展示的内部原文',
  };
  const hidden: Claim = { ...claim, id: 'hidden-claim', sourceEventId: 'private-source', publicationEventId: 'private-evt', subjectId: hiddenSubject.id };
  world.witnesses.claims.push(claim, hidden);
  world.witnesses.facts.push({ eventId: claim.sourceEventId, tick: 3, locationId: viewer.locationId,
    participantIds: [subject.id, claimant.id], winnerId: subject.id, witnessIds: [first.id, second.id, unrecordedWitness.id] });
  const record = (id: string, actorIds: string[]) => ({
    id, tick: 4, year: world.year, month: world.month, title: '不转录的内部原文', description: '不应呈现的细节',
    category: 'intrigue' as const, actorIds, locationId: viewer.locationId,
  });
  world.events.push(record(claim.publicationEventId, [claimant.id, subject.id]),
    { ...record(hidden.publicationEventId, [hiddenSubject.id]), witnessScope: 'participants' });
  viewer.rumors = [{ id: 'heard-report', originEventId: claim.publicationEventId, subject: '不转录传话原文', originTick: 4,
    learnedTick: 6, provenance: 'conversation', confidence: 67, hops: 2, sourceCultivatorId: first.id }];
  const markup = (actor: Cultivator | undefined = viewer) => renderToStaticMarkup(<AttestationPanel world={world} cultivator={actor} />);
  return { world, viewer, subject, outsider, claim, markup };
}

describe('attestations from the selected NPC perspective', () => {
  it('shows disputed claim and counts unique first-hand testimony instead of repeated or original reporting', () => {
    const { markup } = fixture();
    const html = markup();
    expect(html).toContain('有争议');
    expect(html).toContain(SUBJECT);
    expect(html).toContain('原呈报者');
    expect(html).toContain('独立亲历证词 · 2 份');
    expect(html).toMatch(/支持 1 · 反驳 1/);
    expect(html.match(/第一位亲历者/g)).toHaveLength(1);
    expect(html).toContain('第二位亲历者：反驳呈报');
    expect(html).toContain('当面转述获知呈报，转手 2 次');
    expect(html).not.toContain('不转录传话原文');
    expect(html).not.toContain('尚未出面的现场目击者');
  });

  it('shows bounded appeals, actual dispositions, and reputation restoration instead of private factual truth', () => {
    const { claim, subject, markup, world } = fixture();
    expect(markup(subject)).toContain('所选修士可在期限内提交申诉');
    world.tick = claim.challengeUntilTick;
    expect(markup(subject)).not.toContain('所选修士可在期限内提交申诉');
    world.tick = 8;
    claim.status = 'corroborated';
    expect(markup()).toContain('已获佐证');
    claim.status = 'retracted';
    claim.appeal = { tick: 8, actorId: subject.id, verdict: 'upheld', reason: '仅引擎读取的秘密案情' };
    claim.reputationRestored = 2;
    claim.settledTick = 8;
    const html = markup();
    expect(html).toContain('申诉期限 Tick #9');
    expect(html).toContain('申诉成立');
    expect(html).toContain('已撤回');
    expect(html).toContain('名誉扣减 3 · 实际恢复 2');
    expect(html).not.toContain('仅引擎读取的秘密案情');
    expect(html).not.toContain('不展示的内部原文');
  });

  it('does not show unrelated private cases or other actors’ cases in an empty perspective', () => {
    const { markup, outsider, viewer, world } = fixture();
    outsider.rumors = [...viewer.rumors];
    expect(markup()).not.toContain(HIDDEN_SUBJECT);
    expect(markup(outsider)).not.toContain(SUBJECT);
    viewer.alive = false;
    expect(markup()).not.toContain(SUBJECT);
    expect(renderToStaticMarkup(<AttestationPanel world={world} cultivator={undefined} />)).toContain('不显示全局案卷');
  });
});
