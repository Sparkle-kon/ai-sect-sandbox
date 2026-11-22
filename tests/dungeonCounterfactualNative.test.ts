import { describe, expect, it } from 'vitest';
import { captureDungeonCounterfactualSource, previewDungeonCounterfactual, projectRealDungeonChoice } from '../src/engine/dungeonCounterfactual';
import { encodeEraWorldSave } from '../src/engine/storageEngine';
import { dungeonActor, dungeonMove, dungeonOccasion, dungeonOccasionIn, dungeonOutsider, enterNativeDungeon } from './expeditionDungeonNativeFixture';

describe('the same actual native garden, two isolated counterfactual routes', () => {
  it('starts from one unchanged source, shows only genuinely paid native steps, and never awards speculative loot', () => {
    const { world } = enterNativeDungeon();
    const actor = dungeonActor(world);
    const before = encodeEraWorldSave(world);
    const source = captureDungeonCounterfactualSource(world, actor, dungeonOccasion, 'main', 7)!;
    expect(world.playerAvatar.possessedId).toBeUndefined();
    expect(source.firstOptions.map(row => row.dungeonMove)).toEqual(['gather', 'retreat']);
    const trial = previewDungeonCounterfactual(source, world, 'main', 7)!;
    expect(trial.sourceTick).toBe(8);
    const [advance, leave] = trial.routes;
    expect(advance.steps[0]).toMatchObject({ move: 'gather', tick: 9, roomBefore: 'garden', roomAfter: 'hall', jadeLeaf: 1 });
    expect(advance.steps.length).toBeLessThanOrEqual(8);
    expect(new Set(advance.steps.map(row => row.eventId)).size).toBe(advance.steps.length);
    expect(leave).toMatchObject({ status: 'returned', steps: [{ tick: 9, move: 'retreat', exit: 'retreated' }] });
    expect(leave.steps[0].jadeLeaf).toBeUndefined();
    expect(advance.steps.find(row => row.move === 'break_array')).toMatchObject({ tick: 10, qiPaid: 18 });
    const award = advance.steps.find(row => row.artifactAwarded);
    expect(award).toMatchObject({ move: 'claim', stones: 80, tick: 14 });
    expect(advance.steps.find(row => row.bossAfter === 0)!.tick).toBeLessThan(award!.tick);
    expect(advance).toMatchObject({ status: 'returned' });
    expect(advance.steps.at(-1)).toMatchObject({ move: 'retreat', exit: 'escaped', tick: 15 });
    expect(previewDungeonCounterfactual(source, world, 'main', 7)).toEqual(trial);
    expect(encodeEraWorldSave(world)).toBe(before);
    expect(dungeonOccasionIn(world).dungeon?.room).toBe('garden');
  });

  it('rejects stale/sibling source even at the same date, a non-attendee, and unobserved real commits', () => {
    const { world } = enterNativeDungeon(), actor = dungeonActor(world);
    const source = captureDungeonCounterfactualSource(world, actor, dungeonOccasion, 'main', 7)!;
    expect(captureDungeonCounterfactualSource(world, dungeonActor(world, dungeonOutsider), dungeonOccasion, 'main', 7)).toBeUndefined();
    expect(captureDungeonCounterfactualSource(world, { ...actor }, dungeonOccasion, 'main', 7)).toBeUndefined();
    const replacement = structuredClone(world);
    expect(previewDungeonCounterfactual(source, replacement, 'main', 7)).toBeUndefined();
    expect(previewDungeonCounterfactual(source, world, 'sibling', 7)).toBeUndefined();
    expect(previewDungeonCounterfactual(source, world, 'main', 8)).toBeUndefined();
    expect(previewDungeonCounterfactual({ ...source }, world, 'main', 7)).toBeUndefined();
    const actual = dungeonMove(world, 'retreat', 'garden');
    expect(projectRealDungeonChoice(source, world, actual, source.firstOptions[1])).toMatchObject({ exit: 'retreated', tick: 9 });
    expect(projectRealDungeonChoice(source, world, actual, source.firstOptions[0])).toBeUndefined();
    const duplicate = structuredClone(actual);
    duplicate.events.push({ ...actual.events.find(row => row.id === dungeonOccasionIn(actual).dungeon!.steps.at(-1)!.eventId)! });
    expect(projectRealDungeonChoice(source, world, duplicate, source.firstOptions[1])).toBeUndefined();
  });
});
