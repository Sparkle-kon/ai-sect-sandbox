import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {mapExplorerIndex} from '../src/components/MapKeyboardExplorer';
import {pickActorMarker,planActorMarkers} from '../src/components/mapActorClusters';
import {buildMapActorSpriteModels} from '../src/components/mapActorSpriteModel';
import {admitPaintedSpritePositions} from '../src/components/mapCanvasNamePills';
import {DEFAULT_CAMERA,MAP_HEIGHT,MAP_WIDTH} from '../src/components/mapCamera';
import {mapTransitActorIds,visibleMapConvoys} from '../src/components/mapConvoyView';
import {buildMapPresentation} from '../src/components/mapPresentationView';
import {createTerrainMapView,mapActorPositions} from '../src/components/terrainMapView';
import {WorldMapCanvas} from '../src/components/WorldMapCanvas';
import {createInitialWorld} from '../src/data/initialWorld';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {availableRelocationActions,resolveRelocationAction} from '../src/engine/relocationEngine';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {Cultivator,LLMDecisionPayload,WorldState} from '../src/types/world';
import {publicDialogueProofFixture} from './fixtures/publicDialogueFixture';

const gatherer='elder-danxia-2';
const named=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'安静等这月。'};
const route=(targetLocationId:string):LLMDecisionPayload=>({chosenAction:'EXPLORE',targetLocationId,innerMonologue:'走实际路线。'});
const quiet=(world:WorldState):Record<string,LLMDecisionPayload>=>Object.fromEntries(world.cultivators.map(({id})=>[id,rest]));
function viewOf(world:WorldState,viewer?:Cultivator,fog=!!viewer){
  const view=createTerrainMapView(world,viewer,fog);
  const candidates=mapActorPositions(view.seenLocations,view.liveActors,view.trailPositions);
  const sprites=buildMapActorSpriteModels(world,view,candidates);
  const positions=admitPaintedSpritePositions(candidates,sprites);
  const presentation=buildMapPresentation(world,view,positions);
  return {view,positions,sprites,presentation};
}

describe('authorized map bodies and portrait appearance at native end-states',()=>{
  it('poses the actually executed Danxia herb action identically for Utility and validated Cognitive; remote and injected points remain absent',async()=>{
    let start=createInitialWorld();
    for(let i=0;i<3;i++)start=advanceWorldTick(start);
    const frozen=JSON.stringify(start);
    const gather:LLMDecisionPayload={chosenAction:'GATHER_HERBS',targetHerbId:'earth_root',innerMonologue:'不得出现在小人或地图里。'};
    const utility=advanceWorldTick(start,{[gatherer]:gather});
    llmScheduler.resetTickBudget();
    const provider=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(gather)}}]})));
    vi.stubGlobal('fetch',provider);
    let answer:LLMDecisionPayload|undefined;
    try{
      answer=await requestCultivatorLLMDecision(named(start,gatherer),start,{enabled:true,
        apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture-only',model:'fixture'},start.tick+1);
      expect(provider).toHaveBeenCalledTimes(1);
      expect(answer).toMatchObject(gather);
    }finally{vi.unstubAllGlobals();llmScheduler.resetTickBudget();}
    if(!answer)throw new Error('Expected the exact verified gather action from provider');
    const cognitive=advanceWorldTick(start,{[gatherer]:answer},undefined,'deferred',undefined,{modelActors:new Set([gatherer])});
    for(const world of [utility,cognitive]){
      expect(world.events.find(row=>row.id==='evt-5-elder-danxia-2-alchemy')).toMatchObject({
        locationId:'loc-danxia',actorIds:[gatherer],tick:5,
      });
    }
    const before=JSON.stringify(utility);
    const own=viewOf(utility,named(utility,gatherer));
    const online=viewOf(cognitive,named(cognitive,gatherer));
    const sprite=own.sprites.get(gatherer);
    expect(sprite).toMatchObject({id:gatherer,pose:'labor',appearance:{face:expect.any(Object),palette:expect.any(Object)}});
    expect(online.sprites.get(gatherer)).toEqual(sprite);
    expect(JSON.stringify(sprite)).not.toContain(gather.innerMonologue);
    const remote=viewOf(utility,named(utility,'npc-3'));
    expect(remote.view.isCurrentLocation('loc-danxia')).toBe(false);
    expect(remote.sprites.has(gatherer)).toBe(false);
    const leaked=own.positions.find(row=>row.actor.id===gatherer)!;
    expect(buildMapActorSpriteModels(utility,remote.view,[...remote.positions,leaked]).has(gatherer)).toBe(false);
    expect(JSON.stringify(utility)).toBe(before);
    expect(JSON.stringify(start)).toBe(frozen);
  });

  it('shows a fight only for both living bodies in the exact public current native contest',()=>{
    const {world,event,actorId,firstId}=publicDialogueProofFixture();
    expect(event).toMatchObject({category:'combat',tick:world.tick,locationId:'loc-market',actorIds:[actorId,firstId]});
    const actor=named(world,actorId),target=named(world,firstId);
    expect([actor,target].every(person=>person.alive&&person.hp>0&&person.locationId===event.locationId)).toBe(true);
    const genuine=viewOf(world,actor);
    expect(genuine.sprites.get(actorId)?.pose).toBe('fight');
    expect(genuine.sprites.get(firstId)?.pose).toBe('fight');
    const privateWorld={...world,events:world.events.map(row=>row===event?{...row,witnessScope:'participants' as const}:row)};
    const hidden=viewOf(privateWorld,actor).sprites;
    expect(hidden.get(actorId)).toBeDefined();
    expect(hidden.get(firstId)).toBeDefined();
    expect(hidden.get(actorId)?.pose).not.toBe('fight');
    expect(hidden.get(firstId)?.pose).not.toBe('fight');
    const duplicate={...world,events:[...world.events,{...event}]};
    expect(viewOf(duplicate,actor).sprites.get(actorId)?.pose).not.toBe('fight');
    const later=advanceWorldTick(world,quiet(world),()=>.99);
    expect(viewOf(later,named(later,actorId)).sprites.get(actorId)?.pose).not.toBe('fight');
  });

  it('draws only one marker for the native travel route, never the hidden or stale endpoint',()=>{
    const start=createInitialWorld(1);
    const traveler=named(start,'npc-1');
    expect(traveler.locationId).toBe('loc-taixu');
    const arrived=advanceWorldTick(start,{...quiet(start),[traveler.id]:route('loc-market')},()=>.99);
    const current=named(arrived,traveler.id);
    expect(current.locationId).toBe('loc-market');
    expect(arrived.mapPresentation?.trails.find(row=>row.cultivatorId===current.id))
      .toMatchObject({tick:arrived.tick,fromLocationId:traveler.locationId,toLocationId:current.locationId});
    const publicMap=viewOf(arrived,undefined,false);
    expect(publicMap.presentation.routes.get(current.id)).toMatchObject({
      fromName:start.locations.find(row=>row.id===traveler.locationId)?.name,
      toName:arrived.locations.find(row=>row.id===current.locationId)?.name,
      points:expect.any(Array),
    });
    expect(publicMap.positions.filter(row=>row.actor.id===current.id)).toHaveLength(1);
    expect(publicMap.sprites.get(current.id)).toMatchObject({pose:'idle'});
    const remote=viewOf(arrived,named(arrived,'npc-3'));
    expect(remote.view.isCurrentLocation(current.locationId)).toBe(false);
    expect(remote.presentation.routes.has(current.id)).toBe(false);
    expect(remote.sprites.has(current.id)).toBe(false);
    expect(viewOf(advanceWorldTick(arrived,quiet(arrived),()=>.99),undefined,false).presentation.routes.has(current.id)).toBe(false);
  });

  it('leaves native migration in its convoy view and never paints stale bodies as the original headquarter residents',()=>{
    // Only the damaged array and known/free destination are portable test preconditions.
    const start=createInitialWorld(51);
    start.tick=8;
    start.month=8;
    const sect=start.sects[0];
    const origin=start.locations.find(row=>row.id===sect.headquartersId)!;
    const destination=start.locations.find(row=>row.id==='loc-vein-north')!;
    if(!sect.leaderId)throw new Error('Expected an actual sect leader');
    const leader=named(start,sect.leaderId);
    const tile=terrainTileAt(start,destination.x,destination.y)!;
    delete destination.ownerSectId;
    delete tile.ownerSectId;
    leader.exploredTileIds.push(tile.id);
    leader.qiProgress=20;
    for(const actor of start.cultivators.filter(row=>row.sectId===sect.id)){
      actor.locationId=origin.id;
      actor.hp=actor.maxHp;
    }
    sect.facilities.defense_array=2;
    sect.arrayMaxHp=400;
    sect.arrayHp=0;
    origin.herbs.earth_root=Math.max(2,origin.herbs.earth_root);
    const opening=advanceWorldTick(start,{...quiet(start),[leader.id]:{chosenAction:'RELOCATE',
      relocationMove:'propose',targetLocationId:destination.id,innerMonologue:'申请迁宗'}},()=>.99);
    const vote=opening.relocations.plans[0];
    expect(vote.status).toBe('voting');
    for(const id of vote.voterIds.filter(id=>id!==leader.id)){
      const voter=named(opening,id);
      const accept=availableRelocationActions(voter,opening).find(row=>row.relocationMove==='approve')!;
      expect(resolveRelocationAction(opening,voter,{...accept,chosenAction:'RELOCATE',innerMonologue:'同意迁宗'})).not.toBeNull();
    }
    const leaving=advanceWorldTick(opening,quiet(opening),()=>.99);
    const convoy=leaving.relocations.plans[0];
    expect(convoy).toMatchObject({status:'in_transit',spent:true,garrisonIds:expect.arrayContaining([leader.id])});
    expect([...mapTransitActorIds(leaving)]).toEqual(convoy.garrisonIds);
    expect(named(leaving,leader.id).locationId).toBe(origin.id);
    const inTransit=viewOf(leaving,undefined,false);
    expect(visibleMapConvoys(leaving,inTransit.view)).toMatchObject([{id:convoy.id}]);
    expect(inTransit.sprites.has(leader.id)).toBe(false);
    expect(inTransit.positions.some(row=>row.actor.id===leader.id)).toBe(false);
    expect(mapExplorerIndex(leaving,inTransit.view,inTransit.positions,inTransit.presentation).actors.some(({id})=>id===leader.id)).toBe(false);
    let settled=leaving;
    for(let i=0;i<9&&settled.relocations.plans[0].status==='in_transit';i++)settled=advanceWorldTick(settled,quiet(settled),()=>.99);
    expect(settled.relocations.plans[0].status).toBe('settled');
    expect(named(settled,leader.id).locationId).toBe(destination.id);
    const arrived=viewOf(settled,undefined,false);
    expect(visibleMapConvoys(settled,arrived.view)).toEqual([]);
    expect(arrived.sprites.has(leader.id)).toBe(true);
    expect(arrived.positions.filter(row=>row.actor.id===leader.id)).toHaveLength(1);
  });

  it.each([360,390])('uses the current projection for %ipx hit, member and accessible explorer identity',width=>{
    let world=createInitialWorld();
    for(let i=0;i<4;i++)world=advanceWorldTick(world);
    const viewer=named(world,gatherer),map=viewOf(world,viewer);
    const size={width,height:width*MAP_HEIGHT/MAP_WIDTH};
    const markers=planActorMarkers(map.positions,DEFAULT_CAMERA,size,viewer.id);
    const members=markers.flatMap(row=>row.kind==='actor'?[row.point.actor.id]:row.ids);
    expect(new Set(members).size).toBe(members.length);
    const roster=mapExplorerIndex(world,map.view,map.positions,map.presentation);
    expect(members.slice().sort()).toEqual(roster.actors.map(({id})=>id).sort());
    expect(roster.actors.some(({id})=>id==='npc-3')).toBe(false);
    for(const marker of markers)expect(pickActorMarker(markers,marker,true)?.key).toBe(marker.key);
    const individual=markers.find(row=>row.kind==='actor'&&row.point.actor.id===viewer.id);
    expect(individual).toMatchObject({kind:'actor',selected:true,key:viewer.id});
    expect(map.sprites.get(viewer.id)?.pose).toBe('labor');
    const onSelect=vi.fn();
    const html=renderToStaticMarkup(<WorldMapCanvas world={world} compact toolsOpen fogEnabled
      selectedCultivatorId={viewer.id} onSelectCultivator={onSelect}/>);
    expect(html).toContain('修仙世界地图。点击修士或地点可检视详情');
    expect(html).toContain('地图当前选择');
    expect(html).toContain(viewer.name);
    expect(html).not.toContain(named(world,'npc-3').name);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
