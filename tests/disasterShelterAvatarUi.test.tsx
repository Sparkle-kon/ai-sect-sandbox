import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {MortalVillagesPanel} from '../src/components/MortalVillagesPanel';
import {DisasterShelterReceipt,reviewedDisasterShelter} from '../src/components/DisasterShelterRead';
import {AVATAR_ORDER_COST,possessAvatar,queueAvatarDisasterShelter} from '../src/engine/avatarEngine';
import {availableDisasterShelterActions} from '../src/engine/disasterShelterEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import type {DisasterShelterMove} from '../src/types/disasterShelter';
import type {WorldState} from '../src/types/world';
import {harmedNativeShelter,shelterAccepted,shelterActor,shelterCase,shelterGuest,shelterHost,shelterTurn}
  from './disasterShelterNativeFixture';

function quote(world:WorldState,id:string,move:DisasterShelterMove){
  const option=availableDisasterShelterActions(shelterActor(world,id),world,world.tick+1).find(row=>row.disasterShelterMove===move);
  if(!option)throw Error('Missing valid current shelter choice');
  return option;
}
function read(world:WorldState,id:string,canQueue=false){
  const actor=shelterActor(world,id),queued=world.playerAvatar.pendingOrder;
  return renderToStaticMarkup(<MortalVillagesPanel world={world} cultivator={actor} shelterControls={canQueue?
    {scopeKey:'secret-frame',revisionKey:world,choices:queued?[]:availableDisasterShelterActions(actor,world,world.tick+1),
      pending:queued?.action==='DISASTER_SHELTER'?queued:undefined,onQueue:vi.fn(()=>true)}:undefined}/>);
}
function occupied(){
  const setup=shelterAccepted();
  let world=setup.world;
  for(let i=1;i<setup.path.length;i++)world=shelterTurn(world);
  expect(shelterCase(world)?.status).toBe('occupied');
  return {...setup,world};
}
it('only shows the original scoped shelter card and exact named offer, without a new read-only button',()=>{
  const {world}=harmedNativeShelter(),guest=shelterActor(world,shelterGuest),html=read(world,shelterHost,true);
  expect(html).toContain('凡人村镇与赈济');
  expect(html).toContain('借一处避灾');
  expect(html).toContain('请'+guest.name+'来避灾');
  expect(html).not.toContain('secret-frame');
  expect(read(world,shelterHost)).not.toContain('借一处避灾');
  const observer=world.cultivators.find(row=>row.alive&&row.id!==shelterHost&&row.id!==shelterGuest)!;
  expect(read(world,observer.id,true)).not.toContain('借一处避灾');
  const c=quote(world,shelterHost,'offer');
  expect(reviewedDisasterShelter({choice:c,revision:world},{},[c])).toBeUndefined();
  expect(reviewedDisasterShelter({choice:c,revision:world},world,[c,c])).toBeUndefined();
});
it('separates reserved, outward route, true arrival, return before departure and genuine homecoming',()=>{
  const setup=shelterAccepted();
  expect(read(setup.world,shelterGuest)).toContain('尚未启程，也没有入住');
  const outward=shelterTurn(setup.world),out=read(outward,shelterGuest);
  expect(out).toContain('仍未到借住处');
  expect(out).not.toContain('确已到原订住处');
  const {world}=occupied();
  const lodged=read(world,shelterGuest);
  expect(lodged).toContain('确已到原订住处');
  expect(lodged).toContain('只有这位实际到场的代表占一处');
  expect(lodged).toContain('两户原籍和登记住处照旧');
  expect(lodged).not.toContain(shelterCase(world)!.id);
  const lost=renderToStaticMarkup(<DisasterShelterReceipt world={world} row={{...shelterCase(world)!,status:'lost'}}
    actorId={shelterGuest}/>);
  expect(lost).toContain('不能核对代表的去处');
  expect(lost).not.toContain('正在借住');
});
it('queues exact original host offer and later guest return on strict same-frame pending, with no premature change',()=>{
  let {world}=harmedNativeShelter();
  const step=(id:string,move:DisasterShelterMove)=>{
    const exact=quote(world,id,move),essence=world.playerAvatar.essence;
    const tally=JSON.stringify([world.households,world.settlements,world.disasterShelter]);
    expect(queueAvatarDisasterShelter(world,id,exact)).toBe(false);
    expect(possessAvatar(world,id)).toBe(true);
    expect(queueAvatarDisasterShelter(world,id,exact)).toBe(true);
    expect(queueAvatarDisasterShelter(world,id,exact)).toBe(false);
    expect(world.playerAvatar.essence).toBe(essence-24-AVATAR_ORDER_COST);
    expect(JSON.stringify([world.households,world.settlements,world.disasterShelter])).toBe(tally);
    expect(read(world,id,true)).toContain('已候下月');
    const raw=encodeEraWorldSave(world);
    world=decodeEraWorldSave(raw);
    expect(encodeEraWorldSave(world)).toBe(raw);
    world=shelterTurn(world);
    expect(world.playerAvatar.pendingOrder).toBeUndefined();
  };
  step(shelterHost,'offer');
  expect(shelterCase(world)?.status).toBe('offered');
  const arrived=occupied();
  world=arrived.world;
  step(shelterGuest,'return');
  expect(read(world,shelterGuest)).toContain('住处未空出');
  world=shelterTurn(world);
  expect(read(world,shelterGuest)).toContain('住处已空出，人还没到家');
  for(let i=2;i<arrived.path.length;i++)world=shelterTurn(world);
  expect(read(world,shelterGuest)).toContain('确已归到原地');
});
