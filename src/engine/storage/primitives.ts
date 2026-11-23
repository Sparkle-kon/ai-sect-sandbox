export const WORLD_SAVE_MAX_BYTES = 8 * 1024 * 1024;
export const ERA_WORLD_SAVE_MAX_BYTES = 32 * 1024 * 1024;
export const WORLD_SAVE_MAX_SLOTS = 12;
export const FORMAT = 'ai-sect-sandbox';
export const VERSION = 1;
// Variable-size roster ledgers are constrained by the file byte budget, not an NPC-count limit.
export const SAVE_COLLECTION_LIMIT = WORLD_SAVE_MAX_BYTES;
export type ErrorCode = 'size' | 'json' | 'version' | 'invalid_world' | 'invalid_slot' | 'slot_limit' | 'not_found' | 'storage' | 'slot_conflict' | 'storage_read_only' | 'integrity' | 'storage_blocked';
export class WorldSaveError extends Error {
  constructor(readonly code: ErrorCode, message: string) { super(message); this.name = 'WorldSaveError'; }
}

export type Validator = (value: unknown, path: string) => void;
export type Rule = Validator | { optional: Validator };
export const fail = (path: string): never => { throw new WorldSaveError('invalid_world', `无法验证存档字段：${path}`); };
export const optional = (value: Validator) => ({ optional: value });
export const strings = (max = 9000, min = 0): Validator => (v, path) => {
  if (typeof v !== 'string' || v.length > max || v.length < min) fail(path);
};
export const num = (min: number, max: number, integer = false): Validator => (v, path) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isSafeInteger(v))) fail(path);
};
export const one = (...values: (string | number)[]): Validator => (v, path) => {
  if (!values.some((entry) => entry === v)) fail(path);
};
export const arr = (max: number, rule: Validator): Validator => (v, path) => {
  if (!Array.isArray(v) || v.length > max) return fail(path);
  v.forEach((item, i) => rule(item, `${path}[${i}]`));
};
export const structure = (rules: Record<string, Rule>): Validator => (v, path) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fail(path);
  const rec = v as Record<string, unknown>;
  for (const key of Object.keys(rec)) if (!Object.hasOwn(rules, key)) fail(`${path}.${key}`);
  for (const [key, rule] of Object.entries(rules)) {
    const child = `${path}.${key}`;
    if (typeof rule === 'function') rule(rec[key], child);
    else if (rec[key] !== undefined) rule.optional(rec[key], child);
  }
};
export const id = strings(240, 1);
export const fictionalGender = optional(one('woman','man'));
export const text = strings();
export const bool: Validator = (v, path) => { if (typeof v !== 'boolean') fail(path); };
export const tick = num(0, 100_000_000, true);
export const unsigned32 = num(0, 0xffffffff, true);
export const wealth = num(0, 1_000_000_000);
export const authoredHash=strings(64,64);
export const authoredJade=structure({spiritQi:num(0,150),jadeCapacity:wealth,jade:wealth});
export const authoredEraEffect:Validator=(value,path)=>{
  const item=value as {kind?:unknown}|null;
  if(item?.kind==='jade_vein_depleted')return structure({
    kind:one('jade_vein_depleted'),siteId:id,before:authoredJade,after:authoredJade})(value,path);
  if(item?.kind==='village_capacity')return structure({
    kind:one('village_capacity'),settlementId:id,siteId:id,capacityBefore:tick,capacityAfter:tick,population:tick})(value,path);
  return structure({kind:one('danxia_branch_moves_north'),parentSectId:id,parentSiteId:id,branchSectId:id,destinationId:id,
    tileId:id,memberIds:ids,branchLeaderId:id,parentLeaderId:id,stayingIds:ids,parentStonesBefore:wealth,parentStonesAfter:wealth,
    branchStones:wealth,protectedStones:wealth})(value,path);
};
export const percentage = num(0, 100);
export const affinity = num(-100, 100);
export const count = num(0, 10_000, true);
export const month = num(1, 12, true);
export const ids = arr(SAVE_COLLECTION_LIMIT, id);
export const oid = optional(id), otick = optional(tick), otext = optional(text);
export const spirit = one('金','木','水','火','土','雷','暗','天灵根');
export const realm = one('练气','筑基','金丹','元婴','化神','炼虚','合体','大乘','渡劫');
export const sectRank = one('外门弟子','内门弟子','真传弟子','长老','太上长老','掌门');

export function unique<T>(items: T[], key: (item: T) => string, path: string): Set<string> {
  const keys = new Set(items.map(key));
  if (keys.size !== items.length) fail(path);
  return keys;
}
