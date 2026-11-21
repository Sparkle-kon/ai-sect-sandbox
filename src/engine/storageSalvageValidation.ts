import type { Artifact, WorldState } from '../types/world';
import { ARTIFACT_RULES } from './artifactEngine';
import { proveWorkshopArtifactOrigin } from './artifactSalvageEngine';
import { FURNACE_USE_RETENTION_TICKS } from './furnaceReservationEngine';

export function validateArtifactSalvageHistory(
  world: WorldState, artifacts: readonly Artifact[], actorIds: ReadonlySet<string>, fail: (path: string) => never,
): void {
  const stampedIds = new Map<string, number>();
  for (const item of artifacts) if (item.id) stampedIds.set(item.id, (stampedIds.get(item.id) ?? 0) + 1);
  for (const item of artifacts) {
    if (item.workshopOrigin && (!item.id || stampedIds.get(item.id) !== 1 || !proveWorkshopArtifactOrigin(world,item)))
      fail('artifacts.workshopOrigin');
  }
  const byArtifact = new Map<string, WorldState['artifactSalvages']['receipts'][number]>();
  const byActorTurn = new Map<string, WorldState['artifactSalvages']['receipts'][number]>();
  const actorTurn = (id: string, tick: number) => JSON.stringify([id,tick]);
  for (const row of world.artifactSalvages.receipts) {
    const { artifactId,tier,ownerId,siteId,tick,origin,durability,maxDurability } = row;
    const base = ARTIFACT_RULES[tier].durability;
    if (byArtifact.has(artifactId) || stampedIds.has(artifactId) || byActorTurn.has(actorTurn(ownerId,tick)) ||
        !actorIds.has(ownerId) || tick > world.tick || tick <= origin.finishedTick ||
        (maxDurability !== base && maxDurability !== Math.ceil(base * 1.2)) ||
        !Number.isSafeInteger(durability) || durability < 0 || durability * 10 > maxDurability * 3 ||
        !proveWorkshopArtifactOrigin(world,{id:artifactId,tier,workshopOrigin:origin}) ||
        world.relicExhibits.entries.some((loan) => loan.status !== 'closed' && loan.artifactId === artifactId) ||
        !siteId) fail('artifactSalvages.receipts.source');
    byArtifact.set(artifactId,row);
    byActorTurn.set(actorTurn(ownerId,tick),row);
  }
  const usedIds = new Set<string>();
  for (const use of world.furnaceReservations.uses) {
    if (use.kind !== 'salvage') continue;
    const row = byActorTurn.get(actorTurn(use.actorId,use.tick));
    if (!row || row.siteId !== use.siteId || usedIds.has(row.artifactId)) fail('artifactSalvages.receipts.furnace');
    usedIds.add(row.artifactId);
  }
  for (const row of byArtifact.values()) if (world.tick - row.tick < FURNACE_USE_RETENTION_TICKS && !usedIds.has(row.artifactId))
    fail('artifactSalvages.receipts.furnace');
  const flowIds = new Set<string>();
  for (const month of world.resourceFlow.months) {
    for (const entry of month.entries) {
      if (entry.mechanism !== 'artifact_salvage' && entry.reason !== 'artifact_salvage_recovery') continue;
      const row = byArtifact.get(entry.refId);
      if (!row || flowIds.has(entry.refId) || entry.mechanism !== 'artifact_salvage' || entry.reason !== 'artifact_salvage_recovery' ||
          entry.kind !== 'production' || entry.good !== 'earth_root' || entry.amount !== 1 || entry.tick !== row.tick ||
          entry.to.kind !== 'actor' || entry.to.id !== row.ownerId || entry.visibility.kind !== 'participants' ||
          entry.visibility.actorIds.length !== 1 || entry.visibility.actorIds[0] !== row.ownerId) fail('artifactSalvages.receipts.material');
      flowIds.add(entry.refId);
    }
  }
  const completeMonths = new Set(world.resourceFlow.months.filter((month) => month.entries.length === month.totalEntries).map((month) => month.tick));
  for (const row of byArtifact.values()) if (completeMonths.has(row.tick) && !flowIds.has(row.artifactId))
    fail('artifactSalvages.receipts.material');
  const pending = world.playerAvatar.pendingOrder;
  if (pending?.action === 'SALVAGE_ARTIFACT' && (pending.queuedTick !== world.tick || byArtifact.has(pending.targetArtifactId)))
    fail('playerAvatar.pendingOrder.salvage');
}
