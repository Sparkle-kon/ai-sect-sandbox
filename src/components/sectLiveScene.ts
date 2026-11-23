import {resolveSectLiveSource} from '../engine/sectLiveSources';
import type {SectLiveShow} from '../types/sectLive';
import type {WorldState} from '../types/world';
import {createTerrainMapView} from './terrainMapView';
import {projectSceneStage,type SceneStageFrame} from './sceneStageModel';
import {projectVisualDuelArena,type VisualDuelArenaFrame} from './visualDuelArenaModel';

type LiveScene={readonly kind:'arena';readonly frame:VisualDuelArenaFrame}|
  {readonly kind:'scene';readonly frame:SceneStageFrame};

/** An arena or illustration is subordinate to the exact accepted dated broadcast. */
export function projectSectLiveScene(world:WorldState,show:SectLiveShow):LiveScene|undefined{
  const event=resolveSectLiveSource(world,show);
  if(!event)return;
  const historical=show.tick!==world.tick;
  if(show.bout||show.kind==='combat'||show.kind==='sect_challenge'){
    const source=show.bout?{kind:'tournament' as const,...show.bout}:{kind:show.kind==='sect_challenge'?'sect_challenge' as const:'duel' as const,eventId:event.id};
    const frame=projectVisualDuelArena(world,createTerrainMapView(world,undefined,false),source,{historical});
    if(frame?.siteId===show.siteId&&frame.tick===show.tick)return {kind:'arena',frame};
  }
  const frame=projectSceneStage(world,{eventId:event.id,historical});
  if(frame.sourceId===event.id&&frame.siteId===show.siteId)return {kind:'scene',frame};
}
