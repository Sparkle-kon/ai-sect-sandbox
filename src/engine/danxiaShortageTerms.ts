import type { DanxiaRegrowthSample, WorldState } from '../types/world';

export type { DanxiaRegrowthSample };
export const DANXIA_SECT_ID = 'sect-danxia';
export const DANXIA_FROST_THRESHOLD = .55;
export const DANXIA_REGROWTH_CADENCE = 3;
export const DANXIA_CLOSED_RETENTION_TICKS = 120;

/** Only the currently titled Danxia relief accounts, never a lookalike site or sect name. */
export function danxiaMedicineSite(world: WorldState) {
  const sect = world.sects.find(row => row.id === DANXIA_SECT_ID);
  if (!sect || sect.facilities.alchemy_hall < 1 ||
      world.relocations.plans.some(row => row.sectId === sect.id && row.status === 'in_transit')) return undefined;
  return world.locations.find(site => site.id === sect.headquartersId && site.ownerSectId === sect.id && site.type === 'sect_hq');
}

export function suppressedDanxiaRegrowth(sample: DanxiaRegrowthSample): boolean {
  return Number.isSafeInteger(sample.tick) && sample.tick > 0 && sample.tick % DANXIA_REGROWTH_CADENCE === 0 &&
    sample.kind === '霜息' && Number.isFinite(sample.intensity) && sample.intensity >= DANXIA_FROST_THRESHOLD &&
    sample.intensity <= 1 && Number.isSafeInteger(sample.before) && Number.isSafeInteger(sample.capacity) &&
    sample.before >= 0 && sample.before < sample.capacity && sample.grown === 0;
}

export const danxiaShortageId = (appointmentId: string) => `danxia-shortage-${appointmentId}`;
