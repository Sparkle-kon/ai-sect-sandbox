// Stable storage compatibility API; implementations are independent codec, validation, and slot modules.
export { WORLD_SAVE_MAX_BYTES, ERA_WORLD_SAVE_MAX_BYTES, WORLD_SAVE_MAX_SLOTS, WorldSaveError } from './storage/primitives';
export { worldSaveByteCount, encodeWorldSave, decodeWorldSave, decodeEraWorldSave, encodeEraWorldSave } from './storage/worldCodec';
export * from './storage/saveSlots';
