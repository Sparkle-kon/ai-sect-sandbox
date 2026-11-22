import type {WorldState} from '../types/world';
import type {MapActorPoint} from './mapActorClusters';

export interface MapDossierFocusRequest {
  readonly world:WorldState;
  readonly scopeKey:string;
  readonly revision:number;
  readonly fog:boolean;
  readonly actorId:string;
}

export function resolveMapDossierFocus(request:MapDossierFocusRequest,current:{
  world:WorldState;scopeKey:string;revision:number;fog:boolean;selectedId:string|null;
  points:readonly MapActorPoint[];
}):MapActorPoint|undefined{
  if(request.world!==current.world||request.scopeKey!==current.scopeKey||request.revision!==current.revision||
    request.fog!==current.fog||request.actorId!==current.selectedId)return undefined;
  const actors=current.world.cultivators.filter(actor=>actor.id===request.actorId);
  if(actors.length!==1||!actors[0].alive||actors[0].hp<=0||actors[0].positionPlane!==undefined)return undefined;
  const points=current.points.filter(point=>point.actor===actors[0]&&Number.isFinite(point.x)&&Number.isFinite(point.y));
  return points.length===1?points[0]:undefined;
}
