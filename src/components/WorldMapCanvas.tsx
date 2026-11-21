import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { GodBrushKind, LocationNode, MapPoint, WorldEvent, WorldState } from '../types/world';
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
import { buildMapPresentation, MAP_EFFECT_LABELS, MOTION_MS } from './mapPresentationView';
import { drawFlights, drawMapEffects } from './mapPresentationDraw';
import { centerCamera, clientToMapViewport, closestViewportTarget, DEFAULT_CAMERA, MAP_HEIGHT, MAP_WIDTH, MAX_ZOOM, panCamera, screenToMap, viewportPixelDistance, zoomCamera } from './mapCamera';
import type { CameraPoint, MapCamera } from './mapCamera';
import { focusMapPoint, mapCameraCommand, mapKeyboardCommand, shouldAnimateMap } from './mapKeyboard';
import type { MapCameraCommand } from './mapKeyboard';
import { BRUSH_LABELS, brushPoint, drawHazards, getVisibleHazards } from './mapBrushView';
import { BEAST_COLORS, visibleBeastsByLocation } from './spiritBeastView';
import { activeAvatar } from '../engine/avatarEngine';
import { localQiWeather } from '../engine/weatherEngine';

const MapKeyboardExplorer = React.lazy(async () => ({ default: (await import('./MapKeyboardExplorer')).MapKeyboardExplorer }));

const WEATHER_MARK = {
  平息: { symbol: '', color: '#94a3b8' },
  灵潮: { symbol: '潮', color: '#6ee7b7' },
  罡风: { symbol: '风', color: '#fcd34d' },
  霜息: { symbol: '霜', color: '#bae6fd' },
};

interface WorldMapCanvasProps {
  world: WorldState;
  selectedCultivatorId: string | null;
  onSelectCultivator: (id: string) => void;
  onSelectLocation?: (loc: LocationNode) => void;
  onBrushStroke?: (kind: GodBrushKind, points: MapPoint[]) => void;
  compact?: boolean;
}

export const WorldMapCanvas: React.FC<WorldMapCanvasProps> = ({
  world,
  selectedCultivatorId,
  onSelectCultivator,
  onSelectLocation,
  onBrushStroke,
  compact = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [camera, setCamera] = useState(DEFAULT_CAMERA);
  const [touchPan, setTouchPan] = useState(false);
  const [followsSelection, setFollowsSelection] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [focusMessage, setFocusMessage] = useState('');
  const explorerSummary = useRef<HTMLElement | null>(null);
  const keyboardHelp = useId();
  const cameraRef = useRef(camera);
  const updateCamera = (next: MapCamera) => {
    const previous = cameraRef.current;
    if (previous.x !== next.x || previous.y !== next.y || previous.zoom !== next.zoom) {
      cameraRef.current = next;
      setCamera(next);
    }
  };
  const manualCamera = (next: MapCamera) => { setFollowsSelection(false); updateCamera(next); };
  const [brush, setBrush] = useState<GodBrushKind | 'browse'>('browse');
  const [preview, setPreview] = useState<MapPoint[]>([]);
  const gesture = useRef<{
    pointer: number; initial: CameraPoint; previous: CameraPoint; moved: boolean; isTouch: boolean;
    brush?: GodBrushKind; points: MapPoint[];
  } | undefined>();
  const [fog, setFog] = useState(false);
  const [heat, setHeat] = useState(false);
  const [tileDetailsOpen, setTileDetailsOpen] = useState(false);
  const selected = world.cultivators.find((c) => c.id === selectedCultivatorId);
  const mapView = useMemo(() => createTerrainMapView(world, selected, fog), [world, selected, fog]);
  const { seenLocations, liveActors, isCurrentLocation } = mapView;
  const weatherAtVisibleSites = useMemo(() => new Map(seenLocations
    .filter(({ id }) => isCurrentLocation(id))
    .map((site) => [site.id, localQiWeather(world, site)])), [world, seenLocations, isCurrentLocation]);
  const hazards = useMemo(() => getVisibleHazards(world, mapView), [world, mapView]);
  const beastsByLocation = useMemo(() => visibleBeastsByLocation(world, mapView), [world, mapView]);
  const armedBrush = !fog && onBrushStroke && brush !== 'browse' ? brush : undefined;
  const actorPositions = useMemo(() => mapActorPositions(seenLocations, liveActors), [seenLocations, liveActors]);
  const selectedPoint = actorPositions.find(({ actor }) => actor.id === selectedCultivatorId);
  const followedActorId = selectedPoint?.actor.id;
  const followedX = selectedPoint?.x;
  const followedY = selectedPoint?.y;
  useEffect(() => {
    if (!followsSelection) return;
    if (!followedActorId || followedX === undefined || followedY === undefined) {
      setFollowsSelection(false);
      return;
    }
    updateCamera(focusMapPoint(cameraRef.current, { x: followedX, y: followedY }));
  }, [followsSelection, followedActorId, followedX, followedY]);
  const presentation = useMemo(() => buildMapPresentation(world, mapView, actorPositions), [world, mapView, actorPositions]);
  const paintedActors = useRef<typeof actorPositions>([]);
  const playback = useRef<{ source: WorldState['mapPresentation']; start: number } | undefined>();
  const selectedScheme = selected?.activeScheme;
  const selectedSect = selected && world.sects.find((sect) => sect.id === selected.sectId);
  const avatarId = activeAvatar(world)?.id;
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
  const villagesAt = new Map(world.settlements.villages.map((village) => [village.locationId, village]));
  const currentCouncils = new Map(world.councils.filter((record) => record.tick === world.tick).map((record) => [record.sectId, record]));
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

    const hasMotion = presentation.routes.size > 0 || presentation.effects.length > 0;
    if (playback.current?.source !== world.mapPresentation) {
      playback.current = { source: world.mapPresentation, start: performance.now() };
    }
    const motionStart = playback.current?.start ?? performance.now();
    const draw = (phase: number, elapsed: number, animate: boolean) => {
      ctx.save();
      ctx.clearRect(0, 0, width, height);
      ctx.setTransform(camera.zoom, 0, 0, camera.zoom, camera.x, camera.y);
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
      drawHazards(ctx, hazards);

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
        const localWeather = weatherAtVisibleSites.get(loc.id);
        if (localWeather && localWeather.kind !== '平息') {
          const appearance = WEATHER_MARK[localWeather.kind];
          ctx.save();
          ctx.textAlign = 'right';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillStyle = appearance.color;
          ctx.fillText(appearance.symbol, loc.x - 21, loc.y + 11);
          ctx.restore();
        }
        const localVillage = villagesAt.get(loc.id);
        if (localVillage && isCurrentLocation(loc.id)) {
          ctx.save();
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = localVillage.stress >= 55 ? '#fdba74' : '#bef264';
          ctx.fillText(`村 ${localVillage.population}`, loc.x, loc.y + 43);
          ctx.restore();
        }
        const localCouncil = currentCouncils.get(headquarters.get(loc.id)?.id ?? '');
        if (localCouncil && isCurrentLocation(loc.id)) {
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#c4b5fd';
          ctx.fillText('议', loc.x + 28, loc.y + 11);
        }
        const localBeasts = beastsByLocation.get(loc.id);
        if (localBeasts?.length) {
          ctx.save();
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'right';
          ctx.shadowColor = '#020617';
          ctx.shadowBlur = 4;
          ctx.fillStyle = localBeasts.some(({ kind, tamedBy }) => kind === '凶兽' && !tamedBy) ? '#fda4af' : '#86efac';
          ctx.fillText(`兽 ${localBeasts.length}`, loc.x - 22, loc.y - 4);
          ctx.restore();
        }
        ctx.textAlign = 'center';
        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px sans-serif';
        ctx.fillText(`灵气 ${loc.spiritQi}`, loc.x, loc.y + 33);
      }

      // 5. Draw only actors in the current field of view.
      const frameActors = drawFlights(ctx, actorPositions, presentation.routes, elapsed, animate);
      paintedActors.current = frameActors;
      const marked = new Set<string>();
      for (const { actor: cultivator, x: cx, y: cy } of frameActors) {
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
          const labelCell = `${Math.floor(cx * camera.zoom / 75)}:${Math.floor(cy * camera.zoom / 36)}`;
          const showName = !compact || isSelected || (camera.zoom >= 2 && !marked.has(labelCell));
          if (showName) { ctx.fillText(`${cultivator.name}`, cx, cy + 24); marked.add(labelCell); }
          if (cultivator.id === avatarId) {
            ctx.fillStyle = '#fde68a';
            ctx.fillText('临身', cx, cy - 20);
          }
          ctx.fillStyle = '#cbd5e1';
          ctx.font = '10px sans-serif';
          if (showName) ctx.fillText(
            `${cultivator.realm}${cultivator.realmStage}`,
            cx,
            cy + 36
          );
      }
      drawMapEffects(ctx, presentation.effects, frameActors, elapsed, animate);
      if (armedBrush && preview.length > 0) {
        ctx.strokeStyle = '#fef08a';
        ctx.fillStyle = '#fef08a';
        ctx.lineWidth = 2 / camera.zoom;
        ctx.setLineDash([4 / camera.zoom, 3 / camera.zoom]);
        ctx.beginPath();
        ctx.moveTo(preview[0].x, preview[0].y);
        for (const point of preview.slice(1)) ctx.lineTo(point.x, point.y);
        ctx.stroke();
        const latest = preview.at(-1)!;
        ctx.beginPath();
        ctx.arc(latest.x, latest.y, 4 / camera.zoom, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    const preference = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : undefined;
    let frame: number | undefined;
    let previous = 0;
    const run = (now: number) => {
      const elapsed = now - motionStart;
      const moving = hasMotion && elapsed < MOTION_MS;
      if (now - previous >= (moving ? 33 : 80) || !moving && !heat) {
        draw(now / 1350, elapsed, true);
        previous = now;
      }
      frame = heat || moving ? window.requestAnimationFrame(run) : undefined;
    };
    const stopOrStart = () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = undefined;
      const now = performance.now();
      const animate = shouldAnimateMap(preference?.matches, !document.hidden);
      draw(0, now - motionStart, animate);
      if (animate && (heat || hasMotion && now - motionStart < MOTION_MS)) {
        frame = window.requestAnimationFrame(run);
      }
    };
    preference?.addEventListener('change', stopOrStart);
    document.addEventListener('visibilitychange', stopOrStart);
    stopOrStart();
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      preference?.removeEventListener('change', stopOrStart);
      document.removeEventListener('visibilitychange', stopOrStart);
    };
  }, [world, selectedCultivatorId, mapView, actorPositions, heat, presentation, camera, hazards, beastsByLocation, weatherAtVisibleSites, armedBrush, preview, compact]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wheel = (event: WheelEvent) => {
      if (gesture.current) return;
      const screen = clientToMapViewport(canvas.getBoundingClientRect(), { x: event.clientX, y: event.clientY });
      if (!screen) return;
      const currentCamera = cameraRef.current;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 250 : 1);
      const next = zoomCamera(currentCamera, currentCamera.zoom * Math.exp(-delta * 0.002), screen);
      if (next.zoom === currentCamera.zoom) return;
      event.preventDefault();
      manualCamera(next);
    };
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => canvas.removeEventListener('wheel', wheel);
  }, []);

  const centerOfMap = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
  const getPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = clientToMapViewport(event.currentTarget.getBoundingClientRect(), { x: event.clientX, y: event.clientY });
    return point && point.x >= 0 && point.x <= MAP_WIDTH && point.y >= 0 && point.y <= MAP_HEIGHT ? point : undefined;
  };

  const startGesture = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || gesture.current) return;
    const screen = getPointer(event);
    if (!screen) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const points = armedBrush ? brushPoint([], screenToMap(cameraRef.current, screen)) : [];
    gesture.current = { pointer: event.pointerId, initial: screen, previous: screen, moved: false,
      isTouch: event.pointerType === 'touch', brush: armedBrush, points };
    if (armedBrush) setPreview(points);
  };
  const updateGesture = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    const screen = getPointer(event);
    if (!screen) return;
    const currentCamera = cameraRef.current;
    if (active.brush) {
      const next = brushPoint(active.points, screenToMap(currentCamera, screen));
      if (next !== active.points) { active.points = next; setPreview(next); }
    } else if (active.moved || viewportPixelDistance(screen, active.initial, event.currentTarget.getBoundingClientRect()) >= (active.isTouch ? 9 : 5)) {
      if (!active.moved) active.previous = active.initial;
      active.moved = true;
      if (!active.isTouch || touchPan || !compact) {
        manualCamera(panCamera(currentCamera, { x: screen.x - active.previous.x, y: screen.y - active.previous.y }));
      }
    }
    active.previous = screen;
  };
  const endGesture = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    gesture.current = undefined;
    const screen = getPointer(event);
    const position = screen ? screenToMap(cameraRef.current, screen) : undefined;
    if (active.brush) {
      setPreview([]);
      const points = position ? brushPoint(active.points, position, true) : active.points;
      if (active.brush === armedBrush && points.length > 0) onBrushStroke?.(active.brush, points);
      return;
    }
    const size = event.currentTarget.getBoundingClientRect();
    if (!screen || active.moved || viewportPixelDistance(screen, active.initial, size) >= (active.isTouch ? 9 : 5)) return;
    const currentIds = new Set(actorPositions.map(({ actor }) => actor.id));
    const radius = active.isTouch ? 22 : Math.max(10, cameraRef.current.zoom * 20 * size.width / MAP_WIDTH);
    const picked = closestViewportTarget(paintedActors.current.filter(({ actor }) => currentIds.has(actor.id)),
      cameraRef.current, screen, size, radius);
    if (picked) { onSelectCultivator(picked.actor.id); return; }
    const clickedLocation = closestViewportTarget(seenLocations.filter((site) => isCurrentLocation(site.id)),
      cameraRef.current, screen, size, radius);
    if (clickedLocation) focusSite(clickedLocation);
  };
  const cancelGesture = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (gesture.current?.pointer !== event.pointerId) return;
    gesture.current = undefined;
    setPreview([]);
  };
  const minViewport = screenToMap(camera, { x: 0, y: 0 });
  const maxViewport = screenToMap(camera, { x: MAP_WIDTH, y: MAP_HEIGHT });
  const focusSite = (site: LocationNode) => {
    const visible = seenLocations.find(({ id }) => id === site.id);
    if (!visible) return;
    manualCamera(focusMapPoint(cameraRef.current, visible));
    if (isCurrentLocation(visible.id)) onSelectLocation?.(visible);
    setFocusMessage(`地图已定位：${visible.name}`);
  };
  const locateActor = (id: string) => {
    const point = actorPositions.find(({ actor }) => actor.id === id);
    if (!point) return;
    onSelectCultivator(id);
    manualCamera(focusMapPoint(cameraRef.current, point));
    setFocusMessage(`地图已定位：${point.actor.name}`);
  };
  const activateCamera = (command: MapCameraCommand) => {
    if (command === 'selected' && selectedPoint) setFocusMessage(`地图已定位：${selectedPoint.actor.name}`);
    manualCamera(mapCameraCommand(cameraRef.current, command, selectedPoint));
  };

  return (
    <div className="relative rounded-xl border border-slate-800 bg-slate-950/90 overflow-hidden shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-800/80 bg-slate-900/60">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" />
          <h2 className="text-sm font-semibold text-slate-200">
            {compact ? '九州舆图' : '九州灵脉沙盒舆图'}
          </h2>
        </div>
        <div className={`flex flex-wrap items-center gap-3 text-xs ${compact ? 'hidden sm:flex' : ''}`}>
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

      {compact && <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-3 py-1 text-xs text-slate-300" aria-label="地图快捷控制">
        <button type="button" className="min-h-11 min-w-11 rounded border border-slate-700 disabled:opacity-40"
          aria-label="缩小地图" disabled={camera.zoom <= 1} onClick={() => activateCamera('out')}>−</button>
        <button type="button" className="min-h-11 min-w-11 rounded border border-slate-700 disabled:opacity-40"
          aria-label="放大地图" disabled={camera.zoom >= MAX_ZOOM} onClick={() => activateCamera('in')}>＋</button>
        <button type="button" className="min-h-11 rounded border border-slate-700 px-2 disabled:opacity-40"
          disabled={camera.zoom === 1} onClick={() => activateCamera('home')}>复位</button>
        <span className="tabular-nums">{Math.round(camera.zoom * 100)}%</span>
        <button type="button" aria-pressed={touchPan} onClick={() => setTouchPan((enabled) => !enabled)}
          className={`min-h-11 rounded border px-2 sm:hidden ${touchPan ? 'border-sky-400 text-sky-100' : 'border-slate-700 text-slate-200'}`}>
          {touchPan ? '拖图开启' : '拖图'}
        </button>
      </div>}
      <details className="border-b border-slate-800" open={!compact || undefined}>
        <summary className={`cursor-pointer px-3 py-2 text-xs text-slate-400 ${compact ? 'flex min-h-11 items-center' : 'sr-only'}`}>地图选项</summary>
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
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-800 px-4 py-2 text-[11px] text-slate-300" aria-label="地图视角与画笔">
        {([
          { label: '缩小地图', text: '−', disabled: camera.zoom <= 1, command: 'out' },
          { label: '放大地图', text: '+', disabled: camera.zoom >= MAX_ZOOM, command: 'in' },
          { label: '向左浏览', text: '←', disabled: camera.x >= 0, command: 'left' },
          { label: '向右浏览', text: '→', disabled: minViewport.x + MAP_WIDTH / camera.zoom >= MAP_WIDTH - 0.001, command: 'right' },
          { label: '向上浏览', text: '↑', disabled: camera.y >= 0, command: 'up' },
          { label: '向下浏览', text: '↓', disabled: minViewport.y + MAP_HEIGHT / camera.zoom >= MAP_HEIGHT - 0.001, command: 'down' },
          { label: '重置地图视角', text: '重置', disabled: camera.zoom === 1, command: 'home' },
        ] as const).map(({ label, text, disabled, command }) => (
          <button key={label} type="button" aria-label={label} disabled={disabled} onClick={() => activateCamera(command)}
            className="rounded border border-slate-700 px-2 py-1 text-slate-200 disabled:opacity-35">{text}</button>
        ))}
        <span className="px-1 tabular-nums">{Math.round(camera.zoom * 100)}%</span>
        <label className="inline-flex items-center gap-1">
          天道画笔
          <select value={fog ? 'browse' : brush} disabled={fog || !onBrushStroke} onChange={(event) => setBrush(event.currentTarget.value as GodBrushKind | 'browse')}
            className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 disabled:opacity-40">
            <option value="browse">浏览／选择</option>
            {(Object.entries(BRUSH_LABELS) as [GodBrushKind, string][]).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
          </select>
        </label>
        <span className="text-slate-400">
          {fog ? '修士视野中不可使用天道画笔。' : armedBrush ? '点击或拖笔，松开时应用一笔。' : '滚轮缩放，拖动平移，点击选择。'}
        </span>
      </div>
      </details>
      <p id={keyboardHelp} className="sr-only">方向键平移，加号或减号缩放，Home 复位，F 定位所选修士。山河索引可按地点、修士或事件定位。</p>
      <div className="relative">
        <canvas
        ref={canvasRef}
        width={MAP_WIDTH}
        height={MAP_HEIGHT}
        tabIndex={0}
        aria-describedby={keyboardHelp}
        onKeyDown={(event) => {
          if (event.currentTarget !== event.target || event.nativeEvent.isComposing) return;
          const command = mapKeyboardCommand(event);
          if (!command) return;
          event.preventDefault();
          activateCamera(command);
        }}
        onPointerDown={startGesture}
        onPointerMove={updateGesture}
        onPointerUp={endGesture}
        onPointerCancel={cancelGesture}
        onLostPointerCapture={cancelGesture}
        style={{ touchAction: !compact || touchPan || armedBrush ? 'none' : 'pan-y' }}
        className={`w-full h-auto select-none block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-amber-300 ${armedBrush ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
        aria-label="修仙世界地图。选择修士可查看下方识海状态摘要；也可通过识海面板的修士按钮切换。雷劫用静态闪电标注；围攻地点用玫红虚线圈标注；各地渡劫、驻守、围攻和活跃盛会可在下方列表查看；本月移动、交锋和可见灵兽也有文字摘要。"
      />
        <button
          type="button"
          className={`absolute bottom-2 right-2 w-24 overflow-hidden rounded border border-slate-500 bg-slate-950/90 shadow-md sm:w-36 ${compact ? 'hidden sm:block' : ''}`}
          aria-label="小地图：点击定位"
          title="小地图：点击定位"
          onClick={(event) => {
            const point = event.detail === 0 ? centerOfMap
              : clientToMapViewport(event.currentTarget.getBoundingClientRect(), { x: event.clientX, y: event.clientY });
            if (point) manualCamera(centerCamera(cameraRef.current, point));
          }}
        >
          <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} aria-hidden="true" className="block w-full">
            {world.terrain.tiles.map((tile) => {
              const state = mapView.tileState(tile);
              const width = MAP_WIDTH / world.terrain.columns;
              const height = MAP_HEIGHT / world.terrain.rows;
              return <rect key={tile.id} x={tile.col * width} y={tile.row * height} width={width} height={height}
                fill={state === 'hidden' ? '#070c19' : BIOME_PALETTE[tile.biome].swatch}
                opacity={state === 'explored' ? 0.35 : 1} />;
            })}
            <rect x={minViewport.x + 5} y={minViewport.y + 5}
              width={maxViewport.x - minViewport.x - 10} height={maxViewport.y - minViewport.y - 10}
              fill="#ffffff" fillOpacity={0.1} stroke="#fef08a" strokeWidth={10} />
          </svg>
        </button>
      </div>
      <details className="border-t border-slate-800/80 bg-slate-900/40" onToggle={(event) => setExplorerOpen(event.currentTarget.open)}>
        <summary ref={(node) => { explorerSummary.current = node; }} className="flex min-h-11 cursor-pointer items-center px-3 text-xs font-semibold text-slate-300 focus-visible:outline focus-visible:outline-amber-300">山河索引</summary>
        {explorerOpen && <React.Suspense fallback={<p className="px-3 pb-2 text-xs text-slate-300" role="status">载入山河索引…</p>}>
          <MapKeyboardExplorer world={world} view={mapView} actorPositions={actorPositions} presentation={presentation}
            selected={selectedPoint?.actor} follows={followsSelection} zoom={camera.zoom} onCamera={activateCamera}
            onActor={(actor) => locateActor(actor.id)} onSite={focusSite}
            onFollow={() => setFollowsSelection((current) => !current)}
            onFocusLost={() => { if (explorerSummary.current?.getClientRects().length) explorerSummary.current.focus({ preventScroll: true }); }} />
        </React.Suspense>}
      </details>
      <p role="status" className="sr-only">{focusMessage}</p>
      <div className={`px-4 py-2 border-t border-slate-800/80 bg-slate-900/60 text-[11px] text-slate-400 flex-wrap gap-x-4 gap-y-1 ${compact ? 'hidden' : 'flex'}`} aria-label="选中修士记忆摘要">
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
      {(presentation.routes.size > 0 || presentation.effects.length > 0) && (
        <details className="border-t border-slate-800/80 bg-slate-900/40 px-4 py-2 text-[11px] text-slate-300">
          <summary className="cursor-pointer">本月地图动态 · 移动 {presentation.routes.size} · 事件 {presentation.effects.length}</summary>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {actorPositions.flatMap(({ actor }) => {
              const route = presentation.routes.get(actor.id);
              return route ? [<li key={actor.id}>{actor.name}飞往：{route.fromName} → {route.toName}</li>] : [];
            })}
            {presentation.effects.map((effect) => (
              <li key={effect.id}>{effect.location.name} · {MAP_EFFECT_LABELS[effect.kind]}{effect.text ? `：${effect.text}` : ''}</li>
            ))}
          </ul>
        </details>
      )}
      {hazards.length > 0 && (
        <details className="border-t border-slate-800/80 bg-slate-900/40 px-4 py-2 text-[11px] text-slate-300">
          <summary className="cursor-pointer">当前可见灾害 · {hazards.length} 处</summary>
          <ul className="mt-2 max-h-28 overflow-y-auto space-y-1">
            {hazards.map(({ hazard, tile, label }) => (
              <li key={hazard.id}>第 {tile.row + 1} 行，第 {tile.col + 1} 列 · {label} · 强度 {hazard.intensity} · 至 Tick #{hazard.expiresTick}</li>
            ))}
          </ul>
        </details>
      )}
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
            const localCouncil = currentCouncils.get(homeSect?.id ?? '');
            const localVillage = villagesAt.get(location.id);
            const localWeather = weatherAtVisibleSites.get(location.id);
            const localBeasts = beastsByLocation.get(location.id) ?? [];
            return (
              <li key={location.id} className="inline-flex items-center gap-1.5">
                <span>{location.name} · 灵脉</span>
                <SpiritRootBadge root={location.spiritRoot} />
                <span className="text-slate-400">· 灵气 {location.spiritQi}</span>
                {tile && <span className="text-slate-400">· {tile.biome} · 地格灵气 {tile.spiritQi} · {world.sects.find(({ id }) => id === tile.ownerSectId)?.name ?? '无所属宗门'}</span>}
                {fog && actorPositions.filter(({ actor }) => actor.locationId === location.id).map(({ actor }) => (
                  <button key={actor.id} type="button" onClick={() => onSelectCultivator(actor.id)} className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-200">
                    {actor.name}{actor.id === avatarId ? '（临身）' : ''}
                  </button>
                ))}
                {location.furnaceGrade > 0 && <span className="text-emerald-300">· {location.furnaceGrade} 阶丹炉</span>}
                {guardCount > 0 && <span className="text-indigo-300">· 驻守 {guardCount} 人</span>}
                {homeSect && homeSect.arrayMaxHp > 0 && (
                  <span className="text-indigo-300">· 护山阵 {homeSect.arrayHp}/{homeSect.arrayMaxHp}</span>
                )}
                {localVillage && <span className="text-lime-200">· {localVillage.name} {localVillage.population} 人</span>}
                {localWeather && <span style={{ color: WEATHER_MARK[localWeather.kind].color }}>
                  · 已观测：{localWeather.kind} {Math.round(localWeather.intensity * 100)}%
                </span>}
                {localCouncil && <span className="text-violet-300">· 本月议决：{localCouncil.title}</span>}
                {besiegedLocationIds.has(location.id) && <span className="text-rose-300">· 围攻中</span>}
                {localOccasions.map((occasion) => (
                  <span key={occasion.id} className="text-cyan-300">
                    · {OCCASION_KIND[occasion.kind]}：{occasion.title}（{OCCASION_STATUS[occasion.status]}）
                  </span>
                ))}
                {localBeasts.length > 0 && (
                  <span className="inline-flex flex-wrap gap-x-1">
                    <span>· 可见灵兽 {localBeasts.length} 只：</span>
                    {localBeasts.map((beast) => (
                      <span key={beast.id} style={{ color: BEAST_COLORS[beast.kind] }}>
                        {beast.name}（{beast.kind}{beast.tamedBy ? ' · 已结契' : ' · 野生'}）
                      </span>
                    ))}
                  </span>
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
