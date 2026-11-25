import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {PilgrimagePanel} from '../src/components/PilgrimagePanel';
import {reviewedWaypostMeal} from '../src/components/WaypostMealRead';
import {AVATAR_ORDER_COST,possessAvatar,queueAvatarWaypostMeal} from '../src/engine/avatarEngine';
import {availableWaypostMealActions} from '../src/engine/waypostMealEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import type {WaypostMealMove,WaypostMealOption} from '../src/types/waypostMeal';
import type {WorldState} from '../src/types/world';
import {mealActor,mealGroups,mealGuest,mealHost,mealMonth,mealOutsider,offeredWaypostMeal,pairedMealPilgrims,pilgrimageOrder}
  from './waypostMealNativeFixture';

function quote(world:WorldState,id:string,move:WaypostMealMove){
  const exact=availableWaypostMealActions(mealActor(world,id),world,world.tick+1).find(row=>row.waypostMealMove===move);
  if(!exact)throw Error('Missing native local choice');
  return exact;
}
function read(world:WorldState,id:string,withMenu=false){
  const viewer=mealActor(world,id);
  const pending=world.playerAvatar.pendingOrder;
  return renderToStaticMarkup(<PilgrimagePanel world={world} cultivator={viewer} mealControls={withMenu?
    {scopeKey:'private-scope',revisionKey:world,pending:pending?.action==='WAYPOST_MEAL'?pending:undefined,
      choices:pending?[]:availableWaypostMealActions(viewer,world,world.tick+1),onQueue:vi.fn(()=>true)}:undefined}/>);
}
it('adds one small local card inside the old journey only, distinguishes observation from exact current action',()=>{
  const {world}=pairedMealPilgrims(),viewer=mealActor(world,mealGuest),guestName=viewer.name;
  const view=read(world,mealHost,true);
  expect(view.match(/<h6[^>]*>山驿分茶<\/h6>/g)).toHaveLength(1);
  expect(view).toContain('请'+guestName+'分茶');
  expect(view).not.toContain('private-scope');
  expect(view).not.toContain('已封存 1 株');
  expect(read(world,mealHost)).not.toContain('山驿分茶');
  expect(read(world,mealOutsider,true)).not.toContain('山驿分茶');
  expect(read(world,mealGroups[0][1],true)).not.toContain('山驿分茶');
  const c=quote(world,mealHost,'offer');
  expect(reviewedWaypostMeal({choice:c,revision:world},{},[c])).toBeUndefined();
  expect(reviewedWaypostMeal({choice:c,revision:world},world,[c,c])).toBeUndefined();
});
it('queues by exact two original pilgrims, restores both pending shapes and reports actual rest separately without moving the route',()=>{
  let {world}=pairedMealPilgrims();
  expect(queueAvatarWaypostMeal(world,mealHost,quote(world,mealHost,'offer'))).toBe(false);
  expect(possessAvatar(world,mealHost)).toBe(true);
  world=mealMonth(mealMonth(world)); // Respect the existing host-switch cooldown before requesting a live reply.
  const routes=structuredClone(world.pilgrimages.journeys),body=()=>mealActor(world,mealHost),before=body().herbs.jade_leaf;
  const run=(id:string,move:WaypostMealMove)=>{
    const c=quote(world,id,move),essence=world.playerAvatar.essence,leaf=body().herbs.jade_leaf;
    expect(queueAvatarWaypostMeal(world,id,c)).toBe(true);
    expect(queueAvatarWaypostMeal(world,id,c)).toBe(false);
    expect(world.playerAvatar.essence).toBe(essence-AVATAR_ORDER_COST);
    expect(body().herbs.jade_leaf).toBe(leaf);
    expect(read(world,id,true)).toContain('已候下月');
    const raw=encodeEraWorldSave(world);
    world=decodeEraWorldSave(raw);
    expect(encodeEraWorldSave(world)).toBe(raw);
    world=mealMonth(world);
    expect(world.playerAvatar.pendingOrder).toBeUndefined();
  };
  run(mealHost,'offer');
  expect(world.waypostMeals?.meals[0]).toMatchObject({status:'offered',escrowLeaves:1});
  expect(body().herbs.jade_leaf).toBe(before-1);
  expect(read(world,mealGuest,true)).toContain('应下这席茶');
  expect(read(world,mealHost,true)).not.toContain('应下这席茶');
  expect(possessAvatar(world,mealGuest)).toBe(true);
  run(mealGuest,'accept');
  const html=read(world,mealGuest);
  expect(html).toContain('实用 1 株原封翡翠灵叶');
  expect(html).toContain('（备茶）实回');
  expect(html).toContain('（来客）实回');
  expect(html).not.toContain('<button');
  expect(world.pilgrimages.journeys.map(({waypostMealWitnesses: _proof, ...itinerary}) => itinerary)).toEqual(routes);
  expect(world.pilgrimages.journeys.every(journey=>journey.waypostMealWitnesses?.length===1)).toBe(true);
});
it('prints the actual returned leaf on separation without inventing tea, shared healing or a new stop',()=>{
  const {world}=offeredWaypostMeal();
  const separated=mealMonth(world,{[mealGuest]:pilgrimageOrder(world,mealGuest,'advance')});
  const html=read(separated,mealHost);
  expect(html).toContain('两路没能在原处相候');
  expect(html).toContain('实退 1 株给备茶人');
  expect(html).not.toMatch(/两人仍在山驿|实回|茶已分/);
  const wrong:WaypostMealOption={action:'WAYPOST_MEAL',waypostMealMove:'accept',targetWaypostMealId:'wrong-waypost'};
  expect(queueAvatarWaypostMeal(separated,mealGuest,wrong)).toBe(false);
});
