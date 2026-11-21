import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { SectResearchPanel } from '../src/components/SectResearchPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { RESEARCH_TOPICS } from '../src/engine/researchEngine';
import type { ResearchProject } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.tick = 16;
  const [own, foreign] = world.sects;
  const [viewer, partner, outsider] = world.cultivators;
  viewer.sectId = partner.sectId = own.id;
  outsider.sectId = foreign.id;
  viewer.name = '共研发起者';
  partner.name = '实际贡献者';
  outsider.name = '外宗未公布的发起者';
  const home = world.locations.find(({ id }) => id === own.headquartersId)!;
  home.name = '可见本宗阁址';
  viewer.locationId = partner.locationId = home.id;
  const project: ResearchProject = {
    id: 'known-project', sectId: own.id, topic: 'qi_foundation', proposerId: viewer.id, locationId: home.id, startedTick: 10, deadlineTick: 18,
    status: 'open', contributors: [
      { actorId: viewer.id, joinedTick: 10, lastWorkedTick: 11, workTurns: 1, escrow: { stones: 30, earthRoots: 1 }, spent: { stones: 10, earthRoots: 1 } },
      { actorId: partner.id, joinedTick: 11, lastWorkedTick: 12, workTurns: 1, escrow: { stones: 0, earthRoots: 0 }, spent: { stones: 10, earthRoots: 1 },
        withdrawnTick: 13, withdrawReason: 'injury' },
    ],
  };
  world.research.projects = [project, { ...project, id: 'do-not-publish-external-id', topic: 'warding', sectId: foreign.id,
    proposerId: outsider.id, locationId: foreign.headquartersId, contributors: [] }];
  const html = () => renderToStaticMarkup(<SectResearchPanel world={world} cultivator={viewer} />);
  return { world, own, viewer, project, html };
}

describe('research assembly ledger and actual discovery view', () => {
  it('uses shared typed questions and real attributed work, escrow and lawful refund for the selected sect', () => {
    const { html, viewer } = fixture();
    const markup = html();
    expect(markup).toContain(RESEARCH_TOPICS.qi_foundation.question);
    expect(markup).toContain('共研发起者 · 可见本宗阁址');
    expect(markup).toContain('共研发起者 · 加入 Tick #10 · 实作 1 轮');
    expect(markup).toContain('实际贡献者 · 加入 Tick #11 · 实作 1 轮');
    expect(markup).toContain('已记录实作 2 轮');
    expect(markup).toContain('当前托管：30 灵石、玄土根 1 株；已消耗：10 灵石、玄土根 1 株');
    expect(markup).toContain('结算退回余料：30 灵石、玄土根 1 株');
    expect(markup).toContain('已按规则退出 · Tick #13 · 负伤');
    expect(markup).toContain('此时点尚无已核实阁藏成果');
    expect(markup).not.toContain('外宗未公布的发起者');
    expect(markup).not.toContain('do-not-publish-external-id');
    expect(markup).not.toContain('<button');
    viewer.hp = Math.floor(viewer.maxHp / 2);
    expect(html()).toContain('本时点所选修士可按规则退出：负伤');
  });

  it('checks actual physical pavilion copy before describing a result and respects the displayed time', () => {
    const { world, own, project, html } = fixture();
    const original = structuredClone(world);
    project.status = 'completed';
    project.settledTick = 16;
    project.contributors[0].escrow = { stones: 0, earthRoots: 0 };
    project.discoveryTechniqueId = 'verified-result';
    project.discoveryLocationId = own.headquartersId;
    own.pavilion.push({ id: 'wrong-result', name: '不可误认的功法', spiritRoot: '金' });
    expect(html()).toContain('有创法记录，但此时点本宗阁中未见对应实物');
    own.pavilion.push({ id: 'verified-result', name: '实录核验成果', spiritRoot: '木' });
    expect(html()).toContain('此时点本宗藏经阁可核对：实录核验成果 · 灵根 木');
    expect(html()).not.toContain('不可误认的功法');
    expect(renderToStaticMarkup(<SectResearchPanel world={original} cultivator={original.cultivators[0]} />)).not.toContain('实录核验成果');
  });

  it('places a single feature in the sect workspace and handles an unaffiliated actor', () => {
    expect(renderToStaticMarkup(<App />)).not.toContain('论道会与共研创法');
    expect(renderToStaticMarkup(<App initialWorkspace="sect" />)).toContain('论道会与共研创法');
    const { viewer, html } = fixture();
    viewer.sectId = 'wanderer';
    expect(html()).toContain('散修无本宗论道会');
  });
});
