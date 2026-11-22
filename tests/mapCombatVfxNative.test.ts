import {describe,expect,it} from 'vitest';
import {buildMapCombatVfxPlan} from '../src/components/mapCombatVfxView';
import {buildMapPresentation} from '../src/components/mapPresentationView';
import {createTerrainMapView,mapActorPositions} from '../src/components/terrainMapView';
import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick,executeGodIntervention} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const witness='npc-1',opponent='elder-taixu-1',outsider='npc-6',site='loc-taixu';
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'静候。'};

function month(world:WorldState,order=rest){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(actor=>[actor.id,actor.id===witness?order:rest])),
    ()=>0.2,'utility');
}

function project(world:WorldState,viewerId=witness,fog=true){
  const viewer=world.cultivators.find(actor=>actor.id===viewerId);
  const view=createTerrainMapView(world,viewer,fog);
  const points=mapActorPositions(view.seenLocations,view.liveActors,view.trailPositions);
  return buildMapCombatVfxPlan(world,view,buildMapPresentation(world,view,points));
}

describe('combat marks from native current-month mechanics',()=>{
  it('shows the authentic duel only inside current geographic visibility and never invents a later clash',()=>{
    const initial=createInitialWorld(1,'spirit-bloom');
    const dueling=month(initial,{chosenAction:'DUEL',targetCultivatorId:opponent,innerMonologue:'在太虚山门实地交手。'});
    const source=dueling.events.find(row=>row.tick===dueling.tick&&row.category==='combat'&&row.locationId===site&&row.actorIds.includes(opponent))!;
    expect(source.duelWinnerId).toBeTruthy();
    const own=project(dueling);
    expect(own.effects).toContainEqual(expect.objectContaining({
      id:`${source.id}-clash`,kind:'clash',actorIds:source.actorIds,location:expect.objectContaining({id:site}),
    }));
    for(const hit of source.damage??[]){
      expect(own.effects).toContainEqual(expect.objectContaining({
        id:`${source.id}-damage-${hit.cultivatorId}`,kind:'damage',amount:hit.amount,
      }));
    }
    expect(project(dueling,outsider,true).effects.some(row=>row.id===`${source.id}-clash`)).toBe(false);
    expect(project(dueling,outsider,false).effects).toContainEqual(own.effects.find(row=>row.kind==='clash'));
    expect(project(month(dueling)).effects.some(row=>row.id===`${source.id}-clash`)).toBe(false);
  });

  it('uses the applied damage of a real intervention, not its nominal force or an ongoing storm',()=>{
    const initial=createInitialWorld(1,'spirit-bloom');
    initial.cultivators.find(actor=>actor.id===witness)!.hp=10; // Controlled initial wounded actor.
    const struck=executeGodIntervention(initial,{type:'TRIBULATION_STRIKE',targetCultivatorId:witness});
    expect(struck.cultivators.find(actor=>actor.id===witness)?.hp).toBe(1);
    const source=struck.events.find(row=>row.id.startsWith('evt-god-strike-'))!;
    expect(source.damage).toEqual([{cultivatorId:witness,amount:9}]);
    const read=project(struck);
    expect(read.effects).toContainEqual(expect.objectContaining({id:`${source.id}-lightning`,kind:'lightning'}));
    expect(read.effects).toContainEqual(expect.objectContaining({
      id:`${source.id}-damage-${witness}`,kind:'damage',amount:9,text:'−9 HP',
    }));
    expect(read.storms).toHaveLength(0);
    expect(project(struck,outsider).effects.some(row=>row.id.startsWith(source.id))).toBe(false);
  });

  it('distinguishes a native lightning trial warning from its actually settled first wave',()=>{
    const initial=createInitialWorld(1,'spirit-bloom');
    const actor=initial.cultivators.find(row=>row.id===witness)!;
    Object.assign(actor,{realm:'筑基',realmStage:9,qiProgress:100,hp:actor.maxHp}); // Controlled qualified starting cultivator.
    const opening=month(initial,{chosenAction:'BREAKTHROUGH',innerMonologue:'当面叩问金丹。'});
    const trial=opening.cultivators.find(row=>row.id===witness)!.tribulation!;
    expect(trial).toMatchObject({stage:'lightning',nextWave:1});
    expect(project(opening).storms).toContainEqual(expect.objectContaining({
      wave:1,totalWaves:trial.totalWaves,location:expect.objectContaining({id:site}),
    }));
    expect(project(opening).effects.some(row=>row.kind==='lightning')).toBe(false);
    expect(project(opening,outsider).storms).toEqual([]);
    const after=month(opening,{chosenAction:'FACE_TRIBULATION',tribulationStance:'defy',innerMonologue:'直面劫雷。'});
    const wave=after.events.find(row=>row.tick===after.tick&&row.id.includes('-tribulation-wave-'))!;
    expect(wave.damage?.[0].amount).toBeGreaterThan(0);
    const read=project(after);
    expect(read.effects).toContainEqual(expect.objectContaining({
      id:`${wave.id}-lightning`,kind:'lightning',wave:1,totalWaves:trial.totalWaves,
    }));
    expect(read.effects).toContainEqual(expect.objectContaining({
      id:`${wave.id}-damage-${witness}`,kind:'damage',amount:wave.damage?.[0].amount,
    }));
  });
});
