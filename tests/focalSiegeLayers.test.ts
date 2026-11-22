import { describe, expect, it } from 'vitest';
import { chapterFocalSources, type FocalLayerContext } from '../src/engine/focalLayerEvidence';
import { writeFocalSiegeLayers } from '../src/engine/focalSiegeLayers';
import { projectFocalLayers } from '../src/engine/focalSceneLayers';
import type { ChronicleAnchor, WorldState } from '../src/types/world';
import { actualGrandSiege, actualSiege, location, patriarch, siegeActor, siegeSect, siegeTurn } from './grandSiegeNativeFixture';

const launchId = 'evt-5-dip-sect-qingyun-sect-bloodmoon-launch_siege';
const arrivedId = 'evt-7-dip-siege-5-sect-qingyun-sect-bloodmoon';
const wallId = 'evt-8-dip-siege-5-sect-qingyun-sect-bloodmoon';
const clashId = 'evt-8-siege-5-sect-qingyun-sect-bloodmoon-front-theatre';
const ended = () => {
  let { arrived: world } = actualGrandSiege();
  for (let round = 0; round < 8 && actualSiege(world).status === 'sieging'; round++) world = siegeTurn(world);
  const terminal = actualSiege(world).theatre?.terminal;
  expect(terminal).toMatchObject({ status: 'victory', battlefield: true });
  return { world, terminalId: terminal!.sourceEventId };
};
function source(world: WorldState, id: string): ChronicleAnchor {
  const row = world.chronicleArchive.anchors.find(row => row.id === id) ?? world.events.find(row => row.id === id);
  expect(row, id).toBeDefined();
  return row!;
}
function scene(world: WorldState, focal: ChronicleAnchor, anchors: readonly ChronicleAnchor[], throughTick = world.tick): FocalLayerContext {
  return { world, focal, anchors, throughTick, publicOriginal: chapterFocalSources(world, {
    startTick: 1, endTick: throughTick, anchors: [...anchors],
  }) };
}

describe('layered reading of a real native grand siege', () => {
  it('references paid departure, actual arrival, public exchange and actual contested victory without calling the place conquered', () => {
    const { world, terminalId } = ended();
    const anchors = [launchId, arrivedId, wallId, clashId, terminalId].map(id => source(world, id));
    const before = JSON.stringify(world);
    const layers = projectFocalLayers(scene(world, anchors[4], anchors));
    expect(layers.map(row => row.role)).toEqual(['approach', 'exchange', 'aftermath']);
    expect(layers.map(row => row.eventIds)).toEqual([[launchId, arrivedId], [clashId, wallId], [terminalId]]);
    expect(layers[0].text).toMatch(/灵石已经付了.+到了山门外/);
    expect(layers[1].text).toMatch(/鼓声忽断.+各受了一击.+护山阵/);
    expect(layers[2].text).toMatch(/守线终于被攻破.+撤离/);
    expect(layers.map(row => row.text).join('')).not.toMatch(/斩杀|身亡|死伤|占领|城中|山风/);
    expect(JSON.stringify(world)).toBe(before);
  });

  it('keeps the first contact identical before and after later battle, even with later evidence and unrelated current names or HP', () => {
    const { arrived } = actualGrandSiege();
    const fought = siegeTurn(arrived);
    const { world: closed, terminalId } = ended();
    const early = [launchId, arrivedId, wallId, clashId].map(id => source(fought, id));
    const initial = writeFocalSiegeLayers(scene(fought, early[2], early));
    const later = [...early, source(closed, terminalId)];
    closed.cultivators.forEach(actor => { actor.name = '当下私名'; actor.hp = 1; });
    closed.sects.forEach(sect => { sect.name = '当下宗门私名'; sect.arrayHp = 1; });
    closed.locations.find(row => row.id === location)!.name = '当下山门私名';
    expect(initial.map(row => row.role)).toEqual(['approach', 'exchange']);
    expect(writeFocalSiegeLayers(scene(closed, early[2], later))).toEqual(initial);
    expect(writeFocalSiegeLayers(scene(closed, early[3], later))).toEqual(initial);
    expect(JSON.stringify(initial)).not.toMatch(/当下|攻破|战赔/);
    expect(writeFocalSiegeLayers(scene(closed, early[2], later, early[2].tick - 1))).toEqual([]);
  });

  it('does not expose unsampled or disputed support, or expand an archive without a unique living original', () => {
    const { world, terminalId } = ended();
    const focal = source(world, terminalId);
    expect(writeFocalSiegeLayers(scene(world, focal, [focal])).map(row => row.eventIds)).toEqual([[terminalId]]);
    const launch = source(world, launchId);
    const clash = source(world, clashId);
    const wall = source(world, wallId);
    world.events = world.events.map(row => row.id === launchId ? { ...row, witnessScope: 'participants' } : row);
    const rawClash = world.events.find(row => row.id === clashId)!;
    world.events.push({ ...rawClash, description: '隐匿的新供词。' });
    const anchors = [launch, clash, wall, wall, focal];
    expect(writeFocalSiegeLayers(scene(world, focal, anchors)).map(row => row.eventIds)).toEqual([[terminalId]]);
    world.events = world.events.filter(row => row.id !== terminalId);
    expect(writeFocalSiegeLayers(scene(world, focal, anchors))).toEqual([]);
  });

  it('continues a real fought repulse without turning exhausted array strength into a broken defense', () => {
    let { arrived: world } = actualGrandSiege();
    // This prepared defender is strong enough to repel the attack even after the array is exhausted.
    siegeActor(world, patriarch).combatPower = 1_000_000;
    for (let round = 0; round < 8 && actualSiege(world).status === 'sieging'; round++) world = siegeTurn(world);
    const result = actualSiege(world).theatre?.terminal;
    expect(result).toMatchObject({ battlefield: true, status: 'repelled' });
    const focal = source(world, result!.sourceEventId);
    const anchors = [launchId, arrivedId, wallId, clashId].map(id => source(world, id)).concat(focal);
    const layers = writeFocalSiegeLayers(scene(world, focal, anchors));
    expect(layers.at(-1)).toEqual({ role: 'aftermath', text: '守线没被攻破。联军从山门前撤了。', eventIds: [focal.id] });
    expect(layers.map(row => row.text).join('')).not.toMatch(/取了战赔|占领|斩杀/);
  });

  it('never expands a real displaced headquarters retreat that settled without fighting', () => {
    const { arrived } = actualGrandSiege();
    siegeSect(arrived).headquartersId = 'loc-taixu';
    const withdrawn = siegeTurn(arrived);
    const result = actualSiege(withdrawn).theatre?.terminal;
    expect(result).toMatchObject({ battlefield: false, status: 'repelled' });
    const focal = source(withdrawn, result!.sourceEventId);
    expect(focal.title).toBe('攻山退兵');
    expect(writeFocalSiegeLayers(scene(withdrawn, focal, [source(withdrawn, launchId), source(withdrawn, arrivedId), focal]))).toEqual([]);
  });
});
