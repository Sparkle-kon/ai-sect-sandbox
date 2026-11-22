import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { createTimeline, forkTimeline, readTimelineHead } from '../src/engine/timelineEngine';
import {
  projectCultivatorPortrait, projectMapCultivatorHalos, projectMapCultivatorPortrait, projectMapCultivatorPortraits,
} from '../src/components/cultivatorPortraitModel';
import { createTerrainMapView } from '../src/components/terrainMapView';
import type { WorldState } from '../src/types/world';

const at = (world: WorldState, id: string) => world.cultivators.find(actor => actor.id === id)!;
const well = /^#[0-9a-f]{6}$/iu;

describe('deterministic face geometry and truthful clothing metadata', () => {
  it('hashes Unicode stable identities, not name, roster order, save branch or random cursor', () => {
    const baseline = createInitialWorld(2031);
    const id = '人物-𐐁-e\u0301-1', otherId = '人物-𐐁-é-1';
    const first = at(baseline, 'npc-1'), second = at(baseline, 'npc-4');
    first.id = id;
    second.id = otherId;
    first.name = second.name = '同一个名';
    first.secretGoal = first.innerMonologue = '独有识海仅做保密断言';
    const projection = projectCultivatorPortrait(baseline, first)!;
    expect(projection.face).not.toEqual(projectCultivatorPortrait(baseline, second)?.face);
    expect(projectCultivatorPortrait(baseline, { ...first })).toBeUndefined();

    const fork = forkTimeline(createTimeline(baseline), baseline.tick, {
      type: 'WHISPER_MIND', targetCultivatorId: id, whisperText: '只存在于这一支的同月私念。',
    });
    const branch = readTimelineHead(fork)!;
    const branchActor = at(branch, id);
    branchActor.name = '完全不同的名字';
    branchActor.age = branchActor.lifespan - 1;
    branchActor.realm = '渡劫';
    branchActor.currentAction = 'REST';
    branch.random.state = 0;
    branch.cultivators.reverse();
    expect(projectCultivatorPortrait(branch, branchActor)?.face).toEqual(projection.face);
    expect(projectCultivatorPortrait(baseline, branchActor)).toBeUndefined();
    const different = structuredClone(branch);
    different.random.seed += 1;
    expect(projectCultivatorPortrait(different, at(different, id))?.face).not.toEqual(projection.face);
    const wire = JSON.stringify(projection);
    for (const privateValue of [id, first.name, first.secretGoal, first.locationId]) expect(wire).not.toContain(privateValue);
  });

  it('keeps unrecorded gender neutral, with safe colors and only current real realm/sect halo', () => {
    const world = createInitialWorld(2031);
    const actor = at(world, 'npc-1');
    const sect = world.sects.find(row => row.id === actor.sectId)!;
    delete actor.gender;
    actor.name = '名带女字不作推断';
    actor.title = '男子称号不作推断';
    actor.age = 20; actor.lifespan = 100;
    actor.realm = '金丹'; actor.personality = '逍遥'; actor.spiritRoot = '水';
    const first = projectCultivatorPortrait(world, actor)!;
    expect(first).toMatchObject({ attire: 'neutral', ageBand: 'youth', brow: 'soft', halo: { kind: 'gold-wheel' } });
    expect(Object.values(first.palette).every(color => well.test(color))).toBe(true);

    actor.gender = 'woman';
    actor.age = 30;
    actor.realm = '元婴'; actor.personality = '刚正'; actor.spiritRoot = '火';
    sect.color = 'url(private-source)';
    const second = projectCultivatorPortrait(world, actor)!;
    expect(second).toMatchObject({ attire: 'layered', ageBand: 'seasoned', brow: 'level', halo: { kind: 'dharma' } });
    expect(second.face).toEqual(first.face);
    expect(second.palette).not.toEqual(first.palette);
    expect(Object.values(second.palette).every(color => well.test(color))).toBe(true);

    actor.gender = 'man'; actor.age = 70; sect.alignment = '魔道';
    expect(projectCultivatorPortrait(world, actor)).toMatchObject({
      face: first.face, attire: 'crossed', ageBand: 'elder', halo: { kind: 'blood-moon' },
    });
    actor.realm = '筑基';
    expect(projectCultivatorPortrait(world, actor)?.halo).toBeUndefined();
    actor.realm = '化神';
    actor.alive = false;
    expect(projectCultivatorPortrait(world, actor)?.halo).toBeUndefined();
    expect(projectCultivatorPortrait(world, actor)?.face).toEqual(first.face);
  });
});

describe('portrait projection cannot widen the canonical painted map', () => {
  it('drops remembered tiles, nonstationary positions, new sibling objects and duplicate identities', () => {
    const world = createInitialWorld(2031);
    const observer = at(world, 'npc-1'), elsewhere = at(world, 'npc-6');
    const local = createTerrainMapView(world, observer, true);
    const full = createTerrainMapView(world, observer, false);
    const original = JSON.stringify(world);
    const portrait = projectMapCultivatorPortrait(world, local, observer)!;
    expect(portrait).toEqual(projectCultivatorPortrait(world, observer));
    expect(projectMapCultivatorPortraits(world, local).get(observer.id)).toEqual(portrait);
    expect(projectMapCultivatorHalos(world, local).get(observer.id)).toEqual(portrait.halo);
    expect(projectMapCultivatorPortrait(world, local, elsewhere)).toBeUndefined();
    expect(projectMapCultivatorPortrait(world, { ...full, current: local.current }, elsewhere)).toBeUndefined();
    const sibling = structuredClone(world);
    expect(projectMapCultivatorPortrait(sibling, local, at(sibling, observer.id))).toBeUndefined();
    const trail = new Map(local.trailPositions);
    trail.set(observer.id, { x: 42, y: 64 });
    expect(projectMapCultivatorHalos(world, { ...local, trailPositions: trail }).has(observer.id)).toBe(false);
    expect(JSON.stringify(world)).toBe(original);

    const ambiguous = structuredClone(world);
    const copiedObserver = at(ambiguous, observer.id);
    ambiguous.cultivators.push(structuredClone(copiedObserver));
    const view = createTerrainMapView(ambiguous, copiedObserver, false);
    expect(projectCultivatorPortrait(ambiguous, copiedObserver)).toBeUndefined();
    expect(projectMapCultivatorHalos(ambiguous, view).has(observer.id)).toBe(false);
  });
});
