import {describe,expect,it} from 'vitest';
import {availableCivicMemorialActions,captureCivicReliefDeed,projectCivicMemorials,projectLocalCivicMemorialCount,
  resolveCivicMemorialAction} from '../src/engine/civicMemorialEngine';
import {projectResourceFlowMonth} from '../src/engine/resourceFlowEngine';
import {decodeWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {civicActor as actor,civicChoice as choice,civicMemorialFixture,civicMove as move,civicTurn as turn,civicVillage as village}
  from './fixtures/civicMemorialFixture';

describe('civic memorial native evidence and independent actual witnesses',()=>{
  it('accepts only a real original eyewitness after exact proposal and consumes only the sponsor supplies once',()=>{
    const {world,deedId,subjectId,sameNameId,proposer,witness,outsider,siteId,settlementId}=civicMemorialFixture();
    expect(projectCivicMemorials(world,actor(world,outsider))).toMatchObject({plaques:[],proposals:[],candidates:[]});
    const deed=world.civicMemorials.deeds[0];
    expect(deed.witnessIds).not.toContain(subjectId);
    expect(civicMemorialFixture().world.civicMemorials.deeds).toEqual(world.civicMemorials.deeds);
    expect(resolveCivicMemorialAction(world,actor(world,witness),move('propose',deedId))).toBeNull();
    const opened=turn(world,{[proposer]:move('propose',deedId),[outsider]:choice('EXPLORE',{targetLocationId:siteId})});
    const row=opened.civicMemorials.memorials[0];
    expect(row).toMatchObject({deedId,proposerId:proposer,status:'proposed',proposerDonationKind:'donate_roots',
      proposerDonationTick:world.tick-1});
    expect(actor(opened,outsider).locationId).toBe(siteId);
    expect(resolveCivicMemorialAction(opened,actor(opened,witness),move('verify',row.id))).toBeNull();
    expect(availableCivicMemorialActions(actor(opened,outsider),opened,opened.tick+1)).toEqual([]);
    expect(availableCivicMemorialActions(actor(opened,proposer),opened,opened.tick+1)).toEqual([]);
    expect(availableCivicMemorialActions(actor(opened,witness),opened,opened.tick+1)).toEqual([
      {action:'CIVIC_MEMORIAL',civicMemorialMove:'verify',targetCivicMemorialId:row.id},
    ]);
    const baseline=turn(opened);
    const verified=turn(opened,{[witness]:move('verify',row.id)});
    expect(actor(baseline,proposer).spiritStones-actor(verified,proposer).spiritStones).toBe(10);
    expect(actor(baseline,proposer).herbs.earth_root-actor(verified,proposer).herbs.earth_root).toBe(1);
    expect(verified.villageGranaries).toEqual(baseline.villageGranaries);
    expect(village(verified,settlementId)).toEqual(village(baseline,settlementId));
    expect(verified.households).toEqual(baseline.households);
    expect(verified.civicMemorials.memorials[0]).toMatchObject({status:'verified',verification:{verifierId:witness,tick:verified.tick,
      subjectStatus:'recruited',stonesSpent:10,earthRootsSpent:1}});
    const publicView=projectCivicMemorials(verified,actor(verified,outsider));
    expect(publicView?.plaques).toEqual([{id:row.id,name:'纪同山',subjectStatus:'recruited',deedTick:deed.tick,
      inscribedTick:verified.tick,nameAmbiguous:true}]);
    expect(JSON.stringify(publicView)).not.toContain(subjectId);
    expect(JSON.stringify(publicView)).not.toContain(sameNameId);
    expect(JSON.stringify(publicView)).not.toContain(witness);
    expect(projectLocalCivicMemorialCount(verified,actor(verified,outsider))).toEqual({siteId,count:1});
    const goods=projectResourceFlowMonth(verified,verified.tick,{kind:'observer'})?.rows.filter(entry=>entry.refId===row.id);
    expect(goods?.map(entry=>[entry.kind,entry.good,entry.amount])).toEqual([['consumption','stone',10],['consumption','earth_root',1]]);
    expect(resolveCivicMemorialAction(verified,actor(verified,witness),move('verify',row.id))).toBeNull();
    expect(decodeWorldSave(encodeWorldSave(verified)).civicMemorials).toEqual(verified.civicMemorials);
  });

  it('honors actual deceased status but keeps same-named living residents and actual conflicting public readings separate',()=>{
    const {world,deedId,sourceEventId,subjectId,sameNameId,proposer,witness,other,editor,settlementId}=civicMemorialFixture();
    // True previous witness/proposer still present, but the subject dies on the normal year boundary.
    world.month=12;actor(world,subjectId).age=actor(world,subjectId).lifespan-1;
    const retell=(chronicleReliefReading:'full_supplies'|'unfunded')=>choice('CHRONICLE_ERRATA',{
      chronicleErrataMove:'retell',targetChronicleSourceId:sourceEventId,chronicleReliefReading,
    });
    const claims=turn(world,{[proposer]:move('propose',deedId),[witness]:retell('full_supplies'),[other]:retell('unfunded')});
    expect(actor(claims,subjectId).alive).toBe(false);
    expect(actor(claims,sameNameId).alive).toBe(true);
    expect(claims.civicMemorials.deeds[0].errata?.retellings).toHaveLength(2);
    const row=claims.civicMemorials.memorials[0];
    const done=turn(claims,{[witness]:move('verify',row.id),[editor]:choice('CHRONICLE_ERRATA',{
      chronicleErrataMove:'correct',targetChronicleSourceId:sourceEventId,
    })});
    expect(done.civicMemorials.memorials[0].verification?.subjectStatus).toBe('deceased');
    const plaque=projectCivicMemorials(done,actor(done,proposer))?.plaques[0];
    expect(plaque).toMatchObject({subjectStatus:'deceased',nameAmbiguous:true,errata:{
      readings:[{tick:claims.tick,reading:'full_supplies'},{tick:claims.tick,reading:'unfunded'}],
      correction:{tick:done.tick,reading:'full_supplies'},
    }});
    expect(JSON.stringify(plaque)).not.toContain(editor);
    expect(done.chronicleErrata.retellings).toEqual(claims.chronicleErrata.retellings);
    expect(done.households.members.find(row=>row.recruitedId===sameNameId))
      .toMatchObject({settlementId,status:'recruited'});
  });

  it('does not mint a source from narration, and expired/absent/funding failures do not change supplies or memorial facts',()=>{
    const {world,deedId,proposer,witness,siteId,settlementId}=civicMemorialFixture();
    const fake={...world.settlements.records.find(row=>row.id===world.civicMemorials.deeds[0].reliefRecordId)!};
    captureCivicReliefDeed(world,fake);
    expect(world.civicMemorials.deeds).toHaveLength(1);
    const opened=turn(world,{[proposer]:move('propose',deedId)});
    const row=opened.civicMemorials.memorials[0];
    const moved=turn(opened,{[witness]:choice('EXPLORE',{targetLocationId:'loc-market-east'})});
    expect(actor(moved,witness).locationId).not.toBe(siteId);
    expect(resolveCivicMemorialAction(moved,actor(moved,witness),move('verify',row.id))).toBeNull();
    const poor=turn(opened);
    actor(poor,proposer).herbs.earth_root=0;
    expect(resolveCivicMemorialAction(poor,actor(poor,witness),move('verify',row.id))).toBeNull();
    expect(poor.civicMemorials.memorials[0].verification).toBeUndefined();
    let later=moved;
    while(later.tick<row.expiresTick)later=turn(later);
    expect(later.civicMemorials.memorials[0].status).toBe('expired');
    expect(projectCivicMemorials(later,actor(later,proposer))?.plaques).toEqual([]);
    expect(village(later,settlementId).id).toBe(settlementId);
  });
});
