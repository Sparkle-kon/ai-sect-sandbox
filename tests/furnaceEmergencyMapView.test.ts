import {expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {receipt} from '../src/engine/furnaceEmergencyProof';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {visibleFurnaceEmergencyRescueSegments} from '../src/components/furnaceEmergencyMapView';
import type {FurnaceEmergencyCase} from '../src/types/furnaceEmergency';

it('admits only a corroborated public current rescue edge and respects the visible map scope',()=>{
  // A narrow synthetic projector theorem; end-to-end rescue is exercised in furnaceEmergencyNative.
  const world=applyMapBrush(createInitialWorld(1,'spirit-bloom'),'paint_vein',[{x:260,y:460}]);
  world.tick=21;
  const pair=world.cultivators.filter(actor=>['npc-5','npc-6'].includes(actor.id));
  const refuge='brush-vein-tile-6-11';
  for(const person of pair)person.locationId=refuge;
  const row:FurnaceEmergencyCase={id:'furnace-emergency-furnace-safety-1-npc-6',safetyId:'furnace-safety-1',siteId:'loc-danxia',
    studentId:'npc-6',mentorId:'npc-5',tuitionId:'tuition',usedTick:17,damagedTick:18,hazardId:'beast-tide',injuryEventId:'injury',injuryHp:36,
    decision:{move:'request_rescue',tick:19,acceptedTick:20,refugeId:refuge}};
  world.furnaceEmergencies={cases:[row]};
  const viewer=pair[0],view=createTerrainMapView(world,viewer,false);
  expect(visibleFurnaceEmergencyRescueSegments(world,view,viewer)).toEqual([]);
  row.decision!.crossedTick=21;
  const original=receipt(world,row,'crossed');
  world.events.push(original);
  expect(visibleFurnaceEmergencyRescueSegments(world,view,viewer)).toEqual([{from:{x:210,y:450},to:{x:260,y:460}}]);
  expect(visibleFurnaceEmergencyRescueSegments(world,view)).toEqual([]);
  expect(visibleFurnaceEmergencyRescueSegments(world,view,{...viewer})).toEqual([]);
  expect(visibleFurnaceEmergencyRescueSegments(world,{...view,isCurrentLocation:id=>id!==refuge&&view.isCurrentLocation(id)},viewer)).toEqual([]);
  world.events.push({...original,witnessScope:'participants'});
  expect(visibleFurnaceEmergencyRescueSegments(world,view,viewer)).toEqual([]);
});
