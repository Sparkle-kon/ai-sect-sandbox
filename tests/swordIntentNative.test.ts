import { describe,expect,it } from 'vitest';
import {buildDaoIntentMapVfx,drawDaoIntentMapVfx} from "../src/components/daoIntentMapVfx";
import {createTerrainMapView} from "../src/components/terrainMapView";
import { equippedArtifact } from '../src/engine/artifactEngine';
import { decodeEraWorldSave,encodeEraWorldSave } from '../src/engine/storageEngine';
import {
  actualAwakenedSwordIntent,authenticSwordStart,bindOtherArtifact,daoPathOrder,intentActor,intentTurn,nativeSwordDuel,
  starterSword,swordOpponent,swordOwner,swordSite,
} from './swordIntentNativeFixture';
import type { WorldState } from '../src/types/world';

function strict(world:WorldState){
  const raw=encodeEraWorldSave(world);
  const restored=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(restored)).toBe(raw);
  return restored;
}
const ownedSword=(world:WorldState)=>intentActor(world).artifacts.find(item=>item.id===starterSword)!;
const ownDuel=(world:WorldState)=>world.events.find(event=>
  event.tick===world.tick&&event.actorIds[0]===swordOwner&&event.actorIds.includes(swordOpponent)&&!!event.duelWinnerId)!;

describe('native sword intent and the original cultivated artifact',()=>{
  it('only unlocks after two separately paid practices and actually tempers the same bound artifact',()=>{
    const {choice,first,learned,ready}=actualAwakenedSwordIntent();
    const early=intentTurn(first,{[swordOwner]:daoPathOrder('ready')});
    expect(intentActor(early).daoPath?.ready).toBeUndefined();
    expect(intentActor(learned).daoPath?.practices).toEqual([first,learned].map(world=>({
      tick:world.tick,siteId:swordSite,qiPaid:6,herbPaid:'earth_root',artifactId:starterSword,durabilityGain:1,
    })));
    expect(intentActor(choice).herbs.earth_root-intentActor(learned).herbs.earth_root).toBe(2);
    expect(intentActor(choice).qiProgress-intentActor(learned).qiProgress).toBe(12);
    const original=ownedSword(choice),refined=ownedSword(learned);
    expect(refined).toMatchObject({id:original.id,boundTo:swordOwner,
      durability:original.durability!+2,maxDurability:original.maxDurability!+2});
    expect(intentActor(ready).daoPath?.ready).toEqual({tick:ready.tick,siteId:swordSite,artifactId:starterSword});
    expect(intentActor(ready).qiProgress).toBe(intentActor(learned).qiProgress);
    expect(strict(ready).cultivators.find(actor=>actor.id===swordOwner)?.daoPath).toEqual(intentActor(ready).daoPath);
  });

  it('pays one ready intent on a later real same-roll duel and reverses that ordinary outcome',()=>{
    const {learned,ready}=actualAwakenedSwordIntent(true);
    const unprepared=intentTurn(learned);
    expect(unprepared.tick).toBe(ready.tick);
    const plain=intentTurn(unprepared,{[swordOwner]:nativeSwordDuel()});
    const paid=intentTurn(strict(ready),{[swordOwner]:nativeSwordDuel()});
    expect(ownDuel(plain)).toMatchObject({duelWinnerId:swordOpponent,locationId:swordSite});
    const source=ownDuel(paid);
    expect(source).toMatchObject({duelWinnerId:swordOwner,locationId:swordSite});
    expect(ownDuel(plain).daoIntents).toBeUndefined();
    expect(source.daoIntents).toEqual([{actorId:swordOwner,pathId:'sword',rank:1,tick:paid.tick,
      readyTick:ready.tick,readySiteId:swordSite,siteId:swordSite,eventId:source.id,qiPaid:12,artifactId:starterSword}]);
    expect(intentActor(paid).daoPath?.activations).toEqual(source.daoIntents);
    expect(intentActor(paid).qiProgress).toBe(intentActor(plain).qiProgress-12);
    expect(intentActor(paid).combatPower).toBe(intentActor(plain).combatPower);
    expect(intentActor(paid).daoPath?.ready).toBeUndefined();
    const marks=(world:WorldState,viewer=swordOwner,historical=false)=>
      buildDaoIntentMapVfx(world,createTerrainMapView(world,intentActor(world,viewer),true).isCurrentLocation,historical);
    const site=paid.locations.find(row=>row.id===swordSite)!;
    expect(marks(paid)).toEqual([{pathId:'sword',rank:1,side:0,siteId:swordSite,x:site.x,y:site.y}]);
    expect(marks(paid,'npc-6')).toEqual([]);
    expect(marks(paid,swordOwner,true)).toEqual([]);
    expect(marks(ready)).toEqual([]);
    expect(marks(plain)).toEqual([]);
    const colors:string[]=[];
    const canvas={
      save(){},restore(){},translate(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
      set strokeStyle(value:string){colors.push(value);},
    };
    drawDaoIntentMapVfx(canvas as unknown as CanvasRenderingContext2D,marks(paid),1000,false,1);
    expect(colors).toEqual(['#a5edff']);
    const continued=intentTurn(strict(paid),{[swordOwner]:nativeSwordDuel()});
    expect(ownDuel(continued).daoIntents).toBeUndefined();
    expect(intentActor(continued).daoPath?.activations).toEqual(source.daoIntents);
  });

  it('does not spend a charge when the owner really rebinds to a different original artifact',()=>{
    const {ready}=actualAwakenedSwordIntent();
    const rebound=intentTurn(ready,{[swordOwner]:bindOtherArtifact});
    expect(equippedArtifact(intentActor(rebound))?.id).toBe('artifact-npc-1-2');
    expect(ownedSword(rebound).boundTo).toBeUndefined();
    const fought=intentTurn(rebound,{[swordOwner]:nativeSwordDuel()});
    expect(ownDuel(fought).daoIntents).toBeUndefined();
    expect(intentActor(fought).qiProgress).toBe(intentActor(rebound).qiProgress);
    expect(intentActor(strict(fought)).daoPath?.activations).toEqual([]);
  });
});

it('records separate native furnace, paid array, dark herb and body practice sources',()=>{
  let world=authenticSwordStart();
  world=intentTurn(world,{
    [swordOwner]:{chosenAction:'BUILD_FACILITY',facilityKind:'qi_array',innerMonologue:'以本门库资升级实际聚灵阵。'},
    'npc-5':{chosenAction:'GATHER_HERBS',targetHerbId:'jade_leaf',innerMonologue:'亲手采丹料。'},
    'npc-3':{chosenAction:'GATHER_HERBS',targetHerbId:'shadow_moss',innerMonologue:'亲手采魔渊幽影苔。'},
  });
  expect(world.sects.find(sect=>sect.id==='sect-qingyun')?.facilities.qi_array).toBe(2);
  expect(world.resourceFlow.months.at(-1)?.entries).toContainEqual(expect.objectContaining({
    reason:'facility_construction',refId:'sect-qingyun',
  }));
  world=intentTurn(world,{'npc-3':{chosenAction:'EXPLORE',targetLocationId:'loc-market',innerMonologue:'携自己的幽影苔赴公开坊市。'}});
  expect(intentActor(world,'npc-3').locationId).toBe('loc-market');
  const paths={ [swordOwner]:'formation','npc-5':'alchemy','npc-3':'shadow','npc-8':'body' } as const;
  const orders=(move:'choose'|'practice')=>Object.fromEntries(Object.entries(paths).map(([id,path])=>[id,daoPathOrder(move,path)]));
  const chosen=intentTurn(world,orders('choose'));
  const practiced=intentTurn(chosen,orders('practice'));
  const expected={
    [swordOwner]:{siteId:swordSite,qiPaid:8,stonesPaid:6},
    'npc-5':{siteId:'loc-danxia',qiPaid:8,herbPaid:'jade_leaf'},
    'npc-3':{siteId:'loc-market',qiPaid:10,herbPaid:'shadow_moss'},
    'npc-8':{siteId:intentActor(chosen,'npc-8').locationId,qiPaid:12,hpPaid:4},
  };
  for(const [actorId,pathId] of Object.entries(paths)){
    expect(intentActor(practiced,actorId).daoPath).toMatchObject({pathId,chosenTick:chosen.tick,
      practices:[{tick:practiced.tick,...expected[actorId as keyof typeof expected]}],activations:[]});
    expect(intentActor(chosen,actorId).qiProgress-intentActor(practiced,actorId).qiProgress)
      .toBe(expected[actorId as keyof typeof expected].qiPaid);
  }
  expect(intentActor(chosen,swordOwner).spiritStones-intentActor(practiced,swordOwner).spiritStones).toBe(6);
  expect(intentActor(chosen,'npc-5').herbs.jade_leaf-intentActor(practiced,'npc-5').herbs.jade_leaf).toBe(1);
  expect(intentActor(chosen,'npc-3').herbs.shadow_moss-intentActor(practiced,'npc-3').herbs.shadow_moss).toBe(1);
  expect(intentActor(chosen,'npc-8').hp-intentActor(practiced,'npc-8').hp).toBe(4);
  strict(practiced);
});
