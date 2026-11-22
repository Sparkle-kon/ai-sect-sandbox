import { useEffect, useRef, useState } from 'react';
import type { Artifact, Cultivator, WorldState } from '../types/world';
import { durabilityOf, equippedArtifact, maxDurabilityOf } from '../engine/artifactEngine';
import { ARTIFACT_SALVAGE_ROOTS, availableArtifactSalvageActions, type ArtifactSalvageOption } from '../engine/artifactSalvageEngine';
import { AVATAR_ORDER_COST, canQueueAvatarSalvage } from '../engine/avatarEngine';
import { knownMapLocations } from '../engine/terrainEngine';
import { SpiritRootBadge } from './SpiritRootBadge';

const TIER_COLOR = {
  法器: 'text-slate-300',
  灵器: 'text-sky-300',
  法宝: 'text-violet-300',
  通天灵宝: 'text-amber-300',
};

export type ArtifactSalvageCommand = ArtifactSalvageOption;
export type ArtifactSalvageStamp = { world: WorldState; actorId: string; scopeKey: string };
export interface ArtifactSalvageControls {
  scopeKey: string;
  busy?: boolean;
  readOnly?: boolean;
  onConfirm: (command: ArtifactSalvageCommand, stamp: ArtifactSalvageStamp) => boolean;
}
type Review = { command: ArtifactSalvageCommand; stamp: ArtifactSalvageStamp; item: Artifact; durability: number; maximum: number };

const reviewButton = 'min-h-11 max-w-full rounded border border-violet-500/50 bg-violet-950/50 px-2 py-1.5 text-xs text-violet-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300';
export const artifactSalvageStampMatches = (a: ArtifactSalvageStamp, b: ArtifactSalvageStamp) =>
  a.world === b.world && a.actorId === b.actorId && a.scopeKey === b.scopeKey;
const sameCommand = (a: ArtifactSalvageCommand, b: ArtifactSalvageCommand) =>
  a.action === b.action && a.targetArtifactId === b.targetArtifactId && a.targetLocationId === b.targetLocationId;

export function ArtifactSalvageReview({ name, tier, durability, maximum, site, onConfirm, onCancel }: {
  name: string; tier: string; durability: number; maximum: number; site: string; onConfirm: () => void; onCancel: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  return <div aria-label="核对指定破器" className="space-y-1.5 rounded border border-amber-500/40 bg-amber-950/30 p-2 text-xs leading-relaxed text-amber-100">
    <h5 ref={heading} tabIndex={-1} className="font-semibold [overflow-wrap:anywhere]">拆解：{name} · {tier} · 耐久 {durability}/{maximum}</h5>
    <p className="[overflow-wrap:anywhere]">下一轮复核炉点：{site}。提交此指令立即耗费 {AVATAR_ORDER_COST} 神识，但不推进时间。</p>
    <p>只有下一轮实际用炉并拆解成功，才永久移除这件器物，并回收玄土根 {ARTIFACT_SALVAGE_ROOTS} 株。若条件变化，可能执行不了，不会发放材料。</p>
    <div className="flex min-w-0 flex-wrap gap-1.5">
      <button type="button" className={reviewButton} onClick={onConfirm}>确认登记拆解</button>
      <button type="button" className={reviewButton} onClick={onCancel}>取消核对</button>
    </div>
  </div>;
}

export function ArtifactPanel({ cultivator, cultivators, world, salvage }: {
  cultivator: Cultivator; cultivators: Cultivator[]; world?: WorldState; salvage?: ArtifactSalvageControls;
}) {
  const equipped = cultivator.alive ? equippedArtifact(cultivator) : undefined;
  const names = new Map(cultivators.map(({ id, name }) => [id, name]));
  const heading = useRef<HTMLSpanElement>(null);
  const [pendingReview, setPendingReview] = useState<Review>();
  const [rejected, setRejected] = useState<ArtifactSalvageStamp>();
  const exactActor = world?.cultivators.find(({ id }) => id === cultivator.id);
  const stamp = world && salvage && { world, actorId: cultivator.id, scopeKey: salvage.scopeKey };
  const options = world && salvage && !salvage.readOnly && !salvage.busy && exactActor === cultivator &&
    canQueueAvatarSalvage(world, cultivator.id) ? availableArtifactSalvageActions(cultivator, world, world.tick + 1) : [];
  const byItem = new Map(options.map((option) => [option.targetArtifactId, option]));
  const review = pendingReview && stamp && artifactSalvageStampMatches(pendingReview.stamp, stamp) &&
    options.some((option) => sameCommand(option, pendingReview.command)) &&
    cultivator.artifacts.includes(pendingReview.item) && pendingReview.item.durability === pendingReview.durability &&
    pendingReview.item.maxDurability === pendingReview.maximum ? pendingReview : undefined;
  const queued = world?.playerAvatar.pendingOrder;
  const ownQueued = queued?.action === 'SALVAGE_ARTIFACT' && queued.actorId === cultivator.id && exactActor;
  const receipts = exactActor && world ? world.artifactSalvages.receipts.filter(({ ownerId, tick }) => ownerId === exactActor.id && tick <= world.tick)
    .sort((a, b) => b.tick - a.tick || a.artifactName.localeCompare(b.artifactName)) : [];
  const known = world && exactActor && receipts.length ? new Map(knownMapLocations(world, exactActor).map(({ id, name }) => [id, name])) : undefined;
  const focusHeading = () => heading.current?.focus({ preventScroll: true });
  return (
    <section className="flex flex-wrap items-start gap-1.5 text-xs" aria-label="法宝装备与器灵">
      <span ref={heading} tabIndex={-1} className="text-slate-400">本命与随身法宝：</span>
      {cultivator.artifacts.length === 0 && <span className="text-slate-500">暂无</span>}
      {cultivator.artifacts.length > 0 && (
        <ul className="basis-full grid gap-1.5">
          {cultivator.artifacts.map((artifact, index) => {
            const tier = artifact.tier ?? '法器';
            const durability = durabilityOf(artifact);
            const maxDurability = maxDurabilityOf(artifact);
            const isEquipped = artifact === equipped;
            const option = artifact.id && byItem.get(artifact.id);
            const staged = review?.item === artifact ? review : undefined;
            const origin = exactActor === cultivator ? artifact.craftTrainingOrigin : undefined;
            const blankMaker = origin && names.get(origin.firstTraineeId);
            const finisher = origin && names.get(origin.secondTraineeId);
            return (
              <li key={artifact.id ?? `${artifact.name}-${index}`} className="space-y-1 rounded border border-slate-700 bg-slate-800/50 px-2 py-1.5">
                <div className="flex flex-wrap items-center gap-1.5 text-slate-200">
                  {artifact.name}
                  <SpiritRootBadge root={artifact.spiritRoot} />
                  <span className={TIER_COLOR[tier]}>{tier}</span>
                  <span className={isEquipped ? 'text-emerald-300' : 'text-slate-400'}>
                    {isEquipped ? '已装备' : '未装备'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-slate-400">
                  <span className={durability <= 0 ? 'text-rose-300' : undefined}>
                    耐久 {durability}/{maxDurability}{durability <= 0 ? ' · 已损坏' : ''}
                  </span>
                  <span>{artifact.boundTo ? `认主：${names.get(artifact.boundTo) ?? '姓名未详'}` : '未认主'}</span>
                  {artifact.resonance !== undefined && <span>共鸣 {artifact.resonance}</span>}
                  {artifact.soul && <span>器灵：{artifact.soul.name} · 经验 {artifact.soul.experience}</span>}
                </div>
                {origin && blankMaker && finisher && <p className="text-slate-400 [overflow-wrap:anywhere]">
                  合练原器：{blankMaker}制坯，{finisher}成器。
                </p>}
                {staged && stamp && salvage ? <ArtifactSalvageReview name={artifact.name} tier={tier} durability={staged.durability}
                  maximum={staged.maximum} site={world?.locations.find(({ id }) => id === staged.command.targetLocationId)?.name ?? '此处炉点'}
                  onConfirm={() => {
                    if (!review || !artifactSalvageStampMatches(review.stamp, stamp)) return;
                    setPendingReview(undefined);
                    setRejected(salvage.onConfirm(staged.command, staged.stamp) ? undefined : stamp);
                    focusHeading();
                  }} onCancel={() => { setPendingReview(undefined); focusHeading(); }} />
                  : option && stamp && <button type="button" className={reviewButton} aria-label={`核对拆解：${artifact.name}，${tier}，耐久 ${durability}/${maxDurability}`}
                    onClick={() => { setRejected(undefined); setPendingReview({ command: option, stamp, item: artifact, durability, maximum: maxDurability }); }}>
                    核对拆解
                  </button>}
              </li>
            );
          })}
        </ul>
      )}
      {pendingReview && !review && stamp && pendingReview.stamp.actorId === stamp.actorId && pendingReview.stamp.scopeKey === stamp.scopeKey &&
        <p role="status" className="basis-full text-amber-200">世界或用炉条件已变化，请重新核对要拆解的器物。</p>}
      {rejected && stamp && artifactSalvageStampMatches(rejected, stamp) &&
        <p role="status" className="basis-full text-amber-200">拆解指令未登记；没有拆解器物或发放材料。</p>}
      {ownQueued && <p role="status" className="basis-full break-words rounded border border-violet-500/25 p-2 text-violet-100">
        已登记拆解指令 · 第 {queued.queuedTick + 1} 轮复核。此处未拆解器物，也未发放材料。</p>}
      {receipts.length > 0 && <div aria-label="本人拆解凭据" className="min-w-0 basis-full space-y-1 border-t border-slate-800 pt-2">
        <h5 className="font-semibold text-slate-200">本人拆解凭据</h5>
        <p className="text-slate-400">记录当时回收，不证明材料至今仍在库存。</p>
        <ul className="max-h-48 space-y-1 overflow-y-auto text-slate-300">
          {receipts.map((row) => <li key={row.artifactId} className="min-w-0 rounded bg-slate-800/45 p-2 [overflow-wrap:anywhere]">
            <p>{row.artifactName} · {row.tier} · 耐久 {row.durability}/{row.maxDurability} · 第 {row.tick} 轮实际拆解{known?.has(row.siteId) && ` · ${known.get(row.siteId)}`}</p>
            <p>原器已永久移除；当时实收玄土根 {ARTIFACT_SALVAGE_ROOTS} 株。原器工坊凭据：第 {row.origin.blankTick} 轮制坯，第 {row.origin.finishedTick} 轮验收交割。</p>
          </li>)}
        </ul>
      </div>}
    </section>
  );
}
