import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {projectEraHistory} from '../src/engine/eraHistoryIndex';
import {workshopCapacityActor,workshopCapacityChoice,workshopCapacityFixture,workshopCapacityMove,workshopCapacityOrder,workshopCapacityTurn}
  from './fixtures/workshopCapacityFixture';
import {decodeWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {projectResourceFlowMonth} from '../src/engine/resourceFlowEngine';
import {advanceWorkshops,availableWorkshopActions,availableWorkshopReleaseActions,resolveWorkshopAction,resolveWorkshopReleaseAction,workshopReleaseSource,WORKSHOP_HERB}
  from '../src/engine/workshopEngine';
import type {Cultivator,LLMDecisionPayload,WorkshopQualityFloor,WorkshopReleaseMove,WorldState} from '../src/types/world';

function nativeFirstFinish(floor:WorkshopQualityFloor='standard'){
  const world=createInitialWorld(6031);
  world.tick=30;
  const [maker,patron,observer]=world.cultivators;
  const site=world.locations.find(row=>row.id==='loc-market')!;
  site.furnaceGrade=1;site.spiritRoot='木';
  for(const actor of world.cultivators)actor.locationId=world.locations[0].id;
  for(const actor of [maker,patron,observer]){
    actor.artifacts=[];actor.hp=actor.maxHp;actor.alive=true;actor.locationId=site.id;actor.realm='练气';
    actor.techniqueMastery=0;actor.spiritStones=400;actor.herbs[WORKSHOP_HERB]=24;actor.tribulation=undefined;
  }
  maker.spiritRoot='金';
  const local=(actor:Cultivator,extra:Partial<LLMDecisionPayload>)=>resolveWorkshopAction(world,actor,
    {chosenAction:'WORKSHOP',innerMonologue:'原实物委托。',...extra},()=>0);
  expect(local(patron,{workshopMove:'offer',targetCultivatorId:maker.id,workshopTier:'法器',workshopQuantity:2,
    workshopQualityFloor:floor})).not.toBeNull();
  const order=world.workshops.orders.at(-1)!;
  const target={targetWorkshopId:order.id};
  expect(order.institution).toBeUndefined();
  expect(local(maker,{workshopMove:'accept',...target})).not.toBeNull();
  const perform=()=>local(maker,{workshopMove:'work',...target});
  world.tick++;expect(perform()).not.toBeNull();
  world.tick++;expect(perform()).not.toBeNull();
  const negotiate=(actor:Cultivator,workshopReleaseMove:WorkshopReleaseMove,targetWorkshopReleaseId?:string)=>
    resolveWorkshopReleaseAction(world,actor,{chosenAction:'WORKSHOP_RELEASE',innerMonologue:'仅了结尚余托管。',
      workshopReleaseMove,...target,...(targetWorkshopReleaseId?{targetWorkshopReleaseId}:{})});
  world.tick++;
  return {world,order,patron,maker,observer,target,perform,negotiate};
}

describe('real local workshop escrow release and retained prior delivery',()=>{
  it('uses exactly two distinct dated signatures and refunds only remaining native money and goods',()=>{
    const {world,order,patron,maker,observer,negotiate}=nativeFirstFinish();
    const artifact=structuredClone(patron.artifacts[0]),paidBalance=maker.spiritStones,work=structuredClone(order.work);
    const stones=order.escrowStones,herbs=order.escrowHerbs,before=patron.spiritStones,roots=patron.herbs[WORKSHOP_HERB];
    expect(artifact.id).toBe(order.work[1].artifactId);
    expect(negotiate(patron,'propose')).not.toBeNull();
    const record=order.releaseNegotiations![0];
    expect(record).toMatchObject({status:'offered',firstOutcome:'delivered',balanceStones:stones,balanceHerbs:herbs});
    expect(negotiate(maker,'accept',record.id)).toBeNull();
    world.tick++;
    expect(negotiate(observer,'accept',record.id)).toBeNull();
    expect(negotiate(patron,'accept',record.id)).toBeNull();
    expect(negotiate(maker,'accept',record.id)).not.toBeNull();
    expect(negotiate(maker,'accept',record.id)).toBeNull();
    expect(order).toMatchObject({status:'cancelled',closeReason:'mutual_release',escrowStones:0,escrowHerbs:0,settledTick:world.tick});
    expect(record).toMatchObject({status:'accepted',returnedStones:stones,returnedHerbs:herbs,responderId:maker.id});
    expect(patron.spiritStones).toBe(before+stones);
    expect(patron.herbs[WORKSHOP_HERB]).toBe(roots+herbs);
    expect(patron.artifacts).toEqual([artifact]);
    expect(maker.spiritStones).toBe(paidBalance);
    expect(order.work).toEqual(work);
    const flow=projectResourceFlowMonth(world,world.tick,{kind:'observer'})!.rows;
    expect(flow.filter(row=>row.reason==='workshop_refund').map(row=>[row.good,row.amount])).toEqual([['stone',stones],[WORKSHOP_HERB,herbs]]);
  });

  it('documents genuinely unavailable first stock without falsely restoring its consumed inputs',()=>{
    const {world,order,patron,maker,negotiate}=nativeFirstFinish('fine');
    const proof=workshopReleaseSource(order)!;
    expect(proof.firstOutcome).toBe('stock_unavailable');
    expect(order.work[1]).toMatchObject({quality:'standard'});
    expect(patron.artifacts).toEqual([]);
    expect(negotiate(maker,'propose')).not.toBeNull();
    const record=order.releaseNegotiations![0];
    expect(record.firstOutcome).toBe('stock_unavailable');
    world.tick++;
    expect(negotiate(patron,'accept',record.id)).not.toBeNull();
    expect(record.returnedHerbs).toBe(2);
    expect(patron.herbs[WORKSHOP_HERB]).toBe(22);
    expect(patron.artifacts).toEqual([]);
    expect(order.work[1].feePaid).toBeUndefined();
  });

  it('declines without touching the existing artifact, wages, escrow, or third-party markets',()=>{
    const f=nativeFirstFinish(),{world,order,patron,maker,observer,negotiate}=f;
    expect(negotiate(patron,'propose')).not.toBeNull();
    const row=order.releaseNegotiations![0];
    expect(negotiate(maker,'decline',row.id)).toBeNull();
    world.tick++;
    const financial=()=>structuredClone({escrow:[order.escrowStones,order.escrowHerbs],
      inventories:[patron,maker,observer].map(a=>[a.artifacts,a.herbs,a.spiritStones]),markets:world.markets,work:order.work});
    const before=financial(),wrongPlace=world.locations.find(site=>site.id!==order.siteId)!.id;
    maker.locationId=wrongPlace;
    expect(availableWorkshopReleaseActions(maker,world)).toEqual([]);
    expect(negotiate(maker,'accept',row.id)).toBeNull();
    maker.locationId=order.siteId;
    observer.name=maker.name;
    expect(negotiate(observer,'accept',row.id)).toBeNull();
    expect(negotiate({...maker},'accept',row.id)).toBeNull();
    patron.locationId=wrongPlace;
    expect(negotiate(maker,'accept',row.id)).toBeNull();
    expect(negotiate(maker,'decline',row.id)).not.toBeNull();
    expect(row).toMatchObject({status:'declined',closedTick:world.tick,responderId:maker.id});
    expect(row.returnedStones).toBeUndefined();
    expect(row.returnedHerbs).toBeUndefined();
    expect(negotiate(maker,'accept',row.id)).toBeNull();
    expect(order.status).toBe('active');
    expect(financial()).toEqual(before);
  });

  it('honors both orders in the same-month work/accept race without releasing twice',()=>{
    for(const acceptFirst of [false,true]){
      const {world,order,patron,maker,negotiate,perform}=nativeFirstFinish();
      expect(negotiate(patron,'propose')).not.toBeNull();
      const row=order.releaseNegotiations![0],before=patron.spiritStones;
      world.tick++;
      if(acceptFirst){
        expect(negotiate(maker,'accept',row.id)).not.toBeNull();
        expect(perform()).toBeNull();
        expect(row.status).toBe('accepted');
        expect(order.work).toHaveLength(2);
        expect(patron.spiritStones).toBe(before+row.balanceStones);
      }else{
        expect(perform()).not.toBeNull();
        expect(negotiate(maker,'accept',row.id)).toBeNull();
        advanceWorkshops(world);
        expect(row).toMatchObject({status:'superseded',supersededBy:'work_changed'});
        expect(order.work).toHaveLength(3);
        expect(patron.spiritStones).toBe(before);
      }
      expect(negotiate(maker,'accept',row.id)).toBeNull();
      expect(world.resourceFlow.months.find(m=>m.tick===world.tick)?.entries.filter(r=>r.reason==='workshop_refund')??[])
        .toHaveLength(acceptFirst?2:0);
      expect(patron.artifacts).toHaveLength(1);
    }
  });

  it('lets native manufacture continue without a unilateral hold and distinguishes unpaid negotiations from contract expiry',()=>{
    const continuing=nativeFirstFinish();
    expect(continuing.negotiate(continuing.patron,'propose')).not.toBeNull();
    const pending=continuing.order.releaseNegotiations![0];
    expect(availableWorkshopActions(continuing.maker,continuing.world,false).some(row=>row.workshopMove==='work')).toBe(true);
    expect(continuing.perform()).not.toBeNull();
    continuing.world.tick++;
    expect(continuing.negotiate(continuing.maker,'accept',pending.id)).toBeNull();
    advanceWorkshops(continuing.world);
    expect(pending).toMatchObject({status:'superseded',supersededBy:'work_changed'});
    expect(continuing.order.status).toBe('active');
    const expiring=nativeFirstFinish();
    expect(expiring.negotiate(expiring.maker,'propose')).not.toBeNull();
    const offer=expiring.order.releaseNegotiations![0];
    expiring.world.tick=offer.expiresTick;
    expect(advanceWorkshops(expiring.world)).toEqual([]);
    expect(offer.status).toBe('expired');
    expect(expiring.order.status).toBe('active');
    expiring.world.tick=expiring.order.deadlineTick!;
    expect(advanceWorkshops(expiring.world)).toHaveLength(1);
    expect(expiring.order.closeReason).toBe('work_expired');
    expect(offer.returnedStones).toBeUndefined();
  });
});

const person=(world:WorldState,id:string)=>world.cultivators.find(actor=>actor.id===id)!;
const decision=(chosenAction:LLMDecisionPayload['chosenAction'],terms:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'依照已知的工坊约定。',...terms});
const next=(world:WorldState,orders:Record<string,LLMDecisionPayload>={})=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(actor=>[actor.id,orders[actor.id]??decision('REST')])),()=>.99,'utility');
const reload=(world:WorldState)=>decodeWorldSave(encodeWorldSave(world));
function forgery(raw:string,edit:(w:WorldState)=>void){
  const value=JSON.parse(raw) as {world:WorldState};edit(value.world);
  return ()=>decodeWorldSave(JSON.stringify(value));
}

describe('native workshop release strict continuation',()=>{
  it('uses actual seeded gather, movement, two work months and two live signatures; reopens strict proof',()=>{
    const patronId='npc-1',makerId='npc-6',siteId='loc-market';
    let world=createInitialWorld(1,'spirit-bloom');
    while(world.tick<9)world=next(world,{[patronId]:decision('GATHER_HERBS',{targetHerbId:'earth_root'})});
    expect(person(world,patronId).herbs.earth_root).toBeGreaterThanOrEqual(4);
    expect(person(world,makerId).locationId).toBe(siteId);
    world=next(world,{[patronId]:decision('EXPLORE',{targetLocationId:siteId})});
    expect(person(world,patronId).locationId).toBe(siteId);
    const newOrder=availableWorkshopActions(person(world,patronId),world).find(option=>option.workshopMove==='offer'&&
      option.workshopTier==='法器'&&option.workshopQuantity===2&&option.workshopQualityFloor==='standard'&&option.targetCultivatorId===makerId);
    expect(newOrder).toBeDefined();
    const {action:_action,...offer}=newOrder!;
    world=next(world,{[patronId]:decision('WORKSHOP',offer)});
    const id=world.workshops.orders[0].id;
    const order=(w:WorldState)=>w.workshops.orders.find(row=>row.id===id)!;
    const commissioned=(workshopMove:'accept'|'work')=>decision('WORKSHOP',{workshopMove,targetWorkshopId:id});
    world=next(world,{[makerId]:commissioned('accept')});
    expect(order(world).status).toBe('active');
    for(let work=0;work<2;work++){
      world=reload(next(world,{[makerId]:commissioned('work')}));
      expect(order(world).work).toHaveLength(work+1);
    }
    const finished=order(world).work[1],artifact=person(world,patronId).artifacts.find(row=>row.id===finished.artifactId);
    expect(artifact?.workshopOrigin?.orderId).toBe(id);
    expect(availableWorkshopReleaseActions(person(world,patronId),world)).toEqual([]);
    expect(availableWorkshopReleaseActions(person(world,patronId),world,world.tick+1).map(r=>r.workshopReleaseMove)).toEqual(['propose']);
    const propose=decision('WORKSHOP_RELEASE',{workshopReleaseMove:'propose',targetWorkshopId:id});
    world=reload(next(world,{[patronId]:propose}));
    const pending=order(world).releaseNegotiations![0];
    expect(pending.status).toBe('offered');
    expect(availableWorkshopReleaseActions(person(world,makerId),world)).toEqual([]);
    const originalDuty=structuredClone(order(world).work),control=next(world);
    const accept=decision('WORKSHOP_RELEASE',{workshopReleaseMove:'accept',targetWorkshopId:id,targetWorkshopReleaseId:pending.id});
    const alternative=next(world,{[makerId]:{...accept,workshopReleaseMove:'decline'}});
    expect(order(reload(alternative)).releaseNegotiations![0]).toMatchObject({status:'declined',closedTick:world.tick+1,responderId:makerId});
    expect(order(alternative).work).toEqual(originalDuty);
    expect(order(alternative).status).toBe('active');
    expect(order(alternative).escrowStones).toBe(pending.balanceStones);
    const expiration=reload(next(control,{[makerId]:accept}));
    expect(order(expiration).releaseNegotiations![0]).toMatchObject({status:'expired',closedTick:pending.expiresTick});
    expect(order(expiration).status).toBe('active');
    expect(order(expiration).refundedStones).toBe(0);
    const prediction=next(world,{[makerId]:accept});
    const raw=encodeWorldSave(prediction),sameFromSave=next(reload(world),{[makerId]:accept});
    expect(encodeWorldSave(sameFromSave)).toBe(raw);
    const reopened=decodeWorldSave(raw),closed=order(reopened),last=closed.releaseNegotiations![0];
    expect(last).toMatchObject({status:'accepted',proposerId:patronId,responderId:makerId,
      offeredTick:pending.offeredTick,closedTick:world.tick+1,returnedStones:pending.balanceStones,returnedHerbs:pending.balanceHerbs});
    expect(closed).toMatchObject({status:'cancelled',closeReason:'mutual_release',escrowStones:0,escrowHerbs:0});
    expect(closed.work).toEqual(originalDuty);
    expect(person(reopened,patronId).spiritStones).toBe(person(control,patronId).spiritStones+pending.balanceStones);
    expect(person(reopened,patronId).herbs.earth_root).toBe(person(control,patronId).herbs.earth_root+pending.balanceHerbs);
    expect(person(reopened,makerId).spiritStones).toBe(person(control,makerId).spiritStones);
    expect(person(reopened,patronId).artifacts.filter(row=>row.id===artifact!.id)).toEqual([artifact]);
    expect(reopened.markets).toEqual(control.markets);
    expect(reopened.resourceFlow.months.find(row=>row.tick===reopened.tick)?.entries.flatMap(entry=>entry.kind==='transfer'&&entry.refId===id&&entry.reason==='workshop_refund'?
      [[entry.good,entry.amount,entry.from,entry.to]]:[])).toEqual([
      ['stone',pending.balanceStones,{kind:'workshop',id},{kind:'actor',id:patronId}],
      ['earth_root',pending.balanceHerbs,{kind:'workshop',id},{kind:'actor',id:patronId}],
    ]);
    expect(encodeWorldSave(next(reopened))).toBe(encodeWorldSave(next(reload(reopened))));
    const release=(w:WorldState)=>order(w).releaseNegotiations![0];
    expect([finished.tick,pending.offeredTick,last.closedTick,pending.balanceStones,pending.balanceHerbs]).toEqual([14,15,16,55,2]);
    const eventId='evt-workshop-'+id+'-'+prediction.tick+'-release-accepted';
    const mutations: Array<[string,string,(w:WorldState)=>void]>=[
      ['wrong signatory','reply',w=>{release(w).responderId=patronId;}],
      ['same-month accept','reply',w=>{release(w).closedTick=pending.offeredTick;}],
      ['different prior outcome','proof',w=>{release(w).firstOutcome='stock_unavailable';}],
      ['increase historic balance','proof',w=>{release(w).balanceStones++;}],
      ['increase returned units','settlement',w=>{release(w).returnedHerbs!++;}],
      ['phantom closing trail','proof',w=>{order(w).releaseNegotiations!.push(structuredClone(release(w)));}],
      ['removed accepted trail','missing',w=>{delete order(w).releaseNegotiations;}],
      ['public signature event','event',w=>{delete w.events.find(row=>row.id===eventId)!.witnessScope;}],
      ['missing durable private result','historicalReceipt',w=>{
        w.eraHistory.receipts=w.eraHistory.receipts.filter(receipt=>receipt.eventId!==eventId);
      }],
      ['unrelated resource journal','refundJournal',w=>{
        w.resourceFlow.months.flatMap(row=>row.entries).find(entry=>entry.refId===id&&entry.reason==='workshop_refund'&&entry.good==='stone')!.refId='commission-forged';
      }],
    ];
    for(const [label,field,edit] of mutations)expect(forgery(raw,edit),label).toThrow('workshops.release.'+field);
    const query={kind:'workshop' as const,id};
    const sameNameOutsider='npc-8';
    expect(projectEraHistory(reopened,query,patronId)).toMatchObject([{source:'live_event',receipt:{eventId,status:'cancelled',delivered:1}}]);
    let later=reopened;
    // Populate the real 120-event ring with native co-present social events; no deleting an original row by hand.
    const recentEvents={
      [patronId]:decision('SOCIALIZE',{targetCultivatorId:makerId}),
      [makerId]:decision('SOCIALIZE',{targetCultivatorId:patronId}),
    };
    while(later.tick<reopened.tick+100&&later.events.some(row=>row.id===eventId))later=next(later,recentEvents);
    later=reload(later);
    expect(later.tick).toBeGreaterThan(reopened.tick);
    expect(later.events.some(row=>row.id===eventId)).toBe(false);
    for(const id of [patronId,makerId])expect(projectEraHistory(later,query,id)).toMatchObject([
      {source:'native_receipt',receipt:{eventId,status:'cancelled',delivered:1}},
    ]);
    later.cultivators.find(row=>row.id===sameNameOutsider)!.name=person(later,patronId).name;
    expect(projectEraHistory(later,query,sameNameOutsider)).toEqual([]);
    expect(projectEraHistory(later,query)).toEqual([]);
  });
});

it('cannot reopen an actual native capacity amendment as bilateral surplus release',()=>{
  const {world,payer,maker,supervisor,orderId,caseId,work}=workshopCapacityFixture();
  const proposed=workshopCapacityTurn(world,{[maker]:workshopCapacityMove('offer',orderId)});
  let current=workshopCapacityTurn(proposed,{[payer]:workshopCapacityMove('accept',orderId)});
  expect(workshopCapacityOrder(current,orderId).capacityAmendment).toBeDefined();
  expect(availableWorkshopReleaseActions(workshopCapacityActor(current,maker),current,current.tick+1)).toEqual([]);
  const hazardEnd=current.mapHazards.find(row=>row.kind==='beast_tide')!.expiresTick;
  while(current.tick+1<hazardEnd)current=workshopCapacityTurn(current);
  for(const furnaceSafetyMove of ['inspect','repair','reopen'] as const){
    current=workshopCapacityTurn(current,{[supervisor]:workshopCapacityChoice('FURNACE_SAFETY',{furnaceSafetyMove,targetFurnaceSafetyId:caseId})});
  }
  current=reload(workshopCapacityTurn(current,{[maker]:work}));
  const order=workshopCapacityOrder(current,orderId);
  expect(order).toMatchObject({status:'completed',quantity:2});
  expect(order.work).toHaveLength(2);
  expect(order.capacityAmendment).toBeDefined();
  expect(workshopReleaseSource(order)).toBeUndefined();
  for(const id of [payer,maker])expect(availableWorkshopReleaseActions(workshopCapacityActor(current,id),current,current.tick+1)).toEqual([]);
  expect(order.releaseNegotiations).toBeUndefined();
});
