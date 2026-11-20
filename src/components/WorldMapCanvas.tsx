import React, { useEffect, useRef } from 'react';
import { Cultivator, LocationNode, WorldEvent, WorldState } from '../types/world';
import { memoryStrength } from '../engine/memoryEngine';
import { countCompletedSchemeSteps, SCHEME_STATUS } from './SchemePanel';
import { DIALOGUE_KIND_LABELS } from './DialogueTranscript';
import { SPIRIT_ROOT_COLORS, SpiritRootBadge } from './SpiritRootBadge';
import { countHerbs } from './AlchemyPanel';
import { durabilityOf, equippedArtifact, maxDurabilityOf } from '../engine/artifactEngine';
import { isActiveTrial, TRIAL_STAGE } from './TribulationPanel';
import { isGuardOnDuty } from './SectEconomyPanel';

interface WorldMapCanvasProps {
  world: WorldState;
  selectedCultivatorId: string | null;
  onSelectCultivator: (id: string) => void;
  onSelectLocation?: (loc: LocationNode) => void;
}

export const WorldMapCanvas: React.FC<WorldMapCanvasProps> = ({
  world,
  selectedCultivatorId,
  onSelectCultivator,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const selected = world.cultivators.find((c) => c.id === selectedCultivatorId);
  const selectedScheme = selected?.activeScheme;
  const selectedSect = selected && world.sects.find((sect) => sect.id === selected.sectId);
  const selectedArtifact = selected?.alive ? equippedArtifact(selected) : undefined;
  const selectedLocation = selected && world.locations.find((loc) => loc.id === selected.locationId);
  const selectedTrial = selected?.tribulation;
  const trialsByLocation = new Map<string, number>();
  const guardsByLocation = new Map<string, number>();
  const headquarters = new Map(world.sects.map((sect) => [sect.headquartersId, sect]));
  for (const actor of world.cultivators) {
    if (isGuardOnDuty(actor, world)) {
      guardsByLocation.set(actor.locationId, (guardsByLocation.get(actor.locationId) ?? 0) + 1);
    }
    if (actor.alive && isActiveTrial(actor.tribulation)) {
      trialsByLocation.set(actor.locationId, (trialsByLocation.get(actor.locationId) ?? 0) + 1);
    }
  }
  const selectedSiteTrials = selectedLocation ? trialsByLocation.get(selectedLocation.id) ?? 0 : 0;
  const selectedSiteGuards = selectedLocation ? guardsByLocation.get(selectedLocation.id) ?? 0 : 0;
  const strongestMemory = selected
    ? [...selected.memories, ...selected.coreMemories].reduce(
        (strongest, entry) => Math.max(strongest, memoryStrength(entry, world.tick)),
        0
      )
    : 0;

  const reflectionCounts = selected?.reflections.reduce(
    (counts, entry) => {
      counts[entry.kind] += 1;
      return counts;
    },
    { belief: 0, obsession: 0, heart_demon: 0 }
  );

  const relayedRumorCount = selected?.rumors.filter(
    (entry) => entry.provenance === 'conversation' || entry.provenance === 'flying_sword'
  ).length;

  const latestDialogueEvent = selected && world.events.reduce<WorldEvent | undefined>((latest, event) => {
    if (!event.dialogue?.turns.length || !event.actorIds.includes(selected.id)) return latest;
    return !latest || event.tick > latest.tick ? event : latest;
  }, undefined);
  const latestDialogue = latestDialogueEvent?.dialogue;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // 1. Background gradient
    const bgGrad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      40,
      width / 2,
      height / 2,
      width * 0.7
    );
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(1, '#020617');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Subtle grid lines
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.07)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 3. Draw Spirit Vein connection lines between locations
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.setLineDash([5, 6]);
    const centerLoc = world.locations.find((l) => l.id === 'loc-secret-1');
    if (centerLoc) {
      for (const loc of world.locations) {
        if (loc.id === centerLoc.id) continue;
        ctx.beginPath();
        ctx.moveTo(centerLoc.x, centerLoc.y);
        ctx.lineTo(loc.x, loc.y);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // 4. Draw Locations
    for (const loc of world.locations) {
      const ownerSect = world.sects.find((s) => s.id === loc.ownerSectId);
      const baseColor = ownerSect?.color ?? '#fbbf24';

      // Aura glow proportional to spiritQi
      const auraRadius = 28 + (loc.spiritQi / 100) * 26;
      const aura = ctx.createRadialGradient(
        loc.x,
        loc.y,
        5,
        loc.x,
        loc.y,
        auraRadius
      );
      aura.addColorStop(0, `${baseColor}44`);
      aura.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(loc.x, loc.y, auraRadius, 0, Math.PI * 2);
      ctx.fill();

      // Core node circle
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(loc.x, loc.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Keep the element beside the location name so it doesn't add a competing row.
      ctx.font = 'bold 13px sans-serif';
      const marker = `〈${loc.spiritRoot}〉`;
      const placeWidth = ctx.measureText(loc.name).width;
      const markerWidth = ctx.measureText(marker).width;
      const scrollCount = loc.inheritanceScrolls.length;
      const scrollMarker = scrollCount > 0 ? ` 遗卷×${scrollCount}` : '';
      const scrollWidth = ctx.measureText(scrollMarker).width;
      const furnaceMarker = loc.furnaceGrade > 0 ? ` 炉${loc.furnaceGrade}` : '';
      const furnaceWidth = ctx.measureText(furnaceMarker).width;
      const guardCount = guardsByLocation.get(loc.id) ?? 0;
      const guardMarker = guardCount > 0 ? ` 卫${guardCount}` : '';
      const guardWidth = ctx.measureText(guardMarker).width;
      const labelStart = loc.x - (placeWidth + markerWidth + scrollWidth + furnaceWidth + guardWidth) / 2;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(loc.name, labelStart, loc.y - 26);
      ctx.fillStyle = SPIRIT_ROOT_COLORS[loc.spiritRoot];
      ctx.fillText(marker, labelStart + placeWidth, loc.y - 26);
      if (scrollMarker) {
        ctx.fillStyle = '#fcd34d';
        ctx.fillText(scrollMarker, labelStart + placeWidth + markerWidth, loc.y - 26);
      }

      if (furnaceMarker) {
        ctx.fillStyle = '#86efac';
        ctx.fillText(furnaceMarker, labelStart + placeWidth + markerWidth + scrollWidth, loc.y - 26);
      }
      if (guardMarker) {
        ctx.fillStyle = '#a5b4fc';
        ctx.fillText(guardMarker, labelStart + placeWidth + markerWidth + scrollWidth + furnaceWidth, loc.y - 26);
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.fillText(`灵气 ${loc.spiritQi}`, loc.x, loc.y + 33);
    }

    // 5. Draw Cultivators grouped by location
    const aliveCultivators = world.cultivators.filter((c) => c.alive);
    const byLoc: Record<string, Cultivator[]> = {};
    for (const c of aliveCultivators) {
      byLoc[c.locationId] = byLoc[c.locationId] ?? [];
      byLoc[c.locationId].push(c);
    }

    for (const [locId, group] of Object.entries(byLoc)) {
      const loc = world.locations.find((l) => l.id === locId);
      if (!loc) continue;

      group.forEach((cultivator, idx) => {
        const angle = (idx / group.length) * Math.PI * 2 - Math.PI / 4;
        const offsetRadius = group.length === 1 ? 0 : 38;
        const cx = loc.x + Math.cos(angle) * offsetRadius;
        const cy = loc.y + Math.sin(angle) * offsetRadius;

        const sect = world.sects.find((s) => s.id === cultivator.sectId);
        const color = sect?.color ?? '#38bdf8';
        const isSelected = cultivator.id === selectedCultivatorId;

        // Static bolt only, so it stays legible without flashing or motion.
        if (cultivator.tribulation?.stage === 'lightning') {
          ctx.strokeStyle = '#7dd3fc';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx + 27, cy - 23);
          ctx.lineTo(cx + 21, cy - 13);
          ctx.lineTo(cx + 29, cy - 13);
          ctx.lineTo(cx + 22, cy - 3);
          ctx.stroke();
        }

        if (isSelected) {
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, 17, 0, Math.PI * 2);
          ctx.stroke();
          // A quiet outer arc indicates core-memory presence only on the selected NPC.
          if (cultivator.coreMemories.length > 0) {
            ctx.strokeStyle = '#c4b5fd';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, 21, -Math.PI / 2, Math.PI / 2);
            ctx.stroke();
          }
        }

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, 12, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Name & Realm pill
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${cultivator.name}`, cx, cy + 24);
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '10px sans-serif';
        ctx.fillText(
          `${cultivator.realm}${cultivator.realmStage}`,
          cx,
          cy + 36
        );
      });
    }
  }, [world, selectedCultivatorId]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    const aliveCultivators = world.cultivators.filter((c) => c.alive);
    const byLoc: Record<string, Cultivator[]> = {};
    for (const c of aliveCultivators) {
      byLoc[c.locationId] = byLoc[c.locationId] ?? [];
      byLoc[c.locationId].push(c);
    }

    for (const [locId, group] of Object.entries(byLoc)) {
      const loc = world.locations.find((l) => l.id === locId);
      if (!loc) continue;

      for (let idx = 0; idx < group.length; idx++) {
        const cultivator = group[idx];
        const angle = (idx / group.length) * Math.PI * 2 - Math.PI / 4;
        const offsetRadius = group.length === 1 ? 0 : 38;
        const cx = loc.x + Math.cos(angle) * offsetRadius;
        const cy = loc.y + Math.sin(angle) * offsetRadius;

        const dist = Math.hypot(clickX - cx, clickY - cy);
        if (dist <= 20) {
          onSelectCultivator(cultivator.id);
          return;
        }
      }
    }
  };

  return (
    <div className="relative rounded-xl border border-slate-800 bg-slate-950/90 overflow-hidden shadow-xl">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/80 bg-slate-900/60">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
          <h2 className="text-sm font-semibold text-slate-200">
            九州灵脉沙盒舆图（点击修士头像可观测其识海思维链）
          </h2>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {world.sects.map((sect) => (
            <span key={sect.id} className="flex items-center gap-1.5 text-slate-300">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: sect.color }}
              />
              {sect.name}
            </span>
          ))}
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={1000}
        height={560}
        onClick={handleCanvasClick}
        className="w-full h-auto cursor-pointer block"
        aria-label="修仙世界地图。选择修士可查看下方识海状态摘要；也可通过识海面板的修士按钮切换。雷劫用静态闪电标注；各地渡劫与驻守状态可在下方列表查看。"
      />
      <div className="px-4 py-2 border-t border-slate-800/80 bg-slate-900/60 text-[11px] text-slate-400 flex flex-wrap gap-x-4 gap-y-1" aria-label="选中修士记忆摘要">
        {selected ? (
          <>
            <span className="text-slate-200">{selected.name}{!selected.alive ? '（已陨落，不在地图上显示）' : ''}</span>
            {selectedSect && (
              <span className="text-amber-200">宗门位阶：{selectedSect.name} · {selected.sectRank}{selected.alive ? '' : ' · 留档'}</span>
            )}
            {selectedSect && selectedSect.arrayMaxHp > 0 && (
              <span className="text-indigo-300">本宗护山阵 {selectedSect.arrayHp}/{selectedSect.arrayMaxHp}</span>
            )}
            <span className="inline-flex items-center gap-1">灵根 <SpiritRootBadge root={selected.spiritRoot} /></span>
            {selectedLocation && (
              <span className="inline-flex items-center gap-1">
                {selectedLocation.name} · 灵脉 <SpiritRootBadge root={selectedLocation.spiritRoot} />
              </span>
            )}
            {selected.alive && selectedLocation && (
              <>
                {selectedSiteGuards > 0 && <span className="text-indigo-300">此地驻守 {selectedSiteGuards} 人</span>}
                {selectedSiteTrials > 0 && (
                  <span className="text-sky-300">此地渡劫中 {selectedSiteTrials} 人</span>
                )}
                <span className="text-amber-300">此地遗卷 {selectedLocation.inheritanceScrolls.length} 卷</span>
                <span className="text-emerald-300">
                  此地丹道：{selectedLocation.furnaceGrade > 0 ? `${selectedLocation.furnaceGrade} 阶丹炉` : '无丹炉'} · 灵草 {countHerbs(selectedLocation.herbs)} 株
                </span>
              </>
            )}
            {selectedArtifact ? (
              <span className="text-violet-300">
                装备法宝：{selectedArtifact.name} · 耐久 {durabilityOf(selectedArtifact)}/{maxDurabilityOf(selectedArtifact)}
              </span>
            ) : selected.alive && selected.artifacts.length > 0 && (
              <span className="text-slate-400">未装备法宝</span>
            )}
            {selectedTrial && (
              <span className={TRIAL_STAGE[selectedTrial.stage].color}>
                渡劫：{selectedTrial.targetRealm} · {TRIAL_STAGE[selectedTrial.stage].label}
                {selected.alive && selectedTrial.stage === 'lightning' ? ` · 第 ${selectedTrial.nextWave}/${selectedTrial.totalWaves} 道` : ''}
                {!selected.alive ? ' · 留档' : ''}
              </span>
            )}
            <span>情景记忆 {selected.memories.length} 条</span>
            <span className="text-violet-300">核心记忆 {selected.coreMemories.length} 条{selected.alive && selected.coreMemories.length > 0 ? " · 紫弧标记" : ""}</span>
            <span>最强记忆 {strongestMemory.toFixed(1)}/10</span>
            <span className={reflectionCounts?.heart_demon ? 'text-rose-300' : 'text-slate-400'}>
              {selected.alive ? '道心' : '道心留影'}：信念 {reflectionCounts?.belief} · 执念 {reflectionCounts?.obsession} · 心魔 {reflectionCounts?.heart_demon}
            </span>
            <span className="text-indigo-300">见闻与流言 {selected.rumors.length} 条 · 转述 {relayedRumorCount} 条</span>
            {selectedScheme && (
              <span className={SCHEME_STATUS[selectedScheme.status].color}>
                长线计划：{SCHEME_STATUS[selectedScheme.status].label} · {countCompletedSchemeSteps(selectedScheme)}/{selectedScheme.steps.length} 步
              </span>
            )}
            {latestDialogueEvent && latestDialogue && (
              <span className="text-cyan-300">
                最近对话：{DIALOGUE_KIND_LABELS[latestDialogue.kind]} · 仙历 {latestDialogueEvent.year}年{latestDialogueEvent.month}月 · {latestDialogue.turns.length} 句
              </span>
            )}
          </>
        ) : (
          <span>选择一位修士查看其当前记忆状态。</span>
        )}
      </div>
      <details className="border-t border-slate-800/80 bg-slate-900/40 px-4 py-2 text-[11px] text-slate-300">
        <summary className="cursor-pointer">查看各地点灵脉属性</summary>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {world.locations.map((location) => {
            const herbCount = countHerbs(location.herbs);
            const trialCount = trialsByLocation.get(location.id) ?? 0;
            const guardCount = guardsByLocation.get(location.id) ?? 0;
            const homeSect = headquarters.get(location.id);
            return (
              <li key={location.id} className="inline-flex items-center gap-1.5">
                <span>{location.name} · 灵脉</span>
                <SpiritRootBadge root={location.spiritRoot} />
                <span className="text-slate-400">· 灵气 {location.spiritQi}</span>
                {location.furnaceGrade > 0 && <span className="text-emerald-300">· {location.furnaceGrade} 阶丹炉</span>}
                {guardCount > 0 && <span className="text-indigo-300">· 驻守 {guardCount} 人</span>}
                {homeSect && homeSect.arrayMaxHp > 0 && (
                  <span className="text-indigo-300">· 护山阵 {homeSect.arrayHp}/{homeSect.arrayMaxHp}</span>
                )}
                {trialCount > 0 && <span className="text-sky-300">· 渡劫中 {trialCount} 人</span>}
                {herbCount > 0 && <span className="text-emerald-300">· 灵草 {herbCount} 株</span>}
                {location.inheritanceScrolls.length > 0 && (
                  <span className="text-amber-300">· 遗卷 {location.inheritanceScrolls.length} 卷</span>
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
};
