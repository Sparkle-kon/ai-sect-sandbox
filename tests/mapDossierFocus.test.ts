import {describe,expect,it} from 'vitest';
import {resolveMapDossierFocus} from '../src/components/mapDossierFocus';
import {createTerrainMapView,mapActorPositions} from '../src/components/terrainMapView';
import {createInitialWorld} from '../src/data/initialWorld';

describe('dossier focus operates only on this painted actor',()=>{
  it('focuses the exact current position and rejects changes of sibling frame, revision, fog, selection and authority',()=>{
    const world=createInitialWorld(),actor=world.cultivators[0],view=createTerrainMapView(world,actor,true);
    const points=mapActorPositions(view.seenLocations,view.liveActors,view.trailPositions);
    const request={world,scopeKey:'root',revision:7,fog:true,actorId:actor.id};
    const frame={world,scopeKey:'root',revision:7,fog:true,selectedId:actor.id,points};
    const source=points.find(row=>row.actor===actor)!;
    expect(resolveMapDossierFocus(request,frame)).toBe(source);
    for(const invalid of [
      {...frame,world:structuredClone(world)},{...frame,scopeKey:'fork'},{...frame,revision:8},
      {...frame,fog:false},{...frame,selectedId:world.cultivators[1].id},{...frame,points:[]},
      {...frame,points:[{...source,actor:{...actor}}]},{...frame,points:[source,source]},
    ])expect(resolveMapDossierFocus(request,invalid)).toBeUndefined();
    actor.alive=false;
    expect(resolveMapDossierFocus(request,frame)).toBeUndefined();
  });
});
