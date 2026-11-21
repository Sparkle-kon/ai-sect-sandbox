import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ChronicleFeed, findChronicleReturnTarget } from '../src/components/ChronicleFeed';
import { FocusedSectSummary } from '../src/components/FocusedSectSummary';
import { createInitialWorld } from '../src/data/initialWorld';
import { createChronicleFocusResolver } from '../src/engine/chronicleFocusEngine';
import type { ChronicleFocusRequest } from '../src/engine/chronicleFocusEngine';
import type { WorldEvent } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(43);
  world.tick = 7;
  const [viewer, hidden] = world.cultivators;
  const near = world.locations.find(({ id }) => id === viewer.locationId)!;
  const far = world.locations.find(({ id }) => id === 'loc-vein-north')!;
  Object.assign(near, { x: 340, y: 340, name: '同地点公开方' });
  Object.assign(far, { x: 980, y: 20, name: '迷雾未观测位置' });
  viewer.name = '现场公开修士';
  viewer.exploredTileIds = [];
  hidden.name = '远行隐秘修士';
  hidden.locationId = far.id;
  const publicFact: WorldEvent = { id: 'visible-fact', tick: 7, year: 1, month: 7, title: '公开斗法核验',
    description: '实录不含私人位置。', locationId: near.id, category: 'combat', actorIds: [viewer.id, hidden.id] };
  const hiddenFact: WorldEvent = { ...publicFact, id: 'not-visible-fact', title: '记载的远处公开异象', category: 'heavenly',
    locationId: far.id, actorIds: [hidden.id] };
  const privateFact: WorldEvent = { ...publicFact, id: 'private-proof', title: '既有私下纪事', witnessScope: 'participants' };
  world.events = [publicFact, hiddenFact, privateFact];
  return { world, viewer, near, publicFact, privateFact };
}

describe('chronicle focus controls and origin matching', () => {
  it('filters canonical visible facts and emits only resolver-approved touch-sized affordances', () => {
    const { world, viewer, near, publicFact, privateFact } = fixture();
    const resolver = createChronicleFocusResolver(world, viewer.id);
    const options = vi.fn(resolver.build);
    const onJump = vi.fn();
    const html = renderToStaticMarkup(<ChronicleFeed events={world.events} category="combat"
      onCategoryChange={() => undefined} focusOptions={options} onJump={onJump} />);
    expect(html).toContain('纪事分类');
    expect(html).toContain('value="combat" selected=""');
    expect(html).toContain('公开斗法核验');
    expect(html).toContain('地图：同地点公开方');
    expect(html).toContain('人物：现场公开修士');
    expect(html).toContain('部分词条当前不可定位，不显示未核实位置');
    expect(html).toContain('min-h-11');
    expect(html).toContain(`data-event-id="${publicFact.id}" data-target-kind="site" data-target-id="${near.id}"`);
    expect(html).not.toMatch(/迷雾未观测位置|远行隐秘修士|记载的远处公开异象/);
    expect(options).toHaveBeenCalledTimes(1);
    expect(options).toHaveBeenCalledWith(publicFact.id);
    expect(options).not.toHaveBeenCalledWith(privateFact.id);
    expect(onJump).not.toHaveBeenCalled();
  });

  it('can match an exact former affordance without interpolating a selector; missing targets cannot substitute', () => {
    const request: ChronicleFocusRequest = { eventId: 'fact["x"]', kind: 'actor', targetId: 'person:..' };
    const correct = { dataset: { eventId: request.eventId, targetKind: request.kind, targetId: request.targetId } };
    const reusedPlace = { dataset: { ...correct.dataset, targetKind: 'site' } };
    const differentFact = { dataset: { ...correct.dataset, eventId: 'other' } };
    expect(findChronicleReturnTarget([reusedPlace, differentFact, correct], request)).toBe(correct);
    expect(findChronicleReturnTarget([reusedPlace, differentFact], request)).toBeUndefined();
  });

  it('renders a compact neutral sector only from authorized fields', () => {
    const unknownLeader = renderToStaticMarkup(<FocusedSectSummary name="阅云宗" alignment="中立" />);
    expect(unknownLeader).toContain('阅云宗');
    expect(unknownLeader).toContain('公开立场：中立');
    expect(unknownLeader).not.toMatch(/掌门|库|坐标|灵石/);
    expect(renderToStaticMarkup(<FocusedSectSummary name="阅云宗" alignment="中立" leaderName="已核掌门姓名" />)).toContain('已知掌门：已核掌门姓名');
  });
});
