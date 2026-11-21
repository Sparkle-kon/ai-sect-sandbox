import { useEffect, useId, useRef, useState } from 'react';
import type { Cultivator, LocationNode, WorldState } from '../types/world';
import { isOpenOccasion, OCCASION_KIND } from './WorldOccasionsPanel';
import { isActiveCampaign } from './SectDiplomacyPanel';
import { isActiveTrial } from './TribulationPanel';
import { MAP_EFFECT_LABELS } from './mapPresentationView';
import type { buildMapPresentation } from './mapPresentationView';
import type { createTerrainMapView, mapActorPositions } from './terrainMapView';
import type { MapCameraCommand } from './mapKeyboard';

type Terrain = ReturnType<typeof createTerrainMapView>;
type ActorPositions = ReturnType<typeof mapActorPositions>;
type Presentation = ReturnType<typeof buildMapPresentation>;
const PAGE_SIZE = 8;
const control = 'min-h-11 min-w-0 rounded border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-40';
const directions = [['left', '向左'], ['right', '向右'], ['up', '向上'], ['down', '向下'], ['in', '放大'], ['out', '缩小'], ['home', '复位']] as const;

export function mapExplorerIndex(world: WorldState, view: Terrain, actorPositions: ActorPositions, presentation: Presentation) {
  const sites = view.seenLocations.map((site) => ({ site, current: view.isCurrentLocation(site.id) }));
  const current = new Map(sites.filter((item) => item.current).map(({ site }) => [site.id, site]));
  const actors = actorPositions.flatMap(({ actor }) => current.has(actor.locationId) ? [actor] : []);
  const privateEvents = world.events.filter((event) => event.tick === world.tick && event.witnessScope === 'participants');
  const events: Array<{ id: string; label: string; site: LocationNode }> = [];
  for (const effect of presentation.effects) {
    const site = current.get(effect.location.id);
    if (site && !privateEvents.some(({ id }) => effect.id === id || effect.id.startsWith(`${id}-`))) {
      events.push({ id: `effect-${effect.id}`, label: MAP_EFFECT_LABELS[effect.kind], site });
    }
  }
  for (const occasion of world.occasions.filter(isOpenOccasion)) {
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
    const site = current.get(actor.locationId);
    if (site && isActiveTrial(actor.tribulation)) events.push({ id: `trial-${actor.id}`, label: `${actor.name}正在渡劫`, site });
  }
  return { sites, actors, events };
}

export function MapKeyboardExplorer({ world, view, actorPositions, presentation, selected, follows, zoom, onFollow, onCamera, onSite, onActor, onFocusLost }: {
  world: WorldState;
  view: Terrain;
  actorPositions: ActorPositions;
  presentation: Presentation;
  selected?: Cultivator;
  follows: boolean;
  zoom: number;
  onFollow: () => void;
  onCamera: (command: MapCameraCommand) => void;
  onSite: (site: LocationNode) => void;
  onActor: (actor: Cultivator) => void;
  onFocusLost: () => void;
}) {
  const index = mapExplorerIndex(world, view, actorPositions, presentation);
  const uid = useId();
  const [kind, setKind] = useState<'sites' | 'actors' | 'events'>('sites');
  const [page, setPage] = useState(0);
  const focusOwner = useRef<HTMLElement>();
  const rows = kind === 'sites' ? index.sites.map(({ site, current }) => ({ key: site.id, title: site.name,
    summary: current ? '当前可定位' : '已探索，当前不可见', activate: () => onSite(site) }))
    : kind === 'actors' ? index.actors.map((actor) => ({ key: actor.id, title: actor.name,
      summary: `${actor.realm} ${actor.realmStage}层`, activate: () => onActor(actor) }))
      : index.events.map(({ id, label, site }) => ({ key: id, title: label, summary: site.name, activate: () => onSite(site) }));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  useEffect(() => {
    const previous = focusOwner.current;
    if (previous && !previous.isConnected) {
      focusOwner.current = undefined;
      if (document.activeElement === document.body) onFocusLost();
    }
  });
  return (
    <section className="space-y-2 px-3 pb-3 text-slate-100" aria-label="可操作地图索引"
      onFocusCapture={(event) => { focusOwner.current = event.target; }}
      onBlurCapture={(event) => { if (event.relatedTarget) focusOwner.current = undefined; }}>
      <div className="flex flex-wrap gap-1.5" aria-label="地图移动控制">
        {directions.map(([command, label]) => <button key={command} type="button" className={control}
          disabled={command === 'in' ? zoom >= 4 : zoom <= 1} onClick={() => onCamera(command)}>{label}</button>)}
      </div>
      <div className="flex flex-wrap gap-1.5" aria-label="已选修士地图操作">
        <button type="button" className={control} disabled={!selected} onClick={() => onCamera('selected')}>定位所选修士</button>
        <button type="button" className={control} disabled={!selected} aria-pressed={follows} onClick={onFollow}>跟随所选修士</button>
      </div>
      <label htmlFor={`${uid}-directory`} className="block text-xs text-slate-300">浏览目标</label>
      <select id={`${uid}-directory`} value={kind} className={control} onChange={(event) => { setKind(event.target.value as typeof kind); setPage(0); }}>
        <option value="sites">地点</option><option value="actors">可见修士</option><option value="events">当前可见事件</option>
      </select>
      <p className="text-xs text-slate-400">{rows.length ? `${rows.length} 项 · 第 ${currentPage + 1}/${pages} 页` : '当前视野内无此类目标。'}</p>
      {visible.length > 0 && <ul className="grid min-w-0 gap-1.5 sm:grid-cols-2" aria-label="可定位目标">
        {visible.map((row) => <li key={`${kind}-${row.key}`} className="min-w-0">
          <button type="button" className={`${control} w-full break-words py-1 text-left`} onClick={row.activate}
            aria-pressed={kind === 'actors' ? row.key === selected?.id : undefined}>
            {row.title}<span className="block text-slate-400">{row.summary}</span>
          </button>
        </li>)}
      </ul>}
      {pages > 1 && <div className="flex gap-1.5" aria-label="地图索引分页">
        <button type="button" className={control} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button>
        <button type="button" className={control} disabled={currentPage + 1 === pages} onClick={() => setPage(currentPage + 1)}>下一页</button>
      </div>}
    </section>
  );
}
