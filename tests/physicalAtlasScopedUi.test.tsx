import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {WorldMapCanvas} from '../src/components/WorldMapCanvas';
import {physicalAtlasMapMarks,planPhysicalAtlasDrawing} from '../src/components/physicalAtlasMap';
import {projectPhysicalAtlas} from '../src/engine/physicalAtlasEngine';
import {encodeEraWorldSave} from '../src/engine/storageEngine';
import {runNativeWestCenterCrossing,tripActor,WEST_TRIP_PAYER} from './fixtures/westCenterNativeFixture';

it('distinguishes the visible prior west-to-center paid crossing from the current westbound free pilgrimage',()=>{
  const {returnInitial:world}=runNativeWestCenterCrossing();
  const original=encodeEraWorldSave(world);
  const payer=tripActor(world,WEST_TRIP_PAYER);
  const outside=world.cultivators.find(row=>row.alive&&row.locationId==='loc-tianji');
  if(!outside)throw Error('Actual distant witness missing');
  const atlas=projectPhysicalAtlas(world,payer);
  expect(atlas?.home?.point.regionId).toBe('west');
  expect(atlas?.home?.locationId).toBeUndefined();
  const drawing=planPhysicalAtlasDrawing(atlas,{cols:world.terrain.columns,rows:world.terrain.rows});
  const marks=physicalAtlasMapMarks(drawing);
  expect(marks.some(mark=>mark.title==='西境至中州：驿路'&&mark.summary.includes('有原生实走凭据'))).toBe(true);
  expect(marks.some(mark=>mark.title==='中州至西境：驿路'&&mark.summary.includes('有原生实走凭据'))).toBe(false);
  expect(marks.every(mark=>!mark.title.includes('东境'))).toBe(true);
  const map=(id:string|null,toolsOpen:boolean)=>
    renderToStaticMarkup(<WorldMapCanvas world={world} selectedCultivatorId={id} onSelectCultivator={()=>undefined} compact toolsOpen={toolsOpen}/>);
  expect(map(payer.id,true)).toContain('现地：西境');
  expect(map(payer.id,true)).toContain('眼下可见界线：西境与中州');
  expect(map(payer.id,true)).toContain('西境至中州：驿路，有原生实走凭据');
  expect(map(payer.id,false)).not.toContain('实地域册');
  expect(map(outside.id,true)).not.toContain('西境至中州：驿路，有原生实走凭据');
  expect(map(null,true)).not.toContain('实地域册');
  expect(projectPhysicalAtlas(world,{...payer})).toBeUndefined();
  expect(encodeEraWorldSave(world)).toBe(original);
});
