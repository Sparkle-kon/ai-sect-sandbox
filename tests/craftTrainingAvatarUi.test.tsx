import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {WorkshopPanel} from '../src/components/WorkshopPanel';
import {reviewedCraftTraining} from '../src/components/CraftTrainingRead';
import {AVATAR_ORDER_COST,possessAvatar,queueAvatarCraftTraining} from '../src/engine/avatarEngine';
import {availableCraftTrainingActions} from '../src/engine/craftTrainingEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import type {CraftTrainingMove,CraftTrainingOption} from '../src/types/craftTraining';
import type {WorldState} from '../src/types/world';
import {craftActor,craftFirst,craftKeeper,craftMonth,craftProject,craftSecond,finishedNativeCraftTraining,
  fundedNativeCraftTraining,prepareNativeCraftTraining}
  from './craftTrainingNativeFixture';

function choice(world:WorldState,id:string,move:CraftTrainingMove){
  const option=availableCraftTrainingActions(craftActor(world,id),world,world.tick+1).find(row=>
    row.craftTrainingMove===move&&(row.craftTrainingMove!=='offer'||row.targetCultivatorId===craftFirst&&row.targetCraftTraineeId===craftSecond));
  if(!option)throw Error('Missing exact legal craft option');
  return option;
}
function read(world:WorldState,id:string,menu=false){
  const viewer=craftActor(world,id),queued=world.playerAvatar.pendingOrder;
  return renderToStaticMarkup(<WorkshopPanel world={world} cultivator={viewer} trainingControls={menu?
    {scopeKey:'secret-frame',revisionKey:world,choices:queued?[]:availableCraftTrainingActions(viewer,world,world.tick+1),
      pending:queued?.action==='CRAFT_TRAINING'?queued:undefined,onQueue:vi.fn(()=>true)}:undefined}/>);
}
it('keeps optional offer choices in the original workshop, with two bounded role pickers and no fictional training',()=>{
  const world=prepareNativeCraftTraining();
  const html=read(world,craftKeeper,true);
  expect(html).toContain('工坊委制与品质交割');
  expect(html).toContain('合练铸坯');
  expect(html).toContain('先铸坯');
  expect(html).toContain('后完工');
  expect(html).not.toMatch(/实作|开炉成功|secret-frame/);
  expect(read(world,craftKeeper)).not.toContain('合练铸坯');
  const option=choice(world,craftKeeper,'offer');
  expect(reviewedCraftTraining({choice:option,revision:world},{},[option])).toBeUndefined();
  expect(reviewedCraftTraining({choice:option,revision:world},world,[option,option])).toBeUndefined();
});
it('queues only the exact two names for the keeper and a different rightful worker later; neither pays at queue time',()=>{
  let world=prepareNativeCraftTraining();
  const pick=choice(world,craftKeeper,'offer');
  if(pick.craftTrainingMove!=='offer')throw Error('Expected two exact names');
  const duplicate:CraftTrainingOption={action:'CRAFT_TRAINING',craftTrainingMove:'offer',
    targetCultivatorId:pick.targetCultivatorId,targetCraftTraineeId:pick.targetCultivatorId};
  expect(queueAvatarCraftTraining(world,craftKeeper,pick)).toBe(false);
  expect(possessAvatar(world,craftKeeper)).toBe(true);
  const check=(id:string,option:CraftTrainingOption)=>{
    const essence=world.playerAvatar.essence,cash=craftActor(world,craftKeeper).spiritStones,before=structuredClone(world.craftTraining);
    expect(queueAvatarCraftTraining(world,id,option)).toBe(true);
    expect(queueAvatarCraftTraining(world,id,option)).toBe(false);
    expect(world.playerAvatar.essence).toBe(essence-AVATAR_ORDER_COST);
    expect(craftActor(world,craftKeeper).spiritStones).toBe(cash);
    expect(world.craftTraining).toEqual(before);
    expect(read(world,id,true)).toContain('已候下月');
    const raw=encodeEraWorldSave(world);
    world=decodeEraWorldSave(raw);
    expect(encodeEraWorldSave(world)).toBe(raw);
    world=craftMonth(world);
    expect(world.playerAvatar.pendingOrder).toBeUndefined();
  };
  expect(queueAvatarCraftTraining(world,craftKeeper,duplicate)).toBe(false);
  check(craftKeeper,pick);
  expect(craftProject(world)).toMatchObject({status:'offered',traineeIds:[craftFirst,craftSecond]});
  expect(read(world,craftFirst,true)).toContain('应下本人工序');
  expect(read(world,craftFirst,true)).not.toContain('亲手铸坯');
  world=fundedNativeCraftTraining().world;
  expect(possessAvatar(world,craftFirst)).toBe(true);
  const blank=choice(world,craftFirst,'blank');
  expect(queueAvatarCraftTraining(world,craftSecond,blank)).toBe(false);
  check(craftFirst,blank);
  const html=read(world,craftFirst);
  expect(html).toContain(craftActor(world,craftFirst).name+'实作铸坯');
  expect(html).not.toContain('实作完工');
});
it('names both actual contributors and reads a failed finish as failed, with no artifact on a pending or failed project',()=>{
  const {world,row}=finishedNativeCraftTraining(),html=read(world,craftKeeper);
  expect(html).toContain(craftActor(world,craftFirst).name+'实作铸坯');
  expect(html).toContain(craftActor(world,craftSecond).name+'实作完工');
  expect(html).toContain('器物已实际交付给掌坊人');
  expect(html).not.toContain(row.id);
  const outsider=world.cultivators.find(actor=>![craftKeeper,craftFirst,craftSecond].includes(actor.id))!;
  expect(read(world,outsider.id)).not.toContain('合练铸坯');
  const failed=finishedNativeCraftTraining(true).world;
  expect(read(failed,craftKeeper)).toContain('没达到成器门槛');
  expect(read(failed,craftKeeper)).not.toContain('器物已实际交付给掌坊人');
});
