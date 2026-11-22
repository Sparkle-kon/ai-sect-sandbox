import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {FrontierChart,frontierChartGeometry,paintFrontierChart} from '../src/components/FrontierChart';
import {UpperArrayFieldPanel} from '../src/components/UpperArrayFieldPanel';
import {buildCanvasBiomeRelief} from '../src/components/canvasBiomeShader';
import {buildQiFlowPlan} from '../src/components/qiFlowCanvas';
import {visibleFormationMapLinks} from '../src/components/formationMapView';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {createInitialWorld} from '../src/data/initialWorld';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {availableUpperArrayFieldMovementActions,projectUpperArrayFieldMovement,type UpperArrayFieldMovementOption}
  from '../src/engine/upperArrayFieldMovementEngine';
import {UPPER_ARRAY_FIELD_SITES,upperArrayFieldEdge} from '../src/engine/upperArrayFieldTerms';
import {availableUpperPassageActions} from '../src/engine/upperPassageEngine';
import type {UpperPassageMove} from '../src/engine/upperPassageTerms';
import {availableWaterVeinActions} from '../src/engine/waterVeinEngine';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const travelerId='elder-danxia-1',north='loc-vein-north';
const traveler=(state:WorldState)=>state.cultivators.find(row=>row.id===travelerId)!;
const order=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,...fields,innerMonologue:'按旧井实账与原身实际来路，与人同在。'});
function requireValue<T>(value:T|undefined,why:string):T{if(value===undefined)throw Error(why);return value;}
function turn(world:WorldState,decision=order('REST'),also:Readonly<Record<string,LLMDecisionPayload>>={}){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,row.id===travelerId?decision:also[row.id]??order('REST')])),()=>.99,'utility');
}
function oldStep(world:WorldState,move:UpperPassageMove){
  const option=requireValue(availableUpperPassageActions(traveler(world),world,world.tick+1).find(row=>row.upperPassageMove===move),
    'Passage option must be actually available to the same traveler');
  const {action,...fields}=option;
  return turn(world,order(action,fields));
}
function fieldStep(world:WorldState,move:UpperArrayFieldMovementOption['upperArrayFieldMove'],
  target:UpperArrayFieldMovementOption['targetUpperArrayFieldSiteId']){
  const option=requireValue(availableUpperArrayFieldMovementActions(traveler(world),world,world.tick+1)
    .find(row=>row.upperArrayFieldMove===move&&row.targetUpperArrayFieldSiteId===target),'Real contiguous field movement required');
  const {action,...fields}=option;
  return turn(world,order(action,fields));
}
function counsel(){
  let world=createInitialWorld(1,'spirit-bloom');
  const body=traveler(world),known=knownMapLocations(world,body);
  const knownNorth=known.some(site=>site.id===north),unknown=world.locations.filter(site=>site.id!==body.locationId&&!known.includes(site));
  const choice=unknown.findIndex(site=>site.id===north);
  expect(knownNorth||choice>=0).toBe(true);
  // Same seeded E4-6 acceptance: choose actual offered EXPLORE hit, not a new location or teleport assignment.
  let calls=0;
  applyCultivatorBrainDecision(world,body,order('EXPLORE',knownNorth?{targetLocationId:north}:{}),
    ()=>!knownNorth&&calls++===0?(choice+.2)/unknown.length:.99);
  expect(traveler(world).locationId).toBe(north);
  const village=requireValue(world.settlements.villages.find(row=>row.locationId===north),'Real native settlement at the existing north');
  world=turn(world,order('GATHER_HERBS',{targetHerbId:'earth_root'}));
  world=turn(world,order('VILLAGE_WORKS',{targetSettlementId:village.id,villageWorkKind:'well'}));
  world=turn(world,order('GATHER_HERBS',{targetHerbId:'earth_root'}));
  world=turn(world);
  expect(world.villageWorks.projects[0]).toMatchObject({kind:'well',status:'completed',laborTotal:4});
  world=turn(world,order('WATER_VEIN',{waterVeinMove:'open',targetLocationId:north}));
  world=oldStep(world,'enter');
  for(let i=0;i<3;i++)world=oldStep(world,'advance');
  world=oldStep(world,'read');
  world=oldStep(world,'advance');
  return oldStep(world,'petition');
}
const room=(world:WorldState,readerId=travelerId)=>renderToStaticMarkup(<UpperArrayFieldPanel nowTick={world.tick}
  movement={projectUpperArrayFieldMovement(world,world.cultivators.find(row=>row.id===readerId))}/>);

describe('upper array visual boundary on an actual native crossover',()=>{
  it('does not draw an unentered or foreign chart, admits exactly authorized current cells, and clears after a real exit',()=>{
    const atCouncil=counsel(),outer=projectUpperArrayFieldMovement(atCouncil,traveler(atCouncil));
    expect(atCouncil.locations.some(site=>site.id==='realm-upper-council'||site.id.startsWith('array-field-'))).toBe(false);
    expect(outer).toMatchObject({scope:'council',visibleSites:[]});
    expect(room(atCouncil)).not.toContain('<canvas');
    expect(atCouncil.upperArrayField).toBeUndefined();
    const beforeStones=traveler(atCouncil).spiritStones;
    const entered=fieldStep(atCouncil,'enter','array-field-gate');
    expect(traveler(entered)).toMatchObject({positionPlane:'upper',locationId:'array-field-gate',spiritStones:beforeStones-4});
    expect(entered.cultivators.filter(row=>row.id===travelerId)).toHaveLength(1);
    expect(entered.locations.some(site=>site.id.startsWith('array-field-'))).toBe(false);
    const motion=requireValue(projectUpperArrayFieldMovement(entered,traveler(entered)),'Real authorized current chart');
    const active=requireValue(motion.site,'Actual point');
    expect(motion.scope).toBe('field');
    const permitted=UPPER_ARRAY_FIELD_SITES.filter(site=>site.id===active.id||upperArrayFieldEdge(site.id,active.id));
    expect(motion.visibleSites.map(site=>site.id)).toEqual(permitted.map(site=>site.id));
    const chart={chartId:motion.chartId,name:'阵原',rows:3,cols:3,currentTileId:active.id,
      tiles:motion.visibleSites.map(site=>({...site,tileId:site.id}))};
    const geometry=requireValue(frontierChartGeometry(chart),'Final visible geometry');
    expect(geometry.tiles.map(row=>row.tileId).sort()).toEqual(permitted.map(site=>site.id).sort());
    expect(geometry.active.tileId).toBe(active.id);
    // Drive the exact paint routine on the real scoped plan, not a browser/pixel assertion.
    const clip=vi.fn(),fillText=vi.fn<(label:string,x:number,y:number,maxWidth?:number)=>void>();
    const canvas={clearRect:vi.fn(),fillRect:vi.fn(),strokeRect:vi.fn(),save:vi.fn(),restore:vi.fn(),
      beginPath:vi.fn(),rect:vi.fn(),clip,translate:vi.fn(),scale:vi.fn(),
      createLinearGradient:vi.fn(()=>({addColorStop:vi.fn()})),moveTo:vi.fn(),lineTo:vi.fn(),
      closePath:vi.fn(),stroke:vi.fn(),strokeText:vi.fn(),fillText} as unknown as CanvasRenderingContext2D;
    paintFrontierChart(canvas,geometry);
    expect(clip).toHaveBeenCalledTimes(permitted.length);
    expect(fillText.mock.calls.filter(([name])=>!/\d·\d/u.test(name)).map(([name])=>name).sort())
      .toEqual(permitted.map(site=>site.name).sort());
    const html=room(entered),direct=renderToStaticMarkup(<FrontierChart chart={chart}/>);
    expect(html.match(/<canvas\b/gu)).toHaveLength(1);
    expect(direct).toContain('aria-current="location"');
    for(const tile of permitted){expect(html).toContain(tile.name);expect(direct).toContain(tile.name);}
    for(const tile of UPPER_ARRAY_FIELD_SITES.filter(tile=>!permitted.includes(tile))){
      expect(html).not.toContain(tile.name);expect(direct).not.toContain(tile.name);
    }
    const outside='npc-1';
    expect(room(entered,outside)).toBe('');
    const map=createTerrainMapView(entered,traveler(entered),false);
    expect(map.seenLocations).toEqual([]);
    expect(map.liveActors).toEqual([]);
    expect(buildCanvasBiomeRelief(entered,map)).toEqual({tiles:[],landmarks:[]});
    expect(buildQiFlowPlan(entered,map,visibleFormationMapLinks(entered,map,traveler(entered))))
      .toEqual({sites:[],links:[],clip:[],hasMotion:false});
    const lowerReader=entered.cultivators.find(row=>row.id===outside);
    expect(createTerrainMapView(entered,lowerReader,false).liveActors.some(row=>row.id===travelerId)).toBe(false);
    const raw=encodeEraWorldSave(entered),loaded=decodeEraWorldSave(raw);
    expect(encodeEraWorldSave(loaded)).toBe(raw);
    const exited=fieldStep(loaded,'exit','realm-upper-council');
    expect(traveler(exited).locationId).toBe('realm-upper-council');
    expect(room(exited)).not.toContain('<canvas');
    expect(room(exited,outside)).toBe('');
    expect(exited.locations).toEqual(entered.locations);
    expect(encodeEraWorldSave(entered)).toBe(raw);

    let returning=oldStep(exited,'turnback');
    returning=oldStep(returning,'advance');
    returning=oldStep(returning,'advance');
    expect(traveler(returning).locationId).toBe('realm-passage-upper-step');
    expect(room(returning)).toBe('');
    expect(availableUpperPassageActions(traveler(returning),returning,returning.tick+1)).toEqual([]);
    // The aperture actually expired. Use a second real lower steward, not a forged crossing or a reused old receipt.
    const reopener=requireValue(returning.cultivators.find(row=>row.id==='elder-danxia-2'),'Actual separate known lower steward');
    const known=knownMapLocations(returning,reopener),targetKnown=known.some(row=>row.id===north);
    const newPlaces=returning.locations.filter(row=>row.id!==reopener.locationId&&!known.includes(row)&&
      !(row.type==='secret_realm'&&row.expeditionOmenId!==undefined));
    const candidates=newPlaces.length?newPlaces:returning.locations.filter(row=>row.id!==reopener.locationId&&
      !(row.type==='secret_realm'&&row.expeditionOmenId!==undefined));
    const choice=candidates.findIndex(row=>row.id===north);
    expect(targetKnown||choice>=0).toBe(true);
    let draws=0;
    applyCultivatorBrainDecision(returning,reopener,order('EXPLORE',targetKnown?{targetLocationId:north}:{}),
      ()=>!targetKnown&&draws++===0?(choice+.2)/candidates.length:.99);
    expect(reopener.locationId).toBe(north);
    const realReopening=requireValue(availableWaterVeinActions(reopener,returning,returning.tick+1).find(row=>row.waterVeinMove==='open'),
      'Independent lower steward lawfully funds new North Well aperture');
    const {action,...quote}=realReopening;
    const reopened=turn(returning,order('REST'),{[reopener.id]:order(action,quote)});
    const aperture=requireValue(reopened.coldWaterVein?.openings.at(-1),'Actual paid fresh aperture');
    expect(aperture).toMatchObject({openerId:reopener.id,openedTick:reopened.tick,paidStones:40});
    expect(traveler(reopened).locationId).toBe('realm-passage-upper-step');
    const crossed=oldStep(reopened,'advance'),back=oldStep(crossed,'advance');
    expect(traveler(back)).toMatchObject({id:travelerId,locationId:north});
    expect(traveler(back).positionPlane).toBeUndefined();
    expect(back.upperPassage?.journeys[0]).toMatchObject({returnedTick:back.tick,
      steps:expect.arrayContaining([expect.objectContaining({crossingOpeningId:aperture.id})])});
    expect(room(back)).toBe('');
    const nativeLower=createTerrainMapView(back,traveler(back),true);
    const returnedRelief=buildCanvasBiomeRelief(back,nativeLower);
    expect(returnedRelief.tiles.length).toBeGreaterThan(0);
    expect(returnedRelief.landmarks).toContainEqual(expect.objectContaining({siteId:north,motif:'frost'}));
    expect(returnedRelief.landmarks.some(row=>row.siteId.startsWith('array-field-'))).toBe(false);
    expect(back.cultivators.filter(row=>row.id===travelerId)).toHaveLength(1);
  });

  it('layers only actually visible lower terrain, not explored-only history or an inferred portal on the base chart',()=>{
    const world=createInitialWorld(1,'spirit-bloom');
    const viewer=world.cultivators.find(row=>row.id==='npc-1');
    const view=createTerrainMapView(world,viewer,true),full=createTerrainMapView(world,viewer,false);
    const before=encodeEraWorldSave(world);
    const relief=buildCanvasBiomeRelief(world,view);
    const permitted=world.terrain.tiles.filter(tile=>view.tileState(tile)==='visible').map(row=>row.id);
    expect(permitted.length).toBeGreaterThan(0);
    expect(permitted.length).toBeLessThan(world.terrain.tiles.length);
    expect(relief.tiles.map(row=>row.tileId)).toEqual(permitted);
    expect(relief.landmarks).toContainEqual(expect.objectContaining({siteId:'loc-taixu',motif:'peaks',anchorX:180,anchorY:150}));
    expect(relief.landmarks.some(row=>row.siteId==='loc-tianji'||row.siteId==='loc-vein-north')).toBe(false);
    const flow=buildQiFlowPlan(world,view,visibleFormationMapLinks(world,view,viewer));
    expect(flow.sites.map(row=>row.id)).toContain('loc-taixu');
    expect(flow.sites.every(row=>view.isCurrentLocation(row.id))).toBe(true);
    const global=buildCanvasBiomeRelief(world,full);
    expect(global.tiles).toHaveLength(world.terrain.tiles.length);
    expect(global.landmarks.map(row=>row.siteId)).toEqual(['loc-taixu','loc-blood','loc-danxia','loc-tianji','loc-vein-north']);
    expect(global.landmarks.some(row=>row.siteId.startsWith('array-field-'))).toBe(false);
    expect(encodeEraWorldSave(world)).toBe(before);
  });
});
