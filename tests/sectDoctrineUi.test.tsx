import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { SectDoctrinePanel } from '../src/components/SectDoctrinePanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { doctrineSupport } from '../src/engine/doctrineEngine';
import type { WorldState } from '../src/types/world';

type School = WorldState['doctrines']['schools'][number];

function fixture() {
  const world = createInitialWorld();
  world.tick = 18;
  const [sect, foreignSect] = world.sects;
  const [viewer, founder, supporter, outsider] = world.cultivators;
  viewer.sectId = founder.sectId = supporter.sectId = sect.id;
  outsider.sectId = foreignSect.id;
  founder.name = '公开道统发起人';
  supporter.name = '公开支持者';
  supporter.sectRank = '外门弟子';
  supporter.secretGoal = '未公开的终极目标';
  supporter.innerMonologue = '不得转录的识海原文';
  supporter.reflections.push({ id: 'private-reflection', tick: 16, kind: 'belief', theme: 'community', intensity: 9,
    statement: '不得转录的反思原文', sourceMemoryIds: ['private-memory-ignored'], source: 'utility' });
  outsider.name = '外宗专属发起人';
  const school: School = {
    id: 'school-local', parentSectId: sect.id, theme: 'community', founderId: founder.id, stewardId: founder.id,
    foundedTick: 4, status: 'autonomous', memberIds: [founder.id, supporter.id], treasury: 45, lastChangeTick: 12, lastTrainingTick: 16,
  };
  const history: WorldState['doctrines']['records'] = [
    { id: 'history-support', tick: 4, schoolId: school.id, kind: 'endorse', actorIds: [founder.id], amount: 0, support: 1, description: '不得转录的历史正文' },
    { id: 'history-separate', tick: 12, schoolId: school.id, kind: 'separation', actorIds: [founder.id, viewer.id], amount: 60, support: 3, description: '不得转录的交割正文' },
    { id: 'history-training', tick: 16, schoolId: school.id, kind: 'training', actorIds: [supporter.id], amount: 15, support: 2, description: '不得转录的研修正文' },
    { id: 'history-future', tick: 20, schoolId: school.id, kind: 'reconciliation', actorIds: [founder.id], amount: 99, support: 3, description: '未来状态不得提前呈现' },
  ];
  world.doctrines = { nextId: 3, schools: [school, { ...school, id: 'school-foreign', parentSectId: foreignSect.id, founderId: outsider.id }],
    endorsements: [
      { actorId: founder.id, sectId: sect.id, schoolId: school.id, theme: 'community', tick: 13, evidenceCount: 4, score: 100 },
      { actorId: supporter.id, sectId: sect.id, schoolId: school.id, theme: 'community', tick: 16, evidenceCount: 3, score: 98 },
    ],
    proposals: [{ id: 'agreed', schoolId: school.id, kind: 'separation', openedTick: 9, expiresTick: 14,
      stewardId: founder.id, leaderId: viewer.id, amount: 60, status: 'accepted', settledTick: 12,
      votes: [{ actorId: viewer.id, tick: 12, verdict: 'accept' }], reason: '不得转录的议事原文' }],
    records: history,
  };
  const markup = () => renderToStaticMarkup(<SectDoctrinePanel world={world} cultivator={viewer} />);
  return { world, viewer, school, markup };
}

describe('public doctrine records in the sect workspace', () => {
  it('uses the engine’s current support and thresholds, showing independence, treasury and no private prose', () => {
    const { world, school, markup } = fixture();
    const available = doctrineSupport(world, school);
    const html = markup();
    expect(available.supporters).toBe(2);
    expect(html).toContain('同契道统 · 自主道统');
    expect(html).toContain('成员保留原宗籍');
    expect(html).toContain('公开支持者 · 证据计数 3');
    expect(html).toContain('45 灵石');
    expect(html).toContain(`有效支持 ${available.supporters} 人 · 可参与 ${available.eligibleMembers} 人 · 至少需 ${available.threshold} 人`);
    expect(html).toContain('不按门中位阶加权');
    expect(html).toContain('公开道统发起人');
    expect(html).not.toContain('外宗专属发起人');
    expect(html).not.toContain('不得转录');
    expect(html).not.toContain('未公开的终极目标');
    expect(html).not.toContain('private-memory-ignored');
  });

  it('separates proposal terms and explicit votes from earned transfers, expenses, and historical support', () => {
    const { world, markup } = fixture();
    const html = markup();
    expect(html).toContain('和平分立 · 已接受');
    expect(html).toContain('明确接受');
    expect(html).toContain('协议金额 60 灵石');
    expect(html).toContain('本宗拨入道统 60 灵石');
    expect(html).toContain('研修实际支出 15 灵石');
    expect(html).toContain('最近实办研修：Tick #16');
    expect(html).toContain('近六次实录的支持人数');
    expect(html).toMatch(/Tick 4 支持人数[^>]*value="1"/);
    expect(html).toMatch(/Tick 12 支持人数[^>]*value="3"/);
    expect(html).not.toContain('99 灵石');
    world.tick = 20;
    expect(markup()).toContain('道统交还本宗 99 灵石');
  });

  it('is offered only within the sect workspace and provides clear empty and unaffiliated states', () => {
    const map = renderToStaticMarkup(<App />);
    const sect = renderToStaticMarkup(<App initialWorkspace="sect" />);
    expect(map).not.toContain('道统与分合');
    expect(sect).toContain('道统与分合');
    expect(sect).not.toContain('道统与分合档案');
    const { world, viewer, markup } = fixture();
    world.doctrines.schools = [];
    expect(markup()).toContain('本宗尚无公开道统记录');
    viewer.sectId = 'unaffiliated';
    expect(markup()).toContain('散修暂无本宗道统档案');
  });
});
