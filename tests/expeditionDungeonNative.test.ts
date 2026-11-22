import {describe,expect,it} from 'vitest';
import {availableDungeonMoves,projectExpeditionDungeon} from '../src/engine/expeditionDungeonEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import type {WorldState} from '../src/types/world';
import {actualNativeDungeonGate,dungeonActor,dungeonCompanion,dungeonExplorer,dungeonMonth,dungeonMove,dungeonOccasionIn,dungeonOrigin,dungeonOutsider,enterNativeDungeon} from './expeditionDungeonNativeFixture';

function strict(world:WorldState){
  const raw=encodeEraWorldSave(world),restored=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(restored)).toBe(raw);
  return restored;
}

describe('three room dungeon in a genuine scoped expedition',()=>{
  it('reaches the live native gate only through actual paid observation and legal registration',()=>{
    const {entered,occasion}=actualNativeDungeonGate();
    expect(entered.events).toContainEqual(expect.objectContaining({
      id:`evt-${entered.tick}-${occasion.id}-commence`,witnessScope:'participants',
    }));
    expect(occasion.dungeon).toBeUndefined();
    expect(dungeonActor(entered,dungeonOutsider).locationId).not.toBe(occasion.locationId);
  });

  it('survives actual outer garden, paid array, real boss HP, and one original loot claim',()=>{
    const {world:garden}=enterNativeDungeon();
    const before=dungeonActor(garden),start=dungeonOccasionIn(garden).dungeon!;
    expect(availableDungeonMoves(garden,before,garden.tick+1).map(row=>row.dungeonMove)).not.toContain('claim');
    expect(availableDungeonMoves(garden,before,garden.tick+1).map(row=>row.dungeonMove)).not.toContain('strike');
    const outsider=dungeonActor(garden,dungeonOutsider);
    expect(availableDungeonMoves(garden,outsider,garden.tick+1)).toEqual([]);
    expect(projectExpeditionDungeon(garden,outsider,dungeonOccasionIn(garden).id)).toBeUndefined();
    const herbs=dungeonMove(strict(garden),'gather','garden');
    const picked=dungeonOccasionIn(herbs).dungeon!;
    expect(picked.room).toBe('hall');
    expect(picked.steps.at(-1)).toMatchObject({move:'gather',tick:herbs.tick,jadeLeaf:1});
    expect(dungeonActor(herbs).herbs.jade_leaf-before.herbs.jade_leaf).toBe(1);
    const seal=dungeonMove(strict(herbs),'break_array','hall');
    const charge=dungeonOccasionIn(seal).dungeon!.steps.at(-1);
    expect(dungeonOccasionIn(seal).dungeon?.room).toBe('sanctum');
    expect(charge).toMatchObject({move:'break_array',tick:seal.tick,qiPaid:18});
    expect(dungeonActor(herbs).qiProgress-dungeonActor(seal).qiProgress).toBe(18);
    let world=seal;
    for(let i=0;i<4&&dungeonOccasionIn(world).dungeon!.bossHp>0;i++){
      const oldBoss=dungeonOccasionIn(world).dungeon!.bossHp,oldHp=dungeonActor(world).hp;
      world=dungeonMove(strict(world),'strike','sanctum');
      const current=dungeonOccasionIn(world).dungeon!,hit=current.steps.at(-1);
      expect(current.room).toBe('sanctum');
      expect(hit).toMatchObject({move:'strike',tick:world.tick,bossBefore:oldBoss,bossAfter:current.bossHp,
        hpLost:oldHp-dungeonActor(world).hp});
      expect(current.bossHp).toBeLessThan(oldBoss);
    }
    const won=dungeonOccasionIn(world).dungeon!;
    expect(won.bossHp).toBe(0);
    const money=dungeonActor(world).spiritStones;
    const held=dungeonMove(strict(world),'claim','sanctum'),outcome=dungeonOccasionIn(held).dungeon!;
    const claim=outcome.steps.at(-1);
    expect(claim).toMatchObject({move:'claim',tick:held.tick,stones:80});
    if(claim?.move!=='claim')throw Error('Native boss got no lawful original award');
    expect(dungeonActor(held).spiritStones-money).toBe(80);
    expect(dungeonActor(held).artifacts).toContainEqual(expect.objectContaining({id:claim.artifactId}));
    expect(outcome.outcome).toBeUndefined(); // The reward is in hand, but the body still has to reach the original exit.
    expect(availableDungeonMoves(held,dungeonActor(held),held.tick+1).some(row=>row.dungeonMove==='claim')).toBe(false);
    expect(held.events).toContainEqual(expect.objectContaining({id:claim.eventId,witnessScope:'participants',actorIds:[dungeonExplorer]}));
    expect(dungeonActor(held).locationId).toBe(dungeonOccasionIn(held).locationId);
    expect(start.steps).toHaveLength(1);
    const escaped=dungeonMove(strict(held),'retreat','sanctum');
    expect(dungeonActor(escaped).locationId).toBe(dungeonOrigin);
    expect(dungeonOccasionIn(escaped).dungeon).toMatchObject({outcome:'claimed',closedTick:escaped.tick,
      members:[{actorId:dungeonExplorer,leftTick:escaped.tick,exit:'escaped'}]});
    const again=dungeonMove(strict(escaped),'claim','sanctum');
    expect(dungeonOccasionIn(again).dungeon?.steps.filter(row=>row.move==='claim')).toEqual([claim]);
    expect(dungeonActor(again).artifacts.filter(row=>row.id===claim.artifactId)).toHaveLength(1);
  });

  it('returns a deliberate retreat to the actual anchor and distinguishes true untreated timeout',()=>{
    const {world:garden}=enterNativeDungeon();
    const first=dungeonOccasionIn(garden).dungeon!;
    const away=dungeonMove(strict(garden),'retreat','garden');
    expect(dungeonActor(away).locationId).toBe(dungeonOrigin);
    expect(dungeonOccasionIn(away).dungeon).toMatchObject({outcome:'retreated',closedTick:away.tick,
      members:[{actorId:dungeonExplorer,leftTick:away.tick,exit:'retreated'}]});
    let waiting=garden;
    const end=dungeonOccasionIn(garden).expiresTick;
    while(waiting.tick<end)waiting=dungeonMonth(waiting);
    expect(dungeonOccasionIn(waiting).dungeon).toMatchObject({closedTick:waiting.tick,outcome:'collapsed',
      members:[{actorId:dungeonExplorer,leftTick:waiting.tick,exit:'collapse'}]});
    expect(dungeonActor(waiting).locationId).toBe(dungeonOrigin);
    const member=dungeonOccasionIn(waiting).dungeon?.members[0];
    expect(member?.hpLost).toBeGreaterThan(0);
    expect(dungeonActor(garden).hp-dungeonActor(waiting).hp).toBe(member?.hpLost);
    expect(dungeonOccasionIn(waiting).dungeon?.steps).toEqual(first.steps);
    expect(waiting.locations.some(row=>row.id===dungeonOccasionIn(waiting).locationId)).toBe(false);
    expect(strict(waiting).tick).toBe(end);
  });

  it('admits one real later companion using a physically received local hint, not the hidden roster',()=>{
    const {entered,occasion}=actualNativeDungeonGate(true);
    expect(new Set(occasion.participantIds)).toEqual(new Set([dungeonExplorer,dungeonCompanion]));
    const first=dungeonMove(entered,'enter','garden');
    const joined=dungeonMove(strict(first),'enter','garden',dungeonCompanion);
    const run=dungeonOccasionIn(joined).dungeon!;
    expect(run.members).toEqual([{actorId:dungeonExplorer,enteredTick:first.tick},
      {actorId:dungeonCompanion,enteredTick:joined.tick}]);
    expect(run.steps.map(row=>[row.move,row.actorId])).toEqual([['enter',dungeonExplorer],['enter',dungeonCompanion]]);
    expect(projectExpeditionDungeon(joined,dungeonActor(joined,dungeonCompanion),occasion.id)).toBeDefined();
    expect(projectExpeditionDungeon(joined,dungeonActor(joined,dungeonOutsider),occasion.id)).toBeUndefined();
  });
});
