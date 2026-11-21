import { useEffect, useId, useRef, useState } from 'react';
import type { Cultivator, LocationNode, MapPoint, WorldState } from '../types/world';
import { OCCASION_KIND } from './occasionLabels';
import { isActiveCampaign } from './siegeLabels';
import { isActiveTrial } from './mapStatusLabels';
import { MAP_EFFECT_LABELS } from './mapPresentationView';
import type { buildMapPresentation } from './mapPresentationView';
import type { createTerrainMapView, mapActorPositions } from './terrainMapView';
import { MAP_ACTOR_PAGE_SIZE, mapActorPage } from './mapActorClusters';
import type { MapCameraCommand } from './mapKeyboard';
import type { PaintedMapMark } from './mapPaintedSemantics';

type Terrain = ReturnType<typeof createTerrainMapView>;
type ActorPositions = ReturnType<typeof mapActorPositions>;
type Presentation = ReturnType<typeof buildMapPresentation>;
const PAGE_SIZE = MAP_ACTOR_PAGE_SIZE;
const controlBase = 'min-h-11 min-w-0 rounded border border-slate-700 bg-slate-950 px-2 text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-40';
const control = `${controlBase} text-xs`;
const field = `${controlBase} w-full max-w-full text-base sm:max-w-sm`;
const directions = [['left', '向左'], ['right', '向右'], ['up', '向上'], ['down', '向下'], ['in', '放大'], ['out', '缩小'], ['home', '复位']] as const;
const markLabel = { territory: '宗门领地', hazard: '灾害与地块', route: '路径与行程' } as const;
const standardLabel = { sites: '地点', actors: '可见修士', events: '当前可见事件' } as const;
type MarkKind = PaintedMapMark['kind'];
type ExplorerKind = keyof typeof standardLabel | MarkKind;
const noMarks: readonly PaintedMapMark[] = [];
const isMarkKind = (kind: string): kind is MarkKind => Object.hasOwn(markLabel, kind);

/** Only the supplied paint projection participates. An ambiguous or malformed mark cannot be activated. */
export function exactPaintedMarks(marks: readonly PaintedMapMark[], kind: MarkKind): PaintedMapMark[] {
  const counts = new Map<string, number>();
  for (const mark of marks) if (mark.kind === kind) counts.set(mark.id, (counts.get(mark.id) ?? 0) + 1);
  return marks.filter((mark) => mark.kind === kind && counts.get(mark.id) === 1 && mark.id && mark.title.trim() &&
    Number.isFinite(mark.point.x) && Number.isFinite(mark.point.y));
}

export function activatePaintedMark(marks: readonly PaintedMapMark[], kind: MarkKind, id: string, onPoint?: (point: MapPoint) => void): boolean {
  const mark = onPoint && exactPaintedMarks(marks, kind).find((candidate) => candidate.id === id);
  if (!mark || !onPoint) return false;
  onPoint(mark.point);
  return true;
}

export function MapPaintedTargets({ marks, kind, firstOrdinal, onActivate }: {
  marks: readonly PaintedMapMark[]; kind: MarkKind; firstOrdinal: number; onActivate: (id: string) => void;
}) {
  if (!marks.length) return null;
  return <ul className="grid min-w-0 gap-1.5 sm:grid-cols-2" aria-label={`可定位的${markLabel[kind]}`}>
    {marks.map(({ id, title, summary }, index) => <li key={id} className="min-w-0">
      <button type="button" className={`${control} w-full py-1.5 text-left [overflow-wrap:anywhere]`} onClick={() => onActivate(id)}>
        <span className="block text-slate-400">{markLabel[kind]} · 第 {firstOrdinal + index} 项</span>
        <span className="block font-medium text-slate-100">{title}</span>
        <span className="block text-slate-400">{summary}</span>
      </button>
    </li>)}
  </ul>;
}

export function mapExplorerIndex(world: WorldState, view: Terrain, actorPositions: ActorPositions, presentation: Presentation) {
  const sites = view.seenLocations.map((site) => ({ site, current: view.isCurrentLocation(site.id) }));
  const current = new Map(sites.filter((item) => item.current).map(({ site }) => [site.id, site]));
  const visibleActorIds = new Set(view.liveActors.map(({ id }) => id));
  const actors = actorPositions.flatMap(({ actor }) => visibleActorIds.has(actor.id) && actor.alive ? [actor] : []);
  const privateEvents = world.events.filter((event) => event.tick === world.tick && event.witnessScope === 'participants');
  const events: Array<{ id: string; label: string; site: LocationNode }> = [];
  for (const effect of presentation.effects) {
    const site = current.get(effect.location.id);
    if (site && !privateEvents.some(({ id }) => effect.id === id || effect.id.startsWith(`${id}-`))) {
      events.push({ id: `effect-${effect.id}`, label: MAP_EFFECT_LABELS[effect.kind], site });
    }
  }
  for (const occasion of view.visibleOpenOccasions) {
    const site = current.get(occasion.locationId);
    if (site) events.push({ id: `occasion-${occasion.id}`, label: `${OCCASION_KIND[occasion.kind]}：${occasion.title}`, site });
  }
  for (const siege of world.sieges.filter(isActiveCampaign)) {
    const site = current.get(siege.destinationId);
    if (site && siege.status === 'sieging') events.push({ id: `siege-${siege.id}`, label: '围攻中', site });
  }
  const schoolSites = new Map(world.doctrines.schools.map((school) =>
    [school.id, current.get(world.sects.find(({ id }) => id === school.parentSectId)?.headquartersId ?? '')]));
  for (const proposal of world.doctrines.proposals) {
    const site = schoolSites.get(proposal.schoolId);
    if (site && proposal.status === 'pending' && proposal.openedTick <= world.tick && world.tick < proposal.expiresTick) {
      events.push({ id: `doctrine-${proposal.id}`, label: proposal.kind === 'separation' ? '道统分立待签议' : '道统和解待签议', site });
    }
  }
  for (const record of world.doctrines.records) {
    const site = schoolSites.get(record.schoolId);
    if (!site || record.tick !== world.tick) continue;
    const label = record.kind === 'separation' ? '道统和平分立' : record.kind === 'reconciliation' ? '宗门道统和解' : undefined;
    if (label) events.push({ id: `doctrine-${record.id}`, label, site });
  }
  for (const actor of actors) {
    if (view.trailPositions.has(actor.id)) continue;
    const site = current.get(actor.locationId);
    if (site && isActiveTrial(actor.tribulation)) events.push({ id: `trial-${actor.id}`, label: `${actor.name}正在渡劫`, site });
  }
  return { sites, actors, events };
}

export function MapKeyboardExplorer({ world, view, actorPositions, presentation, selected, follows, zoom, marks = noMarks,
  onFollow, onCamera, onSite, onActor, onPoint, onFocusLost }: {
  world: WorldState;
  view: Terrain;
  actorPositions: ActorPositions;
  presentation: Presentation;
  selected?: Cultivator;
  follows: boolean;
  zoom: number;
  marks?: readonly PaintedMapMark[];
  onFollow: () => void;
  onCamera: (command: MapCameraCommand) => void;
  onSite: (site: LocationNode) => void;
  onActor: (actor: Cultivator) => void;
  onPoint?: (point: MapPoint) => void;
  onFocusLost: () => void;
}) {
  const index = mapExplorerIndex(world, view, actorPositions, presentation);
  const uid = useId();
  const [kind, setKind] = useState<ExplorerKind>('sites');
  const [page, setPage] = useState(0);
  const [actorSearch, setActorSearch] = useState('');
  const actorPage = mapActorPage(kind === 'actors' ? index.actors : [], actorSearch, page);
  const focusOwner = useRef<HTMLElement>();
  const currentMarks = useRef({ marks, kind, onPoint });
  currentMarks.current = { marks, kind, onPoint };
  const layer = isMarkKind(kind) ? kind : undefined;
  const layerRows = layer && onPoint ? exactPaintedMarks(marks, layer) : [];
  const rows = kind === 'sites' ? index.sites.map(({ site, current }) => ({ key: site.id, title: site.name,
    summary: current ? '当前可定位' : '已探索，当前不可见', activate: () => onSite(site) }))
    : kind === 'actors' ? actorPage.actors.map((actor) => ({ key: actor.id, title: actor.name,
      summary: `${actor.realm} ${actor.realmStage}层`, activate: () => onActor(actor) }))
      : kind === 'events' ? index.events.map(({ id, label, site }) => ({ key: id, title: label, summary: site.name, activate: () => onSite(site) })) : [];
  const count = kind === 'actors' ? actorPage.total : layer ? layerRows.length : rows.length;
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = kind === 'actors' ? rows : rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  useEffect(() => {
    const previous = focusOwner.current;
    if (previous && !previous.isConnected) {
      focusOwner.current = undefined;
      if (!document.activeElement || document.activeElement === document.body) onFocusLost();
    }
  });
  return (
    <section className="space-y-2 px-3 pb-3 text-slate-100" aria-label="可操作地图索引"
      onFocusCapture={(event) => { focusOwner.current = event.target; }}
      onBlurCapture={(event) => { if (event.relatedTarget && event.relatedTarget !== event.currentTarget.ownerDocument.body) focusOwner.current = undefined; }}>
      <div className="flex flex-wrap gap-1.5" aria-label="地图移动控制">
        {directions.map(([command, label]) => <button key={command} type="button" className={control}
          disabled={command === 'in' ? zoom >= 4 : zoom <= 1} onClick={() => onCamera(command)}>{label}</button>)}
      </div>
      <div className="flex flex-wrap gap-1.5" aria-label="已选修士地图操作">
        <button type="button" className={control} disabled={!selected} onClick={() => onCamera('selected')}>定位所选修士</button>
        <button type="button" className={control} disabled={!selected} aria-pressed={follows} onClick={onFollow}>跟随所选修士</button>
      </div>
      <label htmlFor={`${uid}-directory`} className="block text-xs text-slate-300">浏览目标</label>
      <select id={`${uid}-directory`} value={kind} className={field} onChange={(event) => {
        const next = event.currentTarget.value;
        if (Object.hasOwn(standardLabel, next) || (onPoint && isMarkKind(next))) { setKind(next as ExplorerKind); setPage(0); }
      }}>
        {Object.entries(standardLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        {onPoint && <optgroup label="实绘图层">{Object.entries(markLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</optgroup>}
      </select>
      {kind === 'actors' && <label className="grid gap-1 text-xs text-slate-300">搜索可见修士
        <input type="search" className={field} value={actorSearch} placeholder="姓名、境界或编号"
          onChange={(event) => { setActorSearch(event.currentTarget.value); setPage(0); }} />
      </label>}
      <p className="text-xs text-slate-400" role="status">{count ? `${count} 项 · 第 ${currentPage + 1}/${pages} 页` : '当前视野内无此类目标。'}</p>
      {layer && <MapPaintedTargets key={layer} kind={layer} firstOrdinal={currentPage * PAGE_SIZE + 1}
        marks={layerRows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)} onActivate={(id) => {
          const latest = currentMarks.current;
          if (latest.kind === layer) activatePaintedMark(latest.marks, layer, id, latest.onPoint);
        }} />}
      {visible.length > 0 && <ul className="grid min-w-0 gap-1.5 sm:grid-cols-2" aria-label="可定位目标">
        {visible.map((row) => <li key={`${kind}-${row.key}`} className="min-w-0">
          <button type="button" className={`${control} w-full break-words py-1 text-left`} onClick={row.activate}
            aria-pressed={kind === 'actors' ? row.key === selected?.id : undefined}>
            {row.title}<span className="block text-slate-400">{row.summary}</span>
          </button>
        </li>)}
      </ul>}
      {pages > 1 && <div className="flex flex-wrap gap-1.5" aria-label="地图索引分页">
        <button type="button" className={control} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button>
        <button type="button" className={control} disabled={currentPage + 1 === pages} onClick={() => setPage(currentPage + 1)}>下一页</button>
      </div>}
    </section>
  );
}
