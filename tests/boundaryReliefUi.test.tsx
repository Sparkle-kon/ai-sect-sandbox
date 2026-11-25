import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BoundaryReliefPanel } from '../src/components/BoundaryReliefPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import type { BoundaryRelief } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(66);
  world.tick = 20;
  const [leader, incumbent, incoming, nearby, distant] = world.cultivators;
  const sect = world.sects.find(({ id }) => id === leader.sectId)!;
  sect.leaderId = leader.id;
  incumbent.sectId = incoming.sectId = sect.id;
  const start = world.locations.find(({ id }) => id === sect.headquartersId)!;
  const post = world.locations.find(({ id }) => id === 'loc-vein-north')!;
  const far = world.locations.find(({ id }) => id !== post.id && id !== start.id)!;
  Object.assign(start, { x: 340, y: 340, name: '旧驻点绝不外传' });
  Object.assign(post, { x: 485, y: 340, name: '现场巡界阵位', ownerSectId: sect.id });
  Object.assign(far, { x: 940, y: 20 });
  leader.locationId = incoming.locationId = start.id;
  nearby.locationId = incumbent.locationId = post.id;
  distant.locationId = far.id;
  for (const person of [leader, incumbent, incoming, nearby, distant]) person.exploredTileIds = [];
  incumbent.guardAssignment = { locationId: post.id, assignedTick: 12, expiresTick: 21 };
  const row: BoundaryRelief = {
    id: 'raw-relief-id', sectId: sect.id, leaderId: leader.id, incumbentId: incumbent.id, incomingId: incoming.id,
    originSiteId: start.id, postSiteId: post.id, incumbentAssignedTick: 12, offeredTick: 17, offerExpiresTick: 20,
    status: 'travelling', acceptedTick: 18, deadlineTick: 24, lastAdvancedTick: 20,
    path: [{ x: start.x, y: start.y }, { x: 380, y: 341.75 }, { x: 425, y: 340 }, { x: post.x, y: post.y }],
    pathIndex: 1, outboundSteps: 1, returnSteps: 0, strainSpent: 1, coverage: { kind: 'incumbent', tick: 20, guardId: incumbent.id },
  };
  world.boundaryReliefs = { cases: [row], nextId: 2 };
  const html = (actor = incoming) => renderToStaticMarkup(<BoundaryReliefPanel world={world} cultivator={actor} />);
  return { world, leader, incumbent, incoming, nearby, distant, post, row, html };
}

describe('confirmed boundary post coverage and private handoff journey', () => {
  it('shows one closed projection, with travelled strain only to an actual participant, never exposing route coordinates', () => {
    const { nearby, distant, html } = fixture();
    const receipt = html();
    expect(receipt).toMatch(/<details class="[^"]+"><summary class="[^"]+">巡界阵位与换防交接/);
    expect(receipt).toContain('接防者实际行进中，未交接');
    expect(receipt).toContain('去程 1 步');
    expect(receipt).toContain('累计实际负担 1');
    expect(receipt).not.toMatch(/341\.75|raw-relief-id|旧驻点绝不外传|已到阵位并完成交接/);
    const publicView = html(nearby);
    expect(publicView).toContain('现有守者实际在岗');
    expect(publicView).not.toMatch(/累计实际负担|去程 1 步|换防邀约|实际行进中/);
    expect(html(distant)).toBe('');
  });

  it('reports an independent current guard only from a visible post and never labels them the original or incoming guard', () => {
    const { world, incumbent, nearby, leader, post, html } = fixture();
    incumbent.locationId = leader.locationId;
    nearby.sectId = incumbent.sectId;
    nearby.guardAssignment = { locationId: post.id, assignedTick: 19, expiresTick: 23 };
    const observed = html(nearby);
    expect(observed).toContain(`Tick #${world.tick} · 另有守者实际在岗`);
    expect(observed).not.toMatch(/现有守者实际在岗|已由接防者实际在岗|实测空岗|本人相关换防实录/);
  });

  it('distinguishes a gap with partial retreat from one proven physical handoff and never counts two guards', () => {
    const { world, leader, incoming, nearby, post, row, html } = fixture();
    world.tick = 22;
    Object.assign(row, { status: 'returning', firstGapTick: 21, returnSteps: 1, strainSpent: 2,
      coverage: { kind: 'gap', tick: 22 } });
    expect(html()).toContain('已走上回程');
    expect(html()).toContain('退回已走 1 步');
    expect(html(nearby)).toContain('实测空岗');
    expect(html()).not.toContain('已到阵位并完成交接');
    world.tick = 24;
    Object.assign(row, { status: 'completed', pathIndex: row.path.length - 1, closedTick: 24, outboundSteps: 3, returnSteps: 0, strainSpent: 3,
      coverage: { kind: 'relief', tick: 24, guardId: incoming.id } });
    incoming.locationId = post.id;
    incoming.guardAssignment = { locationId: post.id, assignedTick: 24, expiresTick: 29 };
    expect(html()).toContain('已到阵位并完成交接');
    expect(html(nearby)).toContain('已由接防者实际在岗');
    expect(html(nearby)).not.toContain('现有守者实际在岗');
    leader.realm = '练气';
    expect(html(leader)).toContain('实际交接 Tick #24');
    expect(html(leader)).not.toMatch(/当前可观测阵位|本案覆盖凭证|已由接防者实际在岗/);
  });
});
