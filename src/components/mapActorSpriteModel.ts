import type {Cultivator,WorldState} from '../types/world';
import {projectCanonicalCultivatorPortraits,type CultivatorPortraitSpec} from './cultivatorPortraitModel';
import {mapTransitActorIds} from './mapConvoyView';
import type {SceneStagePose} from './sceneStageModel';
import type {createTerrainMapView} from './terrainMapView';

type TerrainView=ReturnType<typeof createTerrainMapView>;
export interface MapActorSpriteModel {
  readonly id:string;
  readonly appearance:CultivatorPortraitSpec;
  readonly pose:SceneStagePose;
}

const unique=<T extends {id:string}>(rows:Iterable<T>)=>{
  const output=new Map<string,T|undefined>();
  for(const row of rows)output.set(row.id,output.has(row.id)?undefined:row);
  return output;
};
const ambientPose=(actor:Cultivator):SceneStagePose=>{
  if(actor.currentAction==='REST'||actor.currentAction==='CULTIVATE')return 'cultivate';
  if(actor.currentAction==='GATHER_HERBS'||actor.currentAction==='BREW_PILL'||actor.currentAction==='HEAVENLY_ALCHEMY')return 'labor';
  return 'idle';
};

/** One projected appearance per actual painted candidate; never queries or expands the view per marker. */
export function buildMapActorSpriteModels(world:WorldState,view:TerrainView,
  paintedActors:readonly {readonly actor:Cultivator}[]):ReadonlyMap<string,MapActorSpriteModel>{
  const output=new Map<string,MapActorSpriteModel>();
  if(!paintedActors.length)return output;
  const admitted=unique(view.liveActors);
  const places=unique(view.seenLocations),canonicalPlaces=unique(world.locations);
  const underway=mapTransitActorIds(world);
  const candidates:Cultivator[]=[];
  for(const actor of unique(paintedActors.map(point=>point.actor)).values()){
    if(!actor||admitted.get(actor.id)!==actor||!actor.alive||!Number.isFinite(actor.hp)||actor.hp<=0||
      actor.positionPlane!==undefined)continue;
    if(!view.trailPositions.has(actor.id)){
      if(underway.has(actor.id))continue; // A convoy's nominal origin is not its current physical address.
      const site=places.get(actor.locationId);
      const tile=site&&view.locationTile.get(site.id);
      if(!site||canonicalPlaces.get(site.id)!==site||!tile||view.tileState(tile)!=='visible'||
        !view.isCurrentLocation(site.id))continue;
    }
    candidates.push(actor);
  }
  const appearances=projectCanonicalCultivatorPortraits(world,candidates);
  if(!appearances.size)return output;
  const grounded=new Map(candidates.filter(actor=>appearances.has(actor.id)&&
    !view.trailPositions.has(actor.id)&&!underway.has(actor.id)).map(actor=>[actor.id,actor]));
  const poseByActor=new Map<string,SceneStagePose>();
  for(const event of unique(world.events).values()){
    if(!event||event.witnessScope!==undefined||event.tick!==world.tick||event.year!==world.year||event.month!==world.month||
       event.actorIds.length!==2||event.actorIds[0]===event.actorIds[1]||!event.locationId)continue;
    const [speakerId,targetId]=event.actorIds;
    const speaker=grounded.get(speakerId),target=grounded.get(targetId);
    if(!speaker||!target||speaker.locationId!==event.locationId||target.locationId!==event.locationId)continue;
    const prefix=`evt-${world.tick}-${speakerId}`;
    const duel=event.category==='combat'&&event.id===prefix+'-duel'&&
      (event.duelWinnerId===speakerId||event.duelWinnerId===targetId);
    const talk=event.category==='diplomacy'&&event.id===prefix+'-social'&&event.title===`${speaker.name}与${target.name}坐而论道`;
    if(duel||talk)for(const id of event.actorIds)if(duel||!poseByActor.has(id))poseByActor.set(id,duel?'fight':'talk');
  }
  for(const actor of candidates){
    const appearance=appearances.get(actor.id);
    if(!appearance)continue;
    const pose=grounded.has(actor.id)?poseByActor.get(actor.id)??ambientPose(actor):'idle';
    output.set(actor.id,{id:actor.id,appearance,pose});
  }
  return output;
}
