import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorkshops, WORKSHOP_TERMINAL_LIMIT } from '../src/engine/workshopEngine';
import type { WorldState } from '../src/types/world';
import { acceptedToolLoan, offeredToolLoan, toolChoice, toolJob, toolPerson, toolTurn, usedToolLoan } from './fixtures/toolLoanFixture';

const roundTrip = (world: WorldState) => decodeWorldSave(encodeWorldSave(world));

function corrupt(raw: string, edit: (world: WorldState) => void) {
  const parsed = JSON.parse(raw) as { world: WorldState };
  edit(parsed.world);
  return () => decodeWorldSave(JSON.stringify(parsed));
}

describe('the persisted workshop tool is a single original with native dated proof', () => {
  it('migrates old saves and preserves offered, held, worn awaiting and returned snapshots', () => {
    const old = JSON.parse(encodeWorldSave(createInitialWorld(111))) as { world: Partial<WorldState> };
    delete old.world.toolLoans;
    expect(decodeWorldSave(JSON.stringify(old)).toolLoans).toEqual({ loans: [], nextId: 1 });
    const { world: offered } = offeredToolLoan();
    expect(roundTrip(offered).toolLoans.loans[0]).toMatchObject({ status: 'offered' });
    const { world: held } = acceptedToolLoan();
    expect(roundTrip(held).toolLoans).toEqual(held.toolLoans);
    const f = usedToolLoan();
    const state = roundTrip(f.world);
    const record = state.toolLoans.loans[0];
    const original = record.custody;
    expect(record).toMatchObject({ status: 'awaiting_recovery', wear: { durabilityAfter: original?.durability } });
    const returned = roundTrip(toolTurn(state, { [f.lenderId]: toolChoice('reclaim', f.id) }));
    expect(returned.toolLoans.loans[0].status).toBe('returned');
    expect(returned.toolLoans.loans[0].custody).toBeUndefined();
    expect(toolPerson(returned, f.lenderId).artifacts.find(({ id }) => id === f.artifactId)).toEqual(original);
  });

  it('rejects missing and duplicate objects, fabricated wear/grade, stolen party role and retroactive custody', () => {
    const f = usedToolLoan();
    const raw = encodeWorldSave(f.world);
    expect(corrupt(raw, (s) => { delete s.toolLoans.loans[0].custody; })).toThrow('toolLoans.loans.lifecycle');
    expect(corrupt(raw, (s) => {
      toolPerson(s, f.borrowerId).artifacts.push(structuredClone(s.toolLoans.loans[0].custody!));
    })).toThrow('toolLoans.loans.custody');
    expect(corrupt(raw, (s) => { s.toolLoans.loans[0].wear!.durabilityBefore++; })).toThrow('toolLoans.loans.wear');
    expect(corrupt(raw, (s) => { toolJob(s, f.workshopId).work[1].toolUse!.baseScore--; })).toThrow('toolLoans.loans.wear');
    expect(corrupt(raw, (s) => { s.toolLoans.loans[0].borrowerId = f.outsiderId; })).toThrow('toolLoans.loans.source');
    expect(corrupt(raw, (s) => { s.toolLoans.loans[0].acceptedTick = s.toolLoans.loans[0].offeredTick; })).toThrow('toolLoans.loans.terms');
    expect(corrupt(raw, (s) => { s.toolLoans.loans = []; })).toThrow('toolLoans.loans.nativeWork');
  });

  it('retains the two exact receipts beyond routine workshop archive compaction, without growing ordinary retention', () => {
    const f = usedToolLoan(), { world } = f;
    const source = toolJob(world, f.sourceOrderId), aided = toolJob(world, f.workshopId);
    for (let i = 0; i < WORKSHOP_TERMINAL_LIMIT + 2; i++) {
      const id = `commission-${world.workshops.nextId++}`;
      world.workshops.orders.push({ ...structuredClone(source), id, settledTick: world.tick });
    }
    advanceWorkshops(world);
    expect(world.workshops.orders).toContain(source);
    expect(world.workshops.orders).toContain(aided);
    expect(world.workshops.orders).toHaveLength(WORKSHOP_TERMINAL_LIMIT + 2);
  });

  it('strictly reimports worn original probate under the original deceased owner', () => {
    const f = usedToolLoan(), holder = toolPerson(f.world, f.lenderId);
    const original = structuredClone(f.world.toolLoans.loans[0].custody);
    holder.alive = false;
    holder.hp = 0;
    const probate = roundTrip(toolTurn(f.world));
    expect(probate.toolLoans.loans[0].status).toBe('probate');
    expect(probate.toolLoans.loans[0].custody).toBeUndefined();
    expect(probate.estates.entries.find(({ deceasedId }) => deceasedId === f.lenderId)?.holdings.artifacts
      .find(({ id }) => id === f.artifactId)).toEqual(original);
  });
});
