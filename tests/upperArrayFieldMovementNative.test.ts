import {afterEach,describe,expect,it,vi} from 'vitest';
import {AVATAR_ORDER_COST,possessUpperPassageAvatar,queueAvatarUpperArrayField} from '../src/engine/avatarEngine';
import {availableCouncilPlans} from '../src/engine/councilEngine';
import {computeHeuristicDecision,requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {projectResourceFlowMonth} from '../src/engine/resourceFlowEngine';
import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {availableUpperPassageActions,projectUpperPassage,resolveUpperPassageAction} from '../src/engine/upperPassageEngine';
import {availableUpperArrayFieldMovementActions,projectUpperArrayFieldMovement,resolveUpperArrayFieldMovementAction,
 upperArrayFieldPhysicalSite,upperArrayFieldResidence,type UpperArrayFieldMovementOption} from '../src/engine/upperArrayFieldMovementEngine';
import {UPPER_ARRAY_FIELD_EDGES,upperArrayFieldSite} from '../src/engine/upperArrayFieldTerms';
import {UPPER_PASSAGE_PATH,type UpperPassageMove} from '../src/engine/upperPassageTerms';
import {currentVisibleTileIds,knownMapLocations} from '../src/engine/terrainEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const id='elder-danxia-1';
const actor=(world:WorldState)=>world.cultivators.find(row=>row.id===id)!;
const choice=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'凭原身及实际收据而行。',...fields});
const turn=(world:WorldState,command=choice('REST'))=>advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>
  [row.id,row.id===id?command:choice('REST')])),()=>.99,'utility');
const read=(world:WorldState)=>decodeEraWorldSave(encodeEraWorldSave(world));
function oldMove(world:WorldState,upperPassageMove:UpperPassageMove){
  const option=availableUpperPassageActions(actor(world),world,world.tick+1).find(row=>row.upperPassageMove===upperPassageMove);
  expect(option).toBeDefined();
  return turn(world,choice('UPPER_PASSAGE',{upperPassageMove,targetUpperPassageNodeId:option!.targetUpperPassageNodeId}));
}
function field(world:WorldState,upperArrayFieldMove:UpperArrayFieldMovementOption['upperArrayFieldMove'],
  targetUpperArrayFieldSiteId:UpperArrayFieldMovementOption['targetUpperArrayFieldSiteId']){
  expect(availableUpperArrayFieldMovementActions(actor(world),world,world.tick+1)).toContainEqual(
    {action:'UPPER_ARRAY_FIELD',upperArrayFieldMove,targetUpperArrayFieldSiteId});
  return turn(world,choice('UPPER_ARRAY_FIELD',{upperArrayFieldMove,targetUpperArrayFieldSiteId}));
}
function counsel(){
  const north='loc-vein-north';
  let world=createInitialWorld(1,'spirit-bloom');
  const traveler=actor(world),known=knownMapLocations(world,traveler);
  const knownTarget=known.some(site=>site.id===north);
  const choices=world.locations.filter(row=>row.id!==traveler.locationId&&!known.includes(row));
  const index=choices.findIndex(row=>row.id===north);
  expect(knownTarget||index>=0).toBe(true);
  let draw=0;
  applyCultivatorBrainDecision(world,traveler,choice('EXPLORE',knownTarget?{targetLocationId:north}:{}),
    ()=>!knownTarget&&draw++===0?(index+.2)/choices.length:.99);
  expect(actor(world).locationId).toBe(north);
  const village=world.settlements.villages.find(row=>row.locationId===north)!;
  world=turn(world,choice('GATHER_HERBS',{targetHerbId:'earth_root'}));
  world=turn(world,choice('VILLAGE_WORKS',{targetSettlementId:village.id,villageWorkKind:'well'}));
  world=turn(world,choice('GATHER_HERBS',{targetHerbId:'earth_root'}));
  world=turn(world);
  expect(world.villageWorks.projects[0]).toMatchObject({status:'completed',laborTotal:4});
  world=turn(world,choice('WATER_VEIN',{waterVeinMove:'open',targetLocationId:north}));
  world=oldMove(world,'enter');
  world=oldMove(world,'advance');
  world=oldMove(world,'advance');
  world=oldMove(world,'advance');
  expect(projectUpperArrayFieldMovement(world,actor(world))).toBeUndefined();
  world=oldMove(world,'read');
  world=oldMove(world,'advance');
  expect(projectUpperArrayFieldMovement(world,actor(world))).toBeUndefined();
  return oldMove(world,'petition');
}

afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});
describe('native upper habitat from same previously paid council route',()=>{
  it('has paid admission, a physically contiguous paid home and reversible offset; preserves the old immutable route',()=>{
    let world=counsel();
    const passage=structuredClone(world.upperPassage), stones=actor(world).spiritStones, roots=actor(world).herbs.earth_root;
    expect(passage?.journeys[0].petition).toMatchObject({paidStones:10,outcome:'ordinary'});
    expect(projectUpperArrayFieldMovement(world,actor(world))).toMatchObject({scope:'council',visibleSites:[]});
    for(const [from,to] of UPPER_ARRAY_FIELD_EDGES){
      const a=upperArrayFieldSite(from)!,b=upperArrayFieldSite(to)!;
      expect(Math.abs(a.col-b.col)+Math.abs(a.row-b.row)).toBe(1);
    }
    expect(UPPER_PASSAGE_PATH).toEqual(['loc-vein-north','realm-passage-lower-step','realm-passage-upper-step','realm-upper-gate',
      'realm-upper-array','realm-upper-council']);
    expect(world.upperArrayField).toBeUndefined();
    expect(encodeEraWorldSave(read(world))).toBe(encodeEraWorldSave(world));
    world=field(world,'enter','array-field-gate');
    expect(actor(world)).toMatchObject({positionPlane:'upper',locationId:'array-field-gate',spiritStones:stones-4});
    expect(currentVisibleTileIds(world,actor(world))).toEqual(new Set());
    expect(projectUpperPassage(world,actor(world))).toBeUndefined();
    expect(world.cultivators.filter(row=>row.id===id)).toHaveLength(1);
    expect(world.locations.some(row=>row.id==='array-field-gate'||row.id==='realm-upper-council')).toBe(false);
    const illegal=choice('UPPER_ARRAY_FIELD',{upperArrayFieldMove:'travel',targetUpperArrayFieldSiteId:'array-field-home'});
    expect(resolveUpperArrayFieldMovementAction(world,actor(world),illegal)).toBeNull();
    const safe=read(world);
    expect(encodeEraWorldSave(safe)).toBe(encodeEraWorldSave(world));
    world=field(world,'travel','array-field-path');
    expect(encodeEraWorldSave(field(safe,'travel','array-field-path'))).toBe(encodeEraWorldSave(world));
    world=field(world,'travel','array-field-home');
    world=field(world,'settle','array-field-home');
    expect(upperArrayFieldResidence(world,id)).toMatchObject({homeSiteId:'array-field-home',paidStones:4,paidRoots:1});
    expect(actor(world)).toMatchObject({spiritStones:stones-8,herbs:{earth_root:roots-1}});
    expect(upperArrayFieldPhysicalSite(world,actor(world))?.id).toBe('array-field-home');
    expect(world.upperPassage).toEqual(passage);

    world=field(world,'travel','array-field-path');
    world=field(world,'travel','array-field-gate');
    world=field(world,'exit','realm-upper-council');
    expect(availableUpperPassageActions(actor(world),world)).toEqual([]);
    expect(resolveUpperPassageAction(world,actor(world),choice('UPPER_PASSAGE',{upperPassageMove:'turnback',
      targetUpperPassageNodeId:'realm-upper-array'}))).toBeNull();
    expect(world.upperPassage).toEqual(passage);
    expect(encodeEraWorldSave(read(world))).toBe(encodeEraWorldSave(world));
    world=oldMove(world,'turnback');
    expect(actor(world).locationId).toBe('realm-upper-array');
    expect(upperArrayFieldPhysicalSite(world,actor(world))).toBeUndefined();
  });
  it('rejects forged offsets and enforces native death of that one body with both receipts',()=>{
    const world=field(counsel(),'enter','array-field-gate');
    const spoof=structuredClone(world);
    actor(spoof).locationId='array-field-practice';
    expect(()=>read(spoof)).toThrow();

    const detached=structuredClone(world);
    // Negative age-boundary fixture; native month and normal mortality produce the actual event.
    actor(detached).age=actor(detached).lifespan-1;
    detached.month=12;
    const dead=turn(detached);
    expect(actor(dead).alive).toBe(false);
    expect(actor(dead).locationId).toBe('array-field-gate');
    expect(dead.upperPassage?.journeys[0].deceasedTick).toBe(dead.tick);
    expect(dead.upperArrayField?.visits[0].deceasedTick).toBe(dead.tick);
    expect(dead.events.filter(row=>row.id===`evt-upper-passage-${dead.tick}-${id}-oldage`)).toHaveLength(1);
    expect(encodeEraWorldSave(read(dead))).toBe(encodeEraWorldSave(dead));
  });
  it('lets Cognitive JSON copy the real Council entry and never invent a fee or skip a place',async()=>{
    const world=counsel(),person=actor(world);
    const exact={chosenAction:'UPPER_ARRAY_FIELD',upperArrayFieldMove:'enter',targetUpperArrayFieldSiteId:'array-field-gate'};
    let reply:object=exact;
    const fetch=vi.fn(async(_url:RequestInfo|URL,_options?:RequestInit)=>new Response(JSON.stringify({
      choices:[{message:{content:JSON.stringify(reply)}}],
    })));
    vi.stubGlobal('fetch',fetch);
    async function request(value:object){
      reply=value;llmScheduler.resetTickBudget();
      return requestCultivatorLLMDecision(person,world,{enabled:true,apiKey:'test',apiBaseUrl:'https://fixture.invalid/v1',
        model:'native-array-fixture'},world.tick+1);
    }
    expect(computeHeuristicDecision(person,world,()=>.99).chosenAction).not.toBe('UPPER_ARRAY_FIELD');
    expect(await request({...exact,paidStones:0})).toBeUndefined();
    expect(await request({...exact,targetUpperArrayFieldSiteId:'array-field-home'})).toBeUndefined();
    const decision=await request(exact);
    expect(decision).toMatchObject(exact);
    expect(String(fetch.mock.calls.at(-1)?.[1]?.body)).toContain('本人实到独立界路节点 realm-upper-council');
    const stepped=turn(world,decision);
    expect(actor(stepped)).toMatchObject({locationId:'array-field-gate',positionPlane:'upper',spiritStones:person.spiritStones-4});
    expect(stepped.upperPassage).toEqual(world.upperPassage);
    expect(projectResourceFlowMonth(stepped,stepped.tick,{kind:'observer'})?.rows.some(row=>row.mechanism==='upper_array_field')).toBe(false);
  });

  it('strictly restores one held Council order and later reacquires the same body at the field gate',()=>{
    const world=counsel();
    expect(possessUpperPassageAvatar(world,id)).toBe(true);
    const offered=availableUpperArrayFieldMovementActions(actor(world),world,world.tick+1).find(row=>row.upperArrayFieldMove==='enter')!;
    const essence=world.playerAvatar.essence,stones=actor(world).spiritStones;
    expect(queueAvatarUpperArrayField(world,id,offered)).toBe(true);
    expect(queueAvatarUpperArrayField(world,id,offered)).toBe(false);
    expect(world.playerAvatar.essence).toBe(essence-AVATAR_ORDER_COST);
    expect(actor(world).spiritStones).toBe(stones);
    expect(world.upperArrayField).toBeUndefined();
    const loaded=read(world),result=turn(loaded);
    expect(encodeEraWorldSave(loaded)).toBe(encodeEraWorldSave(world));
    expect(encodeEraWorldSave(result)).toBe(encodeEraWorldSave(turn(world)));
    expect(actor(result).locationId).toBe('array-field-gate');
    expect(actor(result).spiritStones).toBe(stones-4);
    expect(result.playerAvatar.pendingOrder).toBeUndefined();
    let remained=result;
    for(let i=0;i<16&&remained.playerAvatar.possessedId===id;i++)remained=turn(remained);
    expect(remained.playerAvatar.possessedId).not.toBe(id);
    expect(upperArrayFieldPhysicalSite(remained,actor(remained))?.id).toBe('array-field-gate');
    expect(possessUpperPassageAvatar(remained,id)).toBe(true);
    expect(actor(remained).locationId).toBe('array-field-gate');
  });
  it('cannot offer remotely held medicine to a lower council while physically in the array field',()=>{
    const world=field(counsel(),'enter','array-field-gate'),traveler=actor(world);
    const sect=world.sects.find(row=>row.id===traveler.sectId)!;
    // Detached inventory boundary: if this were treated as a lower donation the Council would have a viable sole donor.
    for(const member of world.cultivators.filter(row=>row.sectId===sect.id))member.pills.foundation=0;
    traveler.pills.foundation=1;
    expect(world.cultivators.some(row=>row.alive&&row.sectId===sect.id&&row.realm==='筑基')).toBe(true);
    expect(availableCouncilPlans(world,sect.id).some(row=>row.voterIds.includes(traveler.id)||
      row.proposal.kind==='allocate_pill'&&(row.proposal.donorId===traveler.id||row.proposal.targetCultivatorId===traveler.id))).toBe(false);
    expect(traveler.pills.foundation).toBe(1);
    expect(traveler.locationId).toBe('array-field-gate');
  });
});
