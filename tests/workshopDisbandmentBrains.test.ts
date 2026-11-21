import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { availableRelocationActions, resolveRelocationAction } from '../src/engine/relocationEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { advanceWorkshops, availableWorkshopActions, workshopTerms, WORKSHOP_HERB } from '../src/engine/workshopEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { Cultivator, LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';

const config: LLMConfig = { enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'test',model:'mock-workshop-closure' };
const reply = (payload: object) => new Response(JSON.stringify({ choices:[{message:{content:JSON.stringify(payload)}}] }));
const quiet: LLMDecisionPayload = { chosenAction:'REST',innerMonologue:'' };
const choices = (world: WorldState) => Object.fromEntries(world.cultivators.map(({ id }) => [id, quiet]));
const advance = (world: WorldState) => advanceWorldTick(world, choices(world), () => .99);
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld(51);
  world.tick = world.month = 8;
  const sect = world.sects[0];
  const origin = world.locations.find(({ id }) => id === sect.headquartersId)!;
  const destination = world.locations.find(({ id }) => id === 'loc-vein-north')!;
  const chief = world.cultivators.find(({ id }) => id === sect.leaderId)!;
  const maker = world.cultivators.find(({ id }) => id === 'elder-taixu-1')!;
  const patron = world.cultivators.find(({ id }) => id === 'npc-6')!;
  const stranger = world.cultivators.find(({ id }) => id === 'npc-8')!;
  const tile = terrainTileAt(world, destination.x, destination.y)!;
  delete destination.ownerSectId;
  delete tile.ownerSectId;
  chief.exploredTileIds.push(tile.id);
  sect.facilities.alchemy_hall = 1;
  sect.facilities.defense_array = 2;
  sect.arrayMaxHp = 400;
  sect.arrayHp = 0;
  origin.herbs.earth_root = Math.max(3, origin.herbs.earth_root);
  for (const actor of world.cultivators.filter((row) => row.sectId === sect.id || row === patron)) {
    actor.locationId = origin.id;
    actor.hp = actor.maxHp;
    actor.qiProgress = 20;
  }
  patron.spiritStones = 400;
  patron.herbs[WORKSHOP_HERB] = 8;
  const offer = availableWorkshopActions(patron, world).find((option) => option.workshopMove === 'offer' &&
    option.targetCultivatorId === maker.id && option.workshopTier === '法器' && option.workshopQuantity === 2 &&
    option.workshopQualityFloor === 'standard')!;
  expect(offer).toBeDefined();
  const apply = (actor: Cultivator, payload: LLMDecisionPayload) => applyCultivatorBrainDecision(world, actor, payload, () => .99);
  expect(apply(patron, { ...offer, chosenAction:'WORKSHOP',innerMonologue:'' })).not.toBeNull();
  const order = world.workshops.orders[0];
  expect(order.institution).toMatchObject({sectId:sect.id,establishedTick:0});
  const accept = { chosenAction:'WORKSHOP',workshopMove:'accept',targetWorkshopId:order.id,innerMonologue:'本人应允。' } as const;
  return { world, sect, chief, maker, patron, stranger, origin, destination, order, accept, apply };
}

describe('both brains honor original workshop scope and actual closure', () => {
  it('provides a private limited conditional note to the actual invited maker and never invents a successor action', async () => {
    const {world,maker,patron,stranger,order,accept,apply,destination} = fixture();
    const mock = vi.fn(async (_url:RequestInfo|URL,_init?:RequestInit) => reply(accept));
    vi.stubGlobal('fetch',mock);
    await expect(requestCultivatorLLMDecision(stranger,world,config,world.tick)).resolves.toBeUndefined();
    const note = '新址不自动接约';
    expect(mock.mock.calls.at(-1)?.[1]?.body).not.toContain(note);
    mock.mockImplementation(async () => reply({...accept, successorSiteId:destination.id}));
    await expect(requestCultivatorLLMDecision(maker,world,config,world.tick)).resolves.toBeUndefined();
    mock.mockImplementation(async () => reply({ ...accept, workshopMove:'transfer_obligation' }));
    await expect(requestCultivatorLLMDecision(maker,world,config,world.tick)).resolves.toBeUndefined();
    mock.mockImplementation(async () => reply(accept));
    const signed = await requestCultivatorLLMDecision(maker,world,config,world.tick);
    expect(signed).toMatchObject(accept);
    expect(mock.mock.calls.at(-1)?.[1]?.body).toContain(note);
    expect(computeHeuristicDecision(maker,world,() => .99)).toMatchObject({
      chosenAction:'WORKSHOP',workshopMove:'accept',targetWorkshopId:order.id,innerMonologue:expect.stringContaining('余资退原委托人'),
    });
    expect(apply(maker,signed!)).not.toBeNull();
    expect(order.status).toBe('active');
    expect(patron.spiritStones).toBe(400-workshopTerms('法器',2).totalStones);
  });

  it('declines stale owed work after real relocation closes the charter, refunding the original patron only once', async () => {
    const {world,chief,maker,patron,sect,origin,destination,order,apply} = fixture();
    world.tick++; world.month++;
    expect(apply(maker,computeHeuristicDecision(maker,world,() => .99))).not.toBeNull();
    const work = { chosenAction:'WORKSHOP',workshopMove:'work',targetWorkshopId:order.id,innerMonologue:'依旧单做本轮工。' } as const;
    const mock = vi.fn(async () => reply(work));
    vi.stubGlobal('fetch',mock);
    const cached = await requestCultivatorLLMDecision(maker,world,config,world.tick+1);
    expect(cached).toMatchObject(work);
    world.tick++; world.month++;
    expect(apply(maker,cached!)).not.toBeNull();
    expect(order.work).toHaveLength(1);

    const propose = availableRelocationActions(chief,world).find(({relocationMove,targetLocationId}) =>
      relocationMove==='propose'&&targetLocationId===destination.id)!;
    expect(propose).toBeDefined();
    expect(resolveRelocationAction(world,chief,{...propose,chosenAction:'RELOCATE',innerMonologue:''})).not.toBeNull();
    const plan = world.relocations.plans[0];
    for (const id of plan.voterIds.filter((id) => id!==chief.id)) {
      const voter = world.cultivators.find((actor) => actor.id===id)!;
      const vote=availableRelocationActions(voter,world).find(({relocationMove})=>relocationMove==='approve')!;
      expect(resolveRelocationAction(world,voter,{...vote,chosenAction:'RELOCATE',innerMonologue:''})).not.toBeNull();
    }
    let settled=world;
    for (let i=0;i<7&&settled.relocations.plans[0].status!=='settled';i++) settled=advance(settled);
    expect(settled.relocations.plans[0]).toMatchObject({status:'settled',originId:origin.id,destinationId:destination.id,sectId:sect.id});
    const closed=settled.workshops.orders.find(({id})=>id===order.id)!;
    const proof=settled.workshopDisbandments.closures[0];
    const liveMaker=settled.cultivators.find(({id})=>id===maker.id)!;
    const paid=settled.cultivators.find(({id})=>id===patron.id)!;
    expect(closed).toMatchObject({status:'cancelled',closeReason:'institution_closed',escrowStones:0,escrowHerbs:0});
    expect(proof.returns).toMatchObject([{orderId:order.id,patronId:patron.id,makerId:maker.id,workCount:1}]);
    expect(paid.spiritStones).toBe(400-workshopTerms('法器',2).blankFuel);
    expect(paid.herbs[WORKSHOP_HERB]).toBe(7);
    await expect(requestCultivatorLLMDecision(liveMaker,settled,config,settled.tick+1)).resolves.toBeUndefined();
    expect(computeHeuristicDecision(liveMaker,settled,() => .99).targetWorkshopId).not.toBe(order.id);
    expect(applyCultivatorBrainDecision(settled,liveMaker,cached!,()=>.99)).toBeNull();
    expect(advanceWorkshops(settled)).toEqual([]);
    expect(paid.spiritStones).toBe(400-workshopTerms('法器',2).blankFuel);
    expect(settled.cultivators).toHaveLength(world.cultivators.length);
  });
});
