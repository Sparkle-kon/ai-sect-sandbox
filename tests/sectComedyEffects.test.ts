import {describe,expect,it,vi} from 'vitest';
import {planComedyEffects} from '../src/engine/sectComedyEffects';
import {comedyIdentity,type ComedyContext} from '../src/engine/sectComedyTerms';
import {projectSectChat} from '../src/engine/sectChat';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {sectRelation} from '../src/engine/diplomacyEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {SectComedyTemplate} from '../src/types/sectComedy';
import type {LLMDecisionPayload} from '../src/types/world';

const authored=vi.hoisted(():SectComedyTemplate[]=>[
  {id:'fixture-expensive-visit',match:{phase:'ambient',presence:'home',quirks:['lost','glutton']},
    report:'门前来了位客人。',quote:'掌门，他还要车马钱。',effects:[
      {kind:'visit',npc:'wang',afterMonths:[1,1],reason:'carriage'},
      {kind:'stones',amount:-400_000},{kind:'stones',amount:-400_000},
    ]},
  {id:'fixture-feasible-visit',match:{phase:'ambient',presence:'home',quirks:['lost','glutton']},
    report:'{name}在{site}捡回五块灵石。',quote:'石头倒是认得归家的路。',effects:[
      {kind:'qi',amount:10},{kind:'stones',amount:5},{kind:'herb',herb:'star_bloom',amount:3},
      {kind:'item',template:'demon-iron-wok'},{kind:'injury',rate:.1},{kind:'building_damage',building:'gate',amount:1},
      {kind:'sect_relation',target:'bloodmoon',amount:-8},{kind:'fame',amount:4},{kind:'debt',amount:3},
      {kind:'recruit',template:'demon-sect-cook'},{kind:'visit',npc:'wang',afterMonths:[2,4],reason:'receipt'},
      {kind:'rumor',group:'own',line:'{name}把石头给公库，铁锅归灶房。'},
    ]},
  {id:'fixture-sequel',match:{phase:'ambient',presence:'home'},report:'街坊来问铁锅。',quote:'锅还热着。',effects:[]},
]);
vi.mock('../src/data/sectComedy',async importOriginal=>{
  const actual=await importOriginal<typeof import('../src/data/sectComedy')>();
  return {SECT_COMEDY_TEMPLATES:[...authored.slice(0,2),...actual.SECT_COMEDY_TEMPLATES],
    findSectComedyTemplate:(id:string)=>authored.find(row=>row.id===id)??actual.findSectComedyTemplate(id)};
});
function fresh(){
  const world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0)!;
  const management=world.sectManagement!;
  const actor=world.cultivators.find(row=>row.id===management.foundingDiscipleIds[0])!;
  const sect=world.sects.find(row=>row.id===management.sectId)!;
  for(const person of world.cultivators.filter(row=>row.sectId===sect.id))person.quirks=['shy'];
  actor.quirks=['lost','glutton'];
  sect.spiritStones=5;
  return {world,management,actor,sect};
}
function context(roll:ReturnType<typeof fresh>):ComedyContext{
  return {tick:roll.world.tick,siteId:roll.management.homeSiteId,speakerId:roll.actor.id,
    templateId:authored[0].id,source:{phase:'ambient',presence:'home'}};
}
const rest={chosenAction:'REST',innerMonologue:''} satisfies LLMDecisionPayload;

describe('H6 comedy transactions',()=>{
  it('does not partially debit, publish, schedule, or advance RNG when a later debit fails',()=>{
    const fixture=fresh(),{world}=fixture;
    world.tick++;
    const bytes=JSON.stringify(world);
    expect(planComedyEffects(world,context(fixture),[authored[0].effects[0],
      {kind:'stones',amount:-4},{kind:'stones',amount:-4}])).toBeUndefined();
    expect(JSON.stringify(world)).toBe(bytes);
    expect(planComedyEffects(world,context(fixture),[{kind:'rumor',group:'jiuzhou',line:'别处的闲话'}])).toBeUndefined();
  });

  it('falls back to the next legal scene; both engines settle identical effects with a portable queue',()=>{
    const {world,actor}=fresh();
    const orders=Object.fromEntries(world.cultivators.map(row=>[row.id,rest]));
    const options={captureTrace:false,capturePresentation:false};
    const utility=advanceWorldTick(world,orders,undefined,'utility',undefined,options);
    const cognitive=advanceWorldTick(world,orders,undefined,'deferred',undefined,{...options,modelActors:new Set([actor.id])});
    const management=utility.sectManagement!;
    const beat=management.comedy?.moments.at(-1);
    expect(beat?.templateId).toBe(authored[1].id);
    expect(cognitive.sectManagement?.comedy).toEqual(management.comedy);
    expect(beat?.effects).toHaveLength(12);
    const [visit]=management.comedy?.pending??[];
    expect(visit).toMatchObject({kind:'visit',npc:'wang',originTick:utility.tick,effectIndex:10,speakerId:actor.id});
    expect(visit.dueTick).toBeGreaterThan(utility.tick+1);
    expect(management.buildings.gate).toBe(0);
    expect(management.debt?.principal).toBe(83);
    expect(sectRelation(utility,management.sectId,'sect-bloodmoon')?.affinity).toBe(-8);
    const speaker=utility.cultivators.find(row=>row.id===actor.id)!;
    expect(speaker.herbs.star_bloom).toBe(3);
    expect(speaker.artifacts.some(row=>row.name==='魔宗铁锅')).toBe(true);
    expect(utility.cultivators.find(row=>row.id===comedyIdentity(management.sectId,'recruit','demon-sect-cook')))
      .toMatchObject({sectId:management.sectId,locationId:management.homeSiteId,name:'屠大勺',quirks:['glutton']});
    expect(projectSectChat(utility).find(row=>row.id==='own')?.posts.some(post=>post.text.includes('铁锅归灶房'))).toBe(true);
    const encoded=encodeEraWorldSave(utility);
    expect(encodeEraWorldSave(decodeEraWorldSave(encoded))).toBe(encoded);
    const bad=structuredClone(utility);
    bad.sectManagement!.comedy={...management.comedy!,pending:[{...visit,dueTick:visit.dueTick+1}]};
    expect(()=>encodeEraWorldSave(bad)).toThrow(/sectManagement.comedy.pending/u);
  });

  it('binds real pets, supports item loss and a shared sequel queue, commits only once',()=>{
    const fixture=fresh(),{world,actor,sect}=fixture;
    world.tick++;
    const planned=planComedyEffects(world,context(fixture),[
      {kind:'item',template:'talking-gourd'},{kind:'item_loss',template:'talking-gourd'},
      {kind:'pet',template:'fat-goose'},{kind:'sequel',templateId:'fixture-sequel',afterMonths:[1,1]},
      {kind:'stones',amount:-4},
    ]);
    expect(planned?.pending).toMatchObject([{kind:'sequel',templateId:'fixture-sequel',dueTick:world.tick+1}]);
    expect(sect.spiritStones).toBe(5);
    planned?.commit();
    planned?.commit();
    expect(sect.spiritStones).toBe(1);
    expect(actor.artifacts).toEqual([]);
    expect(world.spiritBeasts.filter(row=>row.tamedBy===actor.id)).toMatchObject([{name:'白眉胖鹅',alive:true}]);
    expect(planComedyEffects(world,context(fixture),[{kind:'pet',template:'lost-crane'}])).toBeUndefined();
  });
});
