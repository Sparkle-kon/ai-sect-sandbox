import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { writeFocalTribulationLayers } from '../src/engine/focalTribulationLayers';
import { resolveTribulation, triggerTribulation } from '../src/engine/tribulationEngine';
import type { WorldEvent, WorldState } from '../src/types/world';
import { actualAscensionWaves, ascentTrial } from './ascensionNativeFixture';

function ordinary(lethal = false) {
  const world = createInitialWorld(1), body = world.cultivators[0];
  Object.assign(body, { realm:'筑基',realmStage:9,qiProgress:95,hp:lethal?1:500,maxHp:500,
    techniqueMastery:50,pillToxicity:0,reflections:[],artifacts:[] });
  body.pills.barrier = 0;
  world.relationships = [];
  const start = triggerTribulation(world,body);
  if (!start) throw new Error('true storm fixture did not start');
  const sources: WorldEvent[] = [start];
  for (let i = 0; i < (lethal ? 1 : 4); i++) {
    world.tick++; world.month++;
    const step = resolveTribulation(world,body,lethal?'defy':i<3?'guard':'focus',() => lethal?1:.5);
    if (!step) throw new Error('true storm fixture omitted a turn');
    sources.push(step);
  }
  world.events.push(...sources);
  return {world,body,sources,focal:sources[sources.length-1]};
}

function read(world: WorldState, focal: WorldEvent, anchors: readonly WorldEvent[], admitted = anchors, throughTick = world.tick) {
  return writeFocalTribulationLayers({world,focal,anchors,throughTick,publicOriginal: id => {
    const rows = admitted.filter(row => row.id === id && row.witnessScope === undefined);
    return rows.length === 1 ? rows[0] : undefined;
  }});
}

describe('focal witnessed trial scenes', () => {
  it('adds approach, actually observed exchanges and successful end of one ordinary native trial', () => {
    const {world,focal,sources} = ordinary();
    const layers = read(world,focal,sources);
    expect(layers.map(row => row.role)).toEqual(['approach','exchange','aftermath']);
    expect(layers[1].eventIds).toEqual(sources.slice(1,-1).map(row => row.id));
    expect(layers[1].text).toContain('第一重、第二重、第三重');
    expect(layers[2].text).toContain('踏入金丹境');
    expect(layers.map(row => row.text).join('')).not.toContain('仙门');
  });

  it('does not add unread waves, later terminal authority or borrowed trial evidence', () => {
    const {world,body,focal,sources} = ordinary();
    const [start, first, second, third] = sources;
    const reduced = read(world,focal,sources,[start,first,third,focal]);
    expect(reduced.find(row => row.role === 'exchange')?.eventIds).toEqual([first.id,third.id]);
    expect(reduced.find(row => row.role === 'exchange')?.text).not.toContain('第二重');
    expect(read(world,focal,sources,[start,first,second,third])).toEqual([]);
    expect(read(world,focal,sources,sources,focal.tick-1)).toEqual([]);
    expect(read(world,focal,sources,[focal])).toEqual([]);
    if (!body.tribulation) throw new Error('lost current native trial');
    body.tribulation.startedTick++;
    expect(read(world,focal,sources)).toEqual([]);
  });

  it('shows the actual first bolt ending (not invented survival or passed waves)', () => {
    const {world,focal,sources} = ordinary(true);
    const layers = read(world,focal,sources);
    expect(layers.map(row => row.role)).toEqual(['approach','aftermath']);
    expect(layers.at(-1)?.text).toContain('第一重劫雷');
    expect(layers.at(-1)?.text).not.toMatch(/撑了过去|踏入|越过仙门/u);
  });

  it('requires the separately durable true ascension receipt and admitted lower-world originals', () => {
    const {passed} = actualAscensionWaves();
    const terminal = ascentTrial(passed).terminal;
    const focal = passed.events.find(row => row.id === terminal?.eventId);
    if (!focal) throw new Error('missing genuine ascension result');
    const layers = read(passed,focal,passed.events);
    expect(layers.map(row => row.role)).toEqual(['approach','exchange','aftermath']);
    expect(layers[1].eventIds).toEqual(ascentTrial(passed).waves.slice(0,-1).map(row => row.eventId));
    expect(layers.at(-1)?.text).toContain('越过仙门，从此不再返回下界');
    const stripped = structuredClone(passed);
    stripped.ascension = undefined;
    expect(read(stripped,focal,stripped.events)).toEqual([]);
  });
});
