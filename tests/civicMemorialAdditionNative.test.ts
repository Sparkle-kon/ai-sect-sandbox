import {describe,expect,it} from 'vitest';
import {availableCivicMemorialActions,projectCivicMemorials} from '../src/engine/civicMemorialEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import type {WorldState} from '../src/types/world';
import {civicActor as actor,civicChoice as choice,civicTurn as turn} from './fixtures/civicMemorialFixture';
import {civicAppendChoice,civicRequire,nativeCivicAppended,nativeCivicNewRelief} from './civicMemorialAdditionNativeFixture';

const hasAppend=(world:WorldState,id:string,deedId:string)=>availableCivicMemorialActions(actor(world,id),world,world.tick+1)
  .some(row=>row.civicMemorialMove==='append_relief'&&row.targetCivicDeedId===deedId);
const exactAppend=(targetCivicMemorialId:string,targetCivicDeedId:string)=>
  choice('CIVIC_MEMORIAL',{civicMemorialMove:'append_relief',targetCivicMemorialId,targetCivicDeedId});
const strictReplay=(world:WorldState)=>{
  const raw=encodeEraWorldSave(world),restored=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(restored)).toBe(raw);
  expect(encodeEraWorldSave(turn(restored))).toBe(encodeEraWorldSave(turn(world)));
  return restored;
};

describe('native additive physical memorial evidence',()=>{
  it('uses an independently paid later deed and actual new witness, while preserving the former inscription and actual ledgers',()=>{
    const f=nativeCivicAppended(),{world,verified,newRelief,amendedMemorial,memorial,newDeed,subjectId,editor,outsider}=f;
    expect(newDeed.tick).toBeGreaterThan(memorial.verification?.tick??Infinity);
    expect(actor(verified,subjectId).spiritStones-actor(newRelief,subjectId).spiritStones).toBe(12);
    expect(actor(verified,subjectId).herbs.jade_leaf-actor(newRelief,subjectId).herbs.jade_leaf).toBe(2);
    const beforeRecord=newRelief.settlements.records.find(row=>row.id===newDeed.reliefRecordId);
    expect(beforeRecord).toMatchObject({actorId:subjectId,settlementId:f.settlementId,kind:'relief',tick:newRelief.tick,
      stones:12,herbs:2,people:0});
    expect(newDeed.witnessIds).toContain(editor);
    expect(newDeed.witnessIds).not.toContain(outsider);
    const {additions,...original}=amendedMemorial;
    expect(original).toEqual(memorial);
    expect(additions).toEqual([{id:`${memorial.id}-addendum-${newDeed.id}`,deedId:newDeed.id,
      witnessId:editor,appendedTick:world.tick}]);
    const id=additions?.[0]?.id;
    expect(world.events.find(row=>row.id===`evt-${id}-${world.tick}`)).toMatchObject({
      actorIds:[editor],locationId:f.siteId,witnessScope:'participants',
    });
    const control=turn(newRelief);
    expect(world.settlements).toEqual(control.settlements);
    expect(world.households).toEqual(control.households);
    expect(world.villageCensuses).toEqual(control.villageCensuses);
    expect(world.villageGranaries).toEqual(control.villageGranaries);
    expect(world.resourceFlow).toEqual(control.resourceFlow);
    expect(world.chronicleErrata).toEqual(control.chronicleErrata);
    expect(world.chronicleErrata.corrections).toHaveLength(1);
    expect(world.civicMemorials.deeds).toEqual(control.civicMemorials.deeds);
    const visible=projectCivicMemorials(world,actor(world,f.proposer))?.plaques.find(row=>row.id===memorial.id);
    civicRequire(visible,'A physically local reader still sees the original plaque');
    expect(visible).toMatchObject({name:'纪同山',nameAmbiguous:true,subjectStatus:'recruited',deedTick:24,inscribedTick:26,
      errata:{correction:{tick:26,reading:'full_supplies'}},additions:[{id,deedTick:newDeed.tick,appendedTick:world.tick,stones:12,herbs:2}]});
    const projected=JSON.stringify(visible);
    for(const privateIdentity of [editor,subjectId,f.sameNameId,newDeed.householdId,newDeed.volunteerId])expect(projected).not.toContain(privateIdentity);
    expect(projected).not.toMatch(/deathTick|ancestry|parentId|deceased/u);
    expect(projectCivicMemorials(world,actor(world,outsider))?.plaques).toEqual([]);
    const restored=strictReplay(world),originalReload=strictReplay(newRelief);
    expect(projectCivicMemorials(restored,actor(restored,f.proposer))).toEqual(projectCivicMemorials(world,actor(world,f.proposer)));
    expect(encodeEraWorldSave(turn(originalReload,{[editor]:civicAppendChoice(originalReload,editor,memorial.id,newDeed.id)})))
      .toBe(encodeEraWorldSave(world));
  });

  it('refuses the donor, original authors and a local late arrival, while the exact new eyewitness is still eligible',()=>{
    const f=nativeCivicNewRelief();
    const historical=f.world.civicMemorials.deeds.find(row=>row.id===f.deedId);
    civicRequire(historical,'Original native deed');
    expect(hasAppend(f.world,f.editor,historical.id)).toBe(false);
    expect(hasAppend(f.world,f.editor,f.newDeed.id)).toBe(true);
    for(const id of [f.proposer,f.witness,f.subjectId,f.outsider]){
      expect(hasAppend(f.world,id,f.newDeed.id)).toBe(false);
      const refused=turn(f.world,{[id]:exactAppend(f.memorial.id,f.newDeed.id)});
      expect(refused.civicMemorials.memorials.find(row=>row.id===f.memorial.id)).toEqual(f.memorial);
    }
    const late=turn(f.world,{[f.outsider]:choice('EXPLORE',{targetLocationId:f.siteId})});
    expect(actor(late,f.outsider).locationId).toBe(f.siteId);
    expect(hasAppend(late,f.outsider,f.newDeed.id)).toBe(false);
    expect(hasAppend(late,f.editor,f.newDeed.id)).toBe(true);
    const refused=turn(late,{[f.outsider]:exactAppend(f.memorial.id,f.newDeed.id)});
    expect(refused.civicMemorials.memorials.find(row=>row.id===f.memorial.id)).toEqual(f.memorial);
  });

  it('does not consume a sibling’s genuine same-date, same-name evidence with exact same serialized deed ID',()=>{
    const a=nativeCivicNewRelief(),b=nativeCivicNewRelief(true);
    expect(a.newDeed).toMatchObject({id:b.newDeed.id,name:b.newDeed.name,tick:b.newDeed.tick,siteId:b.newDeed.siteId,
      stones:b.newDeed.stones,herbs:b.newDeed.herbs});
    expect(a.newDeed.subjectId).not.toBe(b.newDeed.subjectId);
    expect(a.newDeed.householdId).not.toBe(b.newDeed.householdId);
    expect(a.newDeed.volunteerId).not.toBe(b.newDeed.volunteerId);
    expect(a.newDeed.reliefRecordId).not.toBe(b.newDeed.reliefRecordId);
    expect(b.world.settlements.records.find(row=>row.id===b.newDeed.reliefRecordId)).toMatchObject({actorId:b.sameNameId,
      stones:12,herbs:2,people:0,kind:'relief'});
    const positive=civicAppendChoice(a.world,a.editor,a.memorial.id,a.newDeed.id);
    expect(hasAppend(b.world,b.editor,b.newDeed.id)).toBe(false);
    const refused=turn(b.world,{[b.editor]:positive});
    expect(refused.civicMemorials.memorials.find(row=>row.id===b.memorial.id)).toEqual(b.memorial);
    expect(refused.civicMemorials.deeds.find(row=>row.id===b.newDeed.id)).toEqual(b.newDeed);
    expect(projectCivicMemorials(refused,actor(refused,b.editor))?.plaques[0]?.additions).toBeUndefined();
    strictReplay(refused);
  });

  it('cannot append the same event again through a different original local witness',()=>{
    const {world,amendedMemorial,editor,newDeed,other}=nativeCivicAppended();
    expect(newDeed.witnessIds).toContain(other);
    expect(hasAppend(world,other,newDeed.id)).toBe(false);
    expect(hasAppend(world,editor,newDeed.id)).toBe(false);
    const repeated=turn(world,{[other]:exactAppend(amendedMemorial.id,newDeed.id)});
    expect(repeated.civicMemorials.memorials.find(row=>row.id===amendedMemorial.id)).toEqual(amendedMemorial);
    expect(repeated.events.filter(row=>row.id.startsWith(`evt-${amendedMemorial.id}-addendum-`))).toHaveLength(1);
    strictReplay(repeated);
  });
});
