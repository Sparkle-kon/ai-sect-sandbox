import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableAlchemy } from '../src/engine/alchemyEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceTerritorialLeases, availableTerritorialLeaseActions } from '../src/engine/territorialLeaseEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture' };
const gather: LLMDecisionPayload = { chosenAction: 'GATHER_HERBS', targetHerbId: 'jade_leaf', innerMonologue: '只采实际存量' };
const order = <T extends Pick<LLMDecisionPayload, 'leaseMove'>>(args: T): LLMDecisionPayload =>
  ({ ...args, chosenAction: 'TERRITORIAL_LEASE', innerMonologue: '按实采量扣付，地权不转移' });
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld(12391);
  world.tick = 29;
  const [landlord, lessee, buyer] = world.sects;
  const ownerSigner = world.cultivators.find(({ id }) => id === landlord.leaderId)!;
  const tenantSigner = world.cultivators.find(({ id }) => id === lessee.leaderId)!;
  const visitor = world.cultivators.find(({ id, sectId }) => sectId === lessee.id && id !== tenantSigner.id)!;
  const stranger = world.cultivators.find(({ sectId }) => sectId === buyer.id)!;
  const field = world.locations.find(({ id }) => id === landlord.headquartersId)!;
  field.ownerSectId = landlord.id;
  field.herbs.jade_leaf = 3;
  field.herbCapacity.jade_leaf = Math.max(field.herbCapacity.jade_leaf, 3);
  ownerSigner.locationId = visitor.locationId = stranger.locationId = field.id;
  tenantSigner.locationId = lessee.headquartersId;
  visitor.herbs.jade_leaf = 0;
  landlord.spiritStones = 1_000;
  lessee.spiritStones = 500;
  for (const treaty of world.diplomacy) { treaty.pact = 'neutral'; treaty.affinity = 0; }
  const apply = (person: typeof ownerSigner, decision: LLMDecisionPayload) => applyCultivatorBrainDecision(world, person, decision, () => .99);
  return { world, landlord, lessee, buyer, ownerSigner, tenantSigner, visitor, stranger, field, apply };
}

describe('territorial permissions within existing deterministic and model alchemy', () => {
  it('grants only actual signed access, charges exact harvested units and returns unused custody after a real title change', async () => {
    const { world, landlord, lessee, buyer, ownerSigner, tenantSigner, visitor, stranger, field, apply } = fixture();
    const gatherable = (person: typeof visitor) => availableAlchemy(person, world).some(({ action, targetHerbId }) =>
      action === 'GATHER_HERBS' && targetHerbId === 'jade_leaf');
    expect(gatherable(ownerSigner)).toBe(true);
    expect(gatherable(visitor)).toBe(false);
    expect(gatherable(stranger)).toBe(false);
    const invitation = availableTerritorialLeaseActions(ownerSigner, world).find((row) => row.leaseMove === 'offer' &&
      row.targetSectId === lessee.id && row.targetLocationId === field.id)!;
    expect(invitation).toBeDefined();
    const modelResponse = (decision: LLMDecisionPayload) =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(decision) } }] }));
    const model = vi.fn(async () => modelResponse(order({ ...invitation, targetLocationId: 'no-such-title' })));
    vi.stubGlobal('fetch', model);
    const source = vi.fn();
    const invalid = await queryCultivatorLLMDecision(ownerSigner, world, config, source);
    expect(source).toHaveBeenLastCalledWith('utility');
    expect(invalid.targetLocationId).not.toBe('no-such-title');
    model.mockImplementation(async () => modelResponse(order(invitation)));
    expect(apply(ownerSigner, await queryCultivatorLLMDecision(ownerSigner, world, config, source))).not.toBeNull();
    expect(source).toHaveBeenLastCalledWith('llm');
    expect(lessee.spiritStones).toBe(500);
    expect(gatherable(visitor)).toBe(false);
    world.tick++;
    const lease = world.territorialLeases.leases[0];
    const reply = computeHeuristicDecision(tenantSigner, world, () => .99);
    expect(reply).toMatchObject({ chosenAction: 'TERRITORIAL_LEASE', leaseMove: 'accept', targetTerritorialLeaseId: lease.id });
    expect(apply(tenantSigner, reply)).not.toBeNull();
    expect(lessee.spiritStones).toBe(476);
    expect(landlord.spiritStones).toBe(1_000);
    expect(lease.escrow).toBe(24);
    expect(field.ownerSectId).toBe(landlord.id);
    expect(gatherable(visitor)).toBe(true);
    expect(gatherable(ownerSigner)).toBe(true);
    expect(gatherable(stranger)).toBe(false);

    expect(apply(visitor, gather)).not.toBeNull();
    expect(visitor.herbs.jade_leaf).toBe(2);
    expect(field.herbs.jade_leaf).toBe(1);
    expect(landlord.spiritStones).toBe(1_008);
    expect(lease).toMatchObject({ usedUnits: 2, rentPaid: 8, escrow: 16, refunded: 0 });
    expect(apply(visitor, gather)).toBeNull();
    expect(decodeWorldSave(encodeWorldSave(world)).territorialLeases).toEqual(world.territorialLeases);

    field.ownerSectId = buyer.id;
    expect(gatherable(visitor)).toBe(false);
    expect(gatherable(ownerSigner)).toBe(false);
    expect(gatherable(stranger)).toBe(true);
    const id = lease.id;
    advanceTerritorialLeases(world);
    expect(world.territorialLeases.leases.find((row) => row.id === id)).toMatchObject({
      status: 'closed', endReason: 'title_change', escrow: 0, rentPaid: 8, refunded: 16,
    });
    expect(lessee.spiritStones).toBe(492);
    expect(landlord.spiritStones).toBe(1_008);
    expect(field.ownerSectId).toBe(buyer.id);
    expect(advanceTerritorialLeases(world)).toEqual([]);
    expect(decodeWorldSave(encodeWorldSave(world)).territorialLeases).toEqual(world.territorialLeases);
    const forged = structuredClone(world);
    forged.territorialLeases.leases[0].refunded++;
    expect(() => encodeWorldSave(forged)).toThrow(/territorialLeases.leases.balance/);
  });

  it('keeps previously open neutral gathering and old saves, without retroactively creating rights', () => {
    const { world, field, stranger, apply } = fixture();
    const { territorialLeases, ...old } = world;
    const restored = decodeWorldSave(JSON.stringify({ format: 'ai-sect-sandbox', version: 1, world: old }));
    expect(restored.territorialLeases).toEqual(territorialLeases);
    delete field.ownerSectId;
    expect(apply(stranger, gather)).not.toBeNull();
    expect(field.herbs.jade_leaf).toBe(1);
    expect(world.territorialLeases.leases).toEqual([]);
  });
});
