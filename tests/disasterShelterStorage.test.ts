import {describe,expect,it} from 'vitest';
import {possessAvatar,queueAvatarDisasterShelter} from '../src/engine/avatarEngine';
import {availableDisasterShelterActions} from '../src/engine/disasterShelterEngine';
import {decodeEraWorldSave,decodeWorldSave,encodeEraWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import type {WorldState} from '../src/types/world';
import {harmedNativeShelter,shelterAccepted,shelterActor,shelterCase,shelterGuest,shelterHost,shelterOffered,
  shelterMiasma,shelterOrder,shelterTurn} from './disasterShelterNativeFixture';

const row=(world:WorldState)=>shelterCase(world)!;
function corrupt(raw:string,mutation:(world:WorldState)=>void){
  const envelope=JSON.parse(raw) as {world:WorldState};
  mutation(envelope.world);
  return ()=>decodeWorldSave(JSON.stringify(envelope));
}
function returnedShelter(){
  const f=shelterAccepted();
  let world=f.world;
  for(let position=1;position<f.path.length;position++)world=shelterTurn(world);
  const arrived=world;
  world=shelterTurn(world,{[shelterGuest]:shelterOrder(world,shelterGuest,'return')});
  for(let steps=1;steps<f.path.length;steps++)world=shelterTurn(world);
  expect(row(world).status).toBe('returned');
  return {...f,accepted:f.world,arrived,world};
}
describe('strict temporary shelter storage',()=>{
  it('preserves legacy-absent bytes; requires independently recorded older disaster, delivered freight, and true shelter and household IDs',()=>{
    const {world:oldWorld}=harmedNativeShelter(),old=encodeWorldSave(oldWorld);
    expect(old).not.toContain('"disasterShelter"');
    expect(encodeWorldSave(decodeWorldSave(old))).toBe(old);
    const f=shelterOffered(),raw=encodeWorldSave(f.world);
    expect(encodeWorldSave(decodeWorldSave(raw))).toBe(raw);
    const negatives:Array<[string,(w:WorldState)=>void]>=[
      ['disasterShelter.references',w=>{row(w).guest.volunteerId=row(w).host.volunteerId;}],
      ['disasterShelter.references',w=>{row(w).guest.householdId=row(w).host.householdId;}],
      ['disasterShelter.disaster',w=>{w.settlements.records=w.settlements.records.filter(record=>record.id!==row(w).disasterRecordId);}],
      ['disasterShelter.disaster',w=>{row(w).hazard.intensity=1;}],
      ['disasterShelter.deliveredRoute',w=>{row(w).deliveredTick++;}],
      ['disasterShelter.deliveredRoute',w=>{row(w).agreementId='village-supply-imitation';}],
      ['disasterShelter.shelter',w=>{row(w).shelterProjectId='village-work-counterfeit';}],
      ['disasterShelter.route',w=>{[row(w).path[1],row(w).path[2]]=[row(w).path[2],row(w).path[1]];}],
      ['disasterShelter.cases[0].promotedFamily',w=>{Object.assign(row(w),{promotedFamily:'fake permanent migration'});}],
      ['disasterShelter.event',w=>{delete w.disasterShelter;}],
    ];
    for(const [field,edit] of negatives)expect(corrupt(raw,edit)).toThrow(field);
  });

  it('validates reserved, physically walking and finished byte chains without a retained live hazard or changed home register',()=>{
    const f=returnedShelter();
    const raw=encodeWorldSave(f.world),full=encodeEraWorldSave(f.world);
    expect(f.world.mapHazards.some(hazard=>hazard.id===f.hazard.id)).toBe(false);
    expect(encodeWorldSave(decodeWorldSave(raw))).toBe(raw);
    expect(encodeEraWorldSave(decodeEraWorldSave(full))).toBe(full);
    expect(row(decodeWorldSave(raw))).toEqual(row(f.world));
    expect(shelterActor(f.world,shelterGuest).locationId).toBe(f.home.id);
    expect(f.world.households.members.find(member=>member.recruitedId===shelterGuest)).toMatchObject({
      householdId:row(f.world).guest.householdId,settlementId:row(f.world).guest.settlementId,status:'recruited',
    });
    const negatives:Array<[string,(w:WorldState)=>void]>=[
      ['disasterShelter.consent',w=>{row(w).acceptedTick=row(w).offeredTick;}],
      ['disasterShelter.step',w=>{row(w).steps[1].tick=row(w).steps[0].tick;}],
      ['disasterShelter.step',w=>{row(w).steps[1].tileId=row(w).steps[0].tileId;}],
      ['disasterShelter.step',w=>{row(w).steps[0].pathIndex=2;}],
      ['disasterShelter.return',w=>{row(w).steps[0].direction='return';}],
      ['disasterShelter.progress',w=>{row(w).returnedTick=undefined;}],
      ['disasterShelter.progress',w=>{row(w).returnDepartedTick=row(w).returnRequestedTick;}],
      ['disasterShelter.event',w=>{w.events.find(event=>event.id.endsWith('-returned')&&event.id.includes(row(w).id))!.actorIds.reverse();}],
    ];
    for(const [field,edit] of negatives)expect(corrupt(raw,edit)).toThrow(field);
    const active=shelterTurn(f.accepted);
    const activeRaw=encodeWorldSave(active);
    expect(corrupt(activeRaw,w=>{shelterActor(w,shelterGuest).locationId=f.hostSite.id;})).toThrow('disasterShelter.presence');
    expect(encodeWorldSave(shelterTurn(decodeWorldSave(activeRaw)))).toBe(encodeWorldSave(shelterTurn(active)));
  });

  it('keeps private departures unquotable even when a snapshot carries a matching historic-looking anchor',()=>{
    const f=returnedShelter(),raw=encodeWorldSave(f.world);
    expect(corrupt(raw,w=>{
      const fact=w.events.find(event=>event.id.endsWith('-returned')&&event.id.includes(row(w).id))!;
      w.chronicleArchive.anchors.push({id:fact.id,tick:fact.tick,year:fact.year,month:fact.month,actorIds:[...fact.actorIds],
        title:fact.title,description:fact.description,category:fact.category,locationId:fact.locationId});
    })).toThrow('disasterShelter.archive');
  });

  it('keeps a real withdrawal from an already reserved but still unwalked route after the initial offer deadline',()=>{
    const f=shelterAccepted();
    let waiting=shelterMiasma(f.world,f.path[1]);
    while(waiting.tick<row(waiting).expiresTick)waiting=shelterTurn(waiting);
    expect(row(waiting)).toMatchObject({status:'reserved',steps:[],pathIndex:0});
    const withdrawn=shelterTurn(waiting,{[shelterGuest]:shelterOrder(waiting,shelterGuest,'withdraw')});
    const raw=encodeWorldSave(withdrawn),closed=row(decodeWorldSave(raw));
    expect(closed).toMatchObject({status:'withdrawn',closeReason:'withdrawn',closedTick:withdrawn.tick,
      acceptedTick:f.world.tick,steps:[],pathIndex:0});
    expect(withdrawn.tick).toBeGreaterThan(closed.expiresTick);
    expect(closed.departedTick).toBeUndefined();
    expect(closed.arrivedTick).toBeUndefined();
    expect(shelterActor(withdrawn,shelterGuest).locationId).toBe(f.home.id);
  });

  it('roundtrips only exact next-turn consent from the possessed actual guest',()=>{
    const f=shelterOffered(),{world}=f;
    expect(possessAvatar(world,shelterGuest)).toBe(true);
    const possible=availableDisasterShelterActions(shelterActor(world,shelterGuest),world,world.tick+1)
      .find(option=>option.disasterShelterMove==='accept')!;
    expect(possible).toBeDefined();
    expect(queueAvatarDisasterShelter(world,shelterGuest,possible)).toBe(true);
    const raw=encodeWorldSave(world),reopened=decodeWorldSave(raw);
    expect(reopened.playerAvatar.pendingOrder).toEqual(world.playerAvatar.pendingOrder);
    expect(row(shelterTurn(reopened)).status).toBe('reserved');
    expect(corrupt(raw,w=>{Object.assign(w.playerAvatar.pendingOrder!,{targetCultivatorId:shelterHost});}))
      .toThrow('pendingOrder.targetCultivatorId');
    expect(corrupt(raw,w=>{Object.assign(w.playerAvatar.pendingOrder!,{targetDisasterShelterId:'disaster-shelter-99'});}))
      .toThrow('playerAvatar.disasterShelterOrder');
  });
});
