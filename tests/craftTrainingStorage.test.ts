import {describe,expect,it} from 'vitest';
import {possessAvatar,queueAvatarCraftTraining} from '../src/engine/avatarEngine';
import {availableCraftTrainingActions} from '../src/engine/craftTrainingEngine';
import {decodeEraWorldSave,decodeWorldSave,encodeEraWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import type {WorldState} from '../src/types/world';
import {blankNativeCraftTraining,craftActor,craftChoice,craftFirst,craftKeeper,craftMonth,craftProject,craftSecond,craftSite,
  finishedNativeCraftTraining,fundedNativeCraftTraining,offeredNativeCraftTraining,prepareNativeCraftTraining} from './craftTrainingNativeFixture';

const saved=(world:WorldState)=>decodeWorldSave(encodeWorldSave(world));
const project=(world:WorldState)=>craftProject(world)!;
const item=(world:WorldState)=>craftActor(world,craftKeeper).artifacts.find(item=>item.id===project(world).finish?.artifactId)!;
function corrupt(raw:string,mutator:(world:WorldState)=>void){
  const envelope=JSON.parse(raw) as {world:WorldState};
  mutator(envelope.world);
  return ()=>decodeWorldSave(JSON.stringify(envelope));
}
const flow=(w:WorldState,reason:string,good:'stone'|'earth_root')=>w.resourceFlow.months.flatMap(month=>month.entries)
  .find(line=>line.reason===reason&&line.refId===project(w).id&&line.good===good)!;

describe('strict craft training storage and original shared material lineage',()=>{
  it('keeps exact prior bytes and treats the keeper offer and true separate consent as non-interchangeable',()=>{
    const base=prepareNativeCraftTraining(),old=encodeWorldSave(base);
    expect(old).not.toContain('craftTraining');
    expect(encodeWorldSave(saved(base))).toBe(old);
    const {world:offered}=offeredNativeCraftTraining();
    expect(project(saved(offered))).toMatchObject({status:'offered',escrowStones:0,escrowRoots:0});
    const {first,world:funded}=fundedNativeCraftTraining();
    expect(project(saved(first))).toMatchObject({firstJoinedTick:5,status:'offered'});
    expect(project(saved(funded))).toMatchObject({status:'funded',firstJoinedTick:5,secondJoinedTick:6,fundedTick:6,escrowStones:55,escrowRoots:2});
    const raw=encodeWorldSave(funded);
    for(const [field,mutation] of [
      ['craftTraining.references',(w:WorldState)=>{project(w).traineeIds[1]=craftFirst;}],
      ['craftTraining.authority',(w:WorldState)=>{project(w).keeperId='npc-3';}],
      ['craftTraining.signatures',(w:WorldState)=>{project(w).secondJoinedTick=project(w).offeredTick;}],
      ['craftTraining.funding',(w:WorldState)=>{delete project(w).firstJoinedTick;}],
      ['craftTraining.funding',(w:WorldState)=>{project(w).workExpiresTick!++;}],
      ['craftTraining.custody',(w:WorldState)=>{project(w).escrowRoots++;}],
      ['craftTraining.projects[0].fiction',(w:WorldState)=>{Object.assign(project(w),{fiction:'没有备案的额外器具'});}],
    ] as const)expect(corrupt(raw,mutation)).toThrow(field);
    expect(corrupt(raw,w=>{delete w.craftTraining;})).toThrow('craftTraining.event');
  });

  it('requires the exact independently claimed onsite forge slots, conserved stages and actual durable artifact lineage',()=>{
    const {blank,world}=finishedNativeCraftTraining(),raw=encodeWorldSave(world);
    expect(project(saved(world))).toMatchObject({status:'completed',blank:{tick:7,actorId:craftFirst},finish:{tick:8,actorId:craftSecond}});
    const staged=craftMonth(saved(blank),{[craftSecond]:craftChoice(blank,craftSecond,'finish')});
    expect(encodeWorldSave(staged)).toBe(raw);
    const portable=encodeEraWorldSave(world);
    expect(encodeEraWorldSave(decodeEraWorldSave(portable))).toBe(portable);
    expect(item(world).craftTrainingOrigin).toMatchObject({projectId:project(world).id,siteId:craftSite,keeperId:craftKeeper,
      firstTraineeId:craftFirst,secondTraineeId:craftSecond,blankTick:7,finishedTick:8});

    const negatives:Array<[string,(w:WorldState)=>void]>=[
      ['craftTraining.furnace',w=>{w.furnaceReservations.uses=w.furnaceReservations.uses.filter(row=>row.tick!==7||row.actorId!==craftFirst);}],
      ['craftTraining.furnace',w=>{w.furnaceReservations.uses.find(row=>row.tick===8&&row.actorId===craftSecond)!.kind='repair';}],
      ['craftTraining.blank',w=>{project(w).blank!.masteryAfter=project(w).blank!.masteryBefore;}],
      ['craftTraining.finish',w=>{project(w).finish!.blankId='counterfeit-blank';}],
      ['craftTraining.finish',w=>{project(w).finish!.qualityScore++;}],
      ['craftTraining.finish',w=>{project(w).finish!.masteryAfter=project(w).finish!.masteryBefore;}],
      ['craftTraining.artifact',w=>{delete item(w).craftTrainingOrigin;}],
      ['craftTraining.artifact',w=>{item(w).craftTrainingOrigin!.keeperId=craftFirst;}],
      ['craftTraining.artifact',w=>{craftActor(w,craftFirst).artifacts.push(structuredClone(item(w)));}],
      ['craftTraining.event',w=>{delete w.events.find(row=>row.id==='evt-'+project(w).id+'-8-finish')!.witnessScope;}],
    ];
    for(const [field,mutate] of negatives)expect(corrupt(raw,mutate)).toThrow(field);
    let later=world;
    for(let i=0;i<6;i++)later=craftMonth(later);
    expect(later.furnaceReservations.uses.find(row=>row.tick===8&&row.actorId===craftSecond)).toBeUndefined();
    expect(project(saved(later)).finish).toEqual(project(world).finish);
    expect(item(saved(later)).craftTrainingOrigin).toEqual(item(world).craftTrainingOrigin);
  });

  it('binds real incomplete refunds to the original keeper; genuine failed grade consumes paid stages but gives no credit or artifact',()=>{
    const {world:blank}=blankNativeCraftTraining(),returned=craftMonth(blank,{[craftKeeper]:craftChoice(blank,craftKeeper,'withdraw')});
    const raw=encodeWorldSave(returned);
    expect(project(saved(returned))).toMatchObject({status:'withdrawn',refundedStones:27,refundedRoots:1,escrowStones:0,escrowRoots:0});
    expect(flow(returned,'craft_training_refund','stone')).toMatchObject({amount:27,kind:'transfer',to:{kind:'actor',id:craftKeeper}});
    expect(corrupt(raw,w=>{const receipt=flow(w,'craft_training_refund','stone');if(receipt.kind==='transfer')receipt.to.id=craftSecond;}))
      .toThrow('craftTraining.resourceJournal');
    expect(corrupt(raw,w=>{flow(w,'craft_training_deposit','earth_root').visibility={kind:'observer'};}))
      .toThrow('craftTraining.resourceJournal');
    expect(corrupt(raw,w=>{
      const payment=flow(w,'craft_training_refund','stone'),month=w.resourceFlow.months.find(book=>book.tick===payment.tick)!;
      month.entries.push({...structuredClone(payment),id:w.resourceFlow.nextId++});
      month.totalEntries++;
      month.totals.find(value=>value.good==='stone')!.transfer+=payment.amount;
    })).toThrow('craftTraining.resourceJournal');
    const {world:failure}=finishedNativeCraftTraining(true);
    const failed=project(saved(failure));
    expect(failed).toMatchObject({status:'failed',refundedStones:0,refundedRoots:0,finish:{grade:'failed'}});
    expect(failed.finish?.masteryAfter).toBe(failed.finish?.masteryBefore);
    expect(failed.finish?.artifactId).toBeUndefined();
  });

  it('reopens two independent same-month signatures and a later blank-then-refusal in actual actor order',()=>{
    const {world:offered}=offeredNativeCraftTraining();
    const funding=saved(craftMonth(offered,{
      [craftFirst]:craftChoice(offered,craftFirst,'join'),
      [craftSecond]:craftChoice(offered,craftSecond,'join'),
    }));
    expect(project(funding)).toMatchObject({status:'funded',firstJoinedTick:funding.tick,secondJoinedTick:funding.tick,
      fundedTick:funding.tick,escrowStones:55,escrowRoots:2});
    const month=craftMonth(funding,{
      [craftFirst]:craftChoice(funding,craftFirst,'blank'),
      [craftSecond]:craftChoice(funding,craftSecond,'decline'),
    });
    const reopened=saved(month),closed=project(reopened);
    expect(closed).toMatchObject({status:'declined',blank:{tick:month.tick,actorId:craftFirst},
      closedTick:month.tick,closedById:craftSecond,refundedStones:27,refundedRoots:1});
    expect(closed.finish).toBeUndefined();
    expect(corrupt(encodeWorldSave(month),w=>{project(w).closedById=craftKeeper;})).toThrow('craftTraining.reply');
  });

  it('preserves only exact move-specific next-turn avatar payloads',()=>{
    const world=prepareNativeCraftTraining();
    expect(possessAvatar(world,craftKeeper)).toBe(true);
    const option=availableCraftTrainingActions(craftActor(world,craftKeeper),world,world.tick+1)
      .find(row=>row.craftTrainingMove==='offer'&&row.targetCultivatorId===craftFirst&&row.targetCraftTraineeId===craftSecond)!;
    expect(queueAvatarCraftTraining(world,craftKeeper,option)).toBe(true);
    const raw=encodeWorldSave(world),reopened=decodeWorldSave(raw);
    expect(reopened.playerAvatar.pendingOrder).toEqual(world.playerAvatar.pendingOrder);
    expect(reopened.craftTraining).toBeUndefined();
    expect(project(craftMonth(reopened))).toMatchObject({keeperId:craftKeeper,traineeIds:[craftFirst,craftSecond],status:'offered'});
    expect(corrupt(raw,w=>{Object.assign(w.playerAvatar.pendingOrder!,{targetCraftTrainingId:'craft-training-99'});}))
      .toThrow('pendingOrder.targetCraftTrainingId');
    expect(corrupt(raw,w=>{Object.assign(w.playerAvatar.pendingOrder!,{targetCraftTraineeId:craftFirst});}))
      .toThrow('playerAvatar.craftTrainingOrder');
  });
});
