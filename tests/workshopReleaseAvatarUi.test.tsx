import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {WorkshopReleaseRead,reviewedWorkshopRelease,workshopReleaseMenu} from '../src/components/WorkshopReleaseRead';
import {EraHistoryReceipts} from '../src/components/EraHistoryPanel';
import type {EraHistoryView} from '../src/engine/eraHistoryIndex';
import {AVATAR_ORDER_COST,possessAvatar,queueAvatarWorkshopRelease} from '../src/engine/avatarEngine';
import {availableWorkshopReleaseActions,resolveWorkshopAction,type WorkshopReleaseOption} from '../src/engine/workshopEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import type {LLMDecisionPayload,WorkshopOrder,WorkshopReleaseNegotiation,WorldState} from '../src/types/world';

const order:WorkshopOrder={id:'private-order-id',patronId:'p',makerId:'m',siteId:'loc-market',tier:'法器',quantity:2,
  qualityFloor:'standard',status:'active',offeredTick:1,offerExpiresTick:5,acceptedTick:2,deadlineTick:19,
  escrowStones:12,escrowHerbs:2,refundedStones:0,refundedHerbs:0,
  work:[{tick:3,makerId:'m',piece:1,stage:'blank',stonesUsed:2,herbsUsed:1},
    {tick:4,makerId:'m',piece:1,stage:'finish',stonesUsed:2,herbsUsed:1,quality:'standard',qualityScore:60,artifactId:'private-artifact-id',feePaid:5}]};
const proposed:WorkshopReleaseNegotiation={id:'private-negotiation-id',proposerId:'m',offeredTick:5,expiresTick:7,
  firstFinishTick:4,firstOutcome:'delivered',balanceStones:12,balanceHerbs:2,status:'offered'};
const accept:WorkshopReleaseOption={action:'WORKSHOP_RELEASE',workshopReleaseMove:'accept',
  targetWorkshopId:order.id,targetWorkshopReleaseId:proposed.id};
const revision={};
it('shows only the original responding party its exact option and never treats an offer as a refund',()=>{
  const signed={...order,releaseNegotiations:[proposed]};
  const controls={scopeKey:'branch-one',revisionKey:revision,choices:[accept],onQueue:()=>true};
  const html=renderToStaticMarkup(<WorkshopReleaseRead order={signed} actorId="p" tick={5} controls={controls}/>);
  expect(html).toContain('同意停作余件');
  expect(html).toContain('托管没动，工序未停');
  expect(html).not.toMatch(/退回本人|private-|记作下月打算/);
  expect(workshopReleaseMenu(signed,'m',5,[accept])).toEqual([]);
  expect(workshopReleaseMenu(signed,'p',6,[accept])).toEqual([]);
  expect(workshopReleaseMenu(signed,'p',5,[accept,accept])).toEqual([]);
  expect(reviewedWorkshopRelease({choice:accept,revision},{},[accept])).toBeUndefined();
  expect(renderToStaticMarkup(<WorkshopReleaseRead order={signed} actorId="other" tick={5} controls={controls}/>)).toBe('');
});
it('renders accepted terms and old deliveries, or expired/failed material without fabricating accepted settlement',()=>{
  const accepted:WorkshopReleaseNegotiation={...proposed,status:'accepted',closedTick:6,responderId:'p',returnedStones:12,returnedHerbs:2};
  let html=renderToStaticMarkup(<WorkshopReleaseRead order={{...order,status:'cancelled',closeReason:'mutual_release',
    releaseNegotiations:[accepted]}} actorId="p" tick={6}/>);
  expect(html).toContain('退回本人 12 灵石、2 株玄土根');
  expect(html).toContain('首件已交，实发工钱不重算');
  expect(html).not.toContain('<button');
  const first=order.work[1];
  const expired:WorkshopReleaseNegotiation={...proposed,status:'expired',closedTick:7,firstOutcome:'stock_unavailable'};
  html=renderToStaticMarkup(<WorkshopReleaseRead order={{...order,work:[order.work[0],{...first,quality:'failed',
    artifactId:undefined,feePaid:undefined}],releaseNegotiations:[expired]}} actorId="m" tick={7}/>);
  expect(html).toContain('没有达标器物交付');
  expect(html).toContain('没有据此退款');
  expect(html).not.toContain('已同意');
});
it('labels only the exact archived confirmation as mutual consent, not an older generic cancellation',()=>{
  const receipt={kind:'workshop',orderId:order.id,tick:8,year:1001,month:8,eventId:'',patronId:'p',
    makerId:'m',status:'cancelled',delivered:1} as const;
  const rows:EraHistoryView[]=['release-accepted','close','future-release-accepted'].map(phase=>({source:'native_receipt',
    receipt:{...receipt,eventId:'evt-workshop-'+order.id+'-8-'+phase}}));
  const html=renderToStaticMarkup(<EraHistoryReceipts rows={rows} query={{kind:'workshop',id:order.id}}/>);
  expect(html.match(/经双方同意停作余件/g)).toHaveLength(1);
  expect(html.match(/工坊原单终止/g)).toHaveLength(2);
  expect(html).not.toContain(order.id);
});

it('uses an explicit native avatar payload, consumes essence once and only credits the live balance next month',()=>{
  let world=createInitialWorld(6031),maker=world.cultivators[0],patron=world.cultivators[1];
  const ids=[maker.id,patron.id],site=world.locations.find(row=>row.id==='loc-market')!;
  // Deliberately controlled small local setup, not the long-running historical lineage.
  site.furnaceGrade=1;site.spiritRoot='木';
  for(const actor of [maker,patron]){
    actor.locationId=site.id;actor.realm='练气';actor.techniqueMastery=0;actor.spiritStones=400;actor.herbs.earth_root=24;
  }
  maker.spiritRoot='金';
  const rest={chosenAction:'REST',innerMonologue:'不另立约。'} as const;
  const tick=(w:WorldState)=>advanceWorldTick(w,Object.fromEntries(w.cultivators.map(person=>[person.id,rest])),()=>0,'utility');
  const native=(who:typeof maker,extra:Partial<LLMDecisionPayload>)=>resolveWorkshopAction(world,who,{
    chosenAction:'WORKSHOP',innerMonologue:'当面原物约。',...extra},()=>0);
  expect(native(patron,{workshopMove:'offer',targetCultivatorId:maker.id,workshopTier:'法器',workshopQuantity:2,workshopQualityFloor:'standard'})).toBeTruthy();
  const key=world.workshops.orders.at(-1)!.id;
  expect(native(maker,{workshopMove:'accept',targetWorkshopId:key})).toBeTruthy();
  world=tick(world);maker=world.cultivators.find(person=>person.id===ids[0])!;
  expect(native(maker,{workshopMove:'work',targetWorkshopId:key})).toBeTruthy();
  world=tick(world);maker=world.cultivators.find(person=>person.id===ids[0])!;
  expect(native(maker,{workshopMove:'work',targetWorkshopId:key})).toBeTruthy();
  const getOrder=()=>world.workshops.orders.find(row=>row.id===key)!;
  const balance=getOrder().escrowStones,roots=getOrder().escrowHerbs,first=getOrder().work[1].artifactId;
  expect(first).toBeTruthy();
  const proposal=availableWorkshopReleaseActions(maker,world,world.tick+1).find(row=>row.workshopReleaseMove==='propose');
  expect(proposal).toBeTruthy();
  expect(queueAvatarWorkshopRelease(world,maker.id,proposal!)).toBe(false);
  expect(possessAvatar(world,maker.id)).toBe(true);
  // Ordinary three-month switch cooldown; schedule the first action close enough to its end for the second body.
  world=tick(tick(world));
  maker=world.cultivators.find(person=>person.id===ids[0])!;
  const essence=world.playerAvatar.essence;
  expect(queueAvatarWorkshopRelease(world,maker.id,proposal!)).toBe(true);
  expect(queueAvatarWorkshopRelease(world,maker.id,proposal!)).toBe(false);
  expect(world.playerAvatar.essence).toBe(essence-AVATAR_ORDER_COST);
  expect(getOrder().escrowStones).toBe(balance);
  expect(getOrder().releaseNegotiations).toBeUndefined();
  const packed=encodeEraWorldSave(world);world=decodeEraWorldSave(packed);expect(encodeEraWorldSave(world)).toBe(packed);
  const wrong=structuredClone(world),wrongPending=wrong.playerAvatar.pendingOrder;
  if(wrongPending?.action!=='WORKSHOP_RELEASE')throw Error('No actual pending option');
  wrongPending.targetWorkshopId='wrong-original-order';
  expect(()=>decodeEraWorldSave(encodeEraWorldSave(wrong))).toThrow();
  const extra=structuredClone(world);
  Object.assign(extra.playerAvatar.pendingOrder!,{targetWorkshopReleaseId:'forged-respondent-id'});
  expect(()=>decodeEraWorldSave(encodeEraWorldSave(extra))).toThrow();
  world=tick(world);
  const offer=getOrder().releaseNegotiations?.[0];
  expect(offer?.status).toBe('offered');
  expect(getOrder().escrowStones).toBe(balance);
  patron=world.cultivators.find(person=>person.id===ids[1])!;
  const respond=availableWorkshopReleaseActions(patron,world,world.tick+1).find(row=>row.workshopReleaseMove==='accept');
  expect(respond).toBeTruthy();
  expect(possessAvatar(world,patron.id)).toBe(true);
  expect(queueAvatarWorkshopRelease(world,patron.id,respond!)).toBe(true);
  expect(getOrder().escrowHerbs).toBe(roots);
  const pendingResponse=encodeEraWorldSave(world);
  world=decodeEraWorldSave(pendingResponse);
  expect(encodeEraWorldSave(world)).toBe(pendingResponse);
  world=tick(world);
  expect(getOrder()).toMatchObject({status:'cancelled',closeReason:'mutual_release',escrowStones:0,escrowHerbs:0,
    refundedStones:balance,refundedHerbs:roots});
  expect(world.cultivators.find(person=>person.id===ids[1])?.artifacts.some(artifact=>artifact.id===first)).toBe(true);
});
