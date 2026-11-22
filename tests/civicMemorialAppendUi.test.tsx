import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {VillageMemorialPanel} from '../src/components/VillageMemorialPanel';
import {reviewedCivicMemorialAppend,type CivicMemorialAppendOption} from '../src/components/CivicMemorialAppendRead';
import {AVATAR_ORDER_COST,possessAvatar,queueAvatarCivicMemorialAppend} from '../src/engine/avatarEngine';
import {availableCivicMemorialActions} from '../src/engine/civicMemorialEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import type {WorldState} from '../src/types/world';
import {civicActor,civicTurn} from './fixtures/civicMemorialFixture';
import {nativeCivicAppended,nativeCivicNewRelief} from './civicMemorialAdditionNativeFixture';

function read(world:WorldState,villageId:string,id:string,withControls=false){
  const viewer=civicActor(world,id),queued=world.playerAvatar.pendingOrder;
  return renderToStaticMarkup(<VillageMemorialPanel world={world} cultivator={viewer} villageId={villageId} appendControls={withControls?
    {scopeKey:'private-reader-branch',revisionKey:world,pending:queued?.action==='CIVIC_MEMORIAL'?queued:undefined,
      choices:queued?[]:availableCivicMemorialActions(viewer,world,world.tick+1).filter(row=>row.civicMemorialMove==='append_relief'),
      onQueue:vi.fn(()=>true)}:undefined}/>);
}
it('retains the exact old plaque, correction, name warning and exact quotations before and after a distinct native donation',()=>{
  const f=nativeCivicAppended(),{world,newRelief,editor,settlementId,memorial,newDeed,amendedMemorial}=f;
  const prior=read(newRelief,settlementId,editor),after=read(world,settlementId,editor);
  expect(prior).not.toContain('后来附记');
  expect(after).toContain('后来附记');
  expect(after).toContain('另一次实赈：第 '+newDeed.tick+' 轮，本村实收 12 灵石、2 份翡翠灵叶');
  for(const label of ['存在同名记录','立册时仍在世','核验勘误','匿名异闻（未证）']){
    expect(prior).toContain(label);expect(after).toContain(label);
  }
  expect(after).not.toContain(memorial.id);
  expect(after).not.toContain(newDeed.id);
  const {additions,...retained}=amendedMemorial;
  expect(retained).toEqual(memorial);
  expect(additions).toHaveLength(1);
});
it('shows only the actual local witnessed later deed in the named plaque, and blocks stale/duplicate selection',()=>{
  const f=nativeCivicNewRelief(),{world,editor,newDeed,memorial,settlementId}=f;
  const toggle=read(world,settlementId,editor,true);
  expect(toggle).toContain('核对第 '+newDeed.tick+' 轮后记');
  expect(toggle).not.toContain('记作下月打算');
  expect(toggle).not.toContain('private-reader-branch');
  expect(read(world,settlementId,editor)).not.toContain('核对第');
  const original=civicActor(world,editor);
  expect(renderToStaticMarkup(<VillageMemorialPanel world={world} cultivator={{...original}} villageId={settlementId}/>)).toBe('');
  const exact:CivicMemorialAppendOption={action:'CIVIC_MEMORIAL',civicMemorialMove:'append_relief',
    targetCivicMemorialId:memorial.id,targetCivicDeedId:newDeed.id};
  expect(reviewedCivicMemorialAppend({choice:exact,revision:world},{},[exact])).toBeUndefined();
  expect(reviewedCivicMemorialAppend({choice:exact,revision:world},world,[exact,exact])).toBeUndefined();
  const separate=nativeCivicNewRelief(true);
  expect(read(separate.world,separate.settlementId,separate.editor,true)).not.toContain('核对第 '+separate.newDeed.tick+' 轮后记');
});
it('queues exact plaque+deed with 5 essence only, strictly restores and appends one actual native month later',()=>{
  const f=nativeCivicNewRelief(),{editor,settlementId,memorial,newDeed}=f;
  let world=f.world;
  const option=availableCivicMemorialActions(civicActor(world,editor),world,world.tick+1).find(row=>row.civicMemorialMove==='append_relief');
  if(!option||option.civicMemorialMove!=='append_relief')throw Error('Missing exact native proof and witness');
  expect(queueAvatarCivicMemorialAppend(world,editor,option)).toBe(false);
  expect(possessAvatar(world,editor)).toBe(true);
  const proof=JSON.stringify([world.civicMemorials,world.resourceFlow,world.cultivators]);
  const essence=world.playerAvatar.essence;
  expect(queueAvatarCivicMemorialAppend(world,editor,{...option,targetCivicDeedId:memorial.deedId})).toBe(false);
  expect(queueAvatarCivicMemorialAppend(world,editor,option)).toBe(true);
  expect(queueAvatarCivicMemorialAppend(world,editor,option)).toBe(false);
  expect(world.playerAvatar.essence).toBe(essence-AVATAR_ORDER_COST);
  expect(JSON.stringify([world.civicMemorials,world.resourceFlow,world.cultivators])).toBe(proof);
  expect(read(world,settlementId,editor,true)).toContain('已候下月');
  const raw=encodeEraWorldSave(world);
  world=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(world)).toBe(raw);
  world=civicTurn(world);
  expect(world.playerAvatar.pendingOrder).toBeUndefined();
  expect(read(world,settlementId,editor)).toContain('另一次实赈：第 '+newDeed.tick);
  const actual=world.civicMemorials.memorials.find(row=>row.id===memorial.id)!;
  expect(actual.additions).toHaveLength(1);
  expect(actual.verification).toEqual(memorial.verification);
});
