import type { Cultivator, LLMDecisionPayload, ScriptureEdition, ScriptureEditionKind, ScriptureMove, ScriptureOriginal,
  ScriptureState, Technique, WorldEvent, WorldState } from '../types/world';
import { elementalRelation } from './elementalEngine';
import { knownMapLocations } from './terrainEngine';

const ANNOTATION_MASTERY_FLOOR = 30;
const FAITHFUL_MASTERY_FLOOR = 55;
export const SCRIPTURE_CORRECTION_MASTERY = 65;
export const SCRIPTURE_CORRECTION_COST = 25;
export const SCRIPTURE_EDITION_LABELS: Record<ScriptureEditionKind, string> = { gloss: '据本笺注', misread: '偏读异本', corrected: '据本校订' };
export const SCRIPTURE_EDITION_MODIFIERS: Readonly<Record<ScriptureEditionKind, { combat: number; cultivation: number }>> = {
  gloss: { combat: 1.02, cultivation: 1.04 },
  misread: { combat: .88, cultivation: 1.14 },
  corrected: { combat: 1.08, cultivation: 1.08 },
};
const BASELINE = Object.freeze({ combat: 1, cultivation: 1 });
const live = (actor: Cultivator) => actor.alive && actor.hp > 0;
const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

export interface ScriptureOption {
  action: 'SCRIPTURE';
  editionMove: ScriptureMove;
  targetScriptureOriginalId?: string;
  targetScriptureEditionId?: string;
}

export const createScriptureState = (): ScriptureState => ({ originals: [], editions: [] });

function sameText(a: Technique, b: Technique): boolean {
  return a.id === b.id && a.authorId === b.authorId && a.createdTick === b.createdTick &&
    a.name === b.name && a.spiritRoot === b.spiritRoot;
}

/** Metadata only, never another physical copy of the canon. Existing original can never be overwritten. */
export function registerScriptureOriginal(world: WorldState, technique: Technique, source: ScriptureOriginal['source'],
  sourceLocationId?: string, sourceSectId?: string): boolean {
  if (!technique.id) return false;
  const known = world.scriptures.originals.find(({ id }) => id === technique.id);
  if (known) return sameText(known.technique, technique);
  world.scriptures.originals.push({ id: technique.id, technique: { ...technique }, firstSeenTick: world.tick, source,
    ...(sourceLocationId ? { sourceLocationId } : {}), ...(sourceSectId ? { sourceSectId } : {}) });
  return true;
}

function practicedOriginal(world: WorldState, actor: Cultivator): ScriptureOriginal | undefined {
  return actor.technique.id ? world.scriptures.originals.find(({ id, technique }) =>
    id === actor.technique.id && sameText(technique, actor.technique)) : undefined;
}

function localEdition(world: WorldState, actor: Cultivator, edition: ScriptureEdition): boolean {
  return edition.authorId === actor.id || edition.id === actor.activeEdition?.editionId ||
    (edition.locationId === actor.locationId && world.locations.some(({ id }) => id === edition.locationId));
}

/** Immutable manuscript must actually be available; knowledge alone does not make a new physical source. */
function accessibleCanonicalCopy(world: WorldState, actor: Cultivator, original: ScriptureOriginal): ScriptureEdition['evidence'] {
  const site = world.locations.find(({ id }) => id === actor.locationId);
  if (!site) return undefined;
  if (actor.authoredTechnique && actor.authoredTechnique.authorId === actor.id && sameText(actor.authoredTechnique, original.technique)) {
    return { kind: 'author_manuscript', locationId: site.id };
  }
  const sect = world.sects.find(({ id, headquartersId }) => id === actor.sectId && headquartersId === site.id);
  if (sect?.pavilion.some((text) => sameText(text, original.technique))) {
    return { kind: 'pavilion', locationId: site.id, sectId: sect.id };
  }
  if (site.inheritanceScrolls.some((text) => sameText(text, original.technique))) {
    return { kind: 'inheritance', locationId: site.id };
  }
}

export function visibleScriptureEditions(world: WorldState, actor: Cultivator): { original?: ScriptureOriginal; editions: ScriptureEdition[] } {
  const original = practicedOriginal(world, actor);
  if (!original) return { editions: [] };
  const known = new Set(knownMapLocations(world, actor).map(({ id }) => id));
  const { sourceLocationId, sourceSectId, ...base } = original;
  const canDiscloseSource = !sourceLocationId || known.has(sourceLocationId);
  const publicOriginal: ScriptureOriginal = { ...base, technique: { ...base.technique },
    ...(canDiscloseSource && sourceLocationId ? { sourceLocationId } : {}),
    ...(canDiscloseSource && sourceSectId ? { sourceSectId } : {}) };
  const editions = world.scriptures.editions.filter((edition) => edition.originalId === original.id && localEdition(world, actor, edition))
    .sort(byId).map((edition) => {
      const { evidence, ...view } = edition;
      return evidence && (known.has(evidence.locationId) || edition.authorId === actor.id) ? { ...view, evidence: { ...evidence } } : view;
    });
  return { original: publicOriginal, editions };
}

export function scriptureEditionModifiers(actor: Cultivator): { combat: number; cultivation: number } {
  const edition = actor.activeEdition;
  if (!edition || actor.technique.id !== edition.originalId) return BASELINE;
  return SCRIPTURE_EDITION_MODIFIERS[edition.kind] ?? BASELINE;
}

export function availableScriptureActions(actor: Cultivator, world: WorldState): ScriptureOption[] {
  if (!live(actor) || !world.cultivators.includes(actor) || !world.locations.some(({ id }) => id === actor.locationId)) return [];
  const { original, editions } = visibleScriptureEditions(world, actor);
  const result: ScriptureOption[] = [];
  if (actor.activeEdition) result.push({ action: 'SCRIPTURE', editionMove: 'revert' });
  if (!original) return result;
  if (actor.techniqueMastery >= ANNOTATION_MASTERY_FLOOR &&
      !world.scriptures.editions.some((entry) => entry.originalId === original.id && entry.authorId === actor.id && entry.kind !== 'corrected')) {
    result.push({ action: 'SCRIPTURE', editionMove: 'annotate', targetScriptureOriginalId: original.id });
  }
  const canCorrect = actor.techniqueMastery >= SCRIPTURE_CORRECTION_MASTERY && actor.spiritStones >= SCRIPTURE_CORRECTION_COST &&
    Boolean(accessibleCanonicalCopy(world, actor, original));
  for (const edition of editions) {
    // A loan reserves the single circulated physical copy, not an author's own knowledge or already active reading.
    const actualCustody = world.pavilionLoans.copies.some((row) => row.editionId === edition.id) ?
      world.pavilionLoans.loans.find((row) => row.editionId === edition.id && !row.returned) : undefined;
    const mayReadLocalCopy = !actualCustody || edition.authorId === actor.id || actualCustody.borrowerId === actor.id;
    if (mayReadLocalCopy && actor.activeEdition?.editionId !== edition.id) {
      result.push({ action: 'SCRIPTURE', editionMove: 'adopt', targetScriptureEditionId: edition.id });
    }
    if (canCorrect && edition.kind === 'misread' &&
        !world.scriptures.editions.some(({ parentEditionId }) => parentEditionId === edition.id)) {
      result.push({ action: 'SCRIPTURE', editionMove: 'compare', targetScriptureEditionId: edition.id });
    }
  }
  return result;
}

function event(world: WorldState, actor: Cultivator, key: string, title: string, description: string): WorldEvent {
  return { id: `evt-${world.tick}-scripture-${key}-${actor.id}`, tick: world.tick, year: world.year, month: world.month,
    title, description, actorIds: [actor.id], locationId: actor.locationId, category: 'breakthrough' };
}

function compactHash(key: readonly string[]): string {
  const text = JSON.stringify(key);
  let first = 0x811c9dc5, second = 0x84222325;
  for (let i = 0; i < text.length; i++) {
    first = Math.imul(first ^ text.charCodeAt(i), 0x01000193);
    second = Math.imul(second ^ text.charCodeAt(text.length - 1 - i), 0x01000193);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

function editionId(world: WorldState, key: readonly string[]): string {
  const base = `scripture-edition-${compactHash(key)}`;
  let id = base, suffix = 1;
  while (world.scriptures.editions.some((item) => item.id === id)) id = `${base}-${++suffix}`;
  return id;
}

export function resolveScriptureAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'SCRIPTURE') return null;
  const option = availableScriptureActions(actor, world).find((entry) => entry.editionMove === decision.editionMove &&
    entry.targetScriptureOriginalId === decision.targetScriptureOriginalId && entry.targetScriptureEditionId === decision.targetScriptureEditionId);
  if (!option) return null;
  if (option.editionMove === 'revert') {
    const prior = actor.activeEdition?.editionId;
    delete actor.activeEdition;
    return event(world, actor, `revert-${prior}`, '回归原典参修', '弃用当前异本；只应用未经版本修正的熟练度。');
  }
  if (option.editionMove === 'adopt') {
    const edition = world.scriptures.editions.find(({ id }) => id === option.targetScriptureEditionId)!;
    actor.activeEdition = { originalId: edition.originalId, editionId: edition.id, kind: edition.kind };
    return event(world, actor, `adopt-${edition.id}`, '择本参修', `采用${SCRIPTURE_EDITION_LABELS[edition.kind]}；未重复增加熟练度。`);
  }
  const original = practicedOriginal(world, actor)!;
  if (option.editionMove === 'annotate') {
    const alignment = elementalRelation(actor.spiritRoot, original.technique.spiritRoot);
    const kind: ScriptureEditionKind = actor.techniqueMastery < FAITHFUL_MASTERY_FLOOR || alignment === 'overcoming' ? 'misread' : 'gloss';
    const id = editionId(world, ['annotation', original.id, actor.id]);
    world.scriptures.editions.push({ id, originalId: original.id, authorId: actor.id, kind, createdTick: world.tick, locationId: actor.locationId });
    return event(world, actor, `annotate-${id}`, '经义另录异本', `${actor.name}留下具名${SCRIPTURE_EDITION_LABELS[kind]}；原典未被改写。`);
  }
  const authorCopy = accessibleCanonicalCopy(world, actor, original)!;
  const parent = world.scriptures.editions.find(({ id }) => id === option.targetScriptureEditionId)!;
  const id = editionId(world, ['correction', original.id, parent.id]);
  actor.spiritStones -= SCRIPTURE_CORRECTION_COST;
  world.scriptures.editions.push({ id, originalId: original.id, authorId: actor.id, kind: 'corrected', createdTick: world.tick,
    locationId: actor.locationId, parentEditionId: parent.id, evidence: authorCopy });
  return event(world, actor, `compare-${id}`, '据原典校订偏读', `${actor.name}耗${SCRIPTURE_CORRECTION_COST}灵石核对实际原典，将此偏读另立稽核新版，保存旧本及归属。`);
}
