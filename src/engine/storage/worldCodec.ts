import type { WorldState } from '../../types/world';
import { WORLD_SAVE_MAX_BYTES, WorldSaveError, FORMAT, VERSION, ERA_WORLD_SAVE_MAX_BYTES, fail } from './primitives';
import { verifyWorld } from './worldVerifier';

function checkSize(text: string, ceiling = WORLD_SAVE_MAX_BYTES, notice = '存档超过 8 MiB。'): void {
  if (text.length > ceiling || new TextEncoder().encode(text).byteLength > ceiling) {
    throw new WorldSaveError('size', notice);
  }
}

function serializeWorldSave(world: WorldState): string {
  try {
    // A native turn may first attach either optional ledger after a hot-world clone.
    // Normalize that bounded extension order, leaving every pre-extension byte intact.
    if (world.eraHeritage !== undefined || world.mortalAgeTrackingSinceTick !== undefined || world.coldWaterVein !== undefined || world.northMiningCharters !== undefined || world.northWellRevisitLaw !== undefined || world.northWellRevisitReviews !== undefined || world.upperPassage !== undefined || world.northGateRenewal !== undefined || world.frontier !== undefined || world.upperArrayField !== undefined || world.scribeCommissions !== undefined || world.waypostMeals !== undefined || world.craftTraining !== undefined || world.disasterShelter !== undefined || world.roguelikeEncounters !== undefined || world.forbiddenDuels !== undefined || world.beastDuelContacts !== undefined || world.dramaticBonds !== undefined || world.villageReunions !== undefined || world.builtinScenarioOrigin !== undefined || world.tournamentWagers !== undefined || world.immortalAuction !== undefined || world.tianjiGazette !== undefined || world.cultivationClans !== undefined || world.ascension !== undefined) {
      const {eraHeritage,mortalAgeTrackingSinceTick,coldWaterVein,northMiningCharters,northWellRevisitLaw,northWellRevisitReviews,upperPassage,northGateRenewal,frontier,upperArrayField,scribeCommissions,waypostMeals,craftTraining,disasterShelter,roguelikeEncounters,forbiddenDuels,beastDuelContacts,dramaticBonds,villageReunions,builtinScenarioOrigin,tournamentWagers,immortalAuction,tianjiGazette,cultivationClans,ascension,...legacy}=world;
      return JSON.stringify({format:FORMAT,version:VERSION,world:{...legacy,eraHeritage,mortalAgeTrackingSinceTick,coldWaterVein,northMiningCharters,northWellRevisitLaw,northWellRevisitReviews,upperPassage,northGateRenewal,frontier,upperArrayField,scribeCommissions,waypostMeals,craftTraining,disasterShelter,roguelikeEncounters,forbiddenDuels,beastDuelContacts,dramaticBonds,villageReunions,builtinScenarioOrigin,tournamentWagers,immortalAuction,tianjiGazette,cultivationClans,ascension}});
    }
    return JSON.stringify({ format: FORMAT, version: VERSION, world });
  } catch { throw new WorldSaveError('json', '当前世界不能序列化为 JSON。'); }
}

/** Exact UTF-8 export envelope size, separate from in-memory objects and independent of the file acceptance limit. */
export function worldSaveByteCount(world: WorldState): number {
  return new TextEncoder().encode(serializeWorldSave(world)).byteLength;
}

export function encodeWorldSave(world: WorldState): string {
  const raw = serializeWorldSave(world);
  checkSize(raw);
  decodeWorldSave(raw);
  return raw;
}

export function decodeWorldSave(text: string): WorldState {
  return decodeBoundedWorldEnvelope(text, WORLD_SAVE_MAX_BYTES, '存档超过 8 MiB。');
}

/** For verified era checkpoint chunks only; ordinary JSON export, file reads and slots still use 8 MiB. */
export function decodeEraWorldSave(text: string): WorldState {
  return decodeBoundedWorldEnvelope(text, ERA_WORLD_SAVE_MAX_BYTES, '年代分卷总内容超过 32 MiB。');
}

export function encodeEraWorldSave(world: WorldState): string {
  const raw = serializeWorldSave(world);
  decodeEraWorldSave(raw);
  return raw;
}

function decodeBoundedWorldEnvelope(text: string, ceiling: number, notice: string): WorldState {
  if (typeof text !== 'string') throw new WorldSaveError('json', '存档必须是 JSON 文本。');
  checkSize(text, ceiling, notice);
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { throw new WorldSaveError('json', '存档不是有效的 JSON。'); }
  const envelope = payload as { format?:unknown; version?:unknown; world?:unknown } | null;
  if (!envelope || typeof envelope !== 'object' || envelope.format !== FORMAT || envelope.version !== VERSION) {
    throw new WorldSaveError('version', '不支持这个存档格式或版本。');
  }
  if (Object.keys(envelope).some((key) => !['format','version','world'].includes(key))) return fail('envelope');
  return verifyWorld(envelope.world);
}
