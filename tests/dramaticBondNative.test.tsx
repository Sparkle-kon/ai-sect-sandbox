import {renderToStaticMarkup} from 'react-dom/server';
import {PublicBondAside} from '../src/components/DramaticBondRead';
import {useDramaticBondRead} from '../src/components/useDramaticBondRead';
import {describe,expect,it} from 'vitest';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {projectDramaticBondArcs} from '../src/engine/dramaticBondEngine';
import type {WorldState} from '../src/types/world';
import {actualCommonBond,actualDefenderWinsLethally,actualPrivateBond,bondActor,bondEdge,bondSite,bondTurn,firstId,nearId,secondId,observerId} from './dramaticBondNativeFixture';

function strict(world:WorldState){
  const raw=encodeEraWorldSave(world),restored=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(restored)).toBe(raw);
  return restored;
}

const publicRead=(world:WorldState)=>{
  const reader=bondActor(world,observerId);
  const view=createTerrainMapView(world,reader,false);
  const currentVisibleSiteIds=new Set(view.seenLocations.filter(site=>view.isCurrentLocation(site.id)).map(site=>site.id));
  return projectDramaticBondArcs(world,{viewerId:reader.id,throughTick:world.tick,currentVisibleSiteIds});
};

function SharedRead({world}:{world:WorldState}){
  const reading=useDramaticBondRead(world,bondActor(world,observerId),false,{story:true,dossier:false,allowPersonal:false});
  return <PublicBondAside arc={reading.subplot}/>;
}

describe('dramatic bonds use genuine public facts, not the current private relationship graph',()=>{
  it('cannot distinguish two native siblings by a private scheme even across the blood-feud threshold',()=>{
    const {clash}=actualCommonBond();
    const base=encodeEraWorldSave(clash),settled=bondTurn(strict(clash)),secret=actualPrivateBond(strict(clash));
    expect(secret.tick).toBe(settled.tick);
    expect(bondEdge(settled)).toMatchObject({affinity:-39,type:'师徒'});
    expect(bondEdge(secret)).toMatchObject({affinity:-64,type:'血仇'});
    const scheme=secret.events.find(event=>event.id===`evt-${secret.tick}-${firstId}-scheme`)!;
    expect(scheme).toMatchObject({witnessScope:'participants',actorIds:[firstId,secondId],locationId:bondSite});
    expect(bondActor(secret,secondId).spiritStones).toBeLessThan(bondActor(settled,secondId).spiritStones);
    expect(secret.dramaticBonds?.facts).toEqual(settled.dramaticBonds?.facts);
    expect(publicRead(settled)).not.toEqual([]);
    expect(publicRead(strict(secret))).toEqual(publicRead(strict(settled)));
    const control=renderToStaticMarkup(<SharedRead world={settled}/>);
    expect(control).toContain('公开故事支线');
    expect(renderToStaticMarkup(<SharedRead world={secret}/>)).toBe(control);
    expect(JSON.stringify(publicRead(secret))).not.toContain(scheme.description);
    expect(encodeEraWorldSave(clash)).toBe(base);
  });

  it('records the actual defender as the winner and never swaps in a separate same-name fighter',()=>{
    const {clash}=actualCommonBond();
    const a=actualDefenderWinsLethally(strict(clash)),b=actualDefenderWinsLethally(strict(clash),nearId);
    expect(a.death.id).toBe(b.death.id); // Both real siblings use the same initiator and tick.
    expect(bondActor(a.world,secondId).name).toBe(bondActor(a.world,nearId).name);
    expect(a.world.dramaticBonds?.facts).toContainEqual(expect.objectContaining({
      kind:'lethal_duel',sourceEventId:a.death.id,actorIds:[firstId,secondId],winnerId:secondId,fallenId:firstId,
    }));
    expect(b.world.dramaticBonds?.facts).toContainEqual(expect.objectContaining({
      kind:'lethal_duel',sourceEventId:b.death.id,actorIds:[firstId,nearId],winnerId:nearId,fallenId:firstId,
    }));
    const publicA=publicRead(strict(a.world)),publicB=publicRead(strict(b.world));
    const pair=[firstId,secondId];
    const exactA=publicA.find(arc=>JSON.stringify(arc.actorIds)===JSON.stringify(pair));
    const exactB=publicB.find(arc=>JSON.stringify(arc.actorIds)===JSON.stringify(pair));
    expect(exactA?.lastTick).toBe(a.death.tick);
    expect(exactA?.milestones.at(-1)?.text).toBe(
      `斗法既罢，${bondActor(a.world,secondId).name}胜出，${bondActor(a.world).name}未能离开战地。`);
    expect(exactB?.lastTick).toBe(clash.tick);
    expect(exactB?.milestones.some(row=>row.text.includes('未能离开战地'))).toBe(false);
    expect(publicB.some(arc=>arc.actorIds.includes(nearId))).toBe(false); // One independent scene is not a bonded arc.
    expect(publicA).not.toEqual(publicB);
    expect(bondActor(a.world,nearId).alive).toBe(true);
    expect(bondActor(b.world,secondId).alive).toBe(true);
    expect(encodeEraWorldSave(bondTurn(strict(a.world)))).toBe(encodeEraWorldSave(bondTurn(a.world)));
  });
});
