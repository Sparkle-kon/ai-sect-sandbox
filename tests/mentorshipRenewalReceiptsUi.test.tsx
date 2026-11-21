import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MentorshipRenewalReceipts } from '../src/components/MentorshipRenewalReceipts';
import type { projectMentorTransfers } from '../src/engine/mentorTransferEngine';

type View = ReturnType<typeof projectMentorTransfers>;
const student = 'marked-student';
const release = { id: 'private-release', studentId: student, oldMentorId: 'private-old-teacher',
  sourceTuitionId: 'private-native-tuition', techniqueId: 'private-technique', formedTick: 5, lastLessonTick: 7,
  endedTick: 8, endedById: student } satisfies View['releases'][number];
const invitation = { id: 'private-transfer', releaseId: release.id, studentId: student, newMentorId: 'private-new-teacher',
  techniqueId: release.techniqueId, sectId: 'private-sect', siteId: 'private-location', offeredTick: 9, expiresTick: 12,
  status: 'offered' } satisfies View['transfers'][number];
const render = (view: View, viewerId = student) => renderToStaticMarkup(<MentorshipRenewalReceipts view={view} viewerId={viewerId} />);

describe('scoped existing mentorship renewal fold', () => {
  it('prints only history and a pending invitation, never internal IDs or a lesson balance', () => {
    const html = render({ releases: [release], transfers: [invitation] });
    expect(html.match(/<details\b/g)).toHaveLength(1);
    expect(html).not.toMatch(/<details[^>]*\bopen(?:\s|=|>)/);
    expect(html).toContain('续结师承');
    expect(html).toContain('旧约已结 · 本人曾从师');
    expect(html).toContain('本人提出结束旧约');
    expect(html).toContain('结束 Tick #8');
    expect(html).toContain('新约待应允');
    expect(html).not.toMatch(/熟练度|实耗|private-|marked-student|<button/);
  });

  it('keeps active appointment and attendance separate from the actual later lesson receipt', () => {
    const accepted = { ...invitation, status: 'accepted', acceptTick: 10, periodTick: 11, attendTick: 11 } as const;
    const before = render({ releases: [], transfers: [accepted] }, invitation.newMentorId);
    expect(before).toContain('本人为续授师 · 已应新约，未成实授');
    expect(before).toContain('约定课期 Tick #11');
    expect(before).toContain('已有到场登记');
    expect(before).not.toContain('实耗');
    const held = render({ releases: [], transfers: [{ ...accepted, status: 'held', teachTick: 11, closedTick: 11,
      lesson: { tick: 11, masteryBefore: 40, masteryAfter: 41, instructionSpent: 1 } }] });
    expect(held).toContain('实授已记');
    expect(held).toContain('熟练度 40 → 41 · 实耗 1 次授艺机会');
    expect(held).not.toContain('未成实授');
  });

  it('does not create a fold for an empty outsider projection', () => {
    expect(render({ releases: [], transfers: [] })).toBe('');
  });
});
