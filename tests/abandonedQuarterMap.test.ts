import {createInitialWorld} from '../src/data/initialWorld';
import {visibleAbandonedQuarterSites} from '../src/components/abandonedQuarterMap';
import {expect,it,vi} from 'vitest';

const fixtures=vi.hoisted(()=>({proof:vi.fn(),seen:vi.fn()}));
vi.mock('../src/engine/abandonedQuarterProof',()=>({projectCivilianRuin:fixtures.proof}));
vi.mock('../src/engine/terrainEngine',async load=>({...await load<typeof import('../src/engine/terrainEngine')>(),
  currentVisibleTileIds:fixtures.seen}));

it('keeps exact native ruin proof distinct from currently visible visiting cultivators and from fog settings',()=>{
  const world=createInitialWorld(1);
  const actor=world.cultivators[0];
  actor.locationId='loc-market';
  const site=world.locations.find(row=>row.id===actor.locationId)!;
  const settlement=world.settlements.villages.find(row=>row.locationId===site.id)!;
  world.villageEvolution.villages=[{settlementId:settlement.id,siteId:site.id,registeredName:settlement.name,
    status:'ruin',changes:[],samples:[]}];
  const view={seenLocations:[site],isCurrentLocation:()=>true};
  const local=world.terrain.tiles.find(tile=>tile.col===Math.floor(site.x/1000*world.terrain.columns)&&
    tile.row===Math.floor(site.y/600*world.terrain.rows))!;
  fixtures.seen.mockReturnValue(new Set([local.id]));
  fixtures.proof.mockReturnValue(undefined);
  expect([...visibleAbandonedQuarterSites(world,actor,view)]).toEqual([]);
  fixtures.proof.mockReturnValue({siteId:site.id});
  expect([...visibleAbandonedQuarterSites(world,actor,view)]).toEqual([site.id]);
  expect(actor.locationId).toBe(site.id);
  expect(actor.alive).toBe(true);
  expect([...visibleAbandonedQuarterSites(world,{...actor},view)]).toEqual([]);
  expect([...visibleAbandonedQuarterSites(world,actor,{...view,isCurrentLocation:()=>false})]).toEqual([]);
  fixtures.seen.mockReturnValue(new Set());
  expect([...visibleAbandonedQuarterSites(world,actor,view)]).toEqual([]);
});
