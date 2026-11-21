import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MentorshipPanel, relatedMentorshipBranches } from '../src/components/MentorshipPanel';
import { createInitialWorld } from '../src/data/initialWorld';

function fixture() {
  const world = createInitialWorld();
  world.tick = 8;
  const [mentor, selected, junior, other, otherStudent, otherTeacher] = world.cultivators;
  const technique = { ...mentor.technique, id: 'shared-fixture-id', name: '青崖遗诀' };
  for (const actor of [mentor, selected, junior]) {
    actor.technique = technique;
    actor.sectId = mentor.sectId;
    actor.locationId = mentor.locationId;
  }
  mentor.techniqueMastery = 80;
  selected.techniqueMastery = 47;
  junior.techniqueMastery = 20;
  world.mentorship.lineage = [
    { mentorId: junior.id, studentId: other.id, technique, formedTick: 6, lastLessonTick: 6, lessons: 1, flaw: 0 },
    { mentorId: mentor.id, studentId: selected.id, technique, formedTick: 2, lastLessonTick: 7, lessons: 3, flaw: 22 },
    { mentorId: selected.id, studentId: junior.id, technique, formedTick: 4, lastLessonTick: 5, lessons: 2, flaw: 11 },
    { mentorId: otherTeacher.id, studentId: otherStudent.id, technique, formedTick: 3, lastLessonTick: 5, lessons: 1, flaw: 99 },
  ];
  world.mentorship.budgets = [{ mentorId: selected.id, tick: world.tick, spent: 1 }];
  world.mentorship.offers = [
    { id: 'pending', mentorId: mentor.id, studentId: selected.id, technique, createdTick: 7, expiresTick: 10, status: 'pending' },
    { id: 'settled', mentorId: selected.id, studentId: junior.id, technique, createdTick: 4, expiresTick: 7,
      status: 'accepted', resolvedTick: 5, outcome: '弟子熟练度到 20，有 11 点偏差。' },
    { id: 'unrelated', mentorId: other.id, studentId: otherStudent.id, technique, createdTick: 6, expiresTick: 7,
      status: 'declined', resolvedTick: 7, outcome: '无关私学记录' },
  ];
  const markup = () => renderToStaticMarkup(<MentorshipPanel world={world} cultivator={selected} />);
  return { world, mentor, selected, junior, other, otherStudent, markup };
}

describe('mentorship presentation', () => {
  it('shows engine-derived remaining budget, response choices and settled training without forcing action', () => {
    const { mentor, selected, junior, markup } = fixture();
    const html = markup();
    expect(html).toContain(`${selected.name} · 现修 青崖遗诀 · 熟练度 47/100`);
    expect(html).toContain('本月授艺余量 1/2');
    expect(html).toContain('传承偏解降低当前功法效果 4.4%');
    expect(html).toContain(`${mentor.name} → ${selected.name}`);
    expect(html).toContain(`${selected.name} → ${junior.name}`);
    expect(html).toContain('修士当前可选择：拒绝／接受');
    expect(html).toContain('已接受');
    expect(html).toContain('弟子熟练度到 20，有 11 点偏差');
    expect(html).not.toContain('无关私学记录');
    expect(html).not.toContain('<button');
  });

  it('finds only the connected recorded lineage, not disconnected bearers of the same technique', () => {
    const { world, selected, other, otherStudent, markup } = fixture();
    const results = relatedMentorshipBranches(world.mentorship.lineage, selected.id);
    expect(results).toHaveLength(1);
    expect(results[0].edges.map(({ formedTick }) => formedTick)).toEqual([2, 4, 6]);
    expect(markup()).toContain(other.name);
    expect(markup()).not.toContain(otherStudent.name);
    expect(markup()).toContain('偏解 0/100 点（未见偏差）');
  });

  it('handles an empty selection and does not invite a fallen actor to teach', () => {
    const { world, selected, markup } = fixture();
    const noSelection = renderToStaticMarkup(<MentorshipPanel world={world} cultivator={undefined} />);
    expect(noSelection).toContain('选中修士后查看其师承');
    selected.alive = false;
    const archive = markup();
    expect(archive).toContain('已陨落，仅展示留档');
    expect(archive).not.toContain('本月授艺余量');
    expect(archive).not.toContain('修士当前可选择');
  });
});
