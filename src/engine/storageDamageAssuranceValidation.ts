import type { WorldState } from '../types/world';
import {
  damageAssuranceClaimId, damageAssuranceImpactKey, damageAssuranceNativeReceiptId, damageAssuranceWorkKey,
} from './damageAssuranceEngine';
import { FURNACE_SAFETY_REPAIR, furnaceSafetyDamage } from './furnaceSafetyEngine';

export function validateDamageAssuranceHistory(
  world: WorldState, actors: ReadonlySet<string>, fail: (path: string) => never,
): void {
  const claims = world.damageAssurance.claims;
  if (!claims.length) {
    if (world.furnaceSafety.cases.some(({ receipts }) => receipts.some(({ assuranceClaimId }) => assuranceClaimId !== undefined)))
      return fail('damageAssurance.nativeWork');
    return;
  }
  const cases = new Map(world.furnaceSafety.cases.map((row) => [row.id, row]));
  const sites = new Map(world.locations.map((row) => [row.id, row]));
  const latest = new Map<string, number>();
  for (const row of cases.values()) latest.set(row.siteId, Math.max(latest.get(row.siteId) ?? -1, row.damagedTick));
  const ids = new Set<string>(), impacts = new Set<string>(), tagged = new Set<string>(), credited = new Set<string>();
  for (const claim of claims) {
    const source = cases.get(claim.sourceCaseId), inspect = source?.receipts[0];
    const impact = damageAssuranceImpactKey(claim);
    if (!source || !inspect || inspect.kind !== 'inspect' || ids.has(claim.id) || impacts.has(impact) ||
        claim.id !== damageAssuranceClaimId(source.id) || source.siteId !== claim.siteId ||
        source.ownerAtDamage !== claim.responsibleSectId || inspect.ownerSectId !== claim.responsibleSectId ||
        source.hazardId !== claim.hazardId || source.damagedTick !== claim.damagedTick ||
        source.integrityBefore !== claim.integrityBefore || inspect.integrityBefore !== claim.integrityAfterDamage ||
        inspect.integrityAfter !== claim.integrityAfterDamage ||
        claim.integrityAfterDamage !== Math.max(0, source.integrityBefore - furnaceSafetyDamage(source.severity)) ||
        claim.initialLoss !== claim.integrityBefore - claim.integrityAfterDamage ||
        !actors.has(claim.sealedById) || inspect.actorId !== claim.inspectorId || inspect.tick !== claim.inspectionTick ||
        claim.sealedTick <= inspect.tick || claim.sealedTick > world.tick ||
        source.receipts.slice(1).some(({ tick }) => tick < claim.sealedTick))
      return fail('damageAssurance.claims.source');
    ids.add(claim.id);
    impacts.add(impact);

    let remaining = claim.initialLoss, previousTick = claim.sealedTick;
    for (const work of claim.contributions) {
      const actual = source.receipts.find(({ tick }) => tick === work.tick);
      const workKey = damageAssuranceWorkKey(claim, work);
      if (!actual || actual.kind !== 'repair' || actual.assuranceClaimId !== claim.id || !actors.has(work.actorId) ||
          actual.actorId !== work.actorId || actual.ownerSectId !== claim.responsibleSectId ||
          work.tick <= previousTick || work.tick > world.tick || (source.reopenedTick ?? Infinity) <= work.tick ||
          actual.integrityBefore !== work.integrityBefore || actual.integrityAfter !== work.integrityAfter ||
          work.receiptId !== damageAssuranceNativeReceiptId(source.id, actual.tick) ||
          work.stonesSpent !== FURNACE_SAFETY_REPAIR.stones || work.rootsSpent !== FURNACE_SAFETY_REPAIR.roots ||
          work.creditedPoints !== Math.min(remaining, actual.integrityAfter - actual.integrityBefore) ||
          work.creditedPoints <= 0 || tagged.has(work.receiptId) || credited.has(workKey))
        return fail('damageAssurance.claims.work');
      tagged.add(work.receiptId);
      credited.add(workKey);
      previousTick = work.tick;
      remaining -= work.creditedPoints;
    }

    const { status, closedTick, closure } = claim;
    const current = latest.get(claim.siteId) === claim.damagedTick;
    if ((status === 'open') !== (closedTick === undefined) || (status === 'closed') !== (closure !== undefined) ||
        (closedTick !== undefined && (closedTick < previousTick || closedTick > world.tick)) ||
        (status === 'fulfilled') !== (remaining === 0) ||
        (status === 'fulfilled' && closedTick !== previousTick) ||
        (status === 'open' && (!current || source.reopenedTick !== undefined || sites.get(claim.siteId)?.ownerSectId !== claim.responsibleSectId)) ||
        (closure === 'native_reopened' && (source.reopenedTick === undefined || closedTick! < source.reopenedTick)) ||
        (closure === 'case_superseded' && !world.furnaceSafety.cases.some((row) =>
          row.siteId === claim.siteId && row.damagedTick > claim.damagedTick && row.damagedTick <= closedTick!)))
      return fail('damageAssurance.claims.lifecycle');
  }
  for (const { id, receipts } of cases.values()) for (const receipt of receipts) {
    if (receipt.assuranceClaimId !== undefined &&
        (receipt.kind !== 'repair' || !tagged.delete(damageAssuranceNativeReceiptId(id, receipt.tick))))
      return fail('damageAssurance.nativeWork');
  }
  if (tagged.size > 0) fail('damageAssurance.nativeWork');
}
