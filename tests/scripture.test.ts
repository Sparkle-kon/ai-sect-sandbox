import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { createScriptureState, availableScriptureActions, resolveScriptureAction, scriptureEditionModifiers,
  SCRIPTURE_CORRECTION_COST, SCRIPTURE_CORRECTION_MASTERY, visibleScriptureEditions } from '../src/engine/scriptureEngine';
import { authorTechnique, dropInheritance, masteryMultiplier, studyTechnique } from '../src/engine/techniqueEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { Cultivator, LLMDecisionPayload, ScriptureMove } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(164);
  world.scriptures = createScriptureState();
  const sect = world.sects[0];
  const site = world.locations.find(({ id }) => id === sect.headquartersId)!;
  const [author, reader] = world.cultivators.filter((actor) => actor.sectId === sect.id);
  const other = world.cultivators.find((actor) => actor.sectId !== sect.id)!;
  world.tick = 12;
  author.realm = '元婴';
  author.techniqueMastery = 85;
  author.locationId = reader.locationId = site.id;
  const act = (actor: Cultivator, editionMove: ScriptureMove, fields: Partial<LLMDecisionPayload> = {}) =>
    resolveScriptureAction(world, actor, { chosenAction: 'SCRIPTURE', editionMove, innerMonologue: '据实参阅', ...fields });
  const write = () => {
    expect(authorTechnique(author, world)).not.toBeNull();
    return author.technique.id!;
  };
  const readAndMisread = () => {
    const id = write();
    expect(studyTechnique(reader, world, id)).not.toBeNull();
    reader.techniqueMastery = 38;
    expect(act(reader, 'annotate', { targetScriptureOriginalId: id })).not.toBeNull();
    return world.scriptures.editions[0];
  };
  return { world, sect, site, author, reader, other, act, write, readAndMisread };
}

describe('immutable scripture originals and independently corrected editions', () => {
  it('records only real originals without extra physical copies, including actual inherited one-use holdings', () => {
    const { world, sect, site, author, reader, other, write } = fixture();
    expect(world.scriptures.originals).toEqual([]);
    expect(availableScriptureActions(reader, world)).toEqual([]);
    const id = write();
    const authored = world.scriptures.originals[0];
    expect(authored).toMatchObject({ id, source: 'authored', firstSeenTick: world.tick, sourceSectId: sect.id, sourceLocationId: site.id });
    expect(sect.pavilion).toHaveLength(1);
    const first = structuredClone(authored);
    expect(studyTechnique(reader, world, id)).not.toBeNull();
    expect(world.scriptures.originals).toEqual([first]);
    expect(sect.pavilion).toHaveLength(1);
    sect.pavilion[0].name = '伪造改题';
    expect(authored).toEqual(first);
    other.sectId = sect.id; other.locationId = site.id;
    expect(studyTechnique(other, world, id)).toBeNull();

    // A canon may first arrive as a real legacy death drop, without retroactively minting copies.
    author.authoredTechnique = { id: 'previously-untracked-original', name: '旧人散卷', authorId: author.id, createdTick: 3, spiritRoot: '水' };
    author.alive = false; author.hp = 0;
    dropInheritance(author, world);
    expect(world.scriptures.originals).toHaveLength(1);
    expect(site.inheritanceScrolls).toHaveLength(1);
    expect(studyTechnique(other, world, author.authoredTechnique.id)).not.toBeNull();
    expect(site.inheritanceScrolls).toHaveLength(0);
    expect(world.scriptures.originals[1]).toMatchObject({ id: author.authoredTechnique.id, source: 'inheritance', sourceLocationId: site.id });
    expect(studyTechnique(reader, world, author.authoredTechnique.id)).toBeNull();
  });

  it('compares a real misread only with sufficient mastery, funds and physically accessible canonical text', () => {
    const { world, sect, site, reader, author, act, readAndMisread } = fixture();
    const misread = readAndMisread();
    expect(misread).toMatchObject({ originalId: reader.technique.id, authorId: reader.id, kind: 'misread' });
    const original = structuredClone(world.scriptures.originals[0]);
    const parent = structuredClone(misread);
    const priorFunds = 300;
    reader.spiritStones = priorFunds;
    expect(act(reader, 'compare', { targetScriptureEditionId: misread.id })).toBeNull();
    reader.techniqueMastery = SCRIPTURE_CORRECTION_MASTERY;
    reader.spiritStones = 1;
    expect(act(reader, 'compare', { targetScriptureEditionId: misread.id })).toBeNull();
    reader.spiritStones = priorFunds;
    const physicalText = sect.pavilion.pop()!;
    expect(act(reader, 'compare', { targetScriptureEditionId: misread.id })).toBeNull();
    sect.pavilion.push({ ...physicalText, name: '被篡改的卷名' });
    expect(act(reader, 'compare', { targetScriptureEditionId: misread.id })).toBeNull();
    sect.pavilion[0] = physicalText;
    expect(act(reader, 'compare', { targetScriptureEditionId: misread.id })?.title).toBe('据原典校订偏读');
    expect(act(reader, 'compare', { targetScriptureEditionId: misread.id })).toBeNull();
    expect(world.scriptures.editions[1]).toMatchObject({ kind: 'corrected', parentEditionId: misread.id, authorId: reader.id,
      evidence: { kind: 'pavilion', locationId: site.id, sectId: sect.id } });
    expect(world.scriptures.originals[0]).toEqual(original);
    expect(world.scriptures.editions[0]).toEqual(parent);
    expect(reader.spiritStones).toBe(priorFunds - SCRIPTURE_CORRECTION_COST);
    expect(act(author, 'annotate', { targetScriptureOriginalId: original.id })).not.toBeNull();
    expect(world.scriptures.editions[2]).toMatchObject({ kind: 'gloss', authorId: author.id });
  });

  it('uses one active known edition, distinct actual cultivation/combat multipliers, and no stacking or mastery freebie', () => {
    const { world, reader, act, readAndMisread } = fixture();
    const misread = readAndMisread();
    reader.techniqueMastery = 70;
    reader.spiritStones = 400;
    expect(act(reader, 'compare', { targetScriptureEditionId: misread.id })).not.toBeNull();
    const corrected = world.scriptures.editions[1];
    expect(masteryMultiplier(reader)).toBe(1.07);
    expect(act(reader, 'adopt', { targetScriptureEditionId: misread.id })).not.toBeNull();
    expect(act(reader, 'adopt', { targetScriptureEditionId: misread.id })).toBeNull();
    expect(reader.techniqueMastery).toBe(70);
    expect(scriptureEditionModifiers(reader)).toEqual({ combat: .88, cultivation: 1.14 });
    expect(masteryMultiplier(reader, 'combat')).toBeCloseTo(1.07 * .88);
    expect(masteryMultiplier(reader, 'cultivation')).toBeCloseTo(1.07 * 1.14);
    const fast = structuredClone(world);
    const fastReader = fast.cultivators.find(({ id }) => id === reader.id)!;
    fastReader.qiProgress = reader.qiProgress = 0;
    expect(act(reader, 'adopt', { targetScriptureEditionId: corrected.id })).not.toBeNull();
    expect(reader.activeEdition?.editionId).toBe(corrected.id);
    expect(scriptureEditionModifiers(reader)).toEqual({ combat: 1.08, cultivation: 1.08 });
    expect(masteryMultiplier(reader, 'combat')).toBeCloseTo(1.07 * 1.08);
    const consistent = structuredClone(world);
    const consistentReader = consistent.cultivators.find(({ id }) => id === reader.id)!;
    const normal = structuredClone(world);
    const normalReader = normal.cultivators.find(({ id }) => id === reader.id)!;
    delete normalReader.activeEdition;
    const intent = { chosenAction: 'CULTIVATE' as const, innerMonologue: '按固定气息演练' };
    applyCultivatorBrainDecision(fast, fastReader, intent, () => .8);
    applyCultivatorBrainDecision(consistent, consistentReader, intent, () => .8);
    applyCultivatorBrainDecision(normal, normalReader, intent, () => .8);
    expect(fastReader.qiProgress).toBeGreaterThanOrEqual(consistentReader.qiProgress);
    expect(consistentReader.qiProgress).toBeGreaterThan(normalReader.qiProgress);

    expect(act(reader, 'revert')).not.toBeNull();
    expect(act(reader, 'revert')).toBeNull();
    expect(scriptureEditionModifiers(reader)).toEqual({ combat: 1, cultivation: 1 });
  });

  it('does not expose unknown source locations or remote notes, and clears adoption when switching canon', () => {
    const { world, sect, site, author, reader, other, act, readAndMisread } = fixture();
    const remote = world.locations.find(({ type }) => type === 'secret_realm')!;
    author.locationId = remote.id;
    reader.exploredTileIds = []; reader.rumors = [];
    const misread = readAndMisread();
    expect(world.scriptures.originals[0].sourceLocationId).toBe(remote.id);
    expect(visibleScriptureEditions(world, reader).original?.sourceLocationId).toBeUndefined();
    other.locationId = remote.id;
    other.technique = { ...reader.technique };
    expect(visibleScriptureEditions(world, other).editions).toEqual([]);
    expect(act(other, 'adopt', { targetScriptureEditionId: misread.id })).toBeNull();
    other.locationId = site.id;
    expect(act(other, 'adopt', { targetScriptureEditionId: misread.id })).not.toBeNull();
    expect(other.activeEdition?.originalId).toBe(misread.originalId);
    other.sectId = sect.id;
    sect.pavilion.push({ id: 'second-real-original', name: '又一真本', spiritRoot: '木', createdTick: 4 });
    expect(studyTechnique(other, world, 'second-real-original')).not.toBeNull();
    expect(other.activeEdition).toBeUndefined();
    expect(scriptureEditionModifiers(other)).toEqual({ combat: 1, cultivation: 1 });
  });
});
