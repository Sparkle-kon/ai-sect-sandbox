import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import {
  ERA_CHECKPOINT_MAX_BYTES, prepareEraCheckpoint, verifyEraCheckpoint,
} from '../src/engine/eraCheckpointEngine';
import { recordMemory, EPISODIC_LIMIT } from '../src/engine/memoryEngine';
import { decodeWorldSave, decodeEraWorldSave, encodeWorldSave, encodeEraWorldSave, ERA_WORLD_SAVE_MAX_BYTES,
  WORLD_SAVE_MAX_BYTES, worldSaveByteCount, WorldSaveError } from '../src/engine/storageEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';

const build = {engineRuleVersion:'e'.repeat(64)};
const codec = {encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const input = (value:{bytes:Uint8Array}) => ({size:value.bytes.length,async arrayBuffer(){return value.bytes.slice().buffer;}});

describe('portable era checkpoint native gameplay round-trip', () => {
  it('keeps the normal cap and restores whole large authoritative state with an actual funded open oath', async () => {
    const world = createInitialWorld(2031);
    const [requester, provider] = [world.cultivators[0], world.cultivators[4]];
    provider.locationId = requester.locationId;
    requester.spiritStones = 200;
    provider.spiritStones = 100;
    provider.personality = '刚正';
    provider.qiProgress = 20;
    provider.herbs.jade_leaf = 6;
    expect(applyCultivatorBrainDecision(world,requester,{chosenAction:'OFFER_OATH',targetCultivatorId:provider.id,
      oathTerm:'jade_herb',innerMonologue:'约取三叶'},() => .9)).not.toBeNull();
    const oath = world.oaths.contracts[0];
    expect(applyCultivatorBrainDecision(world,provider,{chosenAction:'ACCEPT_OATH',targetOathId:oath.id,
      innerMonologue:'约取三叶'},() => .9)).not.toBeNull();
    expect(oath.escrow).toEqual({ payment:48,collateral:24 });
    // Only synthetic bulk is the prose length, within native validation and true
    // per-actor memory slot caps; the balances and open oath use canonical actions.
    const narrative = '山'.repeat(7800);
    for (const actor of world.cultivators) {
      for (let n=0;n<EPISODIC_LIMIT;n++) recordMemory(actor, world.tick, narrative + n, 4, 'social', 0);
    }
    const nativeBytes = worldSaveByteCount(world);
    expect(nativeBytes).toBeGreaterThan(WORLD_SAVE_MAX_BYTES);
    expect(nativeBytes).toBeLessThan(ERA_WORLD_SAVE_MAX_BYTES);
    expect(ERA_WORLD_SAVE_MAX_BYTES).toBe(ERA_CHECKPOINT_MAX_BYTES);
    expect(() => encodeWorldSave(world)).toThrow(WorldSaveError);

    const portable = await prepareEraCheckpoint(world,{branchId:'branch-1',timelineId:'test-lineage'},codec,build);
    expect(portable.manifest.payloadBytes).toBe(nativeBytes);
    expect(portable.parts.length).toBeGreaterThan(2);
    const restored = await verifyEraCheckpoint(input(portable.manifestFile),portable.parts.map(input).reverse(),codec);
    const holdings = (current: typeof world) => current.cultivators.map(actor=>({id:actor.id,alive:actor.alive,hp:actor.hp,
      stones:actor.spiritStones,herbs:actor.herbs,pills:actor.pills,artifacts:actor.artifacts}));
    expect(holdings(restored.world)).toEqual(holdings(world));
    expect(restored.world.oaths).toEqual(world.oaths);
    const intact = encodeEraWorldSave(world);
    expect(encodeEraWorldSave(restored.world) === intact).toBe(true);
    expect(() => decodeWorldSave(intact)).toThrow(WorldSaveError);
    const nextOriginal = advanceWorldTick(world,undefined,undefined,'utility');
    const nextRestored = advanceWorldTick(restored.world,undefined,undefined,'utility');
    expect(nextRestored.tick).toBe(world.tick + 1);
    expect(encodeEraWorldSave(nextRestored) === encodeEraWorldSave(nextOriginal)).toBe(true);
    expect(encodeEraWorldSave(world) === intact).toBe(true);
  },15000);
});
