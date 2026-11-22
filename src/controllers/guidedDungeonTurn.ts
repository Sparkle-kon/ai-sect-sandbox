import {availableDungeonMoves,type DungeonOption} from '../engine/expeditionDungeonEngine';
import type {LLMDecisionPayload,WorldState} from '../types/world';

export interface GuidedDungeonTurn {
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:DungeonOption;
}

export function resolveGuidedDungeonTurn(request:GuidedDungeonTurn,world:WorldState,branchId:string,revision:number):
  {actorId:string;decision:LLMDecisionPayload}|undefined{
  if(request.world!==world||request.branchId!==branchId||request.revision!==revision)return undefined;
  const actors=world.cultivators.filter(row=>row.id===request.actorId);
  if(actors.length!==1)return undefined;
  const selected=request.option;
  const current=availableDungeonMoves(world,actors[0],world.tick+1).find(option=>
    option.action==='EXPEDITION_DUNGEON'&&option.targetOccasionId===selected.targetOccasionId&&option.dungeonMove===selected.dungeonMove&&option.targetDungeonRoomId===selected.targetDungeonRoomId);
  if(!current)return undefined;
  return {actorId:request.actorId,decision:{chosenAction:'EXPEDITION_DUNGEON',targetOccasionId:current.targetOccasionId,
    dungeonMove:current.dungeonMove,targetDungeonRoomId:current.targetDungeonRoomId,innerMonologue:'亲历此地，依当月确有的路与阵门行动。'}};
}
