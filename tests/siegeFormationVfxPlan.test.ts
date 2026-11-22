import {describe,expect,it} from 'vitest';
import {createTerrainMapView,mapActorPositions} from '../src/components/terrainMapView';
import {projectSiegeFormationVfx} from '../src/components/siegeFormationVfxPlan';
import {possessAvatar} from '../src/engine/avatarEngine';
import {queueGrandSiegeHero} from '../src/engine/grandSiegeTheatreEngine';
import type {WorldState} from '../src/types/world';
import {actualGrandSiege,actualSiege,disciple,location,patriarch,siegeActor,siegeSect,siegeTurn} from './grandSiegeNativeFixture';

function input(world:WorldState,viewerId?:string,fog=false){
  const viewer=viewerId?siegeActor(world,viewerId):undefined;
  const view=createTerrainMapView(world,viewer,fog);
  const sites=new Map(view.seenLocations.map(site=>[site.id,site]));
  const points=mapActorPositions(view.seenLocations,view.liveActors,view.trailPositions);
  return {sites,visible:view.isCurrentLocation,points};
}
function project(world:WorldState,viewerId?:string,fog=false){
  const {sites,visible,points}=input(world,viewerId,fog);
  return projectSiegeFormationVfx(world,sites,visible,points);
}
const coordinates=({x,y}:{x:number;y:number})=>({x,y});

describe('array eye, actual breath and struck-only siege visual projection',()=>{
  it('opens only after a real native array hit and draws witnessed vanguard damage plus real local cultivation',()=>{
    const {arrived}=actualGrandSiege();
    expect(project(arrived)).toEqual([]);
    const fought=siegeTurn(arrived,{[disciple]:{chosenAction:'CULTIVATE',innerMonologue:'守在山门调息。'}});
    expect(siegeActor(fought,disciple).ordinaryActionEvidence).toMatchObject({action:'CULTIVATE',tick:fought.tick});
    const round=actualSiege(fought).theatre!.rounds[0],clash=round.clash!;
    const {sites,points}=input(fought);
    const site=sites.get(location)!;
    const at=(id:string)=>coordinates(points.find(row=>row.actor.id===id)!);
    expect(round.wallBefore).toBeGreaterThan(round.wallAfter);
    const [frame]=project(fought);
    expect(frame).toMatchObject({sourceId:round.sourceEventId,center:coordinates(site)});
    expect(frame.breaths).toContainEqual(at(disciple));
    expect(frame.hits).toEqual([
      {from:at(clash.defenderId),to:at(clash.attackerId),kind:'vanguard'},
      {from:at(clash.attackerId),to:at(clash.defenderId),kind:'vanguard'},
    ]);
    expect(frame.guard).toBeUndefined();
    expect(project(fought,undefined,true)).toEqual([]);
  });

  it('shows paid independent native defending guard, never labels it a signature or awards an offered hold',()=>{
    const {arrived,siege}=actualGrandSiege(),first=siegeTurn(arrived);
    expect(possessAvatar(first,patriarch)).toBe(true);
    const paid=siegeTurn(queueGrandSiegeHero(first,patriarch,siege.id,'leader-last-stand'));
    const wait=siegeTurn(queueGrandSiegeHero(first,patriarch,siege.id,'hold'));
    const round=actualSiege(paid).theatre!.rounds[1];
    expect(round.hero).toMatchObject({actorId:patriarch,paidQi:18,paidHp:12});
    const projected=project(paid)[0];
    expect(projected.guard).toEqual(coordinates(input(paid).points.find(row=>row.actor.id===patriarch)!));
    expect(projected.hits).toEqual([]);
    expect(project(wait)[0]?.guard).toBeUndefined();
  });

  it('fails closed on an unopened array, duplicated/private originals and false witness points',()=>{
    const {arrived}=actualGrandSiege();
    const fought=siegeTurn(arrived,{[disciple]:{chosenAction:'CULTIVATE',innerMonologue:'守在山门调息。'}});
    const round=actualSiege(fought).theatre!.rounds[0];
    const blocked=structuredClone(fought);
    siegeSect(blocked).facilities.defense_array=0;
    expect(project(blocked)).toEqual([]);
    const stale=structuredClone(fought),source=stale.events.find(event=>event.id===round.sourceEventId)!;
    stale.events.push({...source});
    expect(project(stale)).toEqual([]);
    const privateFront=structuredClone(fought);
    privateFront.events.find(event=>event.id.endsWith('-front-theatre'))!.witnessScope='participants';
    expect(project(privateFront)[0]?.hits).toEqual([]);
    const {sites,visible,points}=input(fought);
    const forged=points.map(p=>({...p,actor:{...p.actor}}));
    expect(projectSiegeFormationVfx(fought,sites,visible,forged)).toEqual([
      expect.objectContaining({sourceId:round.sourceEventId,breaths:[],hits:[]}),
    ]);
  });
});
