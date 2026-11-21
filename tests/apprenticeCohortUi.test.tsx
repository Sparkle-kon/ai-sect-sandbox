import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ApprenticeCohortPanel } from '../src/components/ApprenticeCohortPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import type { ApprenticeCohort, ApprenticeCohortSeat } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(78);
  world.tick = 20;
  const [mentor, pupil, otherPupil, outsider] = world.cultivators;
  const sect = world.sects.find(({ id }) => id === mentor.sectId)!;
  const site = world.locations.find(({ id }) => id === sect.headquartersId)!;
  mentor.locationId = pupil.locationId = otherPupil.locationId = outsider.locationId = site.id;
  pupil.sectId = otherPupil.sectId = mentor.sectId;
  otherPupil.name = '此学徒姓名不应外漏';
  const own: ApprenticeCohortSeat = { studentId: pupil.id, status: 'invited' };
  const peer: ApprenticeCohortSeat = { studentId: otherPupil.id, status: 'invited' };
  const cohort: ApprenticeCohort = {
    id: 'hidden-cohort-id', mentorId: mentor.id, sectId: mentor.sectId, siteId: site.id,
    techniqueId: 'hidden-curriculum-id', openedTick: 20, lessonTick: 22, status: 'offered', seats: [own, peer],
  };
  world.apprenticeCohorts = { cohorts: [cohort], graduations: [], nextId: 2 };
  const html = (actor = pupil) => renderToStaticMarkup(<ApprenticeCohortPanel world={world} cultivator={actor} />);
  return { world, mentor, pupil, otherPupil, outsider, own, peer, cohort, html };
}


describe('actual apprenticeship cohorts and independent graduation', () => {
  it('keeps only own pupil seat or mentor-scoped seats, with no world population cap and no peer names', () => {
    const { world, mentor, outsider, own, html } = fixture();
    const offer = html();
    expect(offer).toMatch(/<details class="[^"]+"><summary class="[^"]+">合班学徒与实绩出师/);
    expect(offer).toContain('每班至多 4 席，只限本班，不限制世界人数');
    expect(offer).toContain('开班邀约 Tick #20 · 约定课期 Tick #22');
    expect(offer).toContain('本人席位 · 邀约待应允');
    expect(offer).not.toMatch(/本班已发 2 席邀约|此学徒姓名不应外漏|hidden-(cohort|curriculum)-id|<button/);
    expect(html(mentor)).toContain('本班已发 2 席邀约');
    expect(html(mentor)).toContain('席位 2 · 邀约待应允');
    expect(html(outsider)).toBe('');
    expect(renderToStaticMarkup(<ApprenticeCohortPanel world={world} />)).toBe('');
    world.tick = 21;
    Object.assign(own, { status: 'accepted', acceptedTick: 21 });
    expect(html()).toContain('已同意，未记实际到课');
    expect(html()).not.toContain('实耗 1 次讲授机会');
    expect(html()).not.toContain('之后独立实绩出师');
  });

  it('retains actual attendance after leave but shows only later independently recorded graduation', () => {
    const { world, mentor, pupil, otherPupil, own, peer, cohort, html } = fixture();
    world.tick = 23;
    Object.assign(cohort, { status: 'held', teachingTick: 22, closedTick: 22, instructionSpent: 1 });
    Object.assign(own, { status: 'attended', acceptedTick: 21, readyTick: 22, attendedTick: 22, masteryGained: 2, leftTick: 23 });
    Object.assign(peer, { status: 'attended', acceptedTick: 21, readyTick: 22, attendedTick: 22, masteryGained: 2 });
    const attendance = html();
    expect(attendance).toContain('实授 Tick #22 · 实耗 1 次讲授机会');
    expect(attendance).toContain('实到 Tick #22 · 功法熟练度实增 2 点');
    expect(attendance).toContain('自愿退出 Tick #23；已发生的到课实录仍保留');
    expect(attendance).not.toContain('之后独立实绩出师');
    world.apprenticeCohorts.graduations = [
      { cohortId: cohort.id, studentId: otherPupil.id, mentorId: mentor.id, techniqueId: cohort.techniqueId,
        tick: 24, masteryBefore: 39, masteryAfter: 42 },
    ];
    expect(html(otherPupil)).not.toContain('实绩出师 Tick #24');
    world.tick = 24;
    expect(html(otherPupil)).toContain('本人实绩出师 Tick #24 · 功法熟练度 39 → 42');
    expect(html(pupil)).not.toContain('实绩出师 Tick #24');
    expect(html(mentor).match(/实绩出师 Tick #24/g)).toHaveLength(1);
  });
});
