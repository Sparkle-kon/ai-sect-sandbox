import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import {
  advancePilgrimages, availablePilgrimageActions, PILGRIMAGE_CAMP_HERB, PILGRIMAGE_CAMP_RECOVERY_HP, PILGRIMAGE_LEG_COST,
  PILGRIMAGE_TILE_STRIDE, pilgrimageActedThisTick, pilgrimageCampCheckpoint, pilgrimageCheckpoint, resolvePilgrimageAction, visiblePilgrimages,
} from '../src/engine/pilgrimageEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { Cultivator, LLMDecisionPayload, PilgrimageJourney, PilgrimageMove } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(13071);
  world.tick = 10;
  world.month = 10;
  const site = world.locations.find(row=>row.id === 'loc-taixu')!;
  const [leader,partner,nextLeader,nextPartner,outsider] = world.cultivators;
  for (const actor of world.cultivators) {
    actor.locationId = [leader,partner,nextLeader,nextPartner].includes(actor) ? site.id : 'loc-market-east';
    actor.spiritStones = 100;
    actor.exploredTileIds = [];
    actor.rumors = [];
    actor.herbs[PILGRIMAGE_CAMP_HERB] = 3;
    actor.hp = actor.maxHp;
  }
  const step = () => { ++world.tick; if (world.month === 12) { world.month = 1; ++world.year; } else ++world.month; };
  const act = (actor: Cultivator, pilgrimageMove: PilgrimageMove, fields: Partial<LLMDecisionPayload> = {}) =>
    resolvePilgrimageAction(world,actor,{
      chosenAction:'PILGRIMAGE',pilgrimageMove,innerMonologue:'核对原路线和实到关口',...fields,
    });
  const chosen = (actor: Cultivator, mode: PilgrimageMove, journey: PilgrimageJourney) => act(actor,mode,{targetPilgrimageId:journey.id});
  const makeJourney = (guide = leader, second = partner) => {
    const option = availablePilgrimageActions(guide,world).find(row=>row.pilgrimageMove === 'propose' && row.targetCultivatorId === second.id)!;
    expect(option).toBeDefined();
    expect(act(guide,'propose',option)).not.toBeNull();
    const journey = world.pilgrimages.journeys.at(-1)!;
    expect(chosen(second,'accept',journey)).not.toBeNull();
    return journey;
  };
  const start = () => {
    const journey = makeJourney();
    step(); expect(chosen(leader,'advance',journey)).not.toBeNull();
    expect(journey.pathIndex).toBeGreaterThan(0);
    expect(journey.pathIndex).toBeLessThan(journey.path.length - 1);
    return journey;
  };
  return {world,site,leader,partner,nextLeader,nextPartner,outsider,step,act,chosen,makeJourney,start};
}

describe('verified overnight camps from real paid pilgrimage legs', () => {
  it('pays one real carried provision, pauses the exact checkpoint, then heals capped real injury and takes one real stride', () => {
    const { world,site,leader,partner,outsider,step,chosen,start } = fixture();
    const journey = start();
    const point = pilgrimageCheckpoint(world,leader)!;
    const before = journey.lastMovedTick;
    const path = structuredClone(journey.path);
    const index = journey.pathIndex;
    const tile = terrainTileAt(world,point.x,point.y)!;
    const locationIds = world.locations.map(row=>row.id);
    const titles = world.terrain.tiles.map(row=>row.ownerSectId);
    partner.hp = Math.floor(partner.maxHp*.5);
    const wound = partner.hp;
    leader.hp -= 2;
    const partnerBundle = partner.herbs[PILGRIMAGE_CAMP_HERB];
    expect(chosen(leader,'camp',journey)).toBeNull(); // Took the stride already.
    step();
    expect(chosen(partner,'camp',journey)).toBeNull();
    expect(chosen(outsider,'camp',journey)).toBeNull();
    expect(chosen(leader,'camp',journey)).toMatchObject({title:'在实到关口扎营',witnessScope:'participants'});
    const camp = journey.camps![0];
    expect(camp).toMatchObject({point,tileId:tile.id,legIndex:0,pathIndex:index,payerId:leader.id,openedTick:world.tick,status:'pitched'});
    expect(journey.path).toEqual(path);
    expect(journey.pathIndex).toEqual(index);
    expect(journey.lastMovedTick).toBe(before);
    expect(journey.stopsVisited).toHaveLength(1);
    expect(leader.locationId).toBe(site.id);
    expect(partner.hp).toEqual(wound);
    expect(pilgrimageCampCheckpoint(world,journey)).toEqual(point);
    expect(pilgrimageActedThisTick(world,leader)).toBe(true);
    expect(pilgrimageActedThisTick(world,partner)).toBe(true);
    expect(leader.herbs[PILGRIMAGE_CAMP_HERB]).toBe(2);
    expect(partner.herbs[PILGRIMAGE_CAMP_HERB]).toBe(partnerBundle);
    expect(world.resourceFlow.months.at(-1)?.entries).toMatchObject([{
      kind:'consumption',mechanism:'pilgrimage',reason:'pilgrimage_camp_provision',amount:1,good:PILGRIMAGE_CAMP_HERB,
      refId:journey.id,from:{kind:'actor',id:leader.id},visibility:{kind:'participants',actorIds:[leader.id]},
    }]);
    expect(chosen(leader,'advance',journey)).toBeNull();
    expect(chosen(leader,'resume',journey)).toBeNull();
    expect(chosen(partner,'dismantle',journey)).toBeNull();
    expect(availablePilgrimageActions(leader,world,false,world.tick+1).map(row=>row.pilgrimageMove)).toEqual(['resume','dismantle']);
    const view = visiblePilgrimages(world,partner)[0];
    expect(view.journey).not.toHaveProperty('path');
    expect(view.journey.camps).toEqual([camp]);
    view.journey.camps![0].point.x += 1;
    expect(pilgrimageCampCheckpoint(world,journey)).toEqual(point);
    expect(visiblePilgrimages(world,outsider)).toEqual([]);

    step(); expect(chosen(partner,'resume',journey)).toBeNull();
    expect(chosen(leader,'advance',journey)).toBeNull();
    expect(chosen(leader,'resume',journey)).not.toBeNull();
    expect(camp).toMatchObject({status:'resumed',closedTick:world.tick,recovery:[
      {actorId:leader.id,hp:2},{actorId:partner.id,hp:PILGRIMAGE_CAMP_RECOVERY_HP},
    ]});
    const next = Math.min(index+PILGRIMAGE_TILE_STRIDE,path.length-1);
    const arrived = next === path.length-1;
    expect(journey.pathIndex).toBe(arrived ? 0 : next);
    expect(journey.stopsVisited).toHaveLength(arrived ? 2 : 1);
    expect(journey.lastMovedTick).toBe(world.tick);
    expect(journey.spentByEach).toBe(PILGRIMAGE_LEG_COST);
    expect(leader.spiritStones).toBe(100-PILGRIMAGE_LEG_COST);
    expect(partner.hp).toBe(wound+PILGRIMAGE_CAMP_RECOVERY_HP);
    expect(leader.hp).toBe(leader.maxHp);
    expect(pilgrimageCampCheckpoint(world,journey)).toBeUndefined();
    expect(chosen(leader,'resume',journey)).toBeNull();
    expect(chosen(partner,'dismantle',journey)).toBeNull();
    expect(world.locations.map(row=>row.id)).toEqual(locationIds);
    expect(world.terrain.tiles.map(row=>row.ownerSectId)).toEqual(titles);
  });

  it('requires injury or a real skipped stride and rejects shortage, an unsafe tile, and a fabricated stop', () => {
    const { world,leader,partner,step,chosen,act,start } = fixture();
    const journey = start();
    const point = pilgrimageCheckpoint(world,leader)!;
    const tile = terrainTileAt(world,point.x,point.y)!;
    step();
    expect(chosen(leader,'camp',journey)).toBeNull();
    step(); // an actual lane without a canonical move
    leader.herbs[PILGRIMAGE_CAMP_HERB] = 0;
    expect(chosen(leader,'camp',journey)).toBeNull();
    expect(journey.camps).toBeUndefined();
    expect(world.resourceFlow.months).toEqual([]);
    leader.herbs[PILGRIMAGE_CAMP_HERB] = 1;
    world.mapHazards.push({id:'hazard-fixture',tileId:tile.id,kind:'beast_tide',intensity:2,createdTick:world.tick,expiresTick:world.tick+1});
    expect(chosen(leader,'camp',journey)).toBeNull();
    step();
    expect(act(leader,'camp',{targetPilgrimageId:journey.id,targetLocationId:partner.locationId})).toBeNull();
    expect(chosen(leader,'camp',journey)).not.toBeNull();
    expect(leader.herbs[PILGRIMAGE_CAMP_HERB]).toBe(0);
    step();
    expect(chosen(leader,'resume',journey)).not.toBeNull();
    expect(journey.camps?.[0].recovery).toEqual([]);
  });

  it('lets a real companion dismantle with no payment return, no fake movement and no second camp on same leg', () => {
    const { world,leader,partner,step,chosen,start } = fixture();
    const journey = start();
    const originalIndex = journey.pathIndex;
    const lastMove = journey.lastMovedTick;
    partner.hp = Math.floor(partner.maxHp*.5);
    const hp = partner.hp;
    step(); expect(chosen(leader,'camp',journey)).not.toBeNull();
    step();
    expect(chosen(partner,'dismantle',journey)).not.toBeNull();
    expect(journey.camps).toMatchObject([{status:'dismantled',closedTick:world.tick}]);
    expect(journey.camps?.[0].recovery).toBeUndefined();
    expect(journey.pathIndex).toBe(originalIndex);
    expect(journey.lastMovedTick).toBe(lastMove);
    expect(pilgrimageActedThisTick(world,leader)).toBe(true);
    expect(chosen(leader,'advance',journey)).toBeNull();
    expect(chosen(leader,'resume',journey)).toBeNull();
    expect(partner.hp).toBe(hp);
    expect(leader.herbs[PILGRIMAGE_CAMP_HERB]).toBe(2);
    step();
    expect(chosen(leader,'camp',journey)).toBeNull();
    expect(chosen(leader,'advance',journey)).not.toBeNull();
  });

  it.each(['expiry','death','pin'] as const)('closes a pitched camp once on %s without forging progress or healing', cause => {
    const { world,leader,partner,step,chosen,start } = fixture();
    const journey = start();
    const actualIndex = journey.pathIndex;
    partner.hp = Math.floor(partner.maxHp*.5);
    const hp = partner.hp;
    step(); expect(chosen(leader,'camp',journey)).not.toBeNull();
    const camp = journey.camps![0];
    step();
    if (cause === 'expiry') step();
    if (cause === 'death') { partner.alive = false; partner.hp = 0; }
    if (cause === 'pin') journey.path[actualIndex].x += .5;
    expect(chosen(leader,'resume',journey)).toBeNull();
    expect(pilgrimageCampCheckpoint(world,journey)).toBeUndefined();
    const events = advancePilgrimages(world);
    expect(events.filter(row=>row.title.includes('野营'))).toHaveLength(1);
    expect(advancePilgrimages(world)).toEqual([]);
    expect(camp.status).toBe(cause === 'expiry' ? 'expired' : 'interrupted');
    expect(camp.closedTick).toBe(world.tick);
    expect(camp.recovery).toBeUndefined();
    expect(leader.herbs[PILGRIMAGE_CAMP_HERB]).toBe(2);
    if (cause !== 'death') {
      expect(journey.pathIndex).toBe(actualIndex);
      expect(partner.hp).toBe(hp);
      expect(pilgrimageActedThisTick(world,leader)).toBe(true);
      expect(chosen(leader,'advance',journey)).toBeNull();
    }
    expect(journey.stopsVisited).toHaveLength(1);
  });

  it('keeps two parties camped independently at the same physical coordinate', () => {
    const { world,leader,partner,nextLeader,nextPartner,step,chosen,makeJourney } = fixture();
    const first = makeJourney();
    // Submit the same two lawful public stops for the second independent party.
    expect(resolvePilgrimageAction(world,nextLeader,{chosenAction:'PILGRIMAGE',pilgrimageMove:'propose',innerMonologue:'同行',
      targetCultivatorId:nextPartner.id,targetLocationId:first.stopIds[1],targetPilgrimageNextStopId:first.stopIds[2]})).not.toBeNull();
    const second = world.pilgrimages.journeys.at(-1)!;
    expect(chosen(nextPartner,'accept',second)).not.toBeNull();
    step();
    expect(chosen(leader,'advance',first)).not.toBeNull();
    expect(chosen(nextLeader,'advance',second)).not.toBeNull();
    expect(pilgrimageCheckpoint(world,leader)).toEqual(pilgrimageCheckpoint(world,nextLeader));
    partner.hp = Math.floor(partner.maxHp*.5); nextPartner.hp = Math.floor(nextPartner.maxHp*.5);
    step();
    expect(chosen(leader,'camp',first)).not.toBeNull();
    expect(chosen(nextLeader,'camp',second)).not.toBeNull();
    expect(pilgrimageCampCheckpoint(world,first)).toEqual(pilgrimageCampCheckpoint(world,second));
    expect(world.resourceFlow.months.at(-1)?.entries).toHaveLength(2);
    expect(visiblePilgrimages(world,partner).map(row=>row.journey.id)).toEqual([first.id]);
    step();
    expect(chosen(nextPartner,'dismantle',second)).not.toBeNull();
    expect(pilgrimageCampCheckpoint(world,second)).toBeUndefined();
    expect(pilgrimageCampCheckpoint(world,first)).toBeDefined();
  });
});
