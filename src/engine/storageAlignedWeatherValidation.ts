import type { AlignedWeatherReport, FieldObservatoryRun, WorldState } from '../types/world';
import { OBSERVATORY_COST, OBSERVATORY_LEAD_TICKS, OBSERVATORY_RETENTION_TICKS } from './fieldObservatoryEngine';
import { ALIGNED_WEATHER_OFFER_TICKS, ALIGNED_WEATHER_SOURCE_MAX_AGE } from './alignedWeatherTerms';

const key = (...parts: (string | number)[]) => JSON.stringify(parts);
type NativeReport = Extract<FieldObservatoryRun, { status: 'measured' }>;

function sameRun(source: NativeReport | undefined, report: AlignedWeatherReport, siteId: string, measuredTick: number): boolean {
  return !!source && source.locationId === siteId && source.targetTick === measuredTick &&
    source.openedTick === report.openedTick &&
    source.reading.kind === report.reading.kind && source.reading.intensity === report.reading.intensity &&
    source.station?.kind === report.station?.kind && source.station?.x === report.station?.x && source.station?.y === report.station?.y;
}

export function validateAlignedWeatherHistory(
  world: WorldState, actorIds: ReadonlySet<string>, fail: (path: string) => never,
): void {
  const { comparisons, nextId } = world.alignedWeather;
  if (!comparisons.length) return;
  const sites = new Set(world.locations.filter(({ type }) => type !== 'abyss' && type !== 'secret_realm').map(({ id }) => id));
  const native = new Map(Object.entries(world.fieldObservatories.byActor).map(([operator, { runs }]) =>
    [operator, new Map(runs.filter((run): run is NativeReport => run.status === 'measured').map((run) => [run.openedTick, run]))]));
  const ids = new Set<string>(), sources = new Set<string>(), pairs = new Set<string>();
  const funding = new Map<string, { payer: string; tick: number }>();
  const rememberCost = (payer: string, run: AlignedWeatherReport) => {
    funding.set(`field-observatory-${payer}-${run.openedTick}`, { payer, tick: run.openedTick });
  };
  for (const row of comparisons) {
    const { id, siteId, observerAId, observerBId, measuredTick, offeredTick, expiresTick, first, second, status,
      outcome, settledTick } = row;
    const serial = Number(/^aligned-weather-([1-9]\d*)$/.exec(id)?.[1]);
    const pair = key(siteId, measuredTick, ...[observerAId, observerBId].sort());
    const ownerSource = key(observerAId, first.openedTick);
    if (!Number.isSafeInteger(serial) || serial >= nextId || ids.has(id) || pairs.has(pair) || sources.has(ownerSource) ||
        !actorIds.has(observerAId) || !actorIds.has(observerBId) || observerAId === observerBId || !sites.has(siteId) ||
        offeredTick <= measuredTick || offeredTick - measuredTick > ALIGNED_WEATHER_SOURCE_MAX_AGE || offeredTick > world.tick ||
        expiresTick !== offeredTick + ALIGNED_WEATHER_OFFER_TICKS ||
        first.openedTick + OBSERVATORY_LEAD_TICKS !== measuredTick ||
        !sameRun(native.get(observerAId)?.get(first.openedTick), first, siteId, measuredTick))
      return fail('alignedWeather.comparisons.firstSource');
    ids.add(id);
    sources.add(ownerSource);
    pairs.add(pair);
    rememberCost(observerAId, first);
    if ((status === 'offered') !== (settledTick === undefined) || (status === 'compared') !== !!second ||
        (status === 'compared') !== (outcome !== undefined) ||
        (status === 'offered' && expiresTick <= world.tick) ||
        (settledTick !== undefined && (settledTick < offeredTick || settledTick > world.tick)) ||
        (status === 'expired' ? settledTick !== expiresTick : settledTick !== undefined && settledTick >= expiresTick) ||
        (settledTick !== undefined && settledTick <= offeredTick))
      return fail('alignedWeather.comparisons.lifecycle');
    if (!second) continue;
    const matches = first.reading.kind === second.reading.kind && first.reading.intensity === second.reading.intensity;
    if (second.openedTick !== first.openedTick || settledTick! > measuredTick + OBSERVATORY_RETENTION_TICKS ||
        !sameRun(native.get(observerBId)?.get(second.openedTick), second, siteId, measuredTick) ||
        outcome !== (matches ? 'agrees' : 'uncertain'))
      return fail('alignedWeather.comparisons.secondSource');
    rememberCost(observerBId, second);
  }
  const seenCosts = new Set<string>(), complete = new Set<number>();
  for (const month of world.resourceFlow.months) {
    if (month.totalEntries === month.entries.length) complete.add(month.tick);
    for (const entry of month.entries) {
      const purchase = funding.get(entry.refId);
      if (!purchase) continue;
      if (seenCosts.has(entry.refId) || entry.mechanism !== 'observatory' || entry.reason !== 'observatory_instrument' ||
          entry.kind !== 'consumption' || entry.good !== 'stone' || entry.amount !== OBSERVATORY_COST || entry.tick !== purchase.tick ||
          entry.from.kind !== 'actor' || entry.from.id !== purchase.payer ||
          entry.visibility.kind !== 'participants' || entry.visibility.actorIds.length !== 1 || entry.visibility.actorIds[0] !== purchase.payer)
        return fail('alignedWeather.comparisons.funding');
      seenCosts.add(entry.refId);
    }
  }
  for (const [ref, source] of funding) {
    if (complete.has(source.tick) && !seenCosts.has(ref)) return fail('alignedWeather.comparisons.funding');
  }
}
