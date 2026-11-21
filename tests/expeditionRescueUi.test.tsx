import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExpeditionRescuePanel } from '../src/components/ExpeditionRescuePanel';
import { createInitialWorld } from '../src/data/initialWorld';
import type { ExpeditionRescue, WorldOccasion } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(65);
  world.tick = 18;
  const [explorer, rescuer, witness, outsider] = world.cultivators;
  const gate = world.locations.find(({ type }) => type === 'secret_realm')!;
  const exit = world.locations.find(({ type }) => type === 'market')!;
  const [safe, distant] = [{ x: 360, y: 340 }, { x: 500, y: 340 }];
  Object.assign(gate, safe, { name: '隐秘入口原名' });
  Object.assign(exit, distant, { name: '正址撤离坊市' });
  for (const actor of [explorer, rescuer, witness, outsider]) actor.locationId = gate.id;
  explorer.hp = Math.floor(explorer.maxHp * 0.2);
  rescuer.name = '不可外传救援者';
  witness.name = '不可外传见证者';
  const occasion: WorldOccasion = {
    id: 'private-rescue-occasion', kind: 'expedition', title: '只存在于原始对象的名称',
    locationId: gate.id, startedTick: 12, registrationClosesTick: 14, expiresTick: 23,
    status: 'running', participantIds: [explorer.id, rescuer.id, witness.id, outsider.id],
    remainingIds: [explorer.id, rescuer.id, witness.id, outsider.id], bouts: [], expeditions: [], round: 1,
  };
  world.occasions = [occasion];
  const request: ExpeditionRescue = {
    id: 'private-rescue-request', occasionId: occasion.id, explorerId: explorer.id, gateSiteId: gate.id,
    witnessIds: [rescuer.id, witness.id], openedTick: 18, offerExpiresTick: 21, status: 'signaled', pathIndex: 0, path: [],
  };
  world.expeditionRescues = { requests: [request], nextId: 2 };
  const view = (actor = explorer) => renderToStaticMarkup(<ExpeditionRescuePanel world={world} cultivator={actor} />);
  return { world, explorer, rescuer, witness, outsider, gate, exit, occasion, request, view };
}

describe('verified expedition distress UI', () => {
  it('shows an actual signal for participant and a reachable witness only, without naming witnesses or exposing raw IDs', () => {
    const { witness, outsider, view } = fixture();
    const html = view();
    expect(html).toMatch(/<details class="[^"]+"><summary class="[^"]+">秘境求援与实际撤离/);
    expect(html).toContain('已发出求援，尚未有人同意');
    expect(html).toContain('Tick #18');
    expect(html).not.toMatch(/private-rescue-(occasion|request)|不可外传见证者|已到达经验证的永久出口|正址撤离坊市|<button/);
    expect(view(witness)).toContain('现场曾收到求援信号');
    expect(view(outsider)).toBe('');
  });

  it('distinguishes consent/progress from actual arrival and gate ejection, without dumping route geometry', () => {
    const { world, explorer, rescuer, gate, exit, occasion, request, view } = fixture();
    Object.assign(request, { status: 'extracting', rescuerId: rescuer.id, acceptedTick: 19, exitSiteId: exit.id, supplySpent: 1,
      path: [{ x: gate.x, y: gate.y }, { x: 420, y: 344.15 }, { x: 460, y: 344.15 }, { x: exit.x, y: exit.y }],
      pathIndex: 1, lastAdvancedTick: 20 });
    world.tick = 20;
    const underway = view();
    expect(underway).toContain('救援者已同意，正在实际撤离');
    expect(underway).toContain('实耗 1 株翡翠灵叶');
    expect(underway).toContain('实际已行进 1/3 步，未到出口');
    expect(underway).not.toMatch(/已到达经验证的永久出口|344\.15|private-rescue/);
    expect(underway).not.toContain('正址撤离坊市');
    world.tick = 21;
    request.status = 'rescued';
    request.finishedTick = 21;
    request.arrivedIds = [explorer.id, rescuer.id];
    request.pathIndex = request.path.length - 1;
    explorer.locationId = rescuer.locationId = exit.id;
    occasion.remainingIds = occasion.remainingIds.filter((id) => id !== explorer.id && id !== rescuer.id);
    expect(view()).toContain('已到达经验证的永久出口');
    expect(view()).toContain('正址撤离坊市');
    request.status = 'interrupted';
    request.reason = 'participant_lost';
    request.arrivedIds = [rescuer.id];
    expect(view(rescuer)).toContain('本人实际到达，未完成全队撤离');
    expect(view(rescuer)).toContain('正址撤离坊市');
    expect(view()).not.toContain('正址撤离坊市');
    request.reason = 'gate_closed';
    delete request.arrivedIds;
    expect(view()).toContain('秘境门已关闭；不是完成撤离');
    expect(view()).not.toContain('已到达经验证的永久出口');
    expect(view()).not.toContain('正址撤离坊市');
  });
});
