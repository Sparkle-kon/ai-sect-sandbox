import {describe,expect,it} from 'vitest';
import {resolveGuidedDungeonTurn} from '../src/controllers/guidedDungeonTurn';
import {expeditionDungeonMapMark} from '../src/components/expeditionDungeonMapMark';
import {availableDungeonMoves} from '../src/engine/expeditionDungeonEngine';
import {actualNativeDungeonGate,dungeonActor,dungeonExplorer,dungeonMonth,dungeonOccasionIn,dungeonOutsider} from './expeditionDungeonNativeFixture';

describe('same-view single native dungeon guidance',()=>{
  it('admits only the exact real person, turn, branch, room and choice',()=>{
    const gate=actualNativeDungeonGate();
    const world=gate.entered;
    const option=availableDungeonMoves(world,dungeonActor(world),world.tick+1).find(choice=>choice.dungeonMove==='enter')!;
    expect(option).toBeDefined();
    const request={world,branchId:'main',revision:3,actorId:dungeonExplorer,option};
    const canonical=resolveGuidedDungeonTurn(request,world,'main',3);
    expect(canonical?.decision).toMatchObject({chosenAction:'EXPEDITION_DUNGEON',dungeonMove:'enter',targetDungeonRoomId:'garden'});
    expect(resolveGuidedDungeonTurn({...request,actorId:dungeonOutsider},world,'main',3)).toBeUndefined();
    expect(resolveGuidedDungeonTurn(request,structuredClone(world),'main',3)).toBeUndefined();
    expect(resolveGuidedDungeonTurn(request,world,'other',3)).toBeUndefined();
    expect(resolveGuidedDungeonTurn(request,world,'main',4)).toBeUndefined();
    expect(resolveGuidedDungeonTurn({...request,option:{...option,targetDungeonRoomId:'sanctum'}},world,'main',3)).toBeUndefined();
    const advanced=dungeonMonth(world,{[dungeonExplorer]:canonical!.decision});
    expect(advanced.tick).toBe(world.tick+1);
    expect(dungeonOccasionIn(advanced).dungeon?.members).toMatchObject([{actorId:dungeonExplorer,enteredTick:advanced.tick}]);
    expect(dungeonOccasionIn(world).dungeon).toBeUndefined();
    expect(expeditionDungeonMapMark(advanced,dungeonActor(advanced),()=>true)).toEqual({siteId:dungeonOccasionIn(advanced).locationId,room:'garden'});
    expect(expeditionDungeonMapMark(advanced,dungeonActor(advanced,dungeonOutsider),()=>true)).toBeUndefined();
    expect(expeditionDungeonMapMark(advanced,dungeonActor(advanced),()=>false)).toBeUndefined();
  });
});
