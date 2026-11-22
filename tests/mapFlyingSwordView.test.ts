import { describe, expect, it } from 'vitest';
import { visibleMapFlyingSwords } from '../src/components/mapFlyingSwordView';
import { createTerrainMapView } from '../src/components/terrainMapView';
import { createInitialWorld } from '../src/data/initialWorld';
import { spreadRumors, witnessEvent } from '../src/engine/rumorEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { Cultivator, EscortContract, MapPoint } from '../src/types/world';

function fixture(from: MapPoint = { x: 70, y: 185 }, to: MapPoint = { x: 143, y: 185 }) {
  const world = createInitialWorld();
  const [originator, sender, recipient, bystander] = world.cultivators;
  const [fromSite, toSite, elsewhere] = world.locations;
  Object.assign(fromSite, from);
  Object.assign(toSite, to);
  world.cultivators = [originator, sender, recipient, bystander];
  originator.locationId = sender.locationId = fromSite.id;
  recipient.locationId = toSite.id;
  bystander.locationId = elsewhere.id;
  sender.sectId = recipient.sectId = bystander.sectId = 'sect-qingyun';
  originator.sectId = 'sect-bloodmoon';
  const [emptySite] = world.locations.filter((site) => site !== fromSite && site !== toSite && site !== elsewhere);
  witnessEvent(world, {
    id: 'evt-sword-origin-marker', title: '书信秘密测试正文', description: '仅证收信，不证内容',
    tick: world.tick, year: world.year, month: world.month, locationId: emptySite.id, actorIds: [originator.id],
    category: 'heavenly',
  });
  world.tick = 2;
  spreadRumors(world);
  expect(sender.rumors[0]).toMatchObject({ provenance: 'conversation', sourceCultivatorId: originator.id });
  world.tick = 3;
  spreadRumors(world);
  expect(recipient.rumors[0]).toMatchObject({
    learnedTick: 3, provenance: 'flying_sword', sourceCultivatorId: sender.id, originSourceCultivatorId: originator.id,
  });
  // The same-sect observer may have its own receipt; a viewer's ledger alone must control this cue.
  bystander.rumors = [];
  const projection = (viewer: Cultivator | undefined = recipient, fog = false) =>
    visibleMapFlyingSwords(world, createTerrainMapView(world, viewer, fog), viewer);
  return { world, fromSite, toSite, originator, sender, recipient, bystander, projection };
}

describe('current received flying-sword map cue', () => {
  it('projects native current receipt from its immediate relay and returns only anonymous schematic geometry', () => {
    const { world, fromSite, toSite, originator, sender, recipient, bystander, projection } = fixture();
    // The original source is no longer nearby; the actual immediate sender stayed at the current public site.
    originator.locationId = bystander.locationId;
    const initial = structuredClone(world);
    const [sword] = projection(recipient, true);
    expect(sword.id).toBe('flying-sword-3');
    expect(sword.points[0]).toEqual({ x: fromSite.x, y: fromSite.y });
    expect(sword.points.at(-1)).toEqual({ x: toSite.x, y: toSite.y });
    expect(sword.points.some(({ y }) => y < fromSite.y)).toBe(true);
    expect(Object.keys(sword).sort()).toEqual(['id', 'points']);
    expect(JSON.stringify(sword)).not.toMatch(/evt-|书信|confidence|Cultivator|[Rr]umor/);
    expect(projection(sender)).toEqual([]);
    expect(projection(bystander)).toEqual([]);
    expect(projection({ ...recipient })).toEqual([]);
    expect(visibleMapFlyingSwords(world, createTerrainMapView(world, undefined, false))).toEqual([]);
    expect(world).toEqual(initial);
  });

  it('requires both current actual sites, a living lower same-sect sender, and strictly current provenance', () => {
    const { world, fromSite, toSite, recipient, sender, projection } = fixture();
    const receipt = recipient.rumors[0];
    world.tick = 6;
    expect(projection()).toEqual([]);
    world.tick = 3;
    receipt.witnessScope = 'participants';
    expect(projection()).toEqual([]);
    delete receipt.witnessScope;
    recipient.rumors.push({ ...receipt, id: 'conflicting-receipt' });
    expect(projection()).toEqual([]);
    recipient.rumors.pop();
    sender.alive = false;
    expect(projection()).toEqual([]);
    sender.alive = true;
    sender.positionPlane = 'upper';
    expect(projection()).toEqual([]);
    delete sender.positionPlane;
    sender.sectId = 'sect-bloodmoon';
    expect(projection()).toEqual([]);
    sender.sectId = recipient.sectId;
    sender.locationId = recipient.locationId;
    expect(projection()).toEqual([]);
    sender.locationId = fromSite.id;
    toSite.x = 875;
    recipient.exploredTileIds = [terrainTileAt(world, fromSite.x, fromSite.y)!.id];
    expect(projection(recipient, true)).toEqual([]); // Remembered tiles are not current.
    expect(projection()).toHaveLength(1);
    world.locations = world.locations.filter((site) => site !== fromSite);
    expect(projection()).toEqual([]);
  });

  it('suppresses authorized-but-scoped gates and both endpoints of an active native transit', () => {
    const { world, fromSite, toSite, sender, recipient, projection } = fixture();
    const oldType = fromSite.type;
    fromSite.type = 'secret_realm';
    fromSite.expeditionOmenId = 'not-a-public-site';
    // Simulate an otherwise authorized scoped gate already included in the view's data.
    const terrain = createTerrainMapView(world, recipient, false);
    expect(visibleMapFlyingSwords(world, {
      ...terrain, seenLocations: world.locations, liveActors: world.cultivators, isCurrentLocation: () => true,
    }, recipient)).toEqual([]);
    delete fromSite.expeditionOmenId;
    fromSite.type = oldType;
    const contract: EscortContract = {
      id: 'current-escort', shipmentId: 'cargo', clientId: recipient.id, escortId: sender.id,
      originId: fromSite.id, destinationId: toSite.id, status: 'active', offeredTick: 1, expiresTick: 4, acceptedTick: 2,
      feeEscrow: 1, feePaid: 0, feeRefunded: 0, rationsEscrow: 1, rationsSpent: 0, rationsReturned: 0,
      path: [{ x: fromSite.x, y: fromSite.y }, { x: 102, y: 186 }, { x: toSite.x, y: toSite.y }], pathIndex: 1, stride: 1,
      lastCrossedTileIds: [], usedReportIds: [], detours: [],
    };
    world.escorts.contracts.push(contract);
    expect(projection()).toEqual([]);
    contract.escortId = recipient.id;
    expect(projection()).toEqual([]);
    contract.status = 'delivered';
    expect(projection()).toHaveLength(1);
  });

  it('proves every crossed tile, suppressing even corner-only passages or using a fully visible straight fallback', () => {
    const { world, recipient, projection } = fixture({ x: 39, y: 39 }, { x: 240, y: 241 });
    const [sword] = projection();
    expect(sword.points.length).toBeGreaterThan(2);
    const terrain = createTerrainMapView(world, recipient, false);
    const bowCorner = terrainTileAt(world, 41, 39)!.id; // Bow briefly crosses above the grid corner.
    const straightCorner = terrainTileAt(world, 39.999, 40.003)!.id; // Straight line crosses below it for < .01 units.
    const viewWithout = (...ids: string[]) => ({
      ...terrain, current: new Set(world.terrain.tiles.map(({ id }) => id).filter((id) => !ids.includes(id))),
    });
    expect(sword.points.every(({ x, y }) => terrainTileAt(world, x, y)!.id !== bowCorner)).toBe(true);
    expect(visibleMapFlyingSwords(world, viewWithout(bowCorner), recipient)[0].points).toEqual([{ x: 39, y: 39 }, { x: 240, y: 241 }]);
    expect(visibleMapFlyingSwords(world, viewWithout(bowCorner, straightCorner), recipient)).toEqual([]);
  });
});
