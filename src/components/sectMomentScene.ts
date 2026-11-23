import {resolveSectMomentSource} from '../engine/sectMomentSources';
import type {SectMomentSource} from '../types/sectMoments';
import type {WorldState} from '../types/world';
import {projectSceneStage,type SceneStageFrame,type SceneStageSeason} from './sceneStageModel';

const season=(month:number):SceneStageSeason=>month<=3?'spring':month<=6?'summer':month<=9?'autumn':'winter';

/** Moment illustrations show the dated backdrop only: a live roster is never a historical photo. */
export function projectSectMomentScene(world:WorldState,post:SectMomentSource):SceneStageFrame|undefined{
  const event=resolveSectMomentSource(world,post);
  if(!event)return;
  if(post.kind==='food'){
    const leaderId=world.sectManagement?.leaderId;
    if(!leaderId||!post.audience?.includes(leaderId))return;
    // The meal was private; no live cast, weather telemetry, public chronicle link or participant name.
    return {theme:'countryside',siteId:post.siteId,siteName:'本门饭堂',sourceId:event.id,
      season:season(event.month),cast:[],historical:true};
  }
  const scene=projectSceneStage(world,{eventId:event.id,historical:true});
  return scene.sourceId===event.id&&scene.siteId===post.siteId?scene:undefined;
}
