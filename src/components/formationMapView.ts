import { formationLinkAvailability, visibleFormationLinks } from '../engine/formationNetworkEngine';
import type { Cultivator, MapPoint, WorldState } from '../types/world';
import type { createTerrainMapView } from './terrainMapView';
import { visibleCheckpointRoute } from './mapConvoyView';

interface Endpoint extends MapPoint { name: string }
interface FormationMapLink {
  id: string;
  status: 'active' | 'broken';
  a: Endpoint;
  b: Endpoint;
}

/** Separate from site dots: neither an unseen endpoint nor a fogged intervening tile is exposed. */
export function visibleFormationMapLinks(
  world: WorldState,
  view: ReturnType<typeof createTerrainMapView>,
  selected?: Cultivator,
): FormationMapLink[] {
  const actor = selected && world.cultivators.find(({ id }) => id === selected.id);
  if (!actor?.alive || actor.hp <= 0) return [];
  const sites = new Map(view.seenLocations.map((site) => [site.id, site]));
  return visibleFormationLinks(world, actor).flatMap((link) => {
    const { id, status } = link;
    if ((status !== 'active' && status !== 'broken') || link.fundedTick === undefined || link.fundedTick > world.tick
      || formationLinkAvailability(world, link) !== 'ready') return [];
    if (actor.sectId !== link.sectAId && actor.sectId !== link.sectBId) return [];
    const a = sites.get(link.siteAId);
    const b = sites.get(link.siteBId);
    if (!a || !b || !view.isCurrentLocation(a.id) || !view.isCurrentLocation(b.id)) return [];
    const route = visibleCheckpointRoute(world, view, [a, b], 0)?.route;
    const end = route?.at(-1);
    if (!end || end.x !== b.x || end.y !== b.y || (a.x === b.x && a.y === b.y)) return [];
    return [{ id, status, a: { x: a.x, y: a.y, name: a.name }, b: { x: b.x, y: b.y, name: b.name } }];
  });
}

export function drawFormationMapLinks(ctx: CanvasRenderingContext2D, links: ReturnType<typeof visibleFormationMapLinks>, zoom: number) {
  if (!links.length) return;
  ctx.save();
  ctx.lineWidth = 2 / zoom;
  for (const { a, b, status } of links) {
    ctx.beginPath();
    ctx.strokeStyle = status === 'active' ? '#5eead4' : '#fda4af';
    ctx.moveTo(a.x, a.y);
    if (status === 'broken') {
      ctx.setLineDash([5 / zoom, 4 / zoom]);
      const dx = b.x - a.x, dy = b.y - a.y;
      ctx.lineTo(a.x + dx * .44, a.y + dy * .44);
      ctx.moveTo(a.x + dx * .56, a.y + dy * .56);
    } else {
      ctx.setLineDash([]);
    }
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}
