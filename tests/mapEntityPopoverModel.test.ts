import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {possessAvatar} from '../src/engine/avatarEngine';
import {advanceWorldTick,executeGodIntervention} from '../src/engine/worldEngine';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {availableMapEntityActions,buildMapEntityCommand,projectMapEntityPopover,type MapEntityTarget} from '../src/components/mapEntityPopoverModel';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {advanceOccasions} from '../src/engine/occasionEngine';
import {resolveObservatoryAction} from '../src/engine/fieldObservatoryEngine';
import type {LLMDecisionPayload,WorldEvent} from '../src/types/world';

const seed=30301;
const actorTarget=(id:string):MapEntityTarget=>({kind:'actor',id});
const siteTarget=(id:string):MapEntityTarget=>({kind:'site',id});
const need=<T,>(value:T|undefined):T=>{if(value===undefined)throw Error('Expected actual native fixture data');return value;};

describe('map entity current scope',()=>{
  it('keeps the fictional thought to the same exact live possessed actor and does not expose secret goals',()=>{
    const world=createInitialWorld(seed),actor=world.cultivators[0],other=world.cultivators[1];
    actor.innerMonologue='\u202e暂且收剑。第二句不可出现。';actor.secretGoal='绝不外传的秘密';
    const target=actorTarget(actor.id),view=createTerrainMapView(world,actor,false);
    expect(projectMapEntityPopover(world,view,target,actor.id,true)).not.toHaveProperty('monologue');
    expect(projectMapEntityPopover(world,view,target,actor.id,true)).toHaveProperty('persona');
    expect(possessAvatar(world,actor.id)).toBe(true);
    expect(projectMapEntityPopover(world,view,target,actor.id)).not.toHaveProperty('monologue');
    expect(projectMapEntityPopover(world,view,target,actor.id,true)).not.toHaveProperty('monologue');
    actor.innerMonologue='暂且收剑。第二句不可出现。';
    expect(projectMapEntityPopover(world,view,target,actor.id,true)).toMatchObject({
      kind:'actor',target,name:actor.name,monologue:'暂且收剑。',hp:actor.hp,maxHp:actor.maxHp,
    });
    expect(projectMapEntityPopover(world,view,target,other.id,true)).not.toHaveProperty('monologue');
    expect(JSON.stringify(projectMapEntityPopover(world,view,target,actor.id,true))).not.toContain(actor.secretGoal);
    actor.innerMonologue='旁人绝不外传的秘密。';
    expect(projectMapEntityPopover(world,view,target,actor.id,true)).not.toHaveProperty('monologue');
    const different=structuredClone(world);
    expect(projectMapEntityPopover(different,view,target,actor.id)).toBeUndefined();
    actor.hp=0;
    expect(availableMapEntityActions(world,view,target)).toEqual([]);
  });

  it('uses current public same-location titles and reports village population only to a genuinely present reader',()=>{
    const world=createInitialWorld(seed),village=need(world.settlements.villages.find(row=>row.locationId==='loc-market'));
    const local=need(world.cultivators.find(row=>row.locationId===village.locationId&&row.alive)),remote=world.cultivators[0];
    const title='坊市相逢';
    const present:WorldEvent={id:'evt-popover-public',tick:world.tick,year:world.year,month:world.month,title,description:'公开场景。',
      actorIds:[local.id],locationId:village.locationId,category:'diplomacy'};
    world.events=[present,{...present,id:'evt-popover-private',title:'私下才说',witnessScope:'participants'},
      {...present,id:'evt-popover-stale',title:'并非本月',tick:world.tick-1},
      {...present,id:'evt-popover-elsewhere',title:'并非此处',locationId:remote.locationId},
      {...present,id:'evt-popover-conflict',title:'重名原据'},
      {...present,id:'evt-popover-conflict',title:'重名私据',witnessScope:'participants'}];
    const target=siteTarget(village.locationId),view=createTerrainMapView(world,local,false);
    const read=projectMapEntityPopover(world,view,target,local.id);
    expect(read).toMatchObject({kind:'site',population:village.population,eventTitles:[title]});
    expect(read?.kind==='site'&&read.residents).toContain(local.name);
    expect(projectMapEntityPopover(world,view,target,remote.id)).not.toHaveProperty('population');
    expect(projectMapEntityPopover(world,view,target)).not.toHaveProperty('population');
    const fogged=need(world.locations.find(row=>row.id==='loc-market-east'));
    const tile=need(terrainTileAt(world,fogged.x,fogged.y));
    local.exploredTileIds=[...local.exploredTileIds,tile.id];
    const fogView=createTerrainMapView(world,local,true);
    expect(fogView.seenLocations).toContain(fogged);
    expect(projectMapEntityPopover(world,fogView,siteTarget(fogged.id),local.id)).toBeUndefined();
    expect(buildMapEntityCommand(world,fogView,siteTarget(fogged.id),'treasure')).toBeUndefined();
  });

  it('never lists a traveler at their old address even if the visible map still has their marker on a trail',()=>{
    const world=createInitialWorld(seed),site=need(world.locations.find(row=>row.id==='loc-taixu'));
    const viewer=world.cultivators[0],travel=need(world.cultivators.find(row=>row.locationId===site.id&&row.id!==viewer.id));
    const map=createTerrainMapView(world,viewer,false);
    map.trailPositions.set(travel.id,{x:site.x+12,y:site.y+8});
    const read=projectMapEntityPopover(world,map,siteTarget(site.id),viewer.id);
    expect(read?.kind==='site'&&read.residents).toContain(viewer.name);
    expect(read?.kind==='site'&&read.residents).not.toContain(travel.name);
  });

  it('does not create a treasure command at an actual scoped gate even when a witness can see it',()=>{
    const world=createInitialWorld(2031);
    const observer=need(world.cultivators.find(row=>row.id==='npc-2'));
    const fund:LLMDecisionPayload={chosenAction:'FIELD_OBSERVATORY',observatoryMove:'fund',innerMonologue:'亲自观象。'};
    expect(resolveObservatoryAction(world,observer,fund)).not.toBeNull();
    world.tick=world.month=3;
    expect(resolveObservatoryAction(world,observer,{...fund,observatoryMove:'measure',targetObservatoryTick:1})).not.toBeNull();
    world.tick=world.month=4;
    expect(advanceOccasions(world,()=>.99)[0]?.witnessScope).toBe('participants');
    const gate=world.occasions[0].locationId;
    const visible=createTerrainMapView(world,observer,false),unknown=createTerrainMapView(world,undefined,false);
    expect(visible.seenLocations.some(row=>row.id===gate)).toBe(true);
    expect(projectMapEntityPopover(world,unknown,siteTarget(gate))).toBeUndefined();
    expect(availableMapEntityActions(world,visible,siteTarget(gate))).toEqual([]);
    expect(buildMapEntityCommand(world,visible,siteTarget(gate),'treasure')).toBeUndefined();
  });

  it.each(['utility','cognitive'] as const)('keeps %s history intact and prepares only exact real native interventions',mode=>{
    const base=createInitialWorld(seed);
    const decision:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'安静调息。'};
    const chosen=base.cultivators[0].id;
    const world=mode==='utility'?advanceWorldTick(base):advanceWorldTick(base,{[chosen]:decision},undefined,'deferred',
      undefined,{modelActors:new Set([chosen]),captureTrace:true});
    const actor=need(world.cultivators.find(row=>row.id===chosen)),other=world.cultivators[1];
    if(mode==='cognitive')expect(world.decisionTrace?.records.some(row=>row.actorId===chosen&&row.source==='model')).toBe(true);
    const before=JSON.stringify(world),view=createTerrainMapView(world,actor,false);
    const target=actorTarget(actor.id),site=siteTarget(actor.locationId);
    expect(buildMapEntityCommand(world,view,target,'treasure')).toBeUndefined();
    expect(buildMapEntityCommand(world,view,actorTarget('not-present'),'lightning')).toBeUndefined();
    expect(buildMapEntityCommand(world,view,target,'whisper','\u202e  ')).toBeUndefined();
    expect(buildMapEntityCommand(world,view,target,'whisper','甲'.repeat(221))).toBeUndefined();
    const thunder=need(buildMapEntityCommand(world,view,target,'lightning'));
    const whisper=need(buildMapEntityCommand(world,view,target,'whisper','  徐行\u202e 静观。  '));
    const treasure=need(buildMapEntityCommand(world,view,site,'treasure'));
    expect(thunder).toEqual({type:'TRIBULATION_STRIKE',targetCultivatorId:actor.id});
    expect(whisper).toEqual({type:'WHISPER_MIND',targetCultivatorId:actor.id,whisperText:'徐行 静观。'});
    expect(treasure).toEqual({type:'SPAWN_TREASURE',targetLocationId:actor.locationId});
    expect(JSON.stringify(world)).toBe(before);
    const struck=executeGodIntervention(world,thunder);
    expect(need(struck.cultivators.find(row=>row.id===actor.id)).hp).toBeLessThan(actor.hp);
    expect(need(struck.cultivators.find(row=>row.id===other.id)).hp).toBe(other.hp);
  });
});
