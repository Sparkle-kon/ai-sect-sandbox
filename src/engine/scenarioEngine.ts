import { createInitialWorld } from '../data/initialWorld';
import type { ScenarioOrigin, WorldgenProfileId, WorldState } from '../types/world';
import { advanceWorldTick, executeGodIntervention, type GodInterventionCommand } from './worldEngine';
import { isWorldSeed } from './worldRandom';
import { isWorldgenProfileId } from './worldgenProfiles';

export const SCENARIO_MAX_BYTES = 32_768;
export const SCENARIO_MAX_TICKS = 120;
export const SCENARIO_MAX_COMMANDS = 48;
export const SCENARIO_FORMAT = 'ai-sect-scenario';
export const SCENARIO_VERSION = 1;
export const SCENARIO_RULESET = 1;

export type ScenarioWhisperCue = 'focus' | 'rest' | 'caution';
export const SCENARIO_WHISPER_CUES: Readonly<Record<ScenarioWhisperCue, string>> = Object.freeze({
  focus: '凝神守心，稳步进修。', rest: '若有疲劳，宜先调息。', caution: '陌生所见，宜先察验。',
});
export type ScenarioCommand =
  | { type: 'SPAWN_TREASURE'; targetLocationId: string }
  | { type: 'TRIBULATION_STRIKE'; targetCultivatorId: string }
  | { type: 'DEMONIC_TIDE' }
  | { type: 'WHISPER_MIND'; targetCultivatorId: string; cue: ScenarioWhisperCue };

export interface ScenarioStep { tick: number; command: ScenarioCommand }
export interface ScenarioFixture {
  format: typeof SCENARIO_FORMAT;
  version: typeof SCENARIO_VERSION;
  ruleset: typeof SCENARIO_RULESET;
  seed: number;
  profileId: WorldgenProfileId;
  endTick: number;
  commands: ScenarioStep[];
}
export interface ScenarioReplayProgress { tick: number; endTick: number; completedCommands: number; totalCommands: number }
export interface ScenarioReplayOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ScenarioReplayProgress) => void;
  yieldEvery?: number;
}

export class ScenarioError extends Error {
  constructor(readonly code: 'size' | 'schema' | 'initial_ref' | 'execution_ref' | 'execution' | 'aborted',
    message: string, readonly commandIndex?: number, readonly tick?: number) {
    super(message);
    this.name = 'ScenarioError';
  }
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || !keys.every((key) => actual.includes(key))) return undefined;
  const output: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return undefined;
    output[key] = descriptor.value;
  }
  return output;
}

const validId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_\-]{1,128}$/u.test(id);
const validTick = (tick: unknown): tick is number => typeof tick === 'number' && Number.isSafeInteger(tick) && tick >= 1 && tick <= SCENARIO_MAX_TICKS;
const isCue = (value: unknown): value is ScenarioWhisperCue => typeof value === 'string' && Object.hasOwn(SCENARIO_WHISPER_CUES, value);

function normalizeCommand(value: unknown): ScenarioCommand | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const type: unknown = Object.getOwnPropertyDescriptor(value, 'type')?.value;
  if (type === 'DEMONIC_TIDE') return exactRecord(value, ['type']) ? { type } : undefined;
  if (type === 'SPAWN_TREASURE') {
    const args = exactRecord(value, ['type', 'targetLocationId']);
    if (args && validId(args.targetLocationId)) return { type, targetLocationId: args.targetLocationId };
  }
  if (type === 'TRIBULATION_STRIKE') {
    const args = exactRecord(value, ['type', 'targetCultivatorId']);
    if (args && validId(args.targetCultivatorId)) return { type, targetCultivatorId: args.targetCultivatorId };
  }
  if (type === 'WHISPER_MIND') {
    const args = exactRecord(value, ['type', 'targetCultivatorId', 'cue']);
    if (args && validId(args.targetCultivatorId) && isCue(args.cue)) return { type, targetCultivatorId: args.targetCultivatorId, cue: args.cue };
  }
}

function normalizeFixture(value: unknown): ScenarioFixture {
  const record = exactRecord(value, ['format', 'version', 'ruleset', 'seed', 'profileId', 'endTick', 'commands']);
  if (!record || record.format !== SCENARIO_FORMAT || record.version !== SCENARIO_VERSION || record.ruleset !== SCENARIO_RULESET) {
    throw new ScenarioError('schema', '不是支持版本的剧本文件，或含有剧本格式不允许的字段。');
  }
  const { seed, profileId, endTick, commands } = record;
  if (!isWorldSeed(seed) || !isWorldgenProfileId(profileId) || !validTick(endTick) || !Array.isArray(commands) ||
      commands.length > SCENARIO_MAX_COMMANDS || Reflect.ownKeys(commands).length !== commands.length + 1) {
    throw new ScenarioError('schema', '剧本种子、预设、结束回合或指令数量超出允许范围。');
  }
  let previous = 1;
  const normalized = Array.from({ length: commands.length }, (_, commandIndex): ScenarioStep => {
    const descriptor = Object.getOwnPropertyDescriptor(commands, String(commandIndex));
    const row = descriptor && 'value' in descriptor ? exactRecord(descriptor.value, ['tick', 'command']) : undefined;
    const tick = row?.tick;
    if (!row || !validTick(tick) || tick < previous || tick > endTick) {
      throw new ScenarioError('schema', '指令必须按回合排序，且不得超过剧本结束回合。', commandIndex, validTick(tick) ? tick : undefined);
    }
    const command = normalizeCommand(row.command);
    if (!command) throw new ScenarioError('schema', '指令类型或参数不受支持。仅允许结构化目标及预设提示。', commandIndex, tick);
    previous = tick;
    return { tick, command };
  });
  return { format: SCENARIO_FORMAT, version: SCENARIO_VERSION, ruleset: SCENARIO_RULESET, seed: seed >>> 0, profileId, endTick, commands: normalized };
}

function requireReference(world: WorldState, step: ScenarioStep, commandIndex: number, initial: boolean): void {
  const cmd = step.command;
  let valid = true;
  if (cmd.type === 'SPAWN_TREASURE') valid = world.locations.some(({ id }) => id === cmd.targetLocationId);
  else if (cmd.type === 'TRIBULATION_STRIKE' || cmd.type === 'WHISPER_MIND') {
    valid = world.cultivators.some((actor) => actor.id === cmd.targetCultivatorId && actor.alive && actor.hp > 0);
  } else if (!initial) valid = world.cultivators.some((actor) => actor.alive && actor.hp > 0);
  if (!valid) throw new ScenarioError(initial ? 'initial_ref' : 'execution_ref', initial
    ? '指令目标必须来自剧本预设的实际初始世界。'
    : '回放至该回合时，指令目标已不存在或不可执行。', commandIndex, step.tick);
}

function prepare(input: unknown): { fixture: ScenarioFixture; world: WorldState } {
  const fixture = normalizeFixture(input);
  const world = createInitialWorld(fixture.seed, fixture.profileId);
  fixture.commands.forEach((step, index) => requireReference(world, step, index, true));
  return { fixture, world };
}

export function validateScenarioFixture(input: unknown): ScenarioFixture {
  return prepare(input).fixture;
}

export function createScenarioFixture(seed: number, profileId: WorldgenProfileId,
  endTick = 1, commands: readonly ScenarioStep[] = []): ScenarioFixture {
  return validateScenarioFixture({ format: SCENARIO_FORMAT, version: SCENARIO_VERSION, ruleset: SCENARIO_RULESET, seed, profileId, endTick, commands: [...commands] });
}

export function decodeScenarioFixture(text: string): ScenarioFixture {
  if (typeof text !== 'string') throw new ScenarioError('schema', '剧本文件必须为 JSON 文本。');
  if (!text.length || text.length > SCENARIO_MAX_BYTES || new TextEncoder().encode(text).byteLength > SCENARIO_MAX_BYTES) {
    throw new ScenarioError('size', '剧本文件为空或超出 32 KiB 限制。');
  }
  let decoded: unknown;
  try { decoded = JSON.parse(text); }
  catch { throw new ScenarioError('schema', '剧本文件不是有效的 JSON。'); }
  return validateScenarioFixture(decoded);
}

export function encodeScenarioFixture(input: unknown): string {
  const fixture = validateScenarioFixture(input);
  const encoded = JSON.stringify(fixture);
  if (new TextEncoder().encode(encoded).byteLength > SCENARIO_MAX_BYTES) throw new ScenarioError('size', '剧本文件超出 32 KiB 限制。');
  return encoded;
}

export function scenarioInitialTargets(seed: number, profileId: WorldgenProfileId): {
  cultivators: Array<{ id: string; name: string }>; locations: Array<{ id: string; name: string }>;
} {
  if (!isWorldSeed(seed) || !isWorldgenProfileId(profileId)) throw new ScenarioError('schema', '剧本种子或创世预设无效。');
  const world = createInitialWorld(seed, profileId);
  return {
    cultivators: world.cultivators.filter((actor) => actor.alive && actor.hp > 0).map(({ id, name }) => ({ id, name })),
    locations: world.locations.map(({ id, name }) => ({ id, name })),
  };
}

/** A deterministic 128-bit identity marker, not a signature or a credential. */
function originOf(fixture: ScenarioFixture): ScenarioOrigin {
  const canonical = JSON.stringify(fixture);
  const prime = 0x100000001b3n, mask = 0xffffffffffffffffn;
  let a = 0xcbf29ce484222325n, b = 0x9ca49c461c2dc5a1n;
  for (let i = 0; i < canonical.length; i++) {
    a = ((a ^ BigInt(canonical.charCodeAt(i))) * prime) & mask;
    b = ((b ^ BigInt(canonical.charCodeAt(canonical.length - 1 - i))) * prime) & mask;
  }
  const hash = `${a.toString(16).padStart(16, '0')}${b.toString(16).padStart(16, '0')}`;
  return { version: SCENARIO_VERSION, ruleset: SCENARIO_RULESET, id: `scenario-${hash}`, endTick: fixture.endTick };
}

function applyStep(world: WorldState, step: ScenarioStep, index: number): WorldState {
  requireReference(world, step, index, false);
  const input = step.command;
  const command: GodInterventionCommand = input.type === 'WHISPER_MIND'
    ? { type: input.type, targetCultivatorId: input.targetCultivatorId, whisperText: SCENARIO_WHISPER_CUES[input.cue] }
    : input;
  let next: WorldState;
  try { next = executeGodIntervention(world, command); }
  catch { throw new ScenarioError('execution', '天道指令无法完成，复演未应用。', index, step.tick); }
  if (next.interventionSequence !== world.interventionSequence + 1) {
    throw new ScenarioError('execution', '合法指令未产生实际执行记录，复演未应用。', index, step.tick);
  }
  return next;
}

function* run(input: unknown): Generator<ScenarioReplayProgress, WorldState> {
  const prepared = prepare(input);
  let world = prepared.world;
  const { fixture } = prepared;
  let offset = 0;
  const progress = (): ScenarioReplayProgress => ({ tick: world.tick, endTick: fixture.endTick, completedCommands: offset,
    totalCommands: fixture.commands.length });
  yield progress();
  while (world.tick <= fixture.endTick) {
    while (fixture.commands[offset]?.tick === world.tick) {
      world = applyStep(world, fixture.commands[offset], offset);
      offset++;
      yield progress();
    }
    if (world.tick === fixture.endTick) break;
    let next: WorldState;
    try { next = advanceWorldTick(world, undefined, undefined, 'utility'); }
    catch { throw new ScenarioError('execution', '规则脑未能完成该回合，复演未应用。', undefined, world.tick); }
    if (next.tick !== world.tick + 1) throw new ScenarioError('execution', '世界没有按预期推进，复演未应用。', undefined, world.tick);
    world = next;
    yield progress();
  }
  world.scenarioOrigin = originOf(fixture);
  return world;
}

export function replayScenario(input: unknown): WorldState {
  const runner = run(input);
  for (let step = runner.next(); ; step = runner.next()) if (step.done) return step.value;
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new ScenarioError('aborted', '已取消离线复演；当前世界未改变。');
}

export async function replayScenarioAsync(input: unknown, options: ScenarioReplayOptions = {}): Promise<WorldState> {
  const { signal, onProgress, yieldEvery } = options;
  const runner = run(input);
  const every = typeof yieldEvery === 'number' && Number.isSafeInteger(yieldEvery) ? Math.min(8, Math.max(1, yieldEvery)) : 3;
  let count = 0;
  while (true) {
    assertNotAborted(signal);
    const step = runner.next();
    if (step.done) return step.value;
    onProgress?.(step.value);
    assertNotAborted(signal);
    if (++count >= every) {
      count = 0;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
}
