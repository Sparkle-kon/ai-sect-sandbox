import {describe,expect,it} from 'vitest';
import {possessAvatar,queueAvatarWaypostMeal} from '../src/engine/avatarEngine';
import {availablePilgrimageActions} from '../src/engine/pilgrimageEngine';
import {decodeEraWorldSave,decodeWorldSave,encodeEraWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {availableWaypostMealActions} from '../src/engine/waypostMealEngine';
import {waypostMealEventId} from '../src/types/waypostMeal';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import {acceptedWaypostMeal,mealActor,mealGuest,mealHost,mealJourney,mealLeaders,mealMonth,mealOrder,
  mealOutsider,offeredWaypostMeal,pairedMealPilgrims,pilgrimageOrder} from './waypostMealNativeFixture';

const row=(world:WorldState)=>world.waypostMeals!.meals[0];
const persisted=(world:WorldState)=>decodeWorldSave(encodeWorldSave(world));
function changed(raw:string,edit:(value:WorldState)=>void){
  const envelope=JSON.parse(raw) as {world:WorldState};
  edit(envelope.world);
  return ()=>decodeWorldSave(JSON.stringify(envelope));
}
const bill=(world:WorldState,reason:string)=>world.resourceFlow.months.flatMap(book=>book.entries).find(flow=>flow.reason===reason&&flow.refId===row(world).id)!;

describe('strict actual shared waypost and tracked provisioning',()=>{
  it('preserves legacy exact bytes when no settlement was offered, and holds one real leaf only if both independent live paths match',()=>{
    const {world:initial}=pairedMealPilgrims();
    const previous=encodeWorldSave(initial);
    expect(previous).not.toContain('waypostMeals');
    expect(previous).not.toContain('waypostMealWitnesses');
    expect(encodeWorldSave(decodeWorldSave(previous))).toBe(previous);
    const {world}=offeredWaypostMeal(),raw=encodeWorldSave(world),fresh=persisted(world);
    expect(encodeWorldSave(fresh)).toBe(raw);
    expect(row(fresh)).toMatchObject({status:'offered',escrowLeaves:1,spentLeaves:0,returnedLeaves:0});
    for(const id of mealLeaders){
      expect(mealJourney(fresh,id).waypostMealWitnesses).toEqual([expect.objectContaining({mealId:row(fresh).id,
        point:row(fresh).point,tileId:row(fresh).tileId,offeredTick:fresh.tick})]);
    }
    const negatives:Array<[string,(world:WorldState)=>void]>=[
      ['waypostMeals.source',w=>{row(w).hostVisit.pathIndex++;}],
      ['waypostMeals.source',w=>{row(w).guestVisit.reachedTick--; }],
      ['waypostMeals.source',w=>{row(w).guestVisit.companionId=row(w).hostVisit.companionId;}],
      ['waypostMeals.source',w=>{row(w).guestVisit=structuredClone(row(w).hostVisit);}],
      ['waypostMeals.source',w=>{row(w).hostVisit.destinationId=row(w).hostVisit.originId;}],
      ['waypostMeals.checkpoint',w=>{row(w).tileId='tile-0-0';}],
      ['waypostMeals.custody',w=>{row(w).returnedLeaves=1;}],
      ['waypostMeals.references',w=>{row(w).expiresTick++;}],
      ['waypostMeals.source',w=>{delete mealJourney(w,mealHost).waypostMealWitnesses;}],
      ['waypostMeals.source',w=>{const marks=mealJourney(w,mealHost).waypostMealWitnesses!;marks.push(structuredClone(marks[0]));}],
      ['waypostMeals.orphanWitness',w=>{delete w.waypostMeals;}],
      ['waypostMeals.meals[0].unknownSource',w=>{Object.assign(row(w),{unknownSource:'旁人转述'});}],
    ];
    for(const [path,edit] of negatives)expect(changed(raw,edit)).toThrow(path);
  });

  it('strictly retains the actual serving after native further travel overwrites the earlier path; arbitrary same-tile coordinates still fail',()=>{
    const {world,offered}=acceptedWaypostMeal(true),served=persisted(world),source=row(served);
    expect(row(served).recovery?.map(recovery=>recovery.afterHp-recovery.beforeHp)).toEqual([3,5]);
    const expected=encodeEraWorldSave(served);
    expect(encodeEraWorldSave(decodeEraWorldSave(expected))).toBe(expected);
    expect(encodeWorldSave(mealMonth(persisted(offered),{[mealGuest]:mealOrder(offered,mealGuest,'accept')}))).toBe(encodeWorldSave(served));

    let later=served;
    for(let i=0;i<8&&mealJourney(later,mealHost).legIndex===source.hostVisit.legIndex;i++){
      const choices:Record<string,LLMDecisionPayload>={};
      for(const id of mealLeaders){
        if(availablePilgrimageActions(mealActor(later,id),later,false,later.tick+1).some(q=>q.pilgrimageMove==='advance'&&!q.targetRoadId))
          choices[id]=pilgrimageOrder(later,id,'advance');
      }
      later=mealMonth(later,choices);
    }
    expect(mealJourney(later,mealHost).legIndex).toBeGreaterThan(source.hostVisit.legIndex);
    expect(mealJourney(later,mealHost).path[mealJourney(later,mealHost).pathIndex]).not.toEqual(source.point);
    expect(row(persisted(later))).toEqual(source);
    const historical=encodeWorldSave(later);
    expect(changed(historical,w=>{row(w).point.x+=0.1;})).toThrow('waypostMeals.source');
    expect(changed(historical,w=>{mealJourney(w,mealGuest).waypostMealWitnesses![0].reachedTick++;}))
      .toThrow('waypostMeals.source');
    expect(changed(historical,w=>{row(w).recovery![1].actorId=mealOutsider;})).toThrow('waypostMeals.recovery');
    expect(changed(historical,w=>{row(w).recovery![1].afterHp=999;})).toThrow('waypostMeals.recovery');
  });

  it('supports only exact spent-or-returned flows, proves original owner and hides wilderness receipts',()=>{
    const setup=offeredWaypostMeal(),served=acceptedWaypostMeal().world;
    const declined=persisted(mealMonth(setup.world,{[mealGuest]:mealOrder(setup.world,mealGuest,'decline')}));
    const raw=encodeWorldSave(declined);
    expect(row(declined)).toMatchObject({status:'declined',spentLeaves:0,returnedLeaves:1});
    expect(bill(declined,'waypost_meal_refund')).toMatchObject({amount:1,to:{kind:'actor',id:mealHost},kind:'transfer'});
    expect(changed(raw,w=>{
      const out=bill(w,'waypost_meal_refund');if (out.kind==='transfer') out.to.id=mealGuest;
    })).toThrow('waypostMeals.resourceJournal');
    expect(changed(raw,w=>{
      const out=bill(w,'waypost_meal_refund'),month=w.resourceFlow.months.find(book=>book.tick===out.tick)!;
      month.entries.push({...structuredClone(out),id:w.resourceFlow.nextId++});
      month.totalEntries++;
      month.totals.find(balance=>balance.good==='jade_leaf')!.transfer++;
    })).toThrow('waypostMeals.resourceJournal');
    expect(changed(raw,w=>{bill(w,'waypost_meal_deposit').visibility={kind:'observer'};})).toThrow('waypostMeals.resourceJournal');
    const closedEvent=waypostMealEventId(row(served).id,served.tick,'served'),accepted=encodeWorldSave(served);
    expect(changed(accepted,w=>{delete w.events.find(event=>event.id===closedEvent)!.witnessScope;})).toThrow('waypostMeals.event');
    expect(changed(accepted,w=>{w.events.find(event=>event.id===closedEvent)!.locationId='loc-taixu';})).toThrow('waypostMeals.event');
    expect(changed(accepted,w=>{bill(w,'waypost_meal_consumed').refId='other-native-escrow';})).toThrow('waypostMeals.resourceJournal');
  });

  it('allows a genuine same-month missed contact to settle deposit and return without preventing actual travel',()=>{
    const {world}=pairedMealPilgrims();
    const later=mealMonth(world,{
      [mealHost]:mealOrder(world,mealHost,'offer'),
      [mealGuest]:pilgrimageOrder(world,mealGuest,'advance'),
    });
    const reopened=persisted(later);
    expect(row(reopened)).toMatchObject({status:'missed',offeredTick:later.tick,closedTick:later.tick,escrowLeaves:0,
      spentLeaves:0,returnedLeaves:1});
    expect(mealJourney(reopened,mealGuest).lastMovedTick).toBe(later.tick);
    expect(mealActor(reopened,mealHost).herbs.jade_leaf).toBe(mealActor(world,mealHost).herbs.jade_leaf);
    expect(bill(reopened,'waypost_meal_deposit').tick).toBe(bill(reopened,'waypost_meal_refund').tick);
    expect(row(reopened).recovery).toBeUndefined();
  });

  it('persistently whitelists only the exact next authorized avatar response and resolves after reload',()=>{
    const {world}=offeredWaypostMeal();
    expect(possessAvatar(world,mealGuest)).toBe(true);
    const choice=availableWaypostMealActions(mealActor(world,mealGuest),world,world.tick+1).find(p=>p.waypostMealMove==='accept')!;
    expect(queueAvatarWaypostMeal(world,mealGuest,choice)).toBe(true);
    const raw=encodeWorldSave(world);
    expect(persisted(world).playerAvatar.pendingOrder).toEqual(world.playerAvatar.pendingOrder);
    expect(row(mealMonth(persisted(world))).status).toBe('served');
    expect(changed(raw,w=>{Object.assign(w.playerAvatar.pendingOrder!,{targetCultivatorId:mealHost});})).toThrow('pendingOrder.targetCultivatorId');
    expect(changed(raw,w=>{Object.assign(w.playerAvatar.pendingOrder!,{targetWaypostMealId:'waypost-meal-999'});})).toThrow('playerAvatar.waypostMealOrder');
  });
});
