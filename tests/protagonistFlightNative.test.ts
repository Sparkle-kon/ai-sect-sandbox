import {describe,expect,it} from 'vitest';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {pilgrimageCheckpoint} from '../src/engine/pilgrimageEngine';
import {projectProtagonistFlight} from '../src/engine/protagonistFlightEngine';
import {decodeWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {actualFlight, earnedAcceptedWorld, body, action, turn, own, advance, leadId, guideId, hunterId, origin} from './protagonistFlightNativeFixture';

describe('earned protagonist: pursuit at a real stop and three months of actual native movement',()=>{
  it('records exactly three turns and only actual native stride points or reached stop, survives each strict save',()=>{
    const {pursuit}=actualFlight();
    let world=pursuit;
    const scenes=world.protagonistFlights;
    for(let index=1;index<=3;index++){
      world=advance(world);
      expect(own(world)?.rounds).toHaveLength(index);
      world=decodeWorldSave(encodeWorldSave(world));
      expect(own(world)?.rounds.at(-1)?.tick).toBe(pursuit.tick+index);
      const round=own(world)?.rounds.at(-1);
      if(round?.outcome==='moved')expect(round.points.at(-1)).toEqual(pilgrimageCheckpoint(world,body(world)));
      if(round?.outcome==='reached'){
        expect(round.locationId).toBe(body(world).locationId);
        const site=world.locations.find(row=>row.id===round.locationId)!;
        expect(round.points.at(-1)).toEqual({x:site.x,y:site.y});
      }
    }
    expect(own(world)?.status).toBe('reached');
    expect(own(world)?.nextRound).toBeUndefined();
    expect(world.protagonistFlights).not.toBe(scenes);
    expect(own(turn(world))?.rounds).toEqual(own(world)?.rounds);
    expect(projectProtagonistFlight(world,body(world,guideId))).toBeUndefined();
    expect(projectProtagonistFlight(world,{...body(world)})).toBeUndefined();
    expect(JSON.stringify(own(world))).not.toMatch(/npc-|evt-.*duel|bounty-/);
    expect(projectProtagonistFlight(world,body(world),pursuit.tick+1)?.rounds).toHaveLength(1);
  });

  it('keeps a real withdrawn guide at the last verified stop across the remaining turns, with no phantom segment',()=>{
    const {pursuit,journeyId}=actualFlight();
    let world=turn(pursuit,{[guideId]:action('PILGRIMAGE',{pilgrimageMove:'withdraw',targetPilgrimageId:journeyId})});
    expect(own(world)).toMatchObject({status:'retreated',rounds:[
      {outcome:'retreated',reason:'withdrawn',locationId:origin,points:[]},
    ]});
    expect(body(world).locationId).toBe(origin);
    world=turn(turn(world));
    expect(own(world)?.rounds.map(row=>row.outcome)).toEqual(['retreated','held','held']);
    expect(own(decodeWorldSave(encodeWorldSave(world)))).toEqual(own(world));
  });

  it('returns to the last real stop when the guide actually dies after the first month of traversal',()=>{
    let {world,bountyId}=earnedAcceptedWorld();
    while(world.tick<10)world=turn(world);
    const guide=body(world,guideId);
    guide.age=guide.lifespan-1;
    world=turn(world,{[hunterId]:action('PURSUE_BOUNTY',{targetBountyId:bountyId})});
    expect(own(world)).toMatchObject({status:'active',openedTick:11});
    world=advance(world);
    const moved=own(world)?.rounds[0];
    expect(moved).toMatchObject({outcome:'moved'});
    expect(moved?.points.at(-1)).toEqual(pilgrimageCheckpoint(world,body(world)));
    world=turn(world);
    expect(world.tick).toBe(13);
    expect(body(world,guideId).alive).toBe(false);
    expect(body(world).locationId).toBe(origin);
    expect(pilgrimageCheckpoint(world,body(world))).toBeUndefined();
    expect(own(world)).toMatchObject({status:'retreated',rounds:[
      moved,{outcome:'retreated',reason:'guide_lost',locationId:origin,points:[]},
    ]});
    expect(own(decodeWorldSave(encodeWorldSave(world)))).toEqual(own(world));
    expect(own(turn(world))?.rounds.at(-1)).toMatchObject({outcome:'held',points:[]});
  });

  it('only counts calendar turns and distinguishes timing out from arrival or retreat',()=>{
    const {pursuit}=actualFlight();
    const painted=applyMapBrush(pursuit,'paint_vein',[{x:840,y:500}]);
    expect(painted.tick).toBe(pursuit.tick);
    expect(own(painted)).toEqual(own(pursuit));
    const later=turn(turn(turn(painted)));
    expect(own(later)).toMatchObject({status:'unfinished',rounds:[
      {outcome:'held',points:[]},
      {outcome:'held',points:[]},
      {outcome:'held',reason:'time_elapsed',points:[]},
    ]});
    expect(body(later).locationId).toBe(origin);
    expect(own(decodeWorldSave(encodeWorldSave(later)))).toEqual(own(later));
  });

  it('rejects a native pursuit as an opening when its real first path is visibly obstructed',()=>{
    const {world,bountyId}=earnedAcceptedWorld();
    const hit={x:460,y:500};
    const damaged=applyMapBrush(applyMapBrush(world,'meteor',[hit]),'meteor',[hit]);
    expect(damaged.mapHazards.some(row=>row.kind==='meteor'&&row.intensity>=2)).toBe(true);
    const hunted=turn(damaged,{[hunterId]:action('PURSUE_BOUNTY',{targetBountyId:bountyId})});
    expect(hunted.events.some(row=>row.tick===hunted.tick&&row.duelWinnerId===leadId)).toBe(true);
    expect(hunted.protagonistFlights).toBeUndefined();
  });

  it('rejects incomplete/proposed commitment and a generic real duel; strict saves reject rewritten geometry/current witnesses',()=>{
    const {world,bountyId}=earnedAcceptedWorld();
    const invite=structuredClone(world);
    const abandoned=turn(invite,{[guideId]:action('PILGRIMAGE',{pilgrimageMove:'withdraw',targetPilgrimageId:invite.pilgrimages.journeys.at(-1)!.id})});
    const pursuedWithoutGuide=turn(abandoned,{[hunterId]:action('PURSUE_BOUNTY',{targetBountyId:bountyId})});
    expect(pursuedWithoutGuide.events.some(row=>row.tick===pursuedWithoutGuide.tick&&row.duelWinnerId===leadId)).toBe(true);
    expect(pursuedWithoutGuide.protagonistFlights).toBeUndefined();
    const ordinary=turn(world,{[hunterId]:action('DUEL',{targetCultivatorId:leadId})});
    expect(ordinary.events.some(row=>row.tick===ordinary.tick&&row.duelWinnerId===leadId)).toBe(true);
    expect(ordinary.protagonistFlights).toBeUndefined();
    const {pursuit}=actualFlight();
    const corrupted=structuredClone(advance(pursuit));
    const round=corrupted.protagonistFlights![0].rounds[0];
    round.points[1].x+=.1;
    expect(()=>decodeWorldSave(encodeWorldSave(corrupted))).toThrow(/protagonistFlights/);
    const privateContact=structuredClone(pursuit);
    const event=privateContact.events.find(row=>row.id===privateContact.protagonistFlights![0].contactEventId)!;
    event.witnessScope='participants';
    expect(()=>decodeWorldSave(encodeWorldSave(privateContact))).toThrow();
    const missing=structuredClone(pursuit);
    const contactId=missing.protagonistFlights![0].contactEventId;
    missing.events=missing.events.filter(row=>row.id!==contactId);
    missing.chronicleArchive.anchors=missing.chronicleArchive.anchors.filter(row=>row.id!==contactId);
    expect(()=>decodeWorldSave(encodeWorldSave(missing))).toThrow();
  });
});
