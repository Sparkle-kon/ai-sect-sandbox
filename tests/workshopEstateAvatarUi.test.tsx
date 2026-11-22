import {WorkshopPanel} from '../src/components/WorkshopPanel';
import {AVATAR_ORDER_COST,possessAvatar,queueAvatarWorkshopEstate} from '../src/engine/avatarEngine';
import {availableWorkshopEstateActions} from '../src/engine/workshopEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {estateActor,estateHeirId,estateMakerId,estateMonth,estateOpenAfterNativeDeath,estateOrder,estateWork,patronEstate}
  from './workshopEstateNativeFixture';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {WorkshopEstateRead,reviewedWorkshopEstate} from '../src/components/WorkshopEstateRead';
import type {WorkshopEstateOption} from '../src/engine/workshopEngine';
import type {WorkshopOrder} from '../src/types/world';

const blank:WorkshopOrder['work'][0]={tick:3,makerId:'private-maker',piece:1,stage:'blank',stonesUsed:2,herbsUsed:1};
const order:WorkshopOrder={id:'private-workshop',makerId:blank.makerId,patronId:'private-deceased',
  siteId:'loc-market',tier:'法器',quantity:1,qualityFloor:'fine',status:'probate_hold',
  offeredTick:1,offerExpiresTick:5,acceptedTick:2,deadlineTick:7,
  escrowStones:6,escrowHerbs:1,refundedStones:0,refundedHerbs:0,work:[blank],
  estateContinuation:{estateId:'private-estate',heldTick:4,heldStones:6,heldHerbs:1,phase:'held'}};
const offer:WorkshopEstateOption={action:'WORKSHOP_ESTATE',workshopEstateMove:'offer',targetWorkshopId:order.id};
const confirm:WorkshopEstateOption={...offer,workshopEstateMove:'accept'};
const terms={...order.estateContinuation!,beneficiaryId:'heir',offeredTick:6,replyUntilTick:9};
const controls=(...choices:WorkshopEstateOption[])=>({scopeKey:'branch-proof',revisionKey:order,choices,onQueue:vi.fn(()=>true)});
it('shows the protected old blank and exact lawful next-month request, without pretending to resume or deliver',()=>{
  const html=renderToStaticMarkup(<WorkshopEstateRead order={order} actorId="heir" tick={5} controls={controls(offer)}/>);
  expect(html).toContain('旧坯仍封存');
  expect(html).toContain('持原据请续制');
  expect(html).toContain('尚未复工');
  expect(html).not.toContain('已实际交给');
  expect(html).not.toMatch(/private-|branch-proof/);
  expect(renderToStaticMarkup(<WorkshopEstateRead order={order} actorId="heir" tick={5}/>)).not.toContain('<button');
  expect(renderToStaticMarkup(<WorkshopEstateRead order={order} actorId={order.makerId} tick={5} controls={controls(offer)}/>))
    .not.toContain('持原据请续制');
});
it('requires the same maker and a timely reply; stale and duplicate reviewed quotes do not enable payment',()=>{
  const offered:WorkshopOrder={...order,estateContinuation:{...terms,phase:'offered'}};
  const scoped=controls(confirm);
  const read=(id:string,tick:number)=>renderToStaticMarkup(<WorkshopEstateRead order={offered} actorId={id} tick={tick} controls={scoped}/>);
  expect(read(order.makerId,6)).toContain('同意原坯续制');
  expect(read('heir',6)).not.toContain('<button');
  expect(read(order.makerId,8)).not.toContain('<button');
  expect(reviewedWorkshopEstate({choice:confirm,revision:order},{},[confirm])).toBeUndefined();
  expect(reviewedWorkshopEstate({choice:confirm,revision:order},order,[confirm,confirm])).toBeUndefined();
});
it('distinguishes permission from exact finish or refused return, with only actual original money',()=>{
  const resumed:WorkshopOrder={...order,status:'active',estateContinuation:{...terms,phase:'resumed',resumeTick:7,workUntilTick:10}};
  const read=(row:WorkshopOrder)=>renderToStaticMarkup(<WorkshopEstateRead order={row} actorId="heir" tick={10}/>);
  expect(read(resumed)).toContain('还须实际完工验质');
  const finished:WorkshopOrder={...resumed,status:'completed',estateContinuation:{...resumed.estateContinuation!,phase:'completed',closedTick:8},
    work:[blank,{...blank,tick:8,stage:'finish',artifactId:'private-canonical-artifact',feePaid:6}]};
  expect(read(finished)).toContain('器物已实际交给核定的受益人');
  expect(read(finished)).not.toContain('private-canonical-artifact');
  const failed:WorkshopOrder={...finished,refundedStones:2,
    work:[blank,{...blank,tick:8,stage:'finish',quality:'failed',qualityScore:10}]};
  expect(read(failed)).toContain('无器物交割，也未付工钱');
  expect(read(failed)).toContain('已实退未耗余料：2 灵石');
  expect(read(failed)).not.toContain('器物已实际交给');
  const declined:WorkshopOrder={...resumed,status:'cancelled',closeReason:'estate_returned',refundedStones:6,refundedHerbs:1,
    estateContinuation:{...resumed.estateContinuation!,phase:'released',releaseReason:'declined',closedTick:8}};
  expect(read(declined)).toContain('原工匠谢绝续制');
  expect(read(declined)).toContain('只实退未耗的 6 灵石、1 株玄土根');
  expect(read(declined)).not.toContain('器物已实际交给');
});

it('queues the adjudicated heir and later the original maker with strict pending restore, preserving the one true blank',()=>{
  const start=estateOpenAfterNativeDeath();
  let world=start.world;
  const estate=patronEstate(world),original=estateWork(world).work[0],cash=estateWork(world).escrowStones;
  const scene=(id:string)=>renderToStaticMarkup(<WorkshopPanel world={world} cultivator={estateActor(world,id)}/>);
  expect(scene(estateHeirId)).not.toContain('承接旧坯');
  world=estateMonth(world,{[estateHeirId]:estateOrder('CLAIM_ESTATE',{targetEstateId:estate.id})});
  while(world.tick<estate.closesTick-2)world=estateMonth(world);
  expect(possessAvatar(world,estateHeirId)).toBe(true);
  while(world.tick<estate.closesTick)world=estateMonth(world);
  expect(patronEstate(world)).toMatchObject({status:'settled',beneficiaryId:estateHeirId});
  expect(scene(estateHeirId)).toContain('旧坯仍封存');
  const unauthorized=world.cultivators.find(row=>row.alive&&row.id!==estateHeirId&&row.id!==estateMakerId)!;
  expect(scene(unauthorized.id)).not.toContain('承接旧坯');
  const use=(actorId:string,move:WorkshopEstateOption['workshopEstateMove'])=>{
    const option=availableWorkshopEstateActions(estateActor(world,actorId),world,world.tick+1).find(row=>row.workshopEstateMove===move);
    expect(option).toBeTruthy();
    const essence=world.playerAvatar.essence,stones=estateWork(world).escrowStones;
    expect(queueAvatarWorkshopEstate(world,actorId,option!)).toBe(true);
    expect(queueAvatarWorkshopEstate(world,actorId,option!)).toBe(false);
    expect(world.playerAvatar.essence).toBe(essence-AVATAR_ORDER_COST);
    expect(estateWork(world).escrowStones).toBe(stones);
    const raw=encodeEraWorldSave(world);
    world=decodeEraWorldSave(raw);
    expect(encodeEraWorldSave(world)).toBe(raw);
    world=estateMonth(world);
    expect(world.playerAvatar.pendingOrder).toBeUndefined();
  };
  use(estateHeirId,'offer');
  expect(estateWork(world)).toMatchObject({work:[original],escrowStones:cash,status:'probate_hold',estateContinuation:{phase:'offered'}});
  expect(possessAvatar(world,estateMakerId)).toBe(true);
  use(estateMakerId,'accept');
  expect(estateWork(world)).toMatchObject({work:[original],escrowStones:cash,status:'active',estateContinuation:{phase:'resumed'}});
  expect(scene(estateHeirId)).toContain('还须实际完工验质');
  expect(scene(estateHeirId)).not.toContain('器物已实际交给');
});
