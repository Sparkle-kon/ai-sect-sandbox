import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { wearArtifact } from '../src/engine/artifactEngine';
import { possessAvatar,queueAvatarSalvage } from '../src/engine/avatarEngine';
import { decodeWorldSave,encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { resolveWorkshopAction } from '../src/engine/workshopEngine';
import type { Cultivator,LLMDecisionPayload,WorldState } from '../src/types/world';

function delivered() {
  const world=createInitialWorld(341);
  const site=world.locations.find(row=>row.id==='loc-market')!;
  const [maker,owner]=world.cultivators;
  for (const actor of [maker,owner]) {
    actor.locationId=site.id;
    actor.techniqueMastery=70;
    actor.spiritStones=400;
    actor.herbs.earth_root=10;
    actor.artifacts=[];
    actor.tribulation=undefined;
  }
  site.furnaceGrade=1;
  maker.spiritRoot=site.spiritRoot;
  const work=(actor:Cultivator,fields:Partial<LLMDecisionPayload>) => resolveWorkshopAction(world,actor,{
    chosenAction:'WORKSHOP',innerMonologue:'照契交割。',...fields,
  },()=>.99);
  expect(work(owner,{workshopMove:'offer',targetCultivatorId:maker.id,workshopTier:'法器',workshopQuantity:1,
    workshopQualityFloor:'standard'})).not.toBeNull();
  const targetWorkshopId=world.workshops.orders[0].id;
  expect(work(maker,{workshopMove:'accept',targetWorkshopId})).not.toBeNull();
  for (let turn=0;turn<2;turn++) {
    world.tick++;
    world.month++;
    expect(work(maker,{workshopMove:'work',targetWorkshopId})).not.toBeNull();
  }
  const item=owner.artifacts[0];
  for(let count=0;count<30 && item.durability!>0;count++) wearArtifact(owner,false);
  expect(item.durability).toBe(0);
  expect(possessAvatar(world,owner.id)).toBe(true);
  return {world,site,owner,item};
}

function preview(save:string,edit:(world:WorldState)=>void) {
  const parsed=JSON.parse(save) as {world:WorldState};
  edit(parsed.world);
  return () => decodeWorldSave(JSON.stringify(parsed));
}

function settle() {
  const {world,site,owner,item}=delivered();
  expect(queueAvatarSalvage(world,owner.id,item.id!,world.locations.find((row)=>row.id!==site.id)!.id)).toBe(false);
  expect(queueAvatarSalvage(world,owner.id,item.id!,site.id)).toBe(true);
  expect(owner.artifacts).toContain(item);
  expect(world.artifactSalvages.receipts).toEqual([]);
  const reloaded=decodeWorldSave(encodeWorldSave(world));
  expect(reloaded.playerAvatar.pendingOrder).toMatchObject({action:'SALVAGE_ARTIFACT',targetArtifactId:item.id,targetLocationId:site.id});
  const decisions=Object.fromEntries(reloaded.cultivators.map((actor)=>[actor.id,{chosenAction:'REST',innerMonologue:''} satisfies LLMDecisionPayload]));
  const resolved=advanceWorldTick(reloaded,decisions);
  const actual=resolved.cultivators.find(row=>row.id===owner.id)!;
  expect(actual.artifacts.some(row=>row.id===item.id)).toBe(false);
  expect(actual.herbs.earth_root).toBe(owner.herbs.earth_root+1);
  expect(resolved.playerAvatar.pendingOrder).toBeUndefined();
  expect(resolved.artifactSalvages.receipts).toHaveLength(1);
  return {resolved,item,actual};
}

describe('verified workshop salvage in storage and controlled real turns',()=>{
  it('migrates an old save and consumes an exact queued command in one actual turn after a reload',()=>{
    const old=JSON.parse(encodeWorldSave(createInitialWorld(31))) as {world:Partial<WorldState>};
    delete old.world.artifactSalvages;
    expect(decodeWorldSave(JSON.stringify(old)).artifactSalvages).toEqual({receipts:[]});
    const {resolved,item}=settle();
    const decoded=decodeWorldSave(encodeWorldSave(resolved));
    expect(decoded.artifactSalvages.receipts[0]).toMatchObject({artifactId:item.id,origin:item.workshopOrigin});
    expect(decoded.events.find(row=>row.id===`evt-artifact-salvage-${item.id}`)?.witnessScope).toBe('participants');
  });

  it('rejects a cloned original, forged work, missing furnace slot and duplicate recovery',()=>{
    const {resolved,item,actual}=settle();
    const encoded=encodeWorldSave(resolved);
    expect(preview(encoded,world=>{world.cultivators.find(row=>row.id===actual.id)!.artifacts.push(item);})).toThrow('artifactSalvages.receipts.source');
    expect(preview(encoded,world=>{world.artifactSalvages.receipts[0].origin.finishedTick--;})).toThrow('artifactSalvages.receipts.source');
    expect(preview(encoded,world=>{world.furnaceReservations.uses=world.furnaceReservations.uses.filter(row=>row.kind!=='salvage');})).toThrow('artifactSalvages.receipts.furnace');
    expect(preview(encoded,world=>{world.resourceFlow.months.flatMap(row=>row.entries).find(row=>row.mechanism==='artifact_salvage')!.amount++;})).toThrow();
    expect(preview(encoded,world=>{world.artifactSalvages.receipts.push(world.artifactSalvages.receipts[0]);})).toThrow('artifactSalvages.receipts.source');
  });
});
