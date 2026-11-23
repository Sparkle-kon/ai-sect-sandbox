import { afterEach, describe, expect, it, vi } from 'vitest';
import { projectMapActorsAtCheckpoints } from '../src/components/mapActorCheckpointProjection';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableBellWatchActions, bellWatchCheckpoint, bellWatchDamage, projectBellWatch, projectBellWatchSideNote } from '../src/engine/bellWatch';
import { bellWatchCommand } from '../src/engine/cognition/bellWatchDecision';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { deriveMapPresentation } from '../src/engine/mapMotionEngine';
import { buildConfirmedShareSave, prepareShareSavePrivacy } from '../src/engine/shareSavePrivacy';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { currentVisibleTileIds, terrainTileAt } from '../src/engine/terrainEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { BellWatchMove } from '../src/types/bellWatch';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const towerId = 'loc-taixu';
const towerLeaderId = 'npc-1';
const watcherId = 'elder-taixu-1';
const remoteListenerId = 'elder-taixu-2';
const strangerId = 'npc-5';
const rest: LLMDecisionPayload = { chosenAction:'REST', innerMonologue:'在檐下歇息。' };
const person = (world: WorldState, id: string) => world.cultivators.find(row => row.id === id)!;
const site = (world: WorldState, id: string) => world.locations.find(row => row.id === id)!;
const duty = (world: WorldState) => site(world,towerId).bellWatch!;
const perspective = (world:WorldState,id:string) => projectBellWatch(world,person(world,id));
const options = (world:WorldState,id=watcherId) => availableBellWatchActions(person(world,id),world,world.tick+1);
const move = (targetLocationId:string): LLMDecisionPayload => ({chosenAction:'EXPLORE',targetLocationId,innerMonologue:'循旧路下山。'});
const advance = (world:WorldState, orders:Readonly<Record<string,LLMDecisionPayload>>={},
  utilityId?:string, modelId?:string) => advanceWorldTick(world,
    Object.fromEntries(world.cultivators.filter(actor=>actor.id!==utilityId).map(({id})=>[id,orders[id]??rest])),
    ()=>.95,'utility',undefined,modelId?{modelActors:new Set([modelId])}:undefined);
const saveRoundTrip = (world:WorldState) => {
  const encoded=encodeEraWorldSave(world), reopened=decodeEraWorldSave(encoded);
  expect(encodeEraWorldSave(reopened)).toBe(encoded);
  return reopened;
};
const option = (world:WorldState,kind:BellWatchMove) => {
  const chosen=options(world).find(row=>row.bellWatchMove===kind);
  if(!chosen)throw new Error(`Expected native bell choice: ${kind}`);
  return bellWatchCommand(chosen);
};
const brushTwice = (world:WorldState,point:{x:number;y:number}) =>
  applyMapBrush(applyMapBrush(world,'beast_tide',[point]),'beast_tide',[point]);
afterEach(() => vi.unstubAllGlobals());

function beforeHazard() {
  let world=createInitialWorld(637);
  const tower=site(world,towerId);
  const towerTile=terrainTileAt(world,tower.x,tower.y)!;
  // Use a real played-in known site two tiles away; the report must actually pass the intervening tile.
  const remotePoint={x:(towerTile.col+2.5)*1000/world.terrain.columns,y:(towerTile.row+.5)*600/world.terrain.rows};
  world=applyMapBrush(world,'paint_vein',[remotePoint]);
  const remoteSite=world.locations.find(row=>row.x===remotePoint.x&&row.y===remotePoint.y)!;
  expect(remoteSite?.id).toMatch(/^brush-vein-/);
  expect(duty(world)).toBeUndefined();
  world=advance(world,{
    [towerLeaderId]:{chosenAction:'BUILD_FACILITY',facilityKind:'defense_array',innerMonologue:'修起护山阵。'},
    [remoteListenerId]:move(remoteSite.id),
  });
  expect(person(world,remoteListenerId).locationId).toBe(remoteSite.id);
  expect(world.sects.find(row=>row.id===person(world,watcherId).sectId)?.facilities.defense_array).toBe(1);
  // Open the duty after native building and positioning; next month provides an independent prior date.
  world=advance(advance(world));
  expect(duty(world)).toMatchObject({watcherId,listeners:expect.arrayContaining([
    {actorId:towerLeaderId,siteId:towerId},{actorId:remoteListenerId,siteId:remoteSite.id},
  ]),receipts:[]});
  expect(duty(world).openedTick).toBeLessThan(world.tick);
  expect(options(world)).toEqual([]);
  expect(perspective(world,remoteListenerId)).toBeUndefined();
  return {world,remoteId:remoteSite.id,towerTileId:towerTile.id};
}

function damaged(orders:Readonly<Record<string,LLMDecisionPayload>>={}) {
  const fixture=beforeHazard();
  const brushed=brushTwice(fixture.world,site(fixture.world,towerId));
  const hazard=brushed.mapHazards.find(row=>row.tileId===fixture.towerTileId&&row.kind==='beast_tide')!;
  expect(duty(brushed).damage).toBeUndefined();
  const world=advance(brushed,orders);
  expect(duty(world).damage).toMatchObject({hazard,tick:world.tick,integrityBefore:100});
  expect(duty(world).damage?.integrityAfter).toBeLessThan(100);
  expect(duty(world).choice).toBeUndefined();
  expect(availableBellWatchActions(person(world,watcherId),world)).toEqual([]);
  return {...fixture,world};
}

function mapPerspective(world:WorldState,id:string){
  const viewer=person(world,id);
  const current=currentVisibleTileIds(world,viewer);
  return projectMapActorsAtCheckpoints(world,{viewer,current,above:false,hiddenGates:new Set(),
    isCurrentLocation:locationId=>{
      const place=site(world,locationId);
      return !!place&&current.has(terrainTileAt(world,place.x,place.y)?.id??'');
    }});
}

describe('山钟停了一夜 · actual native bell watch (P23-1)',()=>{
  it('requires a preceding real duty, damage at the exact tower and a later physically present watcher',()=>{
    const {world,remoteId}=beforeHazard();
    const wrong=advance(brushTwice(world,site(world,remoteId)));
    expect(duty(wrong).damage).toBeUndefined();
    expect(options(wrong)).toEqual([]);
    const stale=applyMapBrush(world,'beast_tide',[site(world,towerId)]);
    const fake={...stale.mapHazards.find(row=>row.tileId===terrainTileAt(world,site(world,towerId).x,site(world,towerId).y)?.id)!};
    expect(bellWatchDamage(stale,fake)).toEqual([]);
    expect(duty(stale).damage).toBeUndefined();

    const actual=damaged().world;
    expect(options(actual).map(row=>row.bellWatchMove)).toEqual(['inspect','reroute']);
    expect(options(actual,towerLeaderId)).toEqual([]);
    expect(options(actual,remoteListenerId)).toEqual([]);
    expect(options(actual,strangerId)).toEqual([]);
    expect(perspective(actual,strangerId)).toBeUndefined();
    expect(perspective(actual,remoteListenerId)).toBeUndefined();
    const nextMonth=advance(actual);
    expect(perspective(nextMonth,remoteListenerId)).toMatchObject({phase:'awaiting',options:[]});
    expect(perspective(nextMonth,remoteListenerId)?.body).not.toContain('受损');
    const moved=structuredClone(actual);
    person(moved,watcherId).locationId=remoteId;
    expect(options(moved)).toEqual([]);
  });

  it('lets Utility and strict Cognitive choose the same native permission without invented testimony',async()=>{
    const {world}=damaged();
    const command=option(world,'inspect');
    const config={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'fixture'};
    const ask=(raw:object)=>{
      vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(raw)}}]}))));
      llmScheduler.resetTickBudget();
      return requestCultivatorLLMDecision(person(world,watcherId),world,config,world.tick+1);
    };
    for(const polluted of [{...command,delivered:true},{...command,targetLocationId:towerId},
      {...command,targetBellWatchId:'invented'},{...command,bellWatchMove:'repair'},{...command,innerMonologue:'我已经报过信了。'}]){
      await expect(ask(polluted)).resolves.toBeUndefined();
    }
    const cognitiveOrder=await ask(command);
    expect(cognitiveOrder).toMatchObject(command);
    if(!cognitiveOrder)throw new Error('Expected the actual provider command to round-trip');
    const cognitive=advance(world,{[watcherId]:cognitiveOrder},undefined,watcherId);
    const native=advance(world,{[watcherId]:{...command,innerMonologue:'先查钟楼。'}});
    expect(duty(cognitive).choice).toEqual(duty(native).choice);
    expect(duty(cognitive).choice).toMatchObject({move:'inspect',tick:cognitive.tick});
    expect(duty(cognitive).receipts).toEqual([]);
    const utility=advance(world,{},watcherId);
    expect(person(utility,watcherId).currentAction).toBe('BELL_WATCH');
    expect(options(world).map(row=>row.bellWatchMove)).toContain(duty(utility).choice?.move);
    const inspected=saveRoundTrip(advance(native));
    expect(duty(inspected).choice).toMatchObject({outcome:'inspected',endedTick:inspected.tick});
    expect(duty(inspected).receipts).toContainEqual({actorId:towerLeaderId,siteId:towerId,tick:inspected.tick});
    expect(perspective(inspected,towerLeaderId)?.phase).toBe('received');
    expect(['awaiting','not_received']).toContain(perspective(inspected,remoteListenerId)?.phase);
    expect(perspective(inspected,remoteListenerId)?.body).not.toContain('受损');
    expect(duty(inspected).receipts.some(row=>row.actorId===remoteListenerId)).toBe(false);
    expect(perspective(inspected,strangerId)).toBeUndefined();
  });

  it('requires the intermediate actual checkpoint and physical arrival; an absent recipient never gets the rumor',()=>{
    const {world,remoteId}=damaged();
    const command={...option(world,'reroute'),innerMonologue:'沿已知山径报信。'};
    const sent=advance(world,{[watcherId]:command});
    expect(duty(sent).choice).toMatchObject({move:'reroute',tick:sent.tick,destinationId:remoteId,pathIndex:0});
    expect(duty(sent).receipts).toEqual([]);
    const underway=saveRoundTrip(advance(sent));
    expect(duty(underway).choice).toMatchObject({pathIndex:1,lastMovedTick:underway.tick});
    expect(bellWatchCheckpoint(underway,person(underway,watcherId))).not.toEqual(
      {x:site(underway,towerId).x,y:site(underway,towerId).y});
    expect(person(underway,watcherId).locationId).toBe(towerId);
    expect(duty(underway).receipts).toEqual([]);
    expect(['awaiting','not_received']).toContain(perspective(underway,remoteListenerId)?.phase);
    const travelReview=prepareShareSavePrivacy(underway);
    expect(travelReview.status).toBe('bell_watch_in_transit');
    expect(buildConfirmedShareSave(underway,travelReview)).toBeUndefined();
    expect(mapPerspective(underway,watcherId).trailPositions.get(watcherId))
      .toEqual(bellWatchCheckpoint(underway,person(underway,watcherId)));
    expect(mapPerspective(underway,strangerId).trailPositions.has(watcherId)).toBe(false);
    expect(mapPerspective(underway,strangerId).liveActors.some(actor=>actor.id===watcherId)).toBe(false);
    expect(perspective(underway,remoteListenerId)?.body).not.toContain('受损');

    const arrived=saveRoundTrip(advance(underway));
    expect(person(arrived,watcherId).locationId).toBe(remoteId);
    expect(arrived.mapPresentation.trails.some(row=>row.cultivatorId===watcherId)).toBe(false);
    expect(deriveMapPresentation(underway,arrived,arrived.events).trails
      .some(row=>row.cultivatorId===watcherId)).toBe(false);
    expect(duty(arrived).choice).toMatchObject({outcome:'arrived',endedTick:arrived.tick});
    expect(duty(arrived).receipts).toEqual([{actorId:remoteListenerId,siteId:remoteId,tick:arrived.tick}]);
    expect(perspective(arrived,remoteListenerId)).toMatchObject({phase:'received',siteId:remoteId});
    expect(perspective(arrived,towerLeaderId)?.phase).toBe('not_received');
    expect(perspective(arrived,strangerId)).toBeUndefined();
    const recipient=person(arrived,remoteListenerId);
    expect(projectBellWatchSideNote(arrived,recipient,world.tick,world.tick)).toBeUndefined();
    expect(projectBellWatchSideNote(arrived,recipient,sent.tick,underway.tick))
      .toMatchObject({phase:'not_received',siteId:remoteId,options:[]});
    expect(projectBellWatchSideNote(arrived,recipient,sent.tick,underway.tick)?.body).not.toContain('受损');
    expect(projectBellWatchSideNote(arrived,recipient,arrived.tick,arrived.tick))
      .toMatchObject({phase:'received',siteId:remoteId,options:[]});
    expect(projectBellWatchSideNote(arrived,recipient,sent.tick,arrived.tick)?.phase).toBe('received');
    expect(projectBellWatchSideNote(arrived,person(arrived,towerLeaderId),sent.tick,arrived.tick)?.phase).toBe('not_received');
    expect(projectBellWatchSideNote(arrived,person(arrived,strangerId),sent.tick,arrived.tick)).toBeUndefined();
    expect(projectBellWatchSideNote(arrived,{...recipient},arrived.tick,arrived.tick)).toBeUndefined();
    expect(projectBellWatchSideNote(arrived,recipient,arrived.tick,arrived.tick+1)).toBeUndefined();
    const confirmed=buildConfirmedShareSave(arrived,prepareShareSavePrivacy(arrived));
    if(!confirmed)throw new Error('Expected same-world confirmed share bytes');
    expect(confirmed.json).not.toContain(duty(arrived).id);
    expect(confirmed.json).not.toContain('evt-bell-report-');
    const shared=decodeEraWorldSave(confirmed.json);
    expect(duty(shared)).toBeUndefined();
    expect(person(shared,watcherId).locationId).toBe(remoteId);
    expect(perspective(shared,remoteListenerId)).toBeUndefined();
    expect(world.locations.find(row=>row.id===towerId)?.bellWatch?.choice).toBeUndefined();

    const empty=advance(advance(sent,{[remoteListenerId]:move(towerId)}));
    expect(duty(empty).choice?.outcome).toBe('arrived');
    expect(duty(empty).receipts).toEqual([]);
    expect(perspective(empty,remoteListenerId)?.phase).toBe('not_received');
    expect(perspective(empty,remoteListenerId)?.body).not.toContain('受损');
  });

  it('returns along the walked trail rather than delivering through a newly affected destination',()=>{
    const {world,remoteId}=damaged();
    const sent=advance(world,{[watcherId]:{...option(world,'reroute'),innerMonologue:'沿已知山径报信。'}});
    const underway=advance(sent);
    expect(duty(underway).choice?.pathIndex).toBe(1);
    const blocked=applyMapBrush(underway,'cursed_miasma',[site(underway,remoteId)]);
    const returned=saveRoundTrip(advance(blocked));
    expect(duty(returned).choice).toMatchObject({returning:true,outcome:'blocked',pathIndex:0,endedTick:returned.tick});
    expect(person(returned,watcherId).locationId).toBe(towerId);
    expect(duty(returned).receipts).toEqual([]);
    expect(perspective(returned,remoteListenerId)?.phase).toBe('not_received');
    expect(perspective(returned,remoteListenerId)?.body).not.toContain('受损');
  });

  it('archives a quiet wait only for an original listener physically at the scheduled site',()=>{
    const {world,remoteId}=damaged({[remoteListenerId]:move(towerId)});
    expect(person(world,remoteListenerId).locationId).toBe(towerId);
    const rested=saveRoundTrip(advance(world));
    expect(duty(rested).waits).toContainEqual({actorId:towerLeaderId,siteId:towerId,tick:rested.tick});
    expect(duty(rested).waits?.some(row=>row.actorId===remoteListenerId)).toBe(false);
    expect(projectBellWatchSideNote(rested,person(rested,remoteListenerId),rested.tick,rested.tick)).toBeUndefined();
    const forged=structuredClone(rested);
    duty(forged).waits?.push({actorId:remoteListenerId,siteId:remoteId,tick:rested.tick});
    expect(()=>encodeEraWorldSave(forged)).toThrow(/locations\.bellWatch/);
  });

  it('rejects a forged receipt and a non-adjacent shortcut inserted into the private save',()=>{
    const {world,remoteId}=damaged();
    const sent=advance(world,{[watcherId]:{...option(world,'reroute'),innerMonologue:'沿已知山径报信。'}});
    const shortcut=structuredClone(sent);
    const choice=duty(shortcut).choice;
    if(!choice)throw new Error('Expected authorized route');
    expect(choice.pathTileIds.length).toBeGreaterThan(2);
    choice.pathTileIds.splice(1,1);
    expect(()=>encodeEraWorldSave(shortcut)).toThrow(/locations\.bellWatch/);

    const arrived=advance(advance(sent));
    const disputed=structuredClone(arrived);
    duty(disputed).receipts=[{actorId:towerLeaderId,siteId:remoteId,tick:disputed.tick}];
    expect(()=>encodeEraWorldSave(disputed)).toThrow(/locations\.bellWatch/);
    expect(saveRoundTrip(arrived).locations.find(row=>row.id===towerId)?.bellWatch?.receipts)
      .toEqual([{actorId:remoteListenerId,siteId:remoteId,tick:arrived.tick}]);
  });
});
