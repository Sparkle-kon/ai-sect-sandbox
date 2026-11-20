import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LocationNode, WorldEvent, WorldState } from '../types/world';
import { memoryStrength } from '../engine/memoryEngine';
import { countCompletedSchemeSteps, SCHEME_STATUS } from './SchemePanel';
import { DIALOGUE_KIND_LABELS } from './DialogueTranscript';
import { SPIRIT_ROOT_COLORS, SpiritRootBadge } from './SpiritRootBadge';
import { countHerbs } from './AlchemyPanel';
import { durabilityOf, equippedArtifact, maxDurabilityOf } from '../engine/artifactEngine';
import { isActiveTrial, TRIAL_STAGE } from './TribulationPanel';
import { isGuardOnDuty } from './SectEconomyPanel';
import { isActiveCampaign, SIEGE_LABELS } from './SectDiplomacyPanel';
import { isOpenOccasion, OCCASION_KIND, OCCASION_STATUS } from './WorldOccasionsPanel';
import { BOUNTY_STATUS, relevantBounty } from './BountyBoard';
import { BIOME_PALETTE, createTerrainMapView, mapActorPositions } from './terrainMapView';
import { drawTerrain } from './terrainMapDraw';

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
  const [fog, setFog] = useState(false);
  const [heat, setHeat] = useState(false);
  const [tileDetailsOpen, setTileDetailsOpen] = useState(false);
  const selected = world.cultivators.find((c) => c.id === selectedCultivatorId);
  const mapView = useMemo(() => createTerrainMapView(world, selected, fog), [world, selected, fog]);
  const { seenLocations, liveActors, isCurrentLocation } = mapView;
  const actorPositions = useMemo(() => mapActorPositions(seenLocations, liveActors), [seenLocations, liveActors]);
  const selectedScheme = selected?.activeScheme;
  const selectedSect = selected && world.sects.find((sect) => sect.id === selected.sectId);
  const selectedArtifact = selected?.alive ? equippedArtifact(selected) : undefined;
  const selectedLocation = selected && seenLocations.find((loc) => loc.id === selected.locationId);
  const selectedTrial = selected?.tribulation;
  const selectedBounty = selected && relevantBounty(world.bounties, selected.id);
  const activeSieges = world.sieges.filter(isActiveCampaign);
  const occasionsByLocation = new Map<string, WorldState['occasions']>();
  for (const occasion of world.occasions.filter(isOpenOccasion)) {
    const local = occasionsByLocation.get(occasion.locationId) ?? [];
    local.push(occasion);
    occasionsByLocation.set(occasion.locationId, local);
  }
  const selectedSiege = selected?.alive ? activeSieges.find((siege) => siege.participantIds.includes(selected.id)) : undefined;
  const siegeLocation = selectedSiege && seenLocations.find(({ id }) => id === selectedSiege.destinationId);
  const besiegedLocationIds = new Set(activeSieges.filter(({ status, destinationId }) => status === 'sieging' && isCurrentLocation(destinationId)).map(({ destinationId }) => destinationId));
  const trialsByLocation = new Map<string, number>();
  const guardsByLocation = new Map<string, number>();
  const headquarters = new Map(world.sects.map((sect) => [sect.headquartersId, sect]));
  for (const actor of liveActors) {
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

    const draw = (phase: number) => {
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

      // 2. Terrain, spirit qi overlay and sect boundaries.
      drawTerrain(ctx, world, mapView.tileState, heat, phase);

      // 3. Draw Spirit Vein connection lines between locations
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.setLineDash([5, 6]);
      const centerLoc = seenLocations.find((l) => l.id === 'loc-secret-1' && isCurrentLocation(l.id));
      if (centerLoc) {
        for (const loc of seenLocations) {
          if (loc.id === centerLoc.id || !isCurrentLocation(loc.id)) continue;
          ctx.beginPath();
          ctx.moveTo(centerLoc.x, centerLoc.y);
          ctx.lineTo(loc.x, loc.y);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);

      // 4. Draw Locations
      for (const loc of seenLocations) {
        if (!isCurrentLocation(loc.id)) {
          ctx.fillStyle = '#64748b';
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(loc.name, loc.x, loc.y - 15);
          ctx.beginPath();
          ctx.arc(loc.x, loc.y, 5, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
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

        if (besiegedLocationIds.has(loc.id)) {
          ctx.strokeStyle = '#fb7185';
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(loc.x, loc.y, 23, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

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
        if (occasionsByLocation.has(loc.id)) {
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#67e8f9';
          ctx.fillText('会', loc.x + 28, loc.y - 4);
        }
        ctx.textAlign = 'center';
        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px sans-serif';
        ctx.fillText(`灵气 ${loc.spiritQi}`, loc.x, loc.y + 33);
      }

      // 5. Draw only actors in the current field of view.
      for (const { actor: cultivator, x: cx, y: cy } of actorPositions) {
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
      }
    };

    draw(0);
    if (!heat || typeof window.matchMedia !== 'function') return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame: number | undefined;
    let previous = 0;
    const run = (now: number) => {
      if (now - previous >= 80) {
        draw(now / 1350);
        previous = now;
      }
      frame = window.requestAnimationFrame(run);
    };
    const stopOrStart = () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = undefined;
      if (!preference.matches && !document.hidden) frame = window.requestAnimationFrame(run);
      else draw(0);
    };
    preference.addEventListener('change', stopOrStart);
    document.addEventListener('visibilitychange', stopOrStart);
    stopOrStart();
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      preference.removeEventListener('change', stopOrStart);
      document.removeEventListener('visibilitychange', stopOrStart);
    };
  }, [world, selectedCultivatorId, mapView, actorPositions, heat]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    for (const { actor, x, y } of actorPositions) {
      if (Math.hypot(clickX - x, clickY - y) <= 20) {
        onSelectCultivator(actor.id);
        return;
      }
    }
  };

  return (
    <div className="relative rounded-xl border border-slate-800 bg-slate-950/90 overflow-hidden shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-800/80 bg-slate-900/60">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" />
          <h2 className="text-sm font-semibold text-slate-200">
            九州灵脉沙盒舆图
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-800 px-4 py-2 text-xs text-slate-300">
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={fog} disabled={!selected && !fog} onChange={(event) => setFog(event.currentTarget.checked)} />
          修士视野（迷雾）
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={heat} onChange={(event) => setHeat(event.currentTarget.checked)} />
          灵气热力
        </label>
        <span className="text-[11px] text-slate-400">
          {fog ? `${selected?.name ?? '无修士'}视角 · 已探索 ${mapView.known?.size ?? 0}/${world.terrain.tiles.length} 格 · 视野内 ${mapView.current?.size ?? 0} 格` : '天道全图 · 宗门色线为领地边界'}
        </span>
        {heat && <span className="text-[11px] text-slate-400">蓝色至橙红色表示灵气由低到高。</span>}
      </div>
      <canvas
        ref={canvasRef}
        width={1000}
        height={600}
        onClick={handleCanvasClick}
        className="w-full h-auto cursor-pointer block"
        aria-label="修仙世界地图。选择修士可查看下方识海状态摘要；也可通过识海面板的修士按钮切换。雷劫用静态闪电标注；围攻地点用玫红虚线圈标注；各地渡劫、驻守、围攻和活跃盛会可在下方列表查看。"
      />
      <div className="px-4 py-2 border-t border-slate-800/80 bg-slate-900/60 text-[11px] text-slate-400 flex flex-wrap gap-x-4 gap-y-1" aria-label="选中修士记忆摘要">
        {selected ? (
          <>
            <span className="text-slate-200">{selected.name}{!selected.alive ? '（已陨落，不在地图上显示）' : ''}</span>
            {selectedSect && (
              <span className="text-amber-200">宗门位阶：{selectedSect.name} · {selected.sectRank}{selected.alive ? '' : ' · 留档'}</span>
            )}
            {!fog && selectedSect && selectedSect.arrayMaxHp > 0 && (
              <span className="text-indigo-300">本宗护山阵 {selectedSect.arrayHp}/{selectedSect.arrayMaxHp}</span>
            )}
            <span className="inline-flex items-center gap-1">灵根 <SpiritRootBadge root={selected.spiritRoot} /></span>
            {selectedLocation && isCurrentLocation(selectedLocation.id) && (
              <span className="inline-flex items-center gap-1">
                {selectedLocation.name} · 灵脉 <SpiritRootBadge root={selectedLocation.spiritRoot} />
              </span>
            )}
            {selected.alive && selectedLocation && isCurrentLocation(selectedLocation.id) && (
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
            {selectedSiege && (
              <span className="text-rose-300">参与战役：{SIEGE_LABELS[selectedSiege.status]} · {siegeLocation?.name ?? '地点未详'}</span>
            )}
            {selectedBounty && (
              <span className={selectedBounty.status === 'open' ? 'text-rose-300' : 'text-slate-400'}>
                悬赏：{BOUNTY_STATUS[selectedBounty.status]}
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
        <summary className="cursor-pointer">{fog ? '查看已发现地点与当前所见' : '查看各地点灵脉属性'}</summary>
        <div aria-label="地形图例" className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {Object.entries(BIOME_PALETTE).map(([name, { swatch }]) => (
            <span key={name} className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: swatch }} aria-hidden="true" />
              {name}
            </span>
          ))}
        </div>
        {fog && seenLocations.length === 0 && <p className="mt-2">无已发现的地点。</p>}
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {seenLocations.map((location) => {
            const tile = mapView.locationTile.get(location.id);
            if (!isCurrentLocation(location.id)) {
              return <li key={location.id}>{location.name} · {tile?.biome ?? '地形未详'} · 已探索，当前不可见</li>;
            }
            const herbCount = countHerbs(location.herbs);
            const trialCount = trialsByLocation.get(location.id) ?? 0;
            const guardCount = guardsByLocation.get(location.id) ?? 0;
            const homeSect = headquarters.get(location.id);
            const localOccasions = occasionsByLocation.get(location.id) ?? [];
            return (
              <li key={location.id} className="inline-flex items-center gap-1.5">
                <span>{location.name} · 灵脉</span>
                <SpiritRootBadge root={location.spiritRoot} />
                <span className="text-slate-400">· 灵气 {location.spiritQi}</span>
                {tile && <span className="text-slate-400">· {tile.biome} · 地格灵气 {tile.spiritQi} · {world.sects.find(({ id }) => id === tile.ownerSectId)?.name ?? '无所属宗门'}</span>}
                {fog && actorPositions.filter(({ actor }) => actor.locationId === location.id).map(({ actor }) => (
                  <button key={actor.id} type="button" onClick={() => onSelectCultivator(actor.id)} className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-200">
                    {actor.name}
                  </button>
                ))}
                {location.furnaceGrade > 0 && <span className="text-emerald-300">· {location.furnaceGrade} 阶丹炉</span>}
                {guardCount > 0 && <span className="text-indigo-300">· 驻守 {guardCount} 人</span>}
                {homeSect && homeSect.arrayMaxHp > 0 && (
                  <span className="text-indigo-300">· 护山阵 {homeSect.arrayHp}/{homeSect.arrayMaxHp}</span>
                )}
                {besiegedLocationIds.has(location.id) && <span className="text-rose-300">· 围攻中</span>}
                {localOccasions.map((occasion) => (
                  <span key={occasion.id} className="text-cyan-300">
                    · {OCCASION_KIND[occasion.kind]}：{occasion.title}（{OCCASION_STATUS[occasion.status]}）
                  </span>
                ))}
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
      <details
        className="border-t border-slate-800/80 bg-slate-900/40 px-4 py-2 text-[11px] text-slate-300"
        onToggle={(event) => setTileDetailsOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer">逐格查看地形与灵气</summary>
        {tileDetailsOpen && (
          <ul className="mt-2 grid max-h-44 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
            {world.terrain.tiles.flatMap((tile) => {
              const state = mapView.tileState(tile);
              if (state === 'hidden') return [];
              const owner = world.sects.find(({ id }) => id === tile.ownerSectId)?.name;
              return (
                <li key={tile.id} className="rounded bg-slate-900/70 px-1.5 py-0.5">
                  第 {tile.row + 1} 行，第 {tile.col + 1} 列 · {tile.biome}
                  {state === 'visible' ? ` · 灵气 ${tile.spiritQi} · ${owner ?? '无所属宗门'}` : ' · 已探索，当前不可见'}
                </li>
              );
            })}
          </ul>
        )}
      </details>
    </div>
  );
};
