import type { DungeonMove, DungeonRoom } from '../types/expeditionDungeon';
import type { Cultivator, LLMDecisionPayload, WorldOccasion, WorldState } from '../types/world';
import { cloneWorldWithColdHistory } from './coldHistoryEngine';
import { availableDungeonMoves, projectExpeditionDungeon, type DungeonOption } from './expeditionDungeonEngine';
import { advanceWorldTick } from './worldEngine';
import { sameGeneratedWorld } from './worldIdentity';

const MAX_MOVES = 8;
const moves = ['gather', 'retreat'] as const;

export interface DungeonCounterfactualSource {
  readonly world: WorldState;
  readonly branchId: string;
  readonly revision: number;
  readonly actorId: string;
  readonly occasionId: string;
  readonly sourceTick: number;
  readonly firstOptions: readonly [DungeonOption, DungeonOption];
}

export interface DungeonCounterfactualStep {
  readonly eventId: string;
  readonly tick: number;
  readonly move: DungeonMove;
  readonly roomBefore: DungeonRoom;
  readonly roomAfter: DungeonRoom;
  readonly title: string;
  readonly text: string;
  readonly jadeLeaf?: number;
  readonly qiPaid?: number;
  readonly hpLost?: number;
  readonly bossBefore?: number;
  readonly bossAfter?: number;
  readonly stones?: number;
  readonly artifactAwarded?: true;
  readonly exit?: 'escaped' | 'retreated';
}
export interface DungeonCounterfactualRoute {
  readonly firstOption: DungeonOption;
  readonly steps: readonly DungeonCounterfactualStep[];
  readonly status: 'returned' | 'stopped' | 'bounded';
}
export interface DungeonCounterfactualView {
  readonly actorId: string;
  readonly occasionId: string;
  readonly sourceTick: number;
  readonly routes: readonly [DungeonCounterfactualRoute, DungeonCounterfactualRoute];
}

function only<T>(rows: readonly T[], matches: (row: T) => boolean): T | undefined {
  let first: T | undefined;
  for (const row of rows) {
    if (!matches(row)) continue;
    if (first) return undefined;
    first = row;
  }
  return first;
}

const chosen = (left: DungeonOption, right: DungeonOption) =>
  left.action === right.action && left.targetOccasionId === right.targetOccasionId &&
  left.targetDungeonRoomId === right.targetDungeonRoomId && left.dungeonMove === right.dungeonMove;
const byActor = (world: WorldState, id: string) => only(world.cultivators, actor => actor.id === id);
const byOccasion = (world: WorldState, id: string) => only(world.occasions, occasion => occasion.id === id);
const knownSources = new WeakSet<DungeonCounterfactualSource>();

function firstOptions(world: WorldState, actor: Cultivator, occasionId: string) {
  const scope = projectExpeditionDungeon(world, actor, occasionId);
  if (!scope || scope.room !== 'garden' || scope.closedTick !== undefined ||
      !only(scope.members, member => member.actorId === actor.id && member.leftTick === undefined)) return undefined;
  const [gather, retreat] = moves.map(move =>
    only(scope.options, option => option.dungeonMove === move && option.targetDungeonRoomId === 'garden'));
  return gather && retreat ? [gather, retreat] as const : undefined;
}

export function captureDungeonCounterfactualSource(
  world: WorldState, actor: Cultivator, occasionId: string, branchId: string, revision: number,
): DungeonCounterfactualSource | undefined {
  if (!branchId || !Number.isSafeInteger(revision) || revision < 0 || byActor(world, actor.id) !== actor)
    return undefined;
  const choices = firstOptions(world, actor, occasionId);
  if (!choices) return undefined;
  const source: DungeonCounterfactualSource = Object.freeze({ world, actorId: actor.id, occasionId, branchId, revision,
    sourceTick: world.tick, firstOptions: Object.freeze([Object.freeze(choices[0]), Object.freeze(choices[1])] as const) });
  knownSources.add(source);
  return source;
}

function sameSource(source: DungeonCounterfactualSource, world: WorldState, branchId: string, revision: number) {
  if (!knownSources.has(source) || source.world !== world || source.branchId !== branchId ||
      source.revision !== revision || world.tick !== source.sourceTick) return false;
  const actor = byActor(world, source.actorId);
  const current = actor && firstOptions(world, actor, source.occasionId);
  return !!current && current.every((option, i) => chosen(option, source.firstOptions[i]));
}

const decision = (option: DungeonOption): LLMDecisionPayload => ({
  chosenAction: 'EXPEDITION_DUNGEON', targetOccasionId: option.targetOccasionId,
  targetDungeonRoomId: option.targetDungeonRoomId, dungeonMove: option.dungeonMove,
  innerMonologue: '只按此刻实有的路径行事。',
});

function stepProof(
  before: WorldState, after: WorldState, actorId: string, option: DungeonOption,
): DungeonCounterfactualStep | undefined {
  if (before === after || after.tick !== before.tick + 1 || !sameGeneratedWorld(before, after) ||
      before.interventionSequence !== after.interventionSequence) return undefined;
  const pre = byOccasion(before, option.targetOccasionId), post = byOccasion(after, option.targetOccasionId);
  const oldD = pre?.dungeon, newD = post?.dungeon;
  const oldA = byActor(before, actorId), newA = byActor(after, actorId);
  if (!pre || !post || !oldD || !newD || !oldA || !newA || !newA.alive || newA.hp <= 0 ||
      pre.kind !== 'expedition' || post.kind !== 'expedition' || !pre.omenId || post.omenId !== pre.omenId ||
      pre.locationId !== post.locationId || oldD.openedTick !== newD.openedTick ||
      oldD.room !== option.targetDungeonRoomId || !availableDungeonMoves(before, oldA, before.tick + 1).some(x => chosen(x, option)))
    return undefined;
  const move = option.dungeonMove;
  const eventId = `evt-${after.tick}-${post.id}-dungeon-${move}-${actorId}`;
  const record = only(newD.steps, step => step.tick === after.tick && step.actorId === actorId);
  const original = only(after.events, event => event.id === eventId);
  const membership = only(newD.members, member => member.actorId === actorId);
  if (!record || record.eventId !== eventId || record.move !== move || !original || !membership ||
      original.tick !== after.tick || original.year !== after.year || original.month !== after.month ||
      original.category !== 'heavenly' || original.locationId !== post.locationId || original.witnessScope !== 'participants' ||
      original.actorIds[0] !== actorId || new Set(original.actorIds).size !== original.actorIds.length ||
      original.actorIds.some(id => !newD.members.some(member => member.actorId === id))) return undefined;
  const base = { eventId, tick: after.tick, move, roomBefore: oldD.room, roomAfter: newD.room };
  switch (record.move) {
    case 'enter': return undefined;
    case 'gather': {
      const oldGate = only(before.locations, row => row.id === pre.locationId);
      const gate = only(after.locations, row => row.id === post.locationId);
      if (oldD.room !== 'garden' || newD.room !== 'hall' || record.jadeLeaf !== 1 || !oldGate || !gate ||
          oldGate.herbs.jade_leaf - gate.herbs.jade_leaf !== 1 || newA.herbs.jade_leaf - oldA.herbs.jade_leaf !== 1)
        return undefined;
      return { ...base, title: '从药园入古殿', text: '从实有药圃采得一枚翡翠灵叶，随后进入古殿。', jadeLeaf: record.jadeLeaf };
    }
    case 'break_array':
      if (oldD.room !== 'hall' || newD.room !== 'sanctum' || record.qiPaid !== 18) return undefined;
      return { ...base, title: '打开古殿阵门', text: '以十八点灵气解开阵门，步入传承禁地。', qiPaid: record.qiPaid };
    case 'strike':
      if (oldD.room !== 'sanctum' || newD.room !== 'sanctum' || record.bossBefore !== oldD.bossHp ||
          record.bossAfter !== newD.bossHp || record.bossAfter >= record.bossBefore ||
          !Number.isFinite(record.hpLost) || record.hpLost < 0) return undefined;
      return { ...base, title: record.bossAfter ? '与妖王交锋' : '妖王伏倒',
        text: record.bossAfter ? '此招已落定，妖王仍未伏倒。' : '妖王确已倒下，宝物仍须亲手取得。',
        hpLost: record.hpLost, bossBefore: record.bossBefore, bossAfter: record.bossAfter };
    case 'claim':
      if (oldD.bossHp !== 0 || newD.bossHp !== 0 || !newA.artifacts.some(item => item.id === record.artifactId) ||
          oldA.artifacts.some(item => item.id === record.artifactId) || record.stones !== 80) return undefined;
      return { ...base, title: '取得藏星古钥', text: '本人取走藏星古钥与八十灵石，仍须从出口折返。',
        stones: record.stones, artifactAwarded: true };
    case 'retreat':
      if (membership.leftTick !== after.tick || (membership.exit !== 'escaped' && membership.exit !== 'retreated') ||
          !pre.anchorSiteId || newA.locationId !== pre.anchorSiteId || newA.positionPlane !== undefined ||
          post.remainingIds.includes(actorId)) return undefined;
      return { ...base, title: '原身折返回星门外', text: '本人沿实有出口折返。此步没有代替其他人脱险。', exit: membership.exit };
  }
}

export function projectRealDungeonChoice(
  source: DungeonCounterfactualSource, before: WorldState, after: WorldState, option: DungeonOption,
): DungeonCounterfactualStep | undefined {
  return sameSource(source, before, source.branchId, source.revision) && source.firstOptions.some(x => chosen(x, option))
    ? stepProof(before, after, source.actorId, option) : undefined;
}

function nextMove(occasion: WorldOccasion): DungeonMove | undefined {
  const dungeon = occasion.dungeon;
  if (dungeon?.closedTick !== undefined) return undefined;
  if (dungeon?.room === 'hall') return 'break_array';
  if (dungeon?.room === 'sanctum') return dungeon.bossHp > 0 ? 'strike' :
    dungeon.steps.some(step => step.move === 'claim') ? 'retreat' : 'claim';
  return undefined;
}

function replay(source: DungeonCounterfactualSource, first: DungeonOption): DungeonCounterfactualRoute {
  let world = cloneWorldWithColdHistory(source.world);
  let option: DungeonOption | undefined = first;
  const steps: DungeonCounterfactualStep[] = [];
  for (let n = 0; n < MAX_MOVES && option; n++) {
    const actor = byActor(world, source.actorId);
    const current = option;
    if (!actor || !availableDungeonMoves(world, actor, world.tick + 1).some(candidate => chosen(candidate, current))) break;
    const next = advanceWorldTick(world, { [source.actorId]: decision(current) }, undefined, 'utility', undefined,
      {captureTrace: false, capturePresentation: false});
    const observed = stepProof(world, next, actor.id, current);
    if (!observed) break;
    steps.push(observed);
    if (observed.exit) return { firstOption: first, steps, status: 'returned' };
    world = next;
    const occasion = byOccasion(world, source.occasionId), body = byActor(world, source.actorId);
    const continuation = occasion && nextMove(occasion);
    option = continuation && body ? only(availableDungeonMoves(world, body, world.tick + 1),
      row => row.targetOccasionId === occasion?.id && row.dungeonMove === continuation) : undefined;
  }
  return { firstOption: first, steps, status: steps.length === MAX_MOVES ? 'bounded' : 'stopped' };
}

export function previewDungeonCounterfactual(
  source: DungeonCounterfactualSource, world: WorldState, branchId: string, revision: number,
): DungeonCounterfactualView | undefined {
  if (!sameSource(source, world, branchId, revision)) return undefined;
  const [gather, retreat] = source.firstOptions;
  return { actorId: source.actorId, occasionId: source.occasionId, sourceTick: source.sourceTick,
    routes: [replay(source, gather), replay(source, retreat)] };
}
