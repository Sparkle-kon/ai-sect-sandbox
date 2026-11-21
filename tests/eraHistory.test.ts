import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {projectEraHistory} from '../src/engine/eraHistoryIndex';
import {advanceSettlements} from '../src/engine/settlementEngine';
import {createTimeline,forkTimeline,readTimelineHead} from '../src/engine/timelineEngine';
import {resolveWorkshopAction} from '../src/engine/workshopEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {decodeWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import type {Cultivator,LLMDecisionPayload,WorldState} from '../src/types/world';

const rest={chosenAction:'REST',innerMonologue:'不添加私下台词。'} satisfies LLMDecisionPayload;
const step=(world:WorldState,mode:'utility'|'deferred'='utility')=>
  advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,rest])),()=>.99,mode);
function januaryRecord(){
  const before=createInitialWorld(2031);before.tick=12;before.month=12;
  const sect=before.sects[0],older=before.cultivators.find(row=>row.id===sect.leaderId)!;
  const other=before.cultivators.find(row=>row.sectId===sect.id&&row.id!==older.id)!;
  older.age=older.lifespan-1;other.name=older.name;other.age=24;other.lifespan=120;
  const after=step(before);
  return {before,after,older,other,sectId:sect.id};
}

describe('long era provenance, not regenerated prose',()=>{
  it('records actual named mortality/election once, resolves exact archive proof, and then marks lost sources honestly',()=>{
    const {after,older,other,sectId}=januaryRecord(),actor={kind:'actor' as const,id:older.id};
    const death=`evt-${after.tick}-${older.id}-oldage`;
    expect(projectEraHistory(after,actor)).toContainEqual(expect.objectContaining({source:'live_event',
      receipt:expect.objectContaining({kind:'death',eventId:death,actorId:older.id})}));
    expect(projectEraHistory(after,{kind:'actor',id:other.id}).some(({receipt})=>receipt.kind==='death')).toBe(false);
    expect(projectEraHistory(after,{kind:'sect',id:sectId})[0]?.receipt).toMatchObject({kind:'succession',method:'election',previousLeaderId:older.id});
    const hidden=structuredClone(after);
    hidden.events.find(row=>row.id===death)!.witnessScope='participants';
    expect(projectEraHistory(hidden,actor).some(({receipt})=>receipt.eventId===death)).toBe(false);
    after.events=after.events.filter(row=>row.id!==death);
    expect(projectEraHistory(after,actor).find(({receipt})=>receipt.eventId===death)?.source).toBe('public_archive');
    after.tick+=720;
    after.chronicleArchive={anchors:[],chapters:[]};
    after.coldHistory={chapters:[],droppedChapters:74};
    expect(projectEraHistory(after,actor).find(({receipt})=>receipt.eventId===death)?.source).toBe('source_lost');
    expect(projectEraHistory(after,actor,undefined,12)).toEqual([]);
    expect(JSON.stringify(after.eraHistory)).not.toContain(older.name);
  });

  it('keeps native mortality proof identical when using the deferred cognitive JSON lane',()=>{
    const {before,after,older}=januaryRecord();
    const deferred=step(before,'deferred');
    const query={kind:'actor' as const,id:older.id};
    expect(projectEraHistory(deferred,query).filter(({receipt})=>receipt.kind==='death'))
      .toEqual(projectEraHistory(after,query).filter(({receipt})=>receipt.kind==='death'));
  });

  it('keeps snapshots with same date/display-name distinct across actual timeline forks',()=>{
    const {before,older,other}=januaryRecord();
    other.age=other.lifespan-1;
    const source=createTimeline(before);
    const branched=forkTimeline(source,before.tick,{type:'WHISPER_MIND',targetCultivatorId:older.id,whisperText:'私密旁线。'},'异支');
    const baseline=readTimelineHead(branched,'main')!,alternate=readTimelineHead(branched)!;
    baseline.cultivators.find(row=>row.id===other.id)!.age=26;
    alternate.cultivators.find(row=>row.id===older.id)!.age=26;
    const a=step(baseline),b=step(alternate);
    expect(a.tick).toBe(b.tick);
    const found=(world:WorldState,id:string)=>projectEraHistory(world,{kind:'actor',id}).some(({receipt})=>receipt.kind==='death');
    expect(found(a,older.id)).toBe(true);expect(found(b,older.id)).toBe(false);
    expect(found(a,other.id)).toBe(false);expect(found(b,other.id)).toBe(true);
  });

  it('uses genuine native village movement and can still name the typed index after record compaction',()=>{
    const world=createInitialWorld(2031);
    world.tick=3;world.month=3;
    for(const village of world.settlements.villages)village.stress=4;
    const origin=world.settlements.villages[0];origin.stress=86;
    advanceSettlements(world);
    const record=world.settlements.records.find(row=>row.kind==='migration')!;
    const query={kind:'settlement' as const,id:record.targetSettlementId!};
    const indexed=projectEraHistory(world,query)[0];
    expect(indexed).toMatchObject({source:'native_receipt',receipt:{kind:'migration',people:record.people,
      fromSettlementId:origin.id,toSettlementId:record.targetSettlementId}});
    world.settlements.records=[];
    expect(projectEraHistory(world,query)[0].source).toBe('source_lost');
  });

  it.each([{floor:'standard',delivered:1},{floor:'fine',delivered:0}] as const)(
    'records the paid $floor workshop terminal with $delivered deliveries only to the actual parties',({floor,delivered})=>{
    const world=createInitialWorld(6031);world.tick=12;world.month=1;
    const [maker,patron,stranger]=world.cultivators,market=world.locations.find(row=>row.id==='loc-market')!;
    for(const actor of world.cultivators)actor.locationId=world.locations[0].id;
    for(const actor of [maker,patron]){
      actor.locationId=market.id;actor.realm='练气';actor.techniqueMastery=0;actor.hp=actor.maxHp;actor.spiritStones=300;
      actor.herbs.earth_root=12;actor.artifacts=[];actor.tribulation=undefined;
    }
    market.furnaceGrade=1;stranger.name=patron.name;
    const run=(actor:Cultivator,extra:Partial<LLMDecisionPayload>)=>resolveWorkshopAction(world,actor,{...rest,chosenAction:'WORKSHOP',...extra},()=>.99);
    expect(run(patron,{workshopMove:'offer',targetCultivatorId:maker.id,workshopTier:'法器',workshopQuantity:1,
      workshopQualityFloor:floor})).not.toBeNull();
    const order=world.workshops.orders[0],target={targetWorkshopId:order.id};
    expect(run(maker,{workshopMove:'accept',...target})).not.toBeNull();
    world.tick++;world.month++;
    expect(run(maker,{workshopMove:'work',...target})).not.toBeNull();
    world.tick++;world.month++;
    const terminal=run(maker,{workshopMove:'work',...target})!;
    expect(order.status).toBe('completed');
    world.events=[terminal,...world.events];
    const query={kind:'workshop' as const,id:order.id};
    expect(projectEraHistory(world,query,patron.id)[0]).toMatchObject({source:'live_event',receipt:{kind:'workshop',status:'completed',delivered}});
    expect(decodeWorldSave(encodeWorldSave(world)).eraHistory).toEqual(world.eraHistory);
    expect(projectEraHistory(world,query,stranger.id)).toEqual([]);
    expect(projectEraHistory(world,query)).toEqual([]);
    world.events=world.events.filter(row=>row.id!==terminal.id);world.workshops.orders=[];
    expect(projectEraHistory(world,query,maker.id)[0].source).toBe('source_lost');
    expect(projectEraHistory(world,query,stranger.id)).toEqual([]);
    expect(JSON.stringify(world.eraHistory)).not.toContain(patron.name);
  });
});
