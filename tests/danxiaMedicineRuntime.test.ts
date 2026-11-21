import {afterEach,describe,expect,it,vi} from 'vitest';
import {availableAlchemy,alchemyCost} from '../src/engine/alchemyEngine';
import {possessAvatar,queueAvatarDanxiaMedicine} from '../src/engine/avatarEngine';
import {availableDanxiaMedicineActions,danxiaMedicineCheckpoint} from '../src/engine/danxiaMedicineEngine';
import {decodeWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {advanceWorldTick} from '../src/engine/worldEngine';

import {DANXIA_FIXTURE,danxiaActor,danxiaPayload,danxiaSite,danxiaTurn,preparedDanxiaAppointment} from './fixtures/danxiaNativeFixture';
import type {DanxiaMedicineMove,WorldState} from '../src/types/world';

afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});
const fixture=DANXIA_FIXTURE;
const disciple=fixture.discipleId;
const escort=fixture.staffId;
const stock=(world:WorldState,id:string)=>danxiaActor(world,id).herbs.jade_leaf;
const pledge=(danxiaMedicineMove:'retain'|'offer_ship'|'observe',targetDanxiaShortageId:string,targetCultivatorId?:string)=>
  danxiaPayload('DANXIA_MEDICINE',{danxiaMedicineMove,targetDanxiaShortageId,...(targetCultivatorId?{targetCultivatorId}:{})});
const later=(danxiaMedicineMove:Exclude<DanxiaMedicineMove,'observe'|'retain'|'offer_ship'>,targetDanxiaMedicineId:string)=>
  danxiaPayload('DANXIA_MEDICINE',{danxiaMedicineMove,targetDanxiaMedicineId});
const load=(world:WorldState)=>decodeWorldSave(encodeWorldSave(world));
const journal=(world:WorldState,id:string)=>world.resourceFlow.months.flatMap(month=>month.entries).filter(row=>(row.mechanism==='danxia_medicine'&&row.refId===id)||('from' in row&&row.from.kind==='danxia_medicine'&&row.from.id===id));
const commitment=(world:WorldState)=>world.danxiaMedicine.commitments[0];

function shortageFixture(){
  const f=preparedDanxiaAppointment();
  const world=danxiaTurn(f.world,{[f.patientId]:danxiaPayload('CARE_FOLLOWUP',{careFollowupMove:'attend',targetCareFollowupId:f.appointmentId})});
  const incident=world.danxiaShortages.cases[0];
  expect(incident).toMatchObject({status:'open',discipleId:disciple,patientId:f.patientId,availableLeaves:0,requiredLeaves:1});
  // Single controlled initial input: a genuinely stored, finite personal pair
  // on the qualified donor. E2-3 authorities/native history are unaltered.
  const donor=danxiaActor(world,disciple);
  donor.herbs.jade_leaf=2;
  expect(donor.spiritStones).toBeGreaterThanOrEqual(alchemyCost('foundation',danxiaSite(world).furnaceGrade));
  return {...f,world,shortageId:incident.id};
}
function offered(f:ReturnType<typeof shortageFixture>){
  const incoming=availableDanxiaMedicineActions(danxiaActor(f.world,disciple),f.world,f.world.tick+1)
    .find(row=>row.danxiaMedicineMove==='offer_ship'&&row.targetCultivatorId===escort);
  expect(incoming).toBeDefined();
  const world=danxiaTurn(f.world,{[disciple]:pledge('offer_ship',f.shortageId,escort)});
  expect(commitment(world)).toMatchObject({status:'offered',escortId:escort,escrow:2});
  return world;
}
function waitFor(world:WorldState,predicate:(input:WorldState)=>boolean,limit=12){
  const start=world.tick;
  while(!predicate(world)&&world.tick-start<limit)world=danxiaTurn(world);
  expect(predicate(world)).toBe(true);
  return world;
}

describe('native E2-4 distinct, exactly once custody outcomes',()=>{
  it('cannot promise the same jade twice, distinguishes observation from actual reserve, and only converts the held batch by a real furnace action',()=>{
    const f=shortageFixture();
    const observed=danxiaTurn(f.world,{[disciple]:pledge('observe',f.shortageId)});
    expect(stock(observed,disciple)).toBe(2);
    expect(commitment(observed)).toMatchObject({status:'observed',escrow:0});
    expect(journal(observed,commitment(observed).id)).toEqual([]);
    const retained=danxiaTurn(f.world,{[disciple]:pledge('retain',f.shortageId)});
    const row=commitment(retained);
    expect(row).toMatchObject({status:'retained',escrow:2});
    expect(stock(retained,disciple)).toBe(0);
    expect(stock(f.world,disciple)).toBe(2);
    const sameDonor=danxiaActor(retained,disciple);
    expect(availableAlchemy(sameDonor,retained,retained.tick+1).some(item=>item.action==='BREW_PILL'&&item.targetPillId==='foundation')).toBe(false);
    const duplicate=danxiaTurn(retained,{[disciple]:pledge('offer_ship',f.shortageId,escort)});
    expect(duplicate.danxiaMedicine.commitments).toHaveLength(1);
    expect(stock(duplicate,disciple)).toBe(0);
    expect(commitment(duplicate).escrow).toBe(2);
    const ready=danxiaTurn(load(retained),{[disciple]:danxiaPayload('GATHER_HERBS',{targetHerbId:'earth_root'})});
    const before=danxiaActor(ready,disciple);
    expect(before.herbs.earth_root).toBeGreaterThanOrEqual(1);
    const brewed=danxiaTurn(load(ready),{[disciple]:later('brew',row.id)});
    expect(commitment(brewed)).toMatchObject({status:'brew_failed',escrow:0,settlement:{kind:'brew_failed',actorId:disciple}});
    expect(danxiaActor(brewed,disciple).herbs.earth_root).toBe(before.herbs.earth_root-1);
    expect(danxiaActor(brewed,disciple).spiritStones).toBe(before.spiritStones-alchemyCost('foundation',danxiaSite(retained).furnaceGrade));
    expect(danxiaActor(brewed,disciple).pills.foundation).toBe(before.pills.foundation);
    expect(journal(brewed,row.id).map(item=>[item.kind,item.amount])).toEqual([['transfer',2],['consumption',2]]);
    expect(brewed.careFollowups.appointments.find(item=>item.id===f.appointmentId)?.receipt).toBeUndefined();
    expect(load(brewed).danxiaMedicine).toEqual(brewed.danxiaMedicine);
  });

  it('moves the same native batch only after assent; real arrival and signed receipt are separate and tied to the original adult',()=>{
    const f=shortageFixture();
    const offer=offered(f),row=commitment(offer);
    const agreed=danxiaTurn(offer,{[escort]:later('accept',row.id),
      [f.patientId]:danxiaPayload('EXPLORE',{targetLocationId:fixture.villageSiteId})});
    expect(danxiaActor(agreed,f.patientId).locationId).toBe(fixture.villageSiteId);
    expect(commitment(agreed)).toMatchObject({status:'in_transit',acceptedTick:agreed.tick,pathIndex:0,escrow:2});
    expect(commitment(agreed).departedTick).toBeUndefined();
    const inMotion=danxiaTurn(load(agreed),{[escort]:danxiaPayload('EXPLORE',{targetLocationId:'loc-qingyun'})});
    expect(commitment(inMotion).departedTick).toBeGreaterThan(agreed.tick);
    const runner=danxiaActor(inMotion,escort),recipient=danxiaActor(inMotion,f.patientId);
    const point=danxiaMedicineCheckpoint(inMotion,runner);
    expect(point).toBeDefined();
    const participantMap=createTerrainMapView(inMotion,recipient,false);
    expect(participantMap.trailPositions.get(runner.id)).toEqual(point);
    const stranger=inMotion.cultivators.find(row=>![disciple,escort,f.patientId].includes(row.id))!;
    const outsiderMap=createTerrainMapView(inMotion,stranger,false);
    expect(outsiderMap.trailPositions.has(runner.id)).toBe(false);
    expect(outsiderMap.liveActors).not.toContain(runner);
    expect(danxiaActor(inMotion,escort).locationId).not.toBe('loc-qingyun');
    const arrived=waitFor(inMotion,w=>commitment(w).status==='arrived');
    expect(commitment(arrived)).toMatchObject({escrow:2,arrivedTick:arrived.tick});
    expect(danxiaActor(arrived,escort).locationId).toBe(fixture.villageSiteId);
    expect(stock(arrived,f.patientId)).toBe(stock(offer,f.patientId));
    expect(availableDanxiaMedicineActions(danxiaActor(arrived,f.patientId),arrived).every(item=>item.danxiaMedicineMove!=='receive')).toBe(true);
    const outsider=danxiaActor(arrived,escort);
    outsider.name=danxiaActor(arrived,f.patientId).name; // Genuine co-present same-name actor cannot collect.
    expect(availableDanxiaMedicineActions(outsider,arrived,arrived.tick+1).every(item=>item.danxiaMedicineMove!=='receive')).toBe(true);
    const received=danxiaTurn(load(arrived),{[f.patientId]:later('receive',row.id)});
    expect(commitment(received)).toMatchObject({status:'received',escrow:0,settlement:{kind:'received',actorId:f.patientId}});
    expect(stock(received,f.patientId)).toBe(stock(arrived,f.patientId)+2);
    const again=danxiaTurn(received,{[f.patientId]:later('receive',row.id)});
    expect(stock(again,f.patientId)).toBe(stock(received,f.patientId));
    expect(journal(offer,row.id).map(item=>[item.reason,item.amount])).toEqual([['danxia_medicine_reserve',2]]);
    expect(journal(again,row.id).filter(item=>item.reason==='danxia_medicine_delivery').map(item=>item.amount)).toEqual([2]);
    expect(stock(again,disciple)).toBe(0);
    expect(load(again).danxiaMedicine).toEqual(again.danxiaMedicine);
  });

  it('loses one actual cargo at a severe traversed hazard, keeps the runner on the real route, and never credits a recipient',()=>{
    const f=shortageFixture(),offer=offered(f),row=commitment(offer);
    const accepted=danxiaTurn(offer,{[escort]:later('accept',row.id),
      [f.patientId]:danxiaPayload('EXPLORE',{targetLocationId:fixture.villageSiteId})});
    const routePoint=commitment(accepted).path?.[2];
    expect(routePoint).toBeDefined();
    let blocked=accepted;
    for(let i=0;i<3;i++)blocked=applyMapBrush(blocked,'beast_tide',[routePoint!]);
    const wreck=danxiaTurn(blocked);
    expect(commitment(wreck)).toMatchObject({status:'lost',escrow:0,hazard:{kind:'beast_tide',intensity:3},
      settlement:{kind:'lost',actorId:escort}});
    expect(danxiaMedicineCheckpoint(wreck,danxiaActor(wreck,escort))).toEqual(routePoint);
    expect(stock(wreck,f.patientId)).toBe(stock(accepted,f.patientId));
    expect(journal(wreck,row.id).filter(item=>item.kind==='loss').map(item=>item.amount)).toEqual([2]);
    const returned=waitFor(load(wreck),world=>commitment(world).returnedTick!==undefined);
    expect(commitment(returned).status).toBe('lost');
    expect(danxiaMedicineCheckpoint(returned,danxiaActor(returned,escort))).toBeUndefined();
    expect(stock(returned,disciple)).toBe(0);
    expect(stock(returned,f.patientId)).toBe(stock(accepted,f.patientId));
  });

  it('offers the same actual legal medicine choices to Utility and Cognitive JSON, not a fabricated balance target',async()=>{
    const f=shortageFixture(),actor=danxiaActor(f.world,disciple);
    const controlledPeers=Object.fromEntries(f.world.cultivators.filter(other=>other.id!==disciple).map(other=>[other.id,danxiaPayload('REST')]));
    const utility=advanceWorldTick(f.world,controlledPeers,()=>.99,'utility');
    expect(commitment(utility)).toMatchObject({status:'retained',escrow:2,discipleId:disciple});
    expect(danxiaActor(utility,disciple).currentAction).toBe('DANXIA_MEDICINE');
    const exact=availableDanxiaMedicineActions(actor,f.world,f.world.tick+1).find(row=>row.danxiaMedicineMove==='retain')!;
    const config={enabled:true,apiBaseUrl:'https://fixture.invalid',apiKey:'mock-only',model:'medicine-fixture'};
    expect(exact).toBeDefined();
    expect(availableDanxiaMedicineActions(actor,f.world).some(option=>option.targetDanxiaShortageId===f.shortageId)).toBe(true);
    const confirmed=pledge('retain',f.shortageId);
    let response:object=confirmed;
    const fetcher=vi.fn(async(_url:string,init:RequestInit)=>{
      const body=JSON.parse(String(init.body)) as {messages:{role:string;content:string}[]};
      const prompt=body.messages.find(message=>message.role==='user')?.content??'';
      expect(prompt).toContain('"danxiaMedicineMove":"retain"');
      expect(prompt).toContain('不得补写药量、路程');
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(response)}}]}));
    });
    vi.stubGlobal('fetch',fetcher);
    const accepted=await requestCultivatorLLMDecision(actor,f.world,config,f.world.tick+1);
    expect(accepted).toMatchObject(confirmed);
    expect(commitment(danxiaTurn(f.world,{[disciple]:accepted!}))).toMatchObject({status:'retained',escrow:2});
    llmScheduler.resetTickBudget();
    response={...confirmed,amount:100};
    expect(await requestCultivatorLLMDecision(actor,f.world,config,f.world.tick+1)).toBeUndefined();
  });

  it('expires or is refused without delivery; only exact original on-site donor recovers held stock once',()=>{
    const f=shortageFixture();
    const offer=offered(f),row=commitment(offer);
    const decline=danxiaTurn(offer,{[escort]:later('decline',row.id)});
    const silent=waitFor(offer,w=>commitment(w).status==='recoverable');
    expect(commitment(decline)).toMatchObject({status:'recoverable',escrow:2,disposition:{reason:'escort_declined'}});
    expect(commitment(silent)).toMatchObject({status:'recoverable',escrow:2,disposition:{reason:'offer_expired'}});
    for(const input of [decline,silent]){
      expect(commitment(input).departedTick).toBeUndefined();
      expect(stock(input,disciple)).toBe(0);
      expect(availableDanxiaMedicineActions(danxiaActor(input,escort),input,input.tick+1)
        .some(item=>item.danxiaMedicineMove==='recover')).toBe(false);
      const back=danxiaTurn(load(input),{[disciple]:later('recover',row.id)});
      expect(commitment(back)).toMatchObject({status:'recovered',escrow:0,settlement:{kind:'recovered',actorId:disciple}});
      expect(stock(back,disciple)).toBe(2);
      const triedAgain=danxiaTurn(back,{[disciple]:later('recover',row.id)});
      expect(stock(triedAgain,disciple)).toBe(2);
      expect(journal(triedAgain,row.id).map(item=>[item.kind,item.amount])).toEqual([['transfer',2],['transfer',2]]);
    }
  });

  it('allows only an exact prospective possessed vow, and rejects forged persisted custody and route',()=>{
    const f=shortageFixture();
    expect(possessAvatar(f.world,disciple)).toBe(true);
    const selected=availableDanxiaMedicineActions(danxiaActor(f.world,disciple),f.world,f.world.tick+1);
    const observer=selected.find(item=>item.danxiaMedicineMove==='observe')!;
    const choice=selected.find(item=>item.danxiaMedicineMove==='retain')!;
    expect(queueAvatarDanxiaMedicine(f.world,disciple,observer)).toBe(false);
    expect(queueAvatarDanxiaMedicine(f.world,disciple,choice)).toBe(true);
    expect(stock(f.world,disciple)).toBe(2);
    expect(load(f.world).playerAvatar.pendingOrder).toMatchObject({action:'DANXIA_MEDICINE',danxiaMedicineMove:'retain',targetDanxiaShortageId:f.shortageId});
    const decode=(world:WorldState)=>decodeWorldSave(JSON.stringify({format:'ai-sect-sandbox',version:1,world}));
    for(const patch of [{danxiaMedicineMove:'observe'},{targetDanxiaMedicineId:'invented'},{targetCultivatorId:escort}]){
      const forged=structuredClone(f.world);
      Object.assign(forged.playerAvatar.pendingOrder!,patch);
      expect(()=>decode(forged)).toThrow(expect.objectContaining({code:'invalid_world'}));
    }
    const source=shortageFixture();
    const offeredWorld=offered(source);
    const row=commitment(offeredWorld);
    const accepted=danxiaTurn(offeredWorld,{[escort]:later('accept',row.id)});
    for(const attack of ['bad_escrow','bad_route','fake_patient','duplicate','public'] as const){
      const forged=structuredClone(accepted), entry=commitment(forged);
      if(attack==='bad_escrow')entry.escrow=0;
      if(attack==='bad_route')entry.path![1]={x:entry.path![1].x+1,y:entry.path![1].y};
      if(attack==='fake_patient')entry.patientId=escort;
      if(attack==='duplicate')forged.danxiaMedicine.commitments.push(structuredClone(entry));
      if(attack==='public')Reflect.deleteProperty(forged.events.find(event=>event.id.endsWith(row.id+'-accepted'))!,'witnessScope');
      expect(()=>decode(forged)).toThrow(expect.objectContaining({code:'invalid_world'}));
    }
  });

  it('pins the actual source through compaction without inventing a medicine commitment on the parallel branch',()=>{
    const f=shortageFixture();
    let bound=danxiaTurn(f.world,{[disciple]:pledge('observe',f.shortageId)});
    let unbound=danxiaTurn(f.world);
    const resolution=bound.danxiaShortages.cases.find(item=>item.id===f.shortageId)?.resolution;
    expect(resolution).toBeDefined();
    const beyond=resolution!.tick+121;
    while(bound.tick<beyond)bound=danxiaTurn(bound);
    while(unbound.tick<beyond)unbound=danxiaTurn(unbound);
    const noMedicine=load(unbound);
    expect(noMedicine.danxiaShortages.cases.find(item=>item.id===f.shortageId)?.resolution).toEqual(resolution);
    expect(noMedicine.danxiaMedicine.commitments.some(item=>item.shortageId===f.shortageId)).toBe(false);
    expect(noMedicine.danxiaReviews.reviews.find(item=>item.shortageId===f.shortageId)).toMatchObject({
      source:{outcome:'no_commitment',deliveredLeaves:0},status:'no_agreement',decision:{reason:'expired'},
    });
    const archived=load(bound);
    expect(archived.danxiaShortages.cases.find(item=>item.id===f.shortageId)?.resolution).toEqual(resolution);
    expect(commitment(archived)).toMatchObject({shortageId:f.shortageId,status:'observed'});
    const broken=structuredClone(archived);
    broken.danxiaShortages.cases=[];
    expect(()=>decodeWorldSave(JSON.stringify({format:'ai-sect-sandbox',version:1,world:broken}))).toThrow(expect.objectContaining({code:'invalid_world'}));
  });

  it('never awards an absent recipient at arrival or deadline; physically reverses the cargo before recovery',()=>{
    const f=shortageFixture();
    const offer=offered(f),row=commitment(offer);
    const agreed=danxiaTurn(offer,{[escort]:later('accept',row.id)});
    const arrived=waitFor(agreed,w=>commitment(w).status==='arrived');
    expect(danxiaActor(arrived,f.patientId).locationId).toBe(fixture.siteId);
    expect(availableDanxiaMedicineActions(danxiaActor(arrived,f.patientId),arrived,arrived.tick+1)
      .some(item=>item.danxiaMedicineMove==='receive')).toBe(false);
    const returning=waitFor(load(arrived),w=>commitment(w).status==='returning',5);
    expect(commitment(returning)).toMatchObject({disposition:{reason:'recipient_missed'},escrow:2});
    expect(stock(returning,disciple)).toBe(0);
    expect(availableDanxiaMedicineActions(danxiaActor(returning,disciple),returning,returning.tick+1)
      .some(item=>item.danxiaMedicineMove==='recover')).toBe(false);
    const atOrigin=waitFor(returning,w=>commitment(w).status==='recoverable');
    expect(danxiaActor(atOrigin,escort).locationId).toBe(fixture.siteId);
    expect(commitment(atOrigin).returnedTick).toBe(atOrigin.tick);
    const back=danxiaTurn(atOrigin,{[disciple]:later('recover',row.id)});
    expect(commitment(back).status).toBe('recovered');
    expect(stock(back,disciple)).toBe(2);
    expect(stock(back,f.patientId)).toBe(stock(offer,f.patientId));
  });
});
