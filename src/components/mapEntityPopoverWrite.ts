import {executeGodIntervention} from '../engine/worldEngine';
import type {WorldState} from '../types/world';
import {buildMapEntityCommand,type MapEntityAction,type MapEntityTarget} from './mapEntityPopoverModel';
import {createTerrainMapView} from './terrainMapView';

interface MapEntityPopoverSource {
  world:WorldState;
  scopeKey:string;
  revision:number;
  viewerId:string|null;
}
export interface MapEntityPopoverBinding extends MapEntityPopoverSource {
  fog:boolean;
  target:MapEntityTarget;
}
export interface MapEntityPopoverWriteContext extends MapEntityPopoverSource {
  canWrite:boolean;
}

/** A map intent is an invitation to recheck one exact source and target, not a generic God Console command. */
export function applyScopedMapEntityIntervention(current:MapEntityPopoverWriteContext,binding:MapEntityPopoverBinding,
  action:MapEntityAction,whisperText?:string):WorldState{
  const {world}=current;
  if(!current.canWrite||binding.fog||binding.world!==world||binding.scopeKey!==current.scopeKey||
    binding.revision!==current.revision||binding.viewerId!==current.viewerId)return world;
  const viewer=current.viewerId===null?undefined:world.cultivators.find(actor=>actor.id===current.viewerId);
  if(current.viewerId!==null&&!viewer)return world;
  const view=createTerrainMapView(world,viewer,false);
  const command=buildMapEntityCommand(world,view,binding.target,action,whisperText);
  return command?executeGodIntervention(world,command):world;
}
