import {REGIONAL_SIMULATION_VERSION,regionForPoint,SIMULATION_REGION_NAMES} from '../engine/regionalSimulationEngine';
import {projectWaterVein} from '../engine/waterVeinEngine';
import {WATER_VEIN_SITE} from '../engine/waterVeinTerms';
import {projectNorthMiningCharters} from '../engine/northMiningCharterEngine';
import {projectEraHeritage} from '../engine/eraHeritageEngine';
import {localDoctrineFoundingNotice} from '../engine/doctrineFoundingEngine';
import {localDanxiaSeasonReviewSite} from '../engine/danxiaSeasonReviewEngine';
import { VILLAGE_WORK_RULES, visibleVillageWorks } from '../engine/villageWorksEngine';
import { villageEvolutionLocalSettlement } from '../engine/villageEvolutionEngine';
import { drawUsedVillageMigrationSegments, projectUsedVillageMigrationSegments, projectVillageMapLabels, USED_MIGRATION_ROUTE_LEGEND } from './villageEvolutionMap';
import { householdCensus } from '../engine/householdEngine';
import { visibleSharedCommonsMapSites } from './sharedCommonsMapView';
import { visibleLeaseMapSites } from './leaseMapView';
import { drawFormationMapLinks, visibleFormationMapLinks } from './formationMapView';
import { projectLocalCourierHandoff } from '../engine/sealedCourierEngine';
import { projectLocalDamageAssurance } from '../engine/damageAssuranceEngine';
import { projectLocalAlignedWeather } from '../engine/alignedWeatherEngine';
import { projectLocalCareFollowupCapacity } from '../engine/careFollowupEngine';
import { visibleInfirmaries } from '../engine/infirmaryEngine';
import { visibleHabitats } from '../engine/habitatEngine';
import { visibleChronicleErrata } from '../engine/chronicleErrataEngine';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { GodBrushKind, LocationNode, MapPoint, WorldEvent, WorldState } from '../types/world';
import { memoryStrength } from '../engine/memoryEngine';
import { countCompletedSchemeSteps, countHerbs, isActiveTrial, isGuardOnDuty, SCHEME_STATUS, TRIAL_STAGE } from './mapStatusLabels';
import { DIALOGUE_KIND_LABELS } from './DialogueTranscript';
import { SPIRIT_ROOT_COLORS, SpiritRootBadge } from './SpiritRootBadge';
import { durabilityOf, equippedArtifact, maxDurabilityOf } from '../engine/artifactEngine';
import { isActiveCampaign, SIEGE_LABELS } from './siegeLabels';
import { OCCASION_KIND, OCCASION_STATUS } from './occasionLabels';
import { BOUNTY_STATUS, relevantBounty } from './bountyLabels';
import { BIOME_PALETTE, createTerrainMapView, mapActorPositions } from './terrainMapView';
import { drawMapTerritoryGlyphs, drawTerrain, EXPLORED_TERRAIN_SHADE } from './terrainMapDraw';
import { drawMapConvoys, mapTransitActorIds, visibleMapConvoys, visibleMapEscort } from './mapConvoyView';
import { buildMapPresentation, MAP_EFFECT_LABELS, MOTION_MS } from './mapPresentationView';
import { drawFlights, drawMapEffects } from './mapPresentationDraw';
import { projectMapTerritories } from './mapTerritorySemantics';
import { paintedMapMarks } from './mapPaintedSemantics';
import { centerCamera, clientToMapViewport, closestViewportTarget, DEFAULT_CAMERA, MAP_HEIGHT, MAP_WIDTH, MAX_ZOOM, screenToMap, zoomCamera } from './mapCamera';
import type { CameraPoint, MapCamera } from './mapCamera';
import { CLUSTER_RADIUS_PX, mapActorPage, pickActorMarker, planActorMarkers, visibleMarkerMembers } from './mapActorClusters';
import type { MapActorMarker, MarkerViewport } from './mapActorClusters';
import { focusMapPoint, mapCameraCommand, mapKeyboardCommand, shouldAnimateMap } from './mapKeyboard';
import type { MapCameraCommand } from './mapKeyboard';
import { beginMapGesture, cancelMapGesture, endMapGesture, IDLE_MAP_GESTURE, invalidateMapGesture, moveMapGesture } from './mapTouchGesture';
import type { MapGestureContact, MapGestureFrame, MapGestureState, MapGestureTransition } from './mapTouchGesture';
import { BRUSH_LABELS, drawHazards, getVisibleHazards } from './mapBrushView';
import { BEAST_COLORS, visibleBeastsByLocation } from './spiritBeastView';
import { activeAvatar } from '../engine/avatarEngine';
import { localQiWeather } from '../engine/weatherEngine';
import { visiblePilgrimageCampMarks, visiblePilgrimageMapCheckpoint } from './pilgrimageMapView';
import { visibleSanctuaryMapMarks } from './sanctuaryView';
import { resolveChronicleFocus } from '../engine/chronicleFocusEngine';
import { availableFurnaceSlotSummary } from '../engine/furnaceReservationEngine';
import { visibleVillageSupplyCheckpoints } from '../engine/villageSupplyEngine';
import { drawVillageSupplyCheckpoints } from './villageSupplyMapDraw';
import { visiblePublicRouteWarnings } from '../engine/routeWarningEngine';
import { projectLocalPavilionDesk } from '../engine/pavilionLoanEngine';
import { projectLocalCivicMemorialCount } from '../engine/civicMemorialEngine';
import { projectLocalVillageFair } from '../engine/villageFairEngine';
import { projectLocalSectStipendStatus } from '../engine/sectStipendEngine';
import { projectLocalToolLoanStatus } from '../engine/toolLoanEngine';
import { projectLocalSeedCulture } from '../engine/seedCultureEngine';
import { drawRouteWarningMarks,paintedRouteWarningGeometry } from './routeWarningMapDraw';
import { getCurrentBoundaryCoverage } from '../engine/boundaryReliefEngine';
import { currentVisibleTileIds, knownMapLocations, terrainTileAt } from '../engine/terrainEngine';
import { courierCheckpoint } from '../engine/sealedCourierEngine';
import { pilgrimageCheckpoint } from '../engine/pilgrimageEngine';
import { expeditionRescueCheckpoint } from '../engine/expeditionRescueCheckpoint';
import { boundaryReliefCheckpoint } from '../engine/boundaryReliefCheckpoint';
import { projectVillageGranary } from '../engine/villageGranaryEngine';
import { projectHouseholdNames } from '../engine/householdNameEngine';
import type { ChronicleFocusRequest } from '../engine/chronicleFocusEngine';

const TerrainSuccessionPanel = React.lazy(async () => ({ default: (await import('./TerrainSuccessionPanel')).TerrainSuccessionPanel }));
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
  scopeKey?: string;
  toolsOpen?: boolean;
  onToolsOpenChange?: (value: boolean) => void;
  additionalTools?: React.ReactNode;
  chronicleFocus?: { request: ChronicleFocusRequest; viewerId: string; token: number };
  onChronicleFocusUnavailable?: () => void;
}

export const WorldMapCanvas: React.FC<WorldMapCanvasProps> = ({
  world,
  selectedCultivatorId,
  onSelectCultivator,
  onSelectLocation,
  onBrushStroke,
  compact = false,
  scopeKey = '',
  toolsOpen,
  onToolsOpenChange,
  additionalTools,
  chronicleFocus,
  onChronicleFocusUnavailable,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [camera, setCamera] = useState(DEFAULT_CAMERA);
  const [annotationView, setAnnotationView] = useState<typeof import('./mapAnnotationView')>();
  const hasNotes = Boolean(world.annotations?.notes.length);
  useEffect(() => {
    if (!hasNotes || annotationView) return;
    let obsolete = false;
    void import('./mapAnnotationView').then((module) => { if (!obsolete) setAnnotationView(module); }).catch(() => undefined);
    return () => { obsolete = true; };
  }, [hasNotes, annotationView]);
  const [touchPan, setTouchPan] = useState(false);
  const [localToolsOpen, setLocalToolsOpen] = useState(!compact);
  const toolsExpanded = toolsOpen ?? localToolsOpen;
  const toolsRef = useRef<HTMLDetailsElement>(null);
  const toolsSummary = useRef<HTMLElement | null>(null);
  const [followsSelection, setFollowsSelection] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [focusMessage, setFocusMessage] = useState('');
  const focusedChronicle = useRef<number>();
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
  const gesture = useRef<MapGestureState>(IDLE_MAP_GESTURE);
  const documentGesture = useRef<(event: PointerEvent, down: boolean) => void>();
  const abandonGesture = () => {
    const interrupted = invalidateMapGesture(gesture.current);
    gesture.current = interrupted.state;
    if (interrupted.preview !== undefined) setPreview(interrupted.preview);
    if (interrupted.disarmBrush) setBrush('browse');
  };
  const disarmTools = () => {
    abandonGesture();
    setBrush('browse');
    setTouchPan(false);
  };
  const toolsInteractive = () => toolsExpanded && toolsRef.current?.open !== false;
  useEffect(() => {
    if (!toolsExpanded) {
      disarmTools();
      if (toolsRef.current?.contains(document.activeElement)) toolsSummary.current?.focus({ preventScroll: true });
    }
  }, [toolsExpanded]);
  const commandCamera = (next: MapCamera) => { abandonGesture(); manualCamera(next); };
  const [fog, setFog] = useState(false);
  const [cluster, setCluster] = useState<{ marker: Extract<MapActorMarker, { kind: 'cluster' }>; scope: string; tick: number }>();
  const [clusterSearch, setClusterSearch] = useState('');
  const [clusterPage, setClusterPage] = useState(0);
  const clusterHeadingRef = useRef<HTMLHeadingElement>(null);
  const clusterScope = `${scopeKey}|${fog ? `viewer:${selectedCultivatorId ?? ''}` : 'world'}`;
  const [heat, setHeat] = useState(false);
  const [tileDetailsOpen, setTileDetailsOpen] = useState(false);
  const selected = world.cultivators.find((c) => c.id === selectedCultivatorId);
  const ownPracticeSite = selected?.alive && selected.hp > 0 ? world.sparring.agreements.find((row) =>
    row.status === 'active' && row.siteId === selected.locationId && (row.deadlineTick ?? 0) > world.tick &&
    (row.proposerId === selected.id || row.partnerId === selected.id))?.siteId : undefined;
  const ownShift = selected?.alive && selected.hp > 0 ? world.shortShifts.shifts.find((row) => row.status === 'active' &&
    (row.shiftTick ?? 0) >= world.tick && row.siteId === selected.locationId &&
    (row.hostId === selected.id || row.workerId === selected.id)) : undefined;
  const furnaceShift = useMemo(() => selected
    ? availableFurnaceSlotSummary(world, selected, selected.locationId) : undefined, [world, selected]);
  const ownWorkshopCapacity=useMemo(()=>furnaceShift&&selected ? world.workshops.orders.find((order)=>
    order.status==='active' && order.capacityAmendment && order.siteId===selected.locationId &&
    (order.patronId===selected.id || order.makerId===selected.id)) : undefined,[world,selected,furnaceShift]);
  const localPavilionDesk=useMemo(()=>projectLocalPavilionDesk(world,selected),[world,selected]);
  const localToolLoans=useMemo(()=>world.toolLoans.loans.length ? projectLocalToolLoanStatus(world,selected) : undefined,[world,selected]);
  const localSeedCulture=useMemo(()=>world.seedCulture.plots.length ? projectLocalSeedCulture(world,selected) : undefined,[world,selected]);
  const localStipend=useMemo(()=>world.sectStipends.stipends.length ? projectLocalSectStipendStatus(world,selected) : undefined,[world,selected]);
  const localVillageFair=useMemo(()=>world.villageFairs.fairs.length ? projectLocalVillageFair(world,selected) : undefined,[world,selected]);
  const localMemorial=useMemo(()=>world.civicMemorials.memorials.length ? projectLocalCivicMemorialCount(world,selected) : undefined,[world,selected]);
  const ownCurrentFurnaceRecovery = useMemo(() => furnaceShift && selected && world.artifactSalvages.receipts.some((receipt) =>
    receipt.ownerId === selected.id && receipt.siteId === selected.locationId && receipt.tick === world.tick) ?
    selected.locationId : undefined, [world.tick,world.artifactSalvages,furnaceShift,selected]);
  const mapView = useMemo(() => createTerrainMapView(world, selected, fog), [world, selected, fog]);
  const extractionMarks = useMemo(() => [...new Map(
    [...mapView.extractionPositions.values()].map((point) => [`${point.x}:${point.y}`, point]),
  ).values()], [mapView]);
  const boundaryMarks = useMemo(() => [...new Map(
    [...mapView.boundaryPositions.values()].map((point) => [`${point.x}:${point.y}`, point]),
  ).values()], [mapView]);
  const boundaryCoverage = useMemo(() => new Map(getCurrentBoundaryCoverage(world, selected)
    .map((coverage) => [coverage.postSiteId, coverage])), [world, selected]);
  const observedCohortSites = useMemo(() => {
    const lessons = world.apprenticeCohorts.cohorts.filter((row) => row.status === 'held' && row.lessonTick === world.tick);
    if (!selected?.alive || selected.hp <= 0 || !lessons.length) return new Set<string>();
    const visible = currentVisibleTileIds(world, selected);
    return new Set(world.locations.filter((location) =>
      lessons.some(({ siteId }) => siteId === location.id) &&
      visible.has(terrainTileAt(world, location.x, location.y)?.id ?? '')).map(({ id }) => id));
  }, [world, selected]);
  const localNameRegisterSite = useMemo(() => {
    const register = selected && projectHouseholdNames(world, selected);
    return register?.entries.some(({ status }) => status !== 'visitor') ? selected?.locationId : undefined;
  }, [world, selected]);
  const localGranary = useMemo(() => {
    const granary = projectVillageGranary(world, selected);
    return granary && granary.roots > 0 && granary.stones > 0 ? granary : undefined;
  }, [world, selected]);
  const observedSalvageSites = useMemo(() => {
    if (!selected?.alive || selected.hp <= 0 || !world.caravanRestitution.lots.some(({ status }) => status === 'sealed'))
      return new Set<string>();
    const visible = currentVisibleTileIds(world, selected);
    return new Set(world.caravanRestitution.lots.filter((row) => row.status === 'sealed' && visible.has(row.tileId) &&
      world.locations.some((site) => site.id === row.siteId && terrainTileAt(world, site.x, site.y)?.id === row.tileId))
      .map(({ siteId }) => siteId));
  }, [world, selected]);
  const { seenLocations, isCurrentLocation } = mapView;
  // Turning off terrain fog does not create a civic observation.
  const civicObservation = useMemo(() => selected && villageEvolutionLocalSettlement(world, selected), [world, selected]);
  const villageMapLabels = useMemo(() => projectVillageMapLabels(world, selected), [world, selected]);
  const usedVillageSegments = useMemo(() => projectUsedVillageMigrationSegments(world, selected), [world, selected]);
  const territorySemantics = useMemo(() => projectMapTerritories(world,mapView.tileState), [world,mapView]);
  const locallyObservedWorkshopClosure = useMemo(() => {
    if (!selected?.alive || selected.hp <= 0 || !isCurrentLocation(selected.locationId) ||
      mapTransitActorIds(world).has(selected.id) || courierCheckpoint(world,selected) || pilgrimageCheckpoint(world,selected) ||
      expeditionRescueCheckpoint(world,selected) || boundaryReliefCheckpoint(world,selected)) return undefined;
    return world.workshopDisbandments.closures.filter(({ originId, tick }) =>
      originId === selected.locationId && tick <= world.tick).at(-1);
  }, [world, selected, isCurrentLocation]);
  const liveActors = useMemo(() => {
    const travellers = mapTransitActorIds(world);
    return travellers.size ? mapView.liveActors.filter(({ id }) => !travellers.has(id)) : mapView.liveActors;
  }, [world, mapView]);
  const weatherAtVisibleSites = useMemo(() => new Map(seenLocations
    .filter(({ id }) => isCurrentLocation(id))
    .map((site) => [site.id, localQiWeather(world, site)])), [world, seenLocations, isCurrentLocation]);
  const localConstruction = useMemo(() => new Map(visibleVillageWorks(world, selected)
    .filter(({ status }) => status === 'building')
    .map((project) => [project.settlementId, project])), [world, selected]);
  const scenarioSiteProofs = useMemo(() => {
    const audit = world.scenarioAudit;
    const results = new Map<string, { tick: number; passed: boolean; qi: number }>();
    if (!audit || audit.evaluatedTick > world.tick) return results;
    for (const { objective, evidence, passed } of audit.cards) if (objective.kind === 'site_qi' && evidence.kind === 'site_qi' &&
      evidence.found && isCurrentLocation(objective.locationId)) {
      results.set(objective.locationId, { tick: audit.evaluatedTick, passed, qi: evidence.qi });
    }
    return results;
  }, [world, isCurrentLocation]);
  const localLeaseSites = useMemo(() => visibleLeaseMapSites(world, mapView, selected), [world, mapView, selected]);
  const localCommons = useMemo(() => visibleSharedCommonsMapSites(world, mapView, selected), [world, mapView, selected]);
  const formationLines = useMemo(() => visibleFormationMapLinks(world, mapView, selected), [world, mapView, selected]);
  const localClinic = useMemo(() => {
    const clinic = visibleInfirmaries(world, selected);
    return clinic?.capacity && isCurrentLocation(clinic.siteId) ? { siteId: clinic.siteId, capacity: clinic.capacity } : undefined;
  }, [world, selected, isCurrentLocation]);
  const localFoundingNotice=useMemo(()=>localDoctrineFoundingNotice(world,selected),[world,selected]);
  const localSeasonReviewSite=useMemo(()=>{
    const siteId=localDanxiaSeasonReviewSite(world,selected);
    return siteId&&isCurrentLocation(siteId)?siteId:undefined;
  },[world,selected,isCurrentLocation]);
  const localCourierHandoff = useMemo(() => projectLocalCourierHandoff(world, selected), [world, selected]);
  const localDamageAssurance = useMemo(() => world.damageAssurance.claims.length ?
    projectLocalDamageAssurance(world, selected) : undefined, [world, selected]);
  const localAlignedWeather = useMemo(() => world.alignedWeather.comparisons.length ?
    projectLocalAlignedWeather(world, selected) : undefined, [world, selected]);
  const localFollowup = useMemo(() => {
    const summary = projectLocalCareFollowupCapacity(world, selected);
    return summary && isCurrentLocation(summary.siteId) ? summary : undefined;
  }, [world, selected, isCurrentLocation]);
  const localHabitat = useMemo(() => new Map(visibleHabitats(world, selected)
    .filter((row) => row.capacity !== undefined && row.restoration && row.restoration.endedTick === undefined &&
      row.restoration.expiresTick > world.tick && isCurrentLocation(row.siteId))
    .map((row) => [row.siteId, row])), [world, selected, isCurrentLocation]);
  const localErrata = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of visibleChronicleErrata(world, selected)) {
      if (entry.conflict && !entry.correction && isCurrentLocation(entry.source.locationId)) {
        counts.set(entry.source.locationId, (counts.get(entry.source.locationId) ?? 0) + 1);
      }
    }
    return counts;
  }, [world, selected, isCurrentLocation]);
  const sanctuaryMarks = useMemo(() => visibleSanctuaryMapMarks(world, mapView, selected), [world, mapView, selected]);
  const annotationPins = useMemo(() => annotationView?.mapAnnotationPins(world, mapView, selectedCultivatorId) ?? [], [annotationView, world, mapView, selectedCultivatorId]);
  const convoys = useMemo(() => visibleMapConvoys(world, mapView), [world, mapView]);
  const villageSupplyCheckpoints = useMemo(() => world.villageSupply.agreements.length === 0 ? [] :
    visibleVillageSupplyCheckpoints(world,mapView.current ??
      (selected?.alive ? currentVisibleTileIds(world,selected) : new Set<string>())), [world,mapView.current,selected]);
  const pilgrimageMark = useMemo(() => visiblePilgrimageMapCheckpoint(world, mapView, selected), [world, mapView, selected]);
  const campMarks = useMemo(() => visiblePilgrimageCampMarks(world, selected), [world, selected]);
  const escortedCaravan = useMemo(() => visibleMapEscort(world, mapView, selected), [world, mapView, selected]);
  const hazards = useMemo(() => getVisibleHazards(world, mapView), [world, mapView]);
  const beastsByLocation = useMemo(() => visibleBeastsByLocation(world, mapView), [world, mapView]);
  const armedBrush = toolsExpanded && !fog && onBrushStroke && brush !== 'browse' ? brush : undefined;
  const gestureScope = `${clusterScope}|${selectedCultivatorId ?? ''}|${world.tick}|${world.interventionSequence}|${onBrushStroke ? 'live' : 'read'}`;
  useEffect(() => { abandonGesture(); }, [gestureScope]);

  const actorPositions = useMemo(() => mapActorPositions(seenLocations, liveActors, mapView.trailPositions), [seenLocations, liveActors, mapView.trailPositions]);
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
  const routeWarningMarks=useMemo(()=>world.routeWarnings.notices.length ? paintedRouteWarningGeometry(world,
    visiblePublicRouteWarnings(world,mapView.current ??
      (selected?.alive ? currentVisibleTileIds(world,selected) : new Set<string>()))) : [],[world,mapView.current,selected]);
  const semanticMarks = useMemo(() => explorerOpen ? paintedMapMarks(world,mapView,territorySemantics.markers,hazards,convoys,
    escortedCaravan,presentation,villageSupplyCheckpoints,routeWarningMarks) : [],
  [explorerOpen,world,mapView,territorySemantics,hazards,convoys,escortedCaravan,presentation,villageSupplyCheckpoints,routeWarningMarks]);
  const paintedActors = useRef<{
    markers: ReturnType<typeof planActorMarkers>; positions: typeof actorPositions; camera: MapCamera; size: MarkerViewport; scope: string;
  }>();
  const actorById = useMemo(() => new Map(actorPositions.map(({ actor }) => [actor.id, actor])), [actorPositions]);
  const clusterActors = useMemo(() =>
    cluster && cluster.scope === clusterScope && world.tick >= cluster.tick
      ? visibleMarkerMembers(cluster.marker, actorById) : [], [cluster, clusterScope, world.tick, actorById]);
  const drillPage = mapActorPage(clusterActors, clusterSearch, clusterPage);
  useEffect(() => {
    if (cluster && !clusterActors.length) setCluster(undefined);
  }, [cluster, clusterActors.length]);
  useEffect(() => { if (cluster) clusterHeadingRef.current?.focus({ preventScroll: true }); }, [cluster]);
  const visibleActorsAtSite = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { actor } of actorPositions) {
      if (!mapView.trailPositions.has(actor.id)) counts.set(actor.locationId, (counts.get(actor.locationId) ?? 0) + 1);
    }
    return counts;
  }, [actorPositions, mapView.trailPositions]);
  const playback = useRef<{ source: WorldState['mapPresentation']; start: number } | undefined>();
  const selectedScheme = selected?.activeScheme;
  const selectedSect = selected && world.sects.find((sect) => sect.id === selected.sectId);
  const avatarId = activeAvatar(world)?.id;
  const selectedArtifact = selected?.alive ? equippedArtifact(selected) : undefined;
  const selectedLocation = selected && seenLocations.find((loc) => loc.id === selected.locationId);
  const selectedKnownRegion = useMemo(() => {
    if (world.regionalSimulation?.version !== REGIONAL_SIMULATION_VERSION || !selected?.alive || selected.hp <= 0 ||
        !selectedLocation || selectedLocation.type === 'secret_realm' || selectedLocation.type === 'abyss') return undefined;
    const tile = terrainTileAt(world, selectedLocation.x, selectedLocation.y);
    if (!tile || !knownMapLocations(world, selected).includes(selectedLocation) || !currentVisibleTileIds(world, selected).has(tile.id)) return undefined;
    return regionForPoint(world, selectedLocation);
  }, [world, selected, selectedLocation]);
  const localHeritageReading = useMemo(() => {
    if (!toolsExpanded || !world.eraHeritage || !selected || !selectedLocation) return false;
    const siteTile = terrainTileAt(world, selectedLocation.x, selectedLocation.y);
    return !!siteTile && currentVisibleTileIds(world, selected).has(siteTile.id) &&
      projectEraHeritage(world, selected).presentSiteId === selectedLocation.id;
  }, [toolsExpanded, world, selected, selectedLocation]);
  const localWaterVeinNotice = useMemo(() => {
    if (!toolsExpanded || !selected || !selectedLocation) return false;
    const observation=projectWaterVein(world,selected);
    if(observation?.scope!=='local'||!observation.symptom||observation.siteId!==selectedLocation.id)return false;
    const tile=terrainTileAt(world,selectedLocation.x,selectedLocation.y);
    return !!tile&&currentVisibleTileIds(world,selected).has(tile.id);
  }, [toolsExpanded,world,selected,selectedLocation]);
  const localMiningCharterNotice = useMemo(() => {
    if (!toolsExpanded || !selected || selectedLocation?.id!==WATER_VEIN_SITE)return false;
    const view=projectNorthMiningCharters(world,selected);
    if(view?.scope!=='local'||!view.rows.some(row=>row.status==='ratified'&&row.active))return false;
    const tile=terrainTileAt(world,selectedLocation.x,selectedLocation.y);
    return !!tile&&currentVisibleTileIds(world,selected).has(tile.id);
  }, [toolsExpanded,world,selected,selectedLocation]);
  const selectedTrial = selected?.tribulation;
  const selectedBounty = selected && relevantBounty(world.bounties, selected.id);
  const activeSieges = world.sieges.filter(isActiveCampaign);
  const occasionsByLocation = new Map<string, WorldState['occasions']>();
  for (const occasion of mapView.visibleOpenOccasions) {
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
    if (mapView.trailPositions.has(actor.id)) continue; // Never count a moving pilgrim at its saved departure site.
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
    let markerSize: MarkerViewport = canvas.getBoundingClientRect();
    let staticMarkers: ReturnType<typeof planActorMarkers> | undefined;

    const hasMotion = presentation.routes.size > 0 || presentation.effects.length > 0;
    if (playback.current?.source !== world.mapPresentation) {
      playback.current = { source: world.mapPresentation, start: performance.now() };
    }
    const motionStart = playback.current?.start ?? performance.now();
    const draw = (phase: number, elapsed: number, animate: boolean) => {
      const logicalPerCssPixel = width / (markerSize.width || width) / camera.zoom;
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
      drawTerrain(ctx, world, mapView.tileState, heat, phase, territorySemantics, logicalPerCssPixel);
      drawUsedVillageMigrationSegments(ctx, usedVillageSegments, camera.zoom);
      drawHazards(ctx, hazards);
      annotationView?.drawMapAnnotationPins(ctx, annotationPins, camera.zoom);
      drawMapConvoys(ctx, convoys, camera.zoom);
      drawVillageSupplyCheckpoints(ctx, villageSupplyCheckpoints, camera.zoom);
      drawRouteWarningMarks(ctx,routeWarningMarks,camera.zoom);
      drawFormationMapLinks(ctx, formationLines, camera.zoom);
      if (escortedCaravan) drawMapConvoys(ctx, [escortedCaravan], camera.zoom, '#7dd3fc', 'escort');
      if (pilgrimageMark) {
        const { x, y } = pilgrimageMark.point;
        ctx.save();
        ctx.fillStyle = '#0f2632';
        ctx.fillRect(x - 9, y - 32, 18, 16);
        ctx.fillStyle = '#a5f3fc';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('巡', x, y - 20);
        ctx.restore();
      }
      for (const { point: { x, y }, parties } of campMarks) {
        ctx.save();
        ctx.fillStyle = '#422318';
        ctx.strokeStyle = '#fdba74';
        ctx.lineWidth = 1.5;
        const width = parties > 1 ? 32 : 18;
        ctx.fillRect(x - width / 2, y - 51, width, 16);
        ctx.strokeRect(x - width / 2, y - 51, width, 16);
        ctx.fillStyle = '#ffedd5';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(parties > 1 ? `宿×${parties}` : '宿', x, y - 39, width - 2);
        ctx.restore();
      }
      for (const { x, y } of extractionMarks) {
        ctx.save();
        ctx.fillStyle = '#173331';
        ctx.fillRect(x - 9, y - 33, 18, 16);
        ctx.fillStyle = '#99f6e4';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('撤', x, y - 21);
        ctx.restore();
      }
      for (const { x, y } of boundaryMarks) {
        ctx.save();
        ctx.fillStyle = '#27254a';
        ctx.fillRect(x - 9, y - 33, 18, 16);
        ctx.fillStyle = '#c7d2fe';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('换', x, y - 21);
        ctx.restore();
      }

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

        if (localLeaseSites.has(loc.id)) {
          ctx.save();
          ctx.fillStyle = '#fcd34d';
          ctx.fillRect(loc.x + 17, loc.y + 12, 7, 5);
          ctx.restore();
        }

        if (localCommons.has(loc.id)) {
          ctx.save();
          ctx.fillStyle = '#5eead4';
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText('共', loc.x + 18, loc.y + 18);
          ctx.restore();
        }
        if (observedCohortSites.has(loc.id)) {
          ctx.save();
          ctx.fillStyle = '#fde68a';
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText('授', loc.x + 17, loc.y - 13);
          ctx.restore();
        }
        if (observedSalvageSites.has(loc.id)) {
          ctx.save();
          ctx.fillStyle = '#ccfbf1';
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText('封', loc.x + 17, loc.y + 8);
          ctx.restore();
        }

        // Keep the element beside the location name so it doesn't add a competing row.
        ctx.font = 'bold 13px sans-serif';
        const marker = `〈${loc.spiritRoot}〉`;
        const placeWidth = ctx.measureText(loc.name).width;
        const markerWidth = ctx.measureText(marker).width;
        const scrollCount = loc.inheritanceScrolls.length;
        const scrollMarker = scrollCount > 0 ? ` 遗卷×${scrollCount}` : '';
        const scrollWidth = ctx.measureText(scrollMarker).width;
        const closedFurnace = selected?.locationId === loc.id && isCurrentLocation(loc.id) && furnaceShift?.capacity === 0;
        const furnaceMarker = loc.furnaceGrade > 0 ? closedFurnace ? ' 闭炉' : ` 炉${loc.furnaceGrade}` : '';
        const furnaceWidth = ctx.measureText(furnaceMarker).width;
        const guardCount = guardsByLocation.get(loc.id) ?? 0;
        const guardMarker = guardCount > 0 ? ` 卫${guardCount}` : '';
        const guardWidth = ctx.measureText(guardMarker).width;
        const pavilionMarker = localPavilionDesk?.siteId===loc.id && isCurrentLocation(loc.id) &&
          (localPavilionDesk.staffed || localPavilionDesk.heldCopies>0 || localPavilionDesk.availableCopies>0) ? ' 经' : '';
        const memorialMarker=localMemorial?.siteId===loc.id && localMemorial.count>0 && isCurrentLocation(loc.id) ? ' 祠' : '';
        const fairMarker=localVillageFair?.siteId===loc.id&&isCurrentLocation(loc.id)?' 集':'';
        const stipendMarker=localStipend?.siteId===loc.id&&isCurrentLocation(loc.id)?' 俸':'';
        const seedMarker=localSeedCulture?.siteId===loc.id&&isCurrentLocation(loc.id)?(localSeedCulture.ready>0?' 收':' 苗'):'';
        const toolMarker=localToolLoans?.siteId===loc.id&&isCurrentLocation(loc.id)?(localToolLoans.awaiting>0?' 待领':' 共器'):'';
        const alignmentMarker=localAlignedWeather?.siteId===loc.id&&isCurrentLocation(loc.id)?' 校':'';
        const alignmentWidth=ctx.measureText(alignmentMarker).width;
        const toolWidth=ctx.measureText(toolMarker).width;
        const seedWidth=ctx.measureText(seedMarker).width;
        const stipendWidth=ctx.measureText(stipendMarker).width;
        const fairWidth=ctx.measureText(fairMarker).width;
        const memorialWidth=ctx.measureText(memorialMarker).width;
        const pavilionWidth=ctx.measureText(pavilionMarker).width;
        const labelStart = loc.x - (placeWidth + markerWidth + scrollWidth + furnaceWidth + guardWidth + pavilionWidth + memorialWidth + fairWidth + stipendWidth + seedWidth + toolWidth + alignmentWidth) / 2;
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
          ctx.fillStyle = closedFurnace ? '#fbbf24' : '#86efac';
          ctx.fillText(furnaceMarker, labelStart + placeWidth + markerWidth + scrollWidth, loc.y - 26);
        }
        if (guardMarker) {
          ctx.fillStyle = '#a5b4fc';
          ctx.fillText(guardMarker, labelStart + placeWidth + markerWidth + scrollWidth + furnaceWidth, loc.y - 26);
        }
        if(pavilionMarker) {
          ctx.fillStyle='#fde68a';
          ctx.fillText(pavilionMarker,labelStart+placeWidth+markerWidth+scrollWidth+furnaceWidth+guardWidth,loc.y-26);
        }
        if(memorialMarker){
          ctx.fillStyle='#f5d0a9';
          ctx.fillText(memorialMarker,labelStart+placeWidth+markerWidth+scrollWidth+furnaceWidth+guardWidth+pavilionWidth,loc.y-26);
        }
        if(fairMarker){
          ctx.fillStyle='#a7f3d0';
          ctx.fillText(fairMarker,labelStart+placeWidth+markerWidth+scrollWidth+furnaceWidth+guardWidth+pavilionWidth+memorialWidth,loc.y-26);
        }
        if(stipendMarker){
          ctx.fillStyle='#f8d7a6';
          ctx.fillText(stipendMarker,labelStart+placeWidth+markerWidth+scrollWidth+furnaceWidth+guardWidth+pavilionWidth+memorialWidth+fairWidth,loc.y-26);
        }
        if(seedMarker){
          ctx.fillStyle='#bbf7d0';
          ctx.fillText(seedMarker,labelStart+placeWidth+markerWidth+scrollWidth+furnaceWidth+guardWidth+pavilionWidth+memorialWidth+fairWidth+stipendWidth,loc.y-26);
        }
        if(toolMarker){
          ctx.fillStyle='#c4b5fd';
          ctx.fillText(toolMarker,labelStart+placeWidth+markerWidth+scrollWidth+furnaceWidth+guardWidth+pavilionWidth+memorialWidth+fairWidth+stipendWidth+seedWidth,loc.y-26);
        }
        if(alignmentMarker){
          ctx.fillStyle='#99f6e4';
          ctx.fillText(alignmentMarker,labelStart+placeWidth+markerWidth+scrollWidth+furnaceWidth+guardWidth+pavilionWidth+memorialWidth+fairWidth+stipendWidth+seedWidth+toolWidth,loc.y-26);
        }
        if (occasionsByLocation.has(loc.id)) {
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#67e8f9';
          ctx.fillText('会', loc.x + 28, loc.y - 4);
        }
        const sanctuary = sanctuaryMarks.get(loc.id);
        if (sanctuary !== undefined) {
          ctx.save();
          ctx.textAlign = 'left';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillStyle = sanctuary > 0 ? '#67e8f9' : '#94a3b8';
          ctx.fillText(sanctuary > 0 ? '敕' : '敕·竭', loc.x + 20, loc.y + 25);
          ctx.restore();
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
        if (localVillage && civicObservation?.locationId === loc.id) {
          ctx.save();
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = localVillage.stress >= 55 ? '#fdba74' : '#bef264';
          ctx.fillText(`${villageMapLabels.get(loc.id)?.stage ?? '村'} ${localVillage.population}${localGranary?.siteId === loc.id ? ' · 仓' : ''}`, loc.x, loc.y + 43);
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

      drawMapTerritoryGlyphs(ctx, territorySemantics.markers, logicalPerCssPixel);

      // 5. Draw only actors in the current field of view.
      const frameActors = drawFlights(ctx, actorPositions, presentation.routes, elapsed, animate);
      const markers = frameActors === actorPositions
        ? (staticMarkers ??= planActorMarkers(frameActors, camera, markerSize, selectedCultivatorId))
        : planActorMarkers(frameActors, camera, markerSize, selectedCultivatorId);
      paintedActors.current = { markers, positions: actorPositions, camera, size: markerSize, scope: clusterScope };
      const marked = new Set<string>();
      for (const marker of markers) {
          if (marker.kind === 'cluster') {
            // Cluster circles and labels are CSS-pixel sized and hit-tested at this exact center.
            ctx.save();
            ctx.setTransform(width / markerSize.width, 0, 0, height / markerSize.height, 0, 0);
            ctx.beginPath();
            ctx.arc(marker.x, marker.y, CLUSTER_RADIUS_PX, 0, Math.PI * 2);
            ctx.fillStyle = '#075985';
            ctx.fill();
            ctx.strokeStyle = '#bae6fd';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = '#f0f9ff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText(String(marker.ids.length), marker.x, marker.y + 0.5, 26);
            ctx.restore();
            continue;
          }
          const { actor: cultivator, x: cx, y: cy } = marker.point;
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
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      const next = canvas.getBoundingClientRect();
      if (next.width === markerSize.width && next.height === markerSize.height) return;
      markerSize = next;
      staticMarkers = undefined;
      stopOrStart();
    }) : undefined;
    resize?.observe(canvas);
    return () => {
      resize?.disconnect();
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      preference?.removeEventListener('change', stopOrStart);
      document.removeEventListener('visibilitychange', stopOrStart);
    };
  }, [world, selectedCultivatorId, mapView, actorPositions, heat, presentation, camera, territorySemantics, hazards, convoys, villageSupplyCheckpoints, routeWarningMarks, escortedCaravan, formationLines, localLeaseSites, localCommons, pilgrimageMark, campMarks, extractionMarks, boundaryMarks, observedCohortSites, observedSalvageSites, localGranary, villageMapLabels, civicObservation, usedVillageSegments, furnaceShift, localPavilionDesk, localMemorial, localVillageFair, localStipend, localSeedCulture, localToolLoans, localAlignedWeather, annotationView, annotationPins, beastsByLocation, weatherAtVisibleSites, sanctuaryMarks, armedBrush, preview, compact, clusterScope]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wheel = (event: WheelEvent) => {
      if (gesture.current.phase !== 'idle') return;
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
  const frameFor = (canvas: HTMLCanvasElement): MapGestureFrame => ({
    camera: cameraRef.current, rect: canvas.getBoundingClientRect(), scope: gestureScope,
    allowSingleTouchPan: !compact || touchPan && toolsInteractive(), brush: toolsInteractive() ? armedBrush : undefined,
  });
  const contactFor = (event: Pick<PointerEvent, 'pointerId' | 'pointerType' | 'clientX' | 'clientY'>): MapGestureContact => ({
    id: event.pointerId, pointerType: event.pointerType, client: { x: event.clientX, y: event.clientY },
  });

  const useTap = (screen: CameraPoint, isTouch: boolean, canvas: HTMLCanvasElement) => {
    const size = canvas.getBoundingClientRect();
    const radius = isTouch ? 22 : Math.max(10, cameraRef.current.zoom * 20 * size.width / MAP_WIDTH);
    const painted = paintedActors.current;
    if (!painted || painted.scope !== clusterScope || painted.positions !== actorPositions || painted.camera !== cameraRef.current ||
        painted.size.width !== size.width || painted.size.height !== size.height) return;
    const picked = pickActorMarker(painted.markers, { x: screen.x * size.width / MAP_WIDTH, y: screen.y * size.height / MAP_HEIGHT }, isTouch);
    if (picked) {
      const members = visibleMarkerMembers(picked, actorById);
      if (picked.kind === 'actor' && members[0]) {
        setCluster(undefined);
        onSelectCultivator(members[0].id);
      } else if (picked.kind === 'cluster' && members.length > 0) {
        setClusterSearch('');
        setClusterPage(0);
        setCluster({ marker: picked, scope: clusterScope, tick: world.tick });
      }
      return;
    }
    setCluster(undefined);
    const clickedLocation = closestViewportTarget(seenLocations.filter((site) => isCurrentLocation(site.id)),
      cameraRef.current, screen, size, radius);
    if (clickedLocation) focusSite(clickedLocation);
  };
  const adoptGesture = (transition: MapGestureTransition, canvas?: HTMLCanvasElement) => {
    gesture.current = transition.state;
    if (transition.preview !== undefined) setPreview(transition.preview);
    if (transition.disarmBrush) setBrush('browse');
    if (transition.camera) manualCamera(transition.camera);
    if (transition.finished?.kind === 'stroke' && toolsInteractive() && transition.finished.brush === armedBrush) {
      onBrushStroke?.(transition.finished.brush, transition.finished.points);
    } else if (transition.finished?.kind === 'tap' && canvas) {
      useTap(transition.finished.screen, transition.finished.isTouch, canvas);
    }
  };
  const startGesture = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && gesture.current.phase === 'idle') return;
    const canvas = event.currentTarget;
    const result = beginMapGesture(gesture.current, contactFor(event), frameFor(canvas));
    adoptGesture(result);
    if (result.state.phase !== 'idle') {
      try { canvas.setPointerCapture(event.pointerId); }
      catch { /* The document-level cancel path still prevents an off-map release from painting. */ }
    }
  };
  const updateGesture = (event: React.PointerEvent<HTMLCanvasElement>) =>
    adoptGesture(moveMapGesture(gesture.current, contactFor(event), frameFor(event.currentTarget)));
  const endGesture = (event: React.PointerEvent<HTMLCanvasElement>) =>
    adoptGesture(endMapGesture(gesture.current, contactFor(event), frameFor(event.currentTarget)), event.currentTarget);
  const cancelGesture = (event: React.PointerEvent<HTMLCanvasElement>) =>
    adoptGesture(cancelMapGesture(gesture.current, event.pointerId));

  documentGesture.current = (event, down) => {
    const canvas = canvasRef.current;
    if (!canvas || gesture.current.phase === 'idle' || event.composedPath().includes(canvas)) return;
    if (down) adoptGesture(beginMapGesture(gesture.current, contactFor(event), frameFor(canvas), false));
    else adoptGesture(cancelMapGesture(gesture.current, event.pointerId));
  };
  useEffect(() => {
    const down = (event: PointerEvent) => documentGesture.current?.(event, true);
    const finish = (event: PointerEvent) => documentGesture.current?.(event, false);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', finish, true);
    document.addEventListener('pointercancel', finish, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerup', finish, true);
      document.removeEventListener('pointercancel', finish, true);
    };
  }, []);
  const minViewport = screenToMap(camera, { x: 0, y: 0 });
  const maxViewport = screenToMap(camera, { x: MAP_WIDTH, y: MAP_HEIGHT });
  const focusSite = (site: LocationNode) => {
    const visible = seenLocations.find(({ id }) => id === site.id);
    if (!visible) return;
    commandCamera(focusMapPoint(cameraRef.current, visible));
    if (isCurrentLocation(visible.id)) onSelectLocation?.(visible);
    setFocusMessage(`地图已定位：${visible.name}`);
  };
  useEffect(() => {
    if (!chronicleFocus || focusedChronicle.current === chronicleFocus.token) return;
    focusedChronicle.current = chronicleFocus.token;
    const { request, viewerId } = chronicleFocus;
    const site = request.kind === 'site' && resolveChronicleFocus(world, request, viewerId).ok
      ? seenLocations.find(({ id }) => id === request.targetId) : undefined;
    if (site) focusSite(site);
    else onChronicleFocusUnavailable?.();
  }, [chronicleFocus, focusSite, onChronicleFocusUnavailable, seenLocations, world]);
  const locateActor = (id: string) => {
    const point = actorPositions.find(({ actor }) => actor.id === id);
    if (!point) return;
    onSelectCultivator(id);
    commandCamera(focusMapPoint(cameraRef.current, point));
    setFocusMessage(`地图已定位：${point.actor.name}`);
  };
  const activateCamera = (command: MapCameraCommand) => {
    if (command === 'selected' && selectedPoint) setFocusMessage(`地图已定位：${selectedPoint.actor.name}`);
    commandCamera(mapCameraCommand(cameraRef.current, command, selectedPoint));
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
        style={{ touchAction: !compact || toolsExpanded && touchPan || armedBrush ? 'none' : 'pan-y' }}
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
            if (point) commandCamera(centerCamera(cameraRef.current, point));
          }}
        >
          <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} aria-hidden="true" className="block w-full">
            {world.terrain.tiles.map((tile) => {
              const state = mapView.tileState(tile);
              const width = MAP_WIDTH / world.terrain.columns;
              const height = MAP_HEIGHT / world.terrain.rows;
              return <rect key={tile.id} x={tile.col * width} y={tile.row * height} width={width} height={height}
                fill={state === 'hidden' ? '#070c19' : state === 'explored' ? EXPLORED_TERRAIN_SHADE : BIOME_PALETTE[tile.biome].swatch}
                opacity={state === 'explored' ? 0.35 : 1} />;
            })}
            <rect x={minViewport.x + 5} y={minViewport.y + 5}
              width={maxViewport.x - minViewport.x - 10} height={maxViewport.y - minViewport.y - 10}
              fill="#ffffff" fillOpacity={0.1} stroke="#fef08a" strokeWidth={10} />
          </svg>
        </button>
      </div>
      {pilgrimageMark && <p className="sr-only">所选修士的巡礼关口：第 {pilgrimageMark.row} 行，第 {pilgrimageMark.col} 列。</p>}
      {campMarks.length > 0 && <p className="sr-only">已观测夜宿营地 {campMarks.length} 处，共 {campMarks.reduce((count, camp) => count + camp.parties, 0)} 队，不是新地点。</p>}
      {extractionMarks.length > 0 && <p className="sr-only">当前看见 {extractionMarks.length} 处实际撤离关口；不是新地点，也未公开路线。</p>}
      {boundaryMarks.length > 0 && <p className="sr-only">当前看见 {boundaryMarks.length} 处实际换防关口。尚在途中的候补不算驻守。</p>}
      {observedCohortSites.size > 0 && <p className="sr-only">当前亲见 {observedCohortSites.size} 处实际合班授课场所，不显示学徒身份。</p>}
      {observedSalvageSites.size > 0 && <p className="sr-only">当前见到 {observedSalvageSites.size} 处已发现并封存原货的地点，不显示货主身份。</p>}
      {localGranary && <p className="sr-only">在场确认：村镇义仓有实际库存。</p>}
      {compact && <p className="min-w-0 break-words border-t border-slate-800 px-3 py-2 text-xs text-slate-300" aria-label="地图当前选择">
        {selected ? <>当前选择：<span className="text-slate-100">{selected.name}</span> · {selected.alive ? `${selected.realm}${selected.realmStage}层` : '已陨落'}</> : '轻触地图选择修士。'}
        {compact && ownCurrentFurnaceRecovery && isCurrentLocation(ownCurrentFurnaceRecovery) &&
          <span className="block break-words text-emerald-300">本轮在此拆解原器，实回一份玄土根</span>}
      </p>}
      {clusterActors.length > 0 && <section className="space-y-2 border-t border-sky-900 bg-slate-900 px-3 py-2 text-xs text-slate-200"
        aria-label="聚合修士列表">
        <div className="flex items-center justify-between gap-2">
          <h3 ref={clusterHeadingRef} tabIndex={-1} className="font-semibold">此标记中的可见修士 · {clusterActors.length} 位</h3>
          <button type="button" className="min-h-11 rounded border border-slate-700 px-2" onClick={() => {
            setCluster(undefined); canvasRef.current?.focus({ preventScroll: true });
          }}>关闭列表</button>
        </div>
        <label className="grid gap-1">搜索聚合修士
          <input type="search" value={clusterSearch} placeholder="姓名、境界或编号"
            className="min-h-11 min-w-0 rounded border border-slate-700 bg-slate-950 px-2 text-base"
            onChange={(event) => { setClusterSearch(event.currentTarget.value); setClusterPage(0); }} />
        </label>
        <p role="status">匹配 {drillPage.total} 位{drillPage.total > 0 && ` · 第 ${drillPage.page + 1}/${drillPage.pages} 页`}</p>
        <ul className="grid gap-1 sm:grid-cols-2">
          {drillPage.actors.map((actor) => <li key={actor.id} className="min-w-0">
            <button type="button" className="min-h-11 w-full break-words rounded border border-slate-700 px-2 text-left"
              onClick={() => {
                if (!actorById.has(actor.id)) return;
                locateActor(actor.id); setCluster(undefined); canvasRef.current?.focus({ preventScroll: true });
              }}>{actor.name} · {actor.realm}{actor.realmStage}层</button>
          </li>)}
        </ul>
        {drillPage.pages > 1 && <div className="flex gap-2" aria-label="聚合列表分页">
          <button type="button" className="min-h-11 rounded border border-slate-700 px-2 disabled:opacity-35"
            disabled={drillPage.page === 0} onClick={() => setClusterPage(drillPage.page - 1)}>上一页</button>
          <button type="button" className="min-h-11 rounded border border-slate-700 px-2 disabled:opacity-35"
            disabled={drillPage.page + 1 === drillPage.pages} onClick={() => setClusterPage(drillPage.page + 1)}>下一页</button>
        </div>}
      </section>}
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
            {ownCurrentFurnaceRecovery && selectedLocation?.id === ownCurrentFurnaceRecovery && isCurrentLocation(ownCurrentFurnaceRecovery) &&
              <span className="text-emerald-300">本轮在此拆解原器，实回一份玄土根</span>}
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
      <details ref={toolsRef} open={toolsExpanded} className="border-t border-slate-800" aria-label="地图工具" data-control-dock="map-tools"
        onToggle={(event) => {
          if (event.target !== event.currentTarget) return;
          const next = event.currentTarget.open;
          if (!next) disarmTools();
          if (next === toolsExpanded) return;
          if (toolsOpen === undefined) setLocalToolsOpen(next);
          onToolsOpenChange?.(next);
        }}>
        <summary ref={(node) => { toolsSummary.current = node; }}
          onClick={() => { if (toolsRef.current?.open) disarmTools(); }}
          className="flex min-h-11 cursor-pointer items-center px-3 text-xs font-semibold text-slate-200 focus-visible:outline focus-visible:outline-amber-300">地图工具</summary>
      <div data-control-dock-body="map-tools">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-800 px-4 py-2 text-xs text-slate-300">
        <label className="inline-flex min-h-11 items-center gap-1.5">
          <input type="checkbox" checked={fog} disabled={!selected && !fog} onChange={(event) => setFog(event.currentTarget.checked)} />
          修士视野（迷雾）
        </label>
        <label className="inline-flex min-h-11 items-center gap-1.5">
          <input type="checkbox" checked={heat} onChange={(event) => setHeat(event.currentTarget.checked)} />
          灵气热力
        </label>
        <span className="text-[11px] text-slate-400">
          {fog ? `${selected?.name ?? '无修士'}视角 · 已探索 ${mapView.known?.size ?? 0}/${world.terrain.tiles.length} 格 · 视野内 ${mapView.current?.size ?? 0} 格` : '天道全图 · 宗门色线为领地边界'}
        </span>
        {heat && <span className="text-[11px] text-slate-400">蓝色至橙红色表示灵气由低到高。</span>}
        {localWaterVeinNotice&&<span className="text-[11px] text-sky-200">此人正在寒玉井边，可核看水势。</span>}
        {localMiningCharterNotice&&<span className="text-[11px] text-amber-200">此处仍有在行的采契。</span>}
        {toolsExpanded && selectedKnownRegion && <span className="text-[11px] text-emerald-200">
          所选已知地点所属地域：{SIMULATION_REGION_NAMES[selectedKnownRegion]}
        </span>}
        {localHeritageReading && <span className="text-[11px] text-amber-200">此处有本人可以核查的旧事凭据。</span>}

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
            className="min-h-11 min-w-11 rounded border border-slate-700 px-2 py-1 text-slate-200 disabled:opacity-35">{text}</button>
        ))}
        <span className="px-1 tabular-nums">{Math.round(camera.zoom * 100)}%</span>
        {compact && <button type="button" disabled={!toolsExpanded} aria-pressed={touchPan} onClick={() => { if (!toolsInteractive()) return; abandonGesture(); setTouchPan((enabled) => !enabled); }}
          className={`min-h-11 rounded border px-2 sm:hidden ${touchPan ? 'border-sky-400 text-sky-100' : 'border-slate-700 text-slate-200'}`}>
          {touchPan ? '拖图开启' : '拖图'}
        </button>}
        <label className="inline-flex min-h-11 items-center gap-1">
          天道画笔
          <select value={fog || !toolsExpanded ? 'browse' : brush} disabled={!toolsExpanded || fog || !onBrushStroke} onChange={(event) => {
            if (!toolsInteractive()) return;
            abandonGesture();
            setBrush(event.currentTarget.value as GodBrushKind | 'browse');
          }}
            className="min-h-11 rounded border border-slate-700 bg-slate-900 px-1.5 py-1 disabled:opacity-40">
            <option value="browse">浏览／选择</option>
            {(Object.entries(BRUSH_LABELS) as [GodBrushKind, string][]).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
          </select>
        </label>
        <span className="text-slate-400">
          {fog ? '修士视野中不可使用天道画笔。' : armedBrush ? '单指松开才落笔；双指或中断会取消此笔。' : compact ? '双指缩放；单指上下滚动，选拖图后可单指平移。' : '滚轮或双指缩放，拖动平移，点击选择。'}
        </span>
      </div>
      {additionalTools !== undefined && <div className="border-b border-slate-800 px-3 py-2">{additionalTools}</div>}
      <details className="border-t border-slate-800/80 bg-slate-900/40" onToggle={(event) => setExplorerOpen(event.currentTarget.open)}>
        <summary ref={(node) => { explorerSummary.current = node; }} className="flex min-h-11 cursor-pointer items-center px-3 text-xs font-semibold text-slate-300 focus-visible:outline focus-visible:outline-amber-300">山河索引</summary>
        {explorerOpen && <React.Suspense fallback={<p className="px-3 pb-2 text-xs text-slate-300" role="status">载入山河索引…</p>}>
          <MapKeyboardExplorer world={world} view={mapView} actorPositions={actorPositions} presentation={presentation}
            selected={selectedPoint?.actor} follows={followsSelection} zoom={camera.zoom} onCamera={activateCamera}
            onActor={(actor) => locateActor(actor.id)} onSite={focusSite} marks={semanticMarks} villageLabels={villageMapLabels}
            onPoint={(point) => {
              abandonGesture();
              commandCamera(focusMapPoint(cameraRef.current,point));
              setFocusMessage('已定位到当前可见的地图标记。');
            }}
            onFollow={() => { abandonGesture(); setFollowsSelection((current) => !current); }}
            onFocusLost={() => { if (explorerSummary.current?.getClientRects().length) explorerSummary.current.focus({ preventScroll: true }); }} />
        </React.Suspense>}
      </details>
      {toolsExpanded && <>
      {(presentation.routes.size > 0 || presentation.effects.length > 0) && (
        <details className="border-t border-slate-800/80 bg-slate-900/40 px-4 py-2 text-[11px] text-slate-300">
          <summary className="flex min-h-11 cursor-pointer items-center">本月地图动态 · 移动 {presentation.routes.size} · 事件 {presentation.effects.length}</summary>
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
      {convoys.length > 0 && <details className="border-t border-slate-800/80 bg-slate-900/40 px-3 py-2 text-xs text-slate-300">
        <summary className="flex min-h-11 cursor-pointer items-center">当前可见迁移车队 · {convoys.length} 支</summary>
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {convoys.map((convoy) => <li key={convoy.id}>
            <button type="button" className="min-h-11 rounded border border-slate-700 px-2 text-left"
              onClick={() => { commandCamera(focusMapPoint(cameraRef.current, convoy.marker)); setFocusMessage(`地图已定位：${convoy.sectName}迁移车队`); }}>
              {convoy.sectName}迁移车队 · 第 {convoy.row} 行，第 {convoy.col} 列
            </button>
          </li>)}
        </ul>
      </details>}
      {escortedCaravan && <div className="border-t border-slate-800/80 px-3 text-xs text-sky-200">
        <button type="button" className="min-h-11 text-left" onClick={() => commandCamera(focusMapPoint(cameraRef.current, escortedCaravan.marker))}>
          定位所选护镖车队 · 第 {escortedCaravan.row} 行，第 {escortedCaravan.col} 列
        </button>
      </div>}
      {annotationPins.length > 0 && <details className="border-t border-slate-800/80 px-3 text-xs text-fuchsia-200">
        <summary className="flex min-h-11 cursor-pointer items-center">可见地图批注 · {annotationPins.length} 条</summary>
        <ul className="max-h-44 space-y-1 overflow-y-auto pb-2">
          {annotationPins.map(({ note, point }) => <li key={note.id}>
            <button type="button" className="min-h-11 break-words text-left" onClick={() => commandCamera(focusMapPoint(cameraRef.current, point))}>{note.text}</button>
          </li>)}
        </ul>
      </details>}
      {hazards.length > 0 && (
        <details className="border-t border-slate-800/80 bg-slate-900/40 px-4 py-2 text-[11px] text-slate-300">
          <summary className="flex min-h-11 cursor-pointer items-center">当前可见灾害 · {hazards.length} 处</summary>
          <ul className="mt-2 max-h-28 overflow-y-auto space-y-1">
            {hazards.map(({ hazard, tile, label }) => (
              <li key={hazard.id}>第 {tile.row + 1} 行，第 {tile.col + 1} 列 · {label} · 强度 {hazard.intensity} · 至 Tick #{hazard.expiresTick}</li>
            ))}
          </ul>
        </details>
      )}
      <details className="border-t border-slate-800/80 bg-slate-900/40 px-4 py-2 text-[11px] text-slate-300">
        <summary className="flex min-h-11 cursor-pointer items-center">{fog ? '查看已发现地点与当前所见' : '查看各地点灵脉属性'}</summary>
        <div aria-label="地形图例" className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {Object.entries(BIOME_PALETTE).map(([name, { swatch }]) => (
            <span key={name} className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: swatch }} aria-hidden="true" />
              {name}
            </span>
          ))}
        </div>
        {formationLines.length > 0 && <ul className="mt-2 space-y-1 text-cyan-200" aria-label="当前可见聚灵阵链">
          {formationLines.map(({ id, status, a, b }) => <li key={id}>{a.name}与{b.name}：{status === 'broken' ? '阵链已断' : '阵链有效'}</li>)}
        </ul>}
        {usedVillageSegments.length > 0 && <p className="mt-2 text-slate-400">{USED_MIGRATION_ROUTE_LEGEND}</p>}
        {fog && seenLocations.length === 0 && <p className="mt-2">无已发现的地点。</p>}
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {seenLocations.map((location) => {
            const tile = mapView.locationTile.get(location.id);
            const villageLabel = villageMapLabels.get(location.id);
            if (!isCurrentLocation(location.id)) {
              return <li key={location.id}>{location.name}{villageLabel && villageLabel.name !== location.name ? ` · ${villageLabel.name}` : ''} · 已探索，当前不可见</li>;
            }
            const herbCount = countHerbs(location.herbs);
            const trialCount = trialsByLocation.get(location.id) ?? 0;
            const guardCount = guardsByLocation.get(location.id) ?? 0;
            const homeSect = headquarters.get(location.id);
            const localOccasions = occasionsByLocation.get(location.id) ?? [];
            const localCouncil = currentCouncils.get(homeSect?.id ?? '');
            const localVillage = civicObservation?.locationId === location.id ? civicObservation : undefined;
            const localWeather = weatherAtVisibleSites.get(location.id);
            const localBeasts = beastsByLocation.get(location.id) ?? [];
            const habitatView = localHabitat.get(location.id);
            const leaseMark = localLeaseSites.get(location.id);
            const assessed = scenarioSiteProofs.get(location.id);
            const villageRegister = localVillage ? householdCensus(world, localVillage.id) : undefined;
            const construction = localVillage ? localConstruction.get(localVillage.id) : undefined;
            const sanctuary = sanctuaryMarks.get(location.id);
            const coverage = boundaryCoverage.get(location.id);
            return (
              <li key={location.id} className="inline-flex items-center gap-1.5">
                <span>{location.name} · 灵脉</span>
                <SpiritRootBadge root={location.spiritRoot} />
                <span className="text-slate-400">· 灵气 {location.spiritQi}</span>
                {tile && <span className="text-slate-400">· {tile.biome} · 地格灵气 {tile.spiritQi} · {world.sects.find(({ id }) => id === tile.ownerSectId)?.name ?? '无所属宗门'}</span>}
                {fog && (visibleActorsAtSite.get(location.id) ?? 0) > 0 &&
                  <span className="text-slate-300">· 可见修士 {visibleActorsAtSite.get(location.id)} 位（山河索引可查）</span>}
                {location.furnaceGrade > 0 && <span className="text-emerald-300">· {location.furnaceGrade} 阶丹炉</span>}
                {location.id===ownWorkshopCapacity?.siteId && isCurrentLocation(location.id) &&
                  <span className="text-amber-200">· 本人委制只留首件，第二件已解除；首件在第 {ownWorkshopCapacity.capacityAmendment?.workUntilTick} 轮前收尾</span>}
                {location.id===localPavilionDesk?.siteId && isCurrentLocation(location.id) &&
                  <span className="text-amber-200">· 藏经阁{localPavilionDesk.staffed?'本轮有值守':'本轮未见值守'}，在架 {localPavilionDesk.availableCopies} 册、持有未归 {localPavilionDesk.heldCopies} 册</span>}
                {location.id===localToolLoans?.siteId && isCurrentLocation(location.id) &&
                  <span className="text-violet-200">· 本人相关共器：封存中 {localToolLoans.active} 件，待实地领取 {localToolLoans.awaiting} 件</span>}
                {location.id===localSeedCulture?.siteId && isCurrentLocation(location.id) &&
                  <span className="text-emerald-200">· 现场苗圃：生长期 {localSeedCulture.growing} 处，实熟待收 {localSeedCulture.ready} 处</span>}
                {location.id===localStipend?.siteId && isCurrentLocation(location.id) &&
                  <span className="text-amber-200">· 本人相关俸养，本轮实兑 {localStipend.paid} 期、未兑 {localStipend.unpaid} 期</span>}
                {location.id===localVillageFair?.siteId && isCurrentLocation(location.id) &&
                  <span className="text-emerald-200">· 今日乡集已实开，现场确认摊位 {localVillageFair.paidStalls} 席（不计人口）</span>}
                {location.id===localMemorial?.siteId && localMemorial.count>0 && isCurrentLocation(location.id) &&
                  <span className="text-amber-200">· 现场见乡祠实据 {localMemorial.count} 则</span>}
                {location.id === locallyObservedWorkshopClosure?.originId &&
                  <span className="text-amber-200">· 此处旧工坊曾撤并，旧委托未转址</span>}
                {location.id === ownPracticeSite && isCurrentLocation(location.id) &&
                  <span className="text-sky-200">· 本人已约定自愿切磋</span>}
                {location.id === ownShift?.siteId && location.ownerSectId === ownShift.hostSectId && isCurrentLocation(location.id) &&
                  <span className="text-sky-200">· 本人已约定观象短聘</span>}
                {location.id === selected?.locationId && isCurrentLocation(location.id) && furnaceShift &&
                  (furnaceShift.capacity === 0 || furnaceShift.used + furnaceShift.reserved + furnaceShift.queued > 0) && <span className="text-amber-200">
                    {furnaceShift.capacity === 0 ? '· 现场停炉，本轮无可用炉位' :
                      `· 炉位 ${furnaceShift.used + furnaceShift.reserved}/${furnaceShift.capacity} 已用或预留`}
                    {' · 候炉 '}{furnaceShift.queued} 位
                  </span>}
                {guardCount > 0 && <span className="text-indigo-300">· 驻守 {guardCount} 人</span>}
                {coverage && <span className="text-indigo-200">· Tick {coverage.tick} 现场确认：{coverage.kind === 'gap' ? '岗位空缺' :
                  coverage.kind === 'relief' ? '接替者已实到' : '有实际驻守'}</span>}
                {observedCohortSites.has(location.id) && <span className="text-amber-200">· 本回合已亲见实际合班授课</span>}
                {observedSalvageSites.has(location.id) && <span className="text-teal-200">· 已亲见货损幸存原物封存</span>}
                {homeSect && homeSect.arrayMaxHp > 0 && (
                  <span className="text-indigo-300">· 护山阵 {homeSect.arrayHp}/{homeSect.arrayMaxHp}</span>
                )}
                {(villageLabel || localVillage) && <span className="text-lime-200">
                  · {villageLabel?.name ?? localVillage?.name}{villageLabel?.stage ? ` · ${villageLabel.stage}` : ''}{localVillage ? ` · ${localVillage.population} 人` : ''}
                </span>}
                {location.id === localNameRegisterSite && isCurrentLocation(location.id) &&
                  <span className="text-lime-200">· 本地称名簿可核对实际身份</span>}
                {location.id === localGranary?.siteId && isCurrentLocation(location.id) &&
                  <span className="text-lime-200">· 在场确认义仓有库存</span>}
                {!!villageRegister?.groups.length && <span className="text-lime-200">· 家户坊籍 {villageRegister.groups.length} 组（非另计人口）</span>}
                {construction && <span className="text-lime-200">· 在建工役 {construction.laborTotal}/{VILLAGE_WORK_RULES[construction.kind].labor} 工时</span>}
                {localWeather && <span style={{ color: WEATHER_MARK[localWeather.kind].color }}>
                  · 已观测：{localWeather.kind} {Math.round(localWeather.intensity * 100)}%
                </span>}
                {sanctuary !== undefined && <span className="text-cyan-200">· 本人通行权有效 · {sanctuary > 0 ? `护阵可挡 ${sanctuary} 次决斗` : '护阵已耗尽'}</span>}
                {(localErrata.get(location.id) ?? 0) > 0 && <span className="text-amber-200">· 公开史料有待勘误 {localErrata.get(location.id)} 条</span>}
                {habitatView && <span className="text-emerald-200">· 复育栖地 {habitatView.wildOccupancy ?? 0}/{habitatView.capacity} 野兽</span>}
                {localFoundingNotice?.siteId===location.id&&isCurrentLocation(location.id)&&
                   <span className="text-teal-200">· {localFoundingNotice.established?'此地已实际另立宗门':'此地有你可核对的立宗筹议'}</span>}
                {localSeasonReviewSite===location.id&&<span className="text-teal-200">· 这里有你可核对的旧药约</span>}
                {localClinic?.siteId === location.id && <span className="text-rose-200">· 静养床 {localClinic.capacity.available}/{localClinic.capacity.beds} 本轮可受理</span>}
                {localCourierHandoff?.siteId === location.id && isCurrentLocation(location.id) &&
                  <span className="text-sky-200">· 经手的封函停在此驿，{localCourierHandoff.status === 'offered' ? '转接须另一人实地应允' : '尚未转托'}，并未送达</span>}
                {localDamageAssurance?.siteId === location.id && isCurrentLocation(location.id) &&
                  <span className="text-amber-200">· 原炉损 {localDamageAssurance.initialLoss} 点，已记实修后尚缺 {localDamageAssurance.remaining} 点，不作复炉凭据</span>}
                {localAlignedWeather?.siteId === location.id && isCurrentLocation(location.id) &&
                  <span className="text-teal-200">· 本人参与的第 {localAlignedWeather.measuredTick} 轮旧观：{localAlignedWeather.outcome === 'uncertain' ? '异读未定' : '两读相合'}，非当前天象</span>}
                {localFollowup?.siteId === location.id &&
                  <span className="text-rose-200">· 急诊优先，本轮另有 {localFollowup.available} 个复诊席位，不代表已预约或施治</span>}
                {localCommons.has(location.id) && <span className="text-teal-200">· 中立灵地共管中 · 外来者限采储备之外的余量</span>}
                {leaseMark && <span className="text-amber-200">· {leaseMark.role === 'owner' ? '本宗授权' : '本宗采集许可'} · 余 {leaseMark.remaining} 株</span>}
                {assessed && <span className="text-cyan-200">· 剧本末回合 #{assessed.tick} 凭证：灵气 {assessed.qi}（{assessed.passed ? '通过' : '未通过'}）</span>}
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
        <summary className="min-h-11 cursor-pointer py-2.5">逐格查看地形与灵气</summary>
        {tileDetailsOpen && (
          <div className="mt-2 space-y-2">
            <React.Suspense fallback={<p role="status">读取地脉与路线记录…</p>}>
              <TerrainSuccessionPanel world={world} view={mapView} selected={selected} />
            </React.Suspense>
            <ul className="grid max-h-44 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
              {world.terrain.tiles.flatMap((tile) => {
                const state = mapView.tileState(tile);
                if (state === 'hidden') return [];
                const owner = world.sects.find(({ id }) => id === tile.ownerSectId)?.name;
                return (
                  <li key={tile.id} className="rounded bg-slate-900/70 px-1.5 py-0.5">
                    第 {tile.row + 1} 行，第 {tile.col + 1} 列
                    {state === 'visible' ? ` · ${tile.biome} · 灵气 ${tile.spiritQi} · ${owner ?? '无所属宗门'}` : ' · 已探索，当前不可见'}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </details>
      </>}
      </div>
      </details>
    </div>
  );
};
