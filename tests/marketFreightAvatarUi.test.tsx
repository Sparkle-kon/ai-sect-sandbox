import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {MarketCaravansPanel} from '../src/components/MarketCaravansPanel';
import {reviewedMarketFreight} from '../src/components/MarketFreightRead';
import {AVATAR_ORDER_COST,possessAvatar,queueAvatarMarketFreight} from '../src/engine/avatarEngine';
import {availableMarketFreightActions} from '../src/engine/escortEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import type {MarketFreightMove,MarketFreightOption} from '../src/types/marketFreight';
import type {WorldState} from '../src/types/world';
import {acceptedNativeFreight,freightActor,freightBuyer,freightCarrier,freightContract,freightMonth,freightOpt,freightOther,freightSeller,
  nativeFreightShipment,offeredNativeFreight}
  from './marketFreightNativeFixture';

function quote(world:WorldState,id:string,move:MarketFreightMove){
  const forActor=availableMarketFreightActions(freightActor(world,id),world,world.tick+1);
  const row=forActor.find(r=>r.marketFreightMove===move&&(r.marketFreightMove!=='offer'||r.targetCultivatorId===freightCarrier));
  if(!row)throw Error('Exact native freight choice unavailable');
  return row;
}
function read(world:WorldState,id:string,withMenu=false){
  const viewer=freightActor(world,id),pending=world.playerAvatar.pendingOrder;
  return renderToStaticMarkup(<MarketCaravansPanel world={world} cultivator={viewer} freightControls={withMenu?
    {scopeKey:'private-branch',revisionKey:world,pending:pending?.action==='MARKET_FREIGHT'?pending:undefined,
      choices:pending?[]:availableMarketFreightActions(viewer,world,world.tick+1),onQueue:vi.fn(()=>true)}:undefined}/>);
}
it('only gives the actual seller a named measured freight option and never leaks private quote to buyer or a bystander',()=>{
  const {world}=nativeFreightShipment(),html=read(world,freightSeller,true);
  expect(html).toContain('坊市与跨境商队');
  expect(html).toContain('这一趟核载承运');
  expect(html).toContain('请'+freightActor(world,freightCarrier).name+'承运');
  expect(html).not.toContain('private-branch');
  const {world:offered}=offeredNativeFreight();
  expect(read(offered,freightOther,true)).not.toContain('这一趟核载承运');
  expect(read(offered,freightBuyer,true)).not.toContain('这一趟核载承运');
  const preview=read(offered,freightCarrier);
  expect(preview).toContain('卖单原挂 5 件；本趟只核 1 件');
  expect(preview).toContain('其余原单不因这趟而记成货损');
  expect(preview).toContain('委托人只托管了运费');
  expect(preview).not.toContain('亲自应下这趟货');
  expect(read(offered,freightCarrier,true)).toContain('亲自应下这趟货');
  const exact=quote(world,freightSeller,'offer');
  expect(reviewedMarketFreight({choice:exact,revision:world},{},[exact])).toBeUndefined();
  expect(reviewedMarketFreight({choice:exact,revision:world},world,[exact,exact])).toBeUndefined();
});
it('queues exact seller and later exact carrier next-month orders without immediate spending, with both pending shapes restored strictly',()=>{
  let {world}=nativeFreightShipment();
  const perform=(id:string,choice:MarketFreightOption)=>{
    const original=JSON.stringify([world.cultivators,world.markets,world.escorts]);
    expect(queueAvatarMarketFreight(world,id,choice)).toBe(false);
    expect(possessAvatar(world,id)).toBe(true);
    const essence=world.playerAvatar.essence;
    expect(queueAvatarMarketFreight(world,id,choice)).toBe(true);
    expect(queueAvatarMarketFreight(world,id,choice)).toBe(false);
    expect(world.playerAvatar.essence).toBe(essence-AVATAR_ORDER_COST);
    expect(JSON.stringify([world.cultivators,world.markets,world.escorts])).toBe(original);
    expect(read(world,id,true)).toContain('已候下月');
    const raw=encodeEraWorldSave(world);
    world=decodeEraWorldSave(raw);
    expect(encodeEraWorldSave(world)).toBe(raw);
    world=freightMonth(world);
    expect(world.playerAvatar.pendingOrder).toBeUndefined();
  };
  perform(freightSeller,quote(world,freightSeller,'offer'));
  expect(freightContract(world)).toMatchObject({status:'offered',feeEscrow:10,feePaid:0});
  world=offeredNativeFreight().world;
  perform(freightCarrier,quote(world,freightCarrier,'accept'));
  const result=freightContract(world);
  expect(result).toMatchObject({status:'active'});
  if(result?.freight?.dispatch){
    expect(result.freight.dispatch.tick).toBe(world.tick);
    expect(result.freight.dispatch.toTileId).not.toBe(result.freight.dispatch.fromTileId);
    expect(result).toMatchObject({feeEscrow:0,feePaid:10,rationsEscrow:1});
    expect(read(world,freightCarrier)).toContain('运费实付 10 灵石');
  }else{
    expect(result).toMatchObject({feeEscrow:10,feePaid:0,rationsEscrow:2});
    expect(read(world,freightCarrier)).toContain('尚未实走');
  }
  expect(read(world,freightCarrier)).not.toContain('有原商单的实到收据');
});
it('requires actual dispatch and matched delivery, and only reports the exact freight return on cancellation',()=>{
  const {world:accepted}=acceptedNativeFreight();
  let moving=accepted;
  for(let i=0;i<8&&!freightContract(moving)?.freight?.dispatch;i++)moving=freightMonth(moving);
  const departure=read(moving,freightSeller);
  expect(departure).toContain('运费实付 10 灵石');
  expect(departure).not.toContain('有原商单的实到收据');
  let end=moving;
  for(let i=0;i<12&&freightContract(end)?.status!=='delivered';i++)end=freightMonth(end);
  expect(read(end,freightSeller)).toContain('有原商单的实到收据：1 件确已送达');
  const unattested=structuredClone(end);
  unattested.markets.receipts=[];
  expect(read(unattested,freightSeller)).not.toContain('有原商单的实到收据');
  const offered=offeredNativeFreight().world;
  const withdrawn=freightMonth(offered,{[freightSeller]:freightOpt(offered,freightSeller,'withdraw')});
  const receipt=read(withdrawn,freightSeller);
  expect(receipt).toContain('实退委托人 10 灵石');
  expect(receipt).not.toContain('有原商单的实到收据');
});
