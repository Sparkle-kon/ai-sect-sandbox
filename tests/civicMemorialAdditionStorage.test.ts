import {describe,expect,it} from 'vitest';
import {possessAvatar,queueAvatarCivicMemorialAppend} from '../src/engine/avatarEngine';
import {availableCivicMemorialActions} from '../src/engine/civicMemorialEngine';
import {decodeEraWorldSave,decodeWorldSave,encodeEraWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import type {WorldState} from '../src/types/world';
import {civicActor as actor,civicChoice as choice,civicTurn as turn} from './fixtures/civicMemorialFixture';
import {civicRequire,nativeCivicAppended,nativeCivicNewRelief} from './civicMemorialAdditionNativeFixture';

const plaque=(w:WorldState)=>w.civicMemorials.memorials.find(row=>row.status==='verified')!;
const add=(w:WorldState)=>plaque(w).additions![0];
const addEventId=(w:WorldState)=>`evt-${add(w).id}-${add(w).appendedTick}`;
const reopened=(w:WorldState)=>{
  const raw=encodeWorldSave(w),restored=decodeWorldSave(raw);
  expect(encodeWorldSave(restored)).toBe(raw);
  return restored;
};
function corrupt(raw:string,edit:(world:WorldState)=>void){
  const envelope=JSON.parse(raw) as {world:WorldState};
  edit(envelope.world);
  return ()=>decodeWorldSave(JSON.stringify(envelope));
}
describe('strict additive civic memorial custody and independent documentary proof',()=>{
  it('keeps old save shape, exact original inscription and both independently paid native receipts',()=>{
    const {verified,world,newDeed,memorial}=nativeCivicAppended();
    const old=encodeWorldSave(verified);
    expect(old).not.toContain('"additions"');
    expect(plaque(reopened(verified))).toEqual(memorial);
    const readable=reopened(world);
    const {additions,...base}=plaque(readable);
    expect(base).toEqual(memorial);
    expect(additions).toEqual(plaque(world).additions);
    expect(readable.civicMemorials.deeds.find(row=>row.id===newDeed.id)).toEqual(newDeed);
    expect(readable.settlements.records.find(row=>row.id===newDeed.reliefRecordId)).toMatchObject({
      kind:'relief',actorId:newDeed.subjectId,stones:12,herbs:2,people:0,
    });
    const portable=encodeEraWorldSave(world);
    expect(encodeEraWorldSave(decodeEraWorldSave(portable))).toBe(portable);
    expect(encodeEraWorldSave(turn(readable))).toBe(encodeEraWorldSave(turn(world)));
  });

  it('fails closed for no original document, altered date/pay, unsupported witness, duplicate overlay or sealed evidence',()=>{
    const f=nativeCivicAppended(),raw=encodeWorldSave(f.world);
    const failures:Array<[string,(w:WorldState)=>void]>=[
      ['civicMemorials.additions.source',w=>{add(w).appendedTick=f.newDeed.tick;}],
      ['civicMemorials.additions.source',w=>{add(w).appendedTick=w.tick+1;}],
      ['civicMemorials.additions.source',w=>{add(w).deedId=f.deedId;}],
      ['civicMemorials.additions.source',w=>{plaque(w).additions!.push({...add(w)});}],
      ['civicMemorials.additions.source',w=>{plaque(w).additions=[];}],
      ['civicMemorials.additions.witness',w=>{add(w).witnessId=f.proposer;}],
      ['civicMemorials.additions.witness',w=>{add(w).witnessId=f.witness;}],
      ['civicMemorials.additions.witness',w=>{add(w).witnessId=f.subjectId;}],
      ['civicMemorials.additions.witness',w=>{add(w).witnessId=f.outsider;}],
      ['civicMemorials.deeds.source',w=>{
        w.settlements.records=w.settlements.records.filter(row=>row.id!==f.newDeed.reliefRecordId);
      }],
      ['civicMemorials.deeds.source',w=>{
        w.settlements.records.find(row=>row.id===f.newDeed.reliefRecordId)!.stones=0;
      }],
      ['civicMemorials.additions.source',w=>{
        w.settlements.records.find(row=>row.id===f.newDeed.reliefRecordId)!.targetSettlementId=f.settlementId;
      }],
      ['civicMemorials.additions.source',w=>{
        const rawRelief=w.events.find(row=>row.id===`evt-${f.newDeed.reliefRecordId}`)!;
        rawRelief.description='不是原来的领款凭据。';
      }],
      ['civicMemorials.additions.source',w=>{
        const rawRelief=w.events.find(row=>row.id===f.sourceEventId)!;
        w.events.push({...rawRelief});
      }],
      ['civicMemorials.deeds.public',w=>{
        w.events.find(row=>row.id===f.sourceEventId)!.witnessScope='participants';
      }],
      ['civicMemorials.additions.event',w=>{w.events=w.events.filter(row=>row.id!==addEventId(w));}],
      ['civicMemorials.additions.event',w=>{delete w.events.find(row=>row.id===addEventId(w))!.witnessScope;}],
      ['civicMemorials.additions.event',w=>{delete plaque(w).additions;}],
      ['civicMemorials.memorials[0].additions[0].deathTick',w=>{Object.assign(add(w),{deathTick:w.tick});}],
      ['civicMemorials.memorials[0].additions[0].parentId',w=>{Object.assign(add(w),{parentId:f.other});}],
    ];
    for(const [field,edit] of failures)expect(corrupt(raw,edit)).toThrow(field);
  });

  it('rejects an authentic same-name sibling deed even if complete original evidence is transplanted under the same date and ID',()=>{
    const f=nativeCivicAppended(),sibling=nativeCivicNewRelief(true);
    expect(f.newDeed).toMatchObject({id:sibling.newDeed.id,name:sibling.newDeed.name,tick:sibling.newDeed.tick,siteId:sibling.newDeed.siteId});
    expect(f.newDeed.subjectId).not.toBe(sibling.newDeed.subjectId);
    const genuine=sibling.world.settlements.records.find(row=>row.id===sibling.newDeed.reliefRecordId);
    const publicEvent=sibling.world.events.find(row=>row.id===`evt-${sibling.newDeed.reliefRecordId}`);
    civicRequire(genuine&&publicEvent,'Independently witnessed, fully paid sibling proof');
    expect(corrupt(encodeWorldSave(f.world),w=>{
      const index=w.civicMemorials.deeds.findIndex(row=>row.id===f.newDeed.id);
      w.civicMemorials.deeds[index]=structuredClone(sibling.newDeed);
      const raw=w.settlements.records.findIndex(row=>row.id===f.newDeed.reliefRecordId);
      w.settlements.records[raw]=structuredClone(genuine);
      w.events=w.events.filter(row=>row.id!==`evt-${f.newDeed.reliefRecordId}`);
      w.events.push(structuredClone(publicEvent));
    })).toThrow('civicMemorials.additions.source');
  });

  it('keeps the original proof after a detached witness and actual hot-ring rotation, but never makes the private ink public or paid',()=>{
    const f=nativeCivicAppended(),raw=encodeWorldSave(f.world);
    expect(corrupt(raw,w=>{
      const {id,tick,year,month,title,description,actorIds,category,locationId}=w.events.find(row=>row.id===addEventId(w))!;
      w.chronicleArchive.anchors.push({id,tick,year,month,title,description,actorIds,category,locationId});
    })).toThrow('civicMemorials.additions.archive');
    expect(corrupt(raw,w=>{
      w.resourceFlow.months.flatMap(row=>row.entries).find(row=>row.mechanism==='civic_memorial')!.refId=add(w).id;
    })).toThrow('civicMemorials.additions.journal');
    let future=turn(f.world,{[f.editor]:choice('EXPLORE',{targetLocationId:'loc-market-east'})});
    expect(actor(future,f.editor).locationId).not.toBe(f.siteId);
    expect(add(reopened(future))).toEqual(add(f.world));
    const ids=new Set([f.sourceEventId,`evt-${f.newDeed.reliefRecordId}`,addEventId(f.world)]);
    for(let round=0;round<18&&future.events.some(row=>ids.has(row.id));round++){
      const commands:Record<string,ReturnType<typeof choice>>={};
      for(const reader of future.cultivators){
        const partner=future.cultivators.find(other=>other.id!==reader.id&&other.alive&&other.locationId===reader.locationId);
        if(reader.alive&&partner)commands[reader.id]=choice('SOCIALIZE',{targetCultivatorId:partner.id});
      }
      future=turn(future,commands);
    }
    expect(future.events.some(row=>ids.has(row.id))).toBe(false);
    const restored=reopened(future);
    expect(add(restored)).toEqual(add(f.world));
    const original=restored.civicMemorials.deeds.find(row=>row.id===f.deedId)!;
    expect(restored.settlements.records.map(row=>row.id)).toContain(original.reliefRecordId);
    expect(restored.settlements.records.map(row=>row.id)).toContain(f.newDeed.reliefRecordId);
  });

  it('round-trips only the actual next-turn public deed and exact memorial in the current avatar order',()=>{
    const f=nativeCivicNewRelief(),{world,editor,memorial,newDeed}=f;
    const pending=availableCivicMemorialActions(actor(world,editor),world,world.tick+1)
      .find(row=>row.civicMemorialMove==='append_relief'&&row.targetCivicMemorialId===memorial.id&&row.targetCivicDeedId===newDeed.id);
    civicRequire(pending?.civicMemorialMove==='append_relief','Exact next turn local provable append');
    expect(possessAvatar(world,editor)).toBe(true);
    expect(queueAvatarCivicMemorialAppend(world,editor,pending)).toBe(true);
    const raw=encodeWorldSave(world),readable=reopened(world);
    expect(readable.playerAvatar.pendingOrder).toEqual(world.playerAvatar.pendingOrder);
    expect(add(turn(readable))).toMatchObject({deedId:newDeed.id,witnessId:editor});
    expect(corrupt(raw,w=>{Object.assign(w.playerAvatar.pendingOrder!,{targetCivicDeedId:f.deedId});}))
      .toThrow('playerAvatar.civicMemorialOrder');
    expect(corrupt(raw,w=>{Object.assign(w.playerAvatar.pendingOrder!,{targetCultivatorId:f.subjectId});}))
      .toThrow('pendingOrder.targetCultivatorId');
  });
});
