import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceFieldObservatories, OBSERVATORY_RETENTION_TICKS, projectFieldObservatory } from '../src/engine/fieldObservatoryEngine';
import { projectAlignedWeather } from '../src/engine/alignedWeatherEngine';
import type { WorldState } from '../src/types/world';
import { comparedAlignedWeather, offeredAlignedWeather, paidReading, weatherPerson, weatherTurn } from './fixtures/alignedWeatherFixture';

const roundTrip = (world: WorldState) => decodeWorldSave(encodeWorldSave(world));
function tamper(raw: string, edit: (world: WorldState) => void) {
  const parsed = JSON.parse(raw) as { world: WorldState };
  edit(parsed.world);
  return () => decodeWorldSave(JSON.stringify(parsed));
}

describe('same-turn weather comparison saves the two exact independent paid originals', () => {
  it('loads old saves, authentic offers and separate terminal consent without flattening disagreement', () => {
    const old = JSON.parse(encodeWorldSave(createInitialWorld(91))) as { world: Partial<WorldState> };
    delete old.world.alignedWeather;
    expect(decodeWorldSave(JSON.stringify(old)).alignedWeather).toEqual({ comparisons: [], nextId: 1 });
    const before = offeredAlignedWeather(), offered = roundTrip(before.world);
    expect(offered.alignedWeather.comparisons[0]).toMatchObject({ status: 'offered', first: { openedTick: before.openedTick } });
    expect(offered.alignedWeather.comparisons[0].second).toBeUndefined();
    const f = comparedAlignedWeather(), archived = roundTrip(f.world);
    const receipt = archived.alignedWeather.comparisons[0];
    expect(receipt).toMatchObject({ status: 'compared', outcome: 'uncertain', measuredTick: f.openedTick + 2 });
    expect(receipt.first.reading).not.toEqual(receipt.second?.reading);
    expect(paidReading(archived, f.proposerId, f.openedTick).station).toBeUndefined();
    expect(paidReading(archived, f.peerId, f.openedTick).station).toEqual(receipt.second?.station);
    const equal = roundTrip(comparedAlignedWeather(false).world).alignedWeather.comparisons[0];
    expect(equal.outcome).toBe('agrees');
    expect(equal.first.reading).toEqual(equal.second?.reading);
  });

  it('rejects changed raw values, substituted geometries, same-observer and same-round consent, and changed real fees', () => {
    const f = comparedAlignedWeather(), raw = encodeWorldSave(f.world);
    expect(tamper(raw, (s) => { s.alignedWeather.comparisons[0].outcome = 'agrees'; }))
      .toThrow('alignedWeather.comparisons.secondSource');
    expect(tamper(raw, (s) => { s.alignedWeather.comparisons[0].second!.reading = { kind: '灵潮', intensity: .98 }; }))
      .toThrow('alignedWeather.comparisons.secondSource');
    expect(tamper(raw, (s) => { s.alignedWeather.comparisons[0].observerBId = f.proposerId; }))
      .toThrow('alignedWeather.comparisons.firstSource');
    expect(tamper(raw, (s) => { s.alignedWeather.comparisons[0].settledTick = s.alignedWeather.comparisons[0].offeredTick; }))
      .toThrow('alignedWeather.comparisons.lifecycle');
    expect(tamper(raw, (s) => { paidReading(s, f.peerId, f.openedTick).station!.x += 1; }))
      .toThrow('fieldObservatories.runs.references');
    expect(tamper(raw, (s) => {
      const entry = s.resourceFlow.months.flatMap(({ entries }) => entries)
        .find((row) => row.refId === `field-observatory-${f.peerId}-${f.openedTick}`)!;
      entry.amount--;
    })).toThrow('alignedWeather.comparisons.funding');
  });

  it('preserves expired invitations without reading disclosure and compacts only ordinary historical view', () => {
    const waiting = offeredAlignedWeather();
    const expired = roundTrip(weatherTurn(weatherTurn(weatherTurn(waiting.world))));
    const ignored = expired.alignedWeather.comparisons[0];
    expect(ignored).toMatchObject({ status: 'expired', settledTick: ignored.expiresTick });
    expect(projectAlignedWeather(expired, weatherPerson(expired, waiting.peerId))[0].first).toBeUndefined();
    const f = comparedAlignedWeather();
    const oldReceipt = structuredClone(f.world.alignedWeather.comparisons[0]);
    f.world.tick += OBSERVATORY_RETENTION_TICKS + 1;
    advanceFieldObservatories(f.world);
    const archived = roundTrip(f.world);
    expect(archived.alignedWeather.comparisons[0]).toEqual(oldReceipt);
    expect(projectFieldObservatory(archived, weatherPerson(archived, f.proposerId)).runs).toEqual([]);
    expect(projectAlignedWeather(archived, weatherPerson(archived, f.proposerId))[0].second?.reading)
      .toEqual(oldReceipt.second?.reading);
    expect(projectAlignedWeather(archived, weatherPerson(archived, f.outsiderId))).toEqual([]);
  });
});
