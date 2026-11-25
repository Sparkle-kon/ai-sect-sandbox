import {afterEach,describe,expect,it,vi} from 'vitest';
import {availableAlchemy} from '../src/engine/alchemyEngine';
import {quotePublicSectChatEvents} from '../src/engine/sectChat';
import {llmScheduler} from '../src/engine/llmScheduler';
import {enrichSectChatMonth} from '../src/engine/sectChatModelProvider';
import {requestSectChallenge} from '../src/engine/sectChallenges';
import {applySectPlayerChat,quoteSectPlayerChatOptions} from '../src/engine/sectPlayerChat';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {projectTianjiTabloid,publishTianjiTabloid} from '../src/engine/tianjiTabloid';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {starterSectIdentity} from '../src/types/sectManagement';
import type {SectJobAssignment} from '../src/types/sectJobs';
import type {SectPlayerChatDraft} from '../src/types/sectPlayerChat';
import {sectRecurringIdentity} from '../src/types/sectRecurring';
import type {LLMConfig,LLMDecisionPayload,WorldEvent,WorldState} from '../src/types/world';

const quiet:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'安坐这一月。'};
const credentials:LLMConfig={enabled:true,sectChatEnabled:true,apiBaseUrl:'https://tabloid-fixture.invalid/v1',apiKey:'fixture',model:'tabloid'};
afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});

function managed(){
  const world=createManagedSectWorld(13071,'classic','drunken-sword-hermitage',0);
  if(!world?.sectManagement)throw new Error('Expected a live managed sect');
  return world;
}
function actor(world:WorldState,id:string){
  const body=world.cultivators.find(row=>row.id===id);
  if(!body)throw new Error('Expected actual cultivator '+id);
  return body;
}
function month(world:WorldState,plans:Readonly<Record<string,LLMDecisionPayload>>={},roll=.2,board?:readonly SectJobAssignment[]){
  const events:WorldEvent[]=[];
  const next=advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,plans[row.id]??quiet])),
    ()=>roll,'utility',undefined,{capturePresentation:false,sectJobAssignments:board,onCompletedEvents:value=>events.push(...value)});
  return {next,events};
}
const read=(world:WorldState)=>projectTianjiTabloid(world,{currentVisibleSiteIds:new Set(world.locations.map(row=>row.id))});
function currentQuarter(world:WorldState){
  const row=world.tianjiGazette?.quarterlies?.at(-1);
  if(!row)throw new Error('A completed quarter needs its actual issue');
  return row;
}
function fixture(){
  const world=month(managed()).next,m=world.sectManagement!;
  const founding=starterSectIdentity(world.random.seed,m.starterId,m.draw);
  const ids=sectRecurringIdentity(m.sectId,founding.creditorId);
  const disciple=m.foundingDiscipleIds[1],site=world.locations.find(row=>row.id===ids.rivalSiteId);
  const tile=site&&terrainTileAt(world,site.x,site.y);
  if(!tile)throw new Error('Expected a real rival venue');
  actor(world,disciple).exploredTileIds.push(tile.id);
  expect(requestSectChallenge(world,disciple,ids.rivalSectId)).toBe(true);
  const accepted=month(world).next;
  return month(accepted).next;
}

describe('江湖小报取坊间真见闻，不拿台词编造结算',()=>{
  it('实际季度边界各刊一期，静季也有报；没有要事时不虚构老风云报',()=>{
    const genesis=managed();
    let world=genesis,twin=structuredClone(genesis);
    const boundaries:number[]=[];
    while(world.year===genesis.year){
      const previous=world,settled=month(world);
      world=settled.next;twin=month(twin).next;
      const issues=world.tianjiGazette?.quarterlies??[];
      if(world.month%3===0){
        const edition=currentQuarter(world);
        expect(edition).toMatchObject({tick:world.tick,year:world.year,month:world.month});
        boundaries.push(world.month);
        expect(read(world)).toEqual(read(twin));
        expect(read(world).find(row=>row.id===edition.id)?.columns.map(col=>col.kind)).toEqual(
          ['headline','embarrassment','dark_horse','rivalry','advertisement']);
        const snapshot=structuredClone(issues);
        publishTianjiTabloid(previous,world,settled.events);
        expect(world.tianjiGazette?.quarterlies).toEqual(snapshot);
      }else expect(issues.some(row=>row.tick===world.tick)).toBe(false);
    }
    expect(boundaries).toEqual([3,6,9,12]);
    expect(world.tianjiGazette?.quarterlies?.map(row=>row.month)).toEqual([3,6,9,12]);
    expect(world.tianjiGazette?.issues.some(row=>row.trigger==='year_turn'&&row.tick===world.tick)).toBe(false);
  });

  it('真实三尺门踢馆和获准公开的招新启事进季报，饭桌密话和后来改写的模型台词不进报',async()=>{
    const fought=fixture(),match=fought.sectManagement?.challenges?.history.find(row=>row.outcome==='completed');
    if(match?.outcome!=='completed')throw new Error('Expected native public challenge');
    expect(fought.events).toContainEqual(expect.objectContaining({id:match.eventId,title:'山门踢馆'}));
    const advert:SectPlayerChatDraft={roomId:'jiuzhou',identity:'leader',body:{kind:'quick',preset:'recruit_ad'}};
    const selected=quoteSectPlayerChatOptions(fought,advert.roomId,advert.identity).find(row=>row.intent.kind==='recruit_ad');
    if(!selected)throw new Error('Expected one real publicly authorized recruitment action');
    let world=applySectPlayerChat(fought,advert,selected.id);
    expect(world).not.toBe(fought);
    const realAdId=world.sectManagement?.playerChat?.months.at(-1)?.posts.find(row=>row.intent.kind==='recruit_ad')?.id;
    expect(realAdId).toBeTruthy();
    const cook=world.sectManagement!.foundingDiscipleIds[0];
    actor(world,cook).herbs.jade_leaf=2;
    const dinner=month(world,{},.2,[{discipleId:cook,jobId:'kitchen'}]);
    const privateMeal=dinner.events.find(row=>row.id.endsWith('-management-kitchen')&&row.actorIds.includes(cook));
    expect(privateMeal?.witnessScope).toBe('participants');
    world=dinner.next;
    while(world.month<6)world=month(world).next;
    const printed=currentQuarter(world),rendered=read(world);
    expect(printed.month).toBe(6);
    expect(printed.challenge).toMatchObject({challengeId:match.id,sourceEventId:match.eventId});
    const hot=printed.hotTopic;
    if(!hot)throw new Error('Expected a counted public discussion, not a copied claim');
    expect(hot.roomId).toBe('jiuzhou');
    const authors=new Set(quotePublicSectChatEvents(world,world.tick-2,world.tick)
      .filter(row=>row.event.id===hot.sourceEventId&&row.post.roomId===hot.roomId).map(row=>row.post.senderId));
    expect(hot).toMatchObject({sourceEventId:match.eventId,speakerCount:2,
      speakerIds:[match.challengerId,match.defenderId].sort()});
    expect(hot.speakerIds).toHaveLength(2);
    expect(hot.speakerIds.every(id=>authors.has(id))).toBe(true);
    expect(hot.sourceEventId).not.toBe(privateMeal?.id);
    expect(printed.advertisement).toMatchObject({postId:realAdId});
    expect(JSON.stringify(printed)).not.toContain(privateMeal?.id);
    expect(rendered.find(row=>row.id===printed.id)?.columns.find(col=>col.kind==='headline')?.empty).toBe(false);
    expect(rendered.find(row=>row.id===printed.id)?.columns.find(col=>col.kind==='advertisement')?.empty).toBe(false);
    const late='荒腔：掌门一言，竟称日月倒转。';
    const provider=vi.fn(async (_url:RequestInfo|URL,req?:RequestInit)=>{
      const request=JSON.parse(String(req?.body)) as {messages:{role:string,content:string}[]};
      const prompt=request.messages.find(row=>row.role==='user');
      if(!prompt)throw new Error('Expected a genuine model scope');
      const batch=JSON.parse(prompt.content) as {slots:{postId:string,senderId:string}[]};
      const messages=batch.slots.map(slot=>({postId:slot.postId,senderId:slot.senderId,text:late}));
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({messages})}}]}));
    });
    vi.stubGlobal('fetch',provider);
    llmScheduler.resetTickBudget();
    const amended=await enrichSectChatMonth(world,credentials);
    expect(provider).toHaveBeenCalled();
    expect(amended).not.toBe(world);
    expect(JSON.stringify(amended.sectManagement?.chat)).toContain(late);
    expect(currentQuarter(amended)).toEqual(printed);
    expect(read(amended)).toEqual(rendered);
    expect(JSON.stringify(rendered)).not.toContain(late);
  });

  it('只有实耗金丹炉火却炸炉的已发生小岔子会上丢人榜',()=>{
    const actorId='npc-5',siteId='loc-danxia';
    let world=managed();
    if(actor(world,actorId).locationId!==siteId){
      world=month(world,{[actorId]:{...quiet,chosenAction:'EXPLORE',targetLocationId:siteId}},.95).next;
    }
    for(const herb of ['jade_leaf','star_bloom','star_bloom'] as const){
      expect(availableAlchemy(actor(world,actorId),world,world.tick+1)).toContainEqual({action:'GATHER_HERBS',targetHerbId:herb});
      world=month(world,{[actorId]:{...quiet,chosenAction:'GATHER_HERBS',targetHerbId:herb}}).next;
    }
    expect(availableAlchemy(actor(world,actorId),world,world.tick+1)).toContainEqual({action:'BREW_PILL',targetPillId:'golden'});
    const gold:LLMDecisionPayload={...quiet,chosenAction:'BREW_PILL',targetPillId:'golden'};
    let ordinary=month(world,{[actorId]:gold},.95).next;
    const smashed=month(world,{[actorId]:gold},.999);
    const source=smashed.events.find(row=>row.id.endsWith('-alchemy-burst-golden'));
    if(!source)throw new Error('Expected real native paid blast, not an ordinary failed brew');
    const alchemist=actor(smashed.next,actorId),before=actor(world,actorId);
    expect(alchemist.herbs.jade_leaf).toBe(before.herbs.jade_leaf-2);
    expect(alchemist.herbs.star_bloom).toBe(before.herbs.star_bloom-3);
    expect(alchemist.alive).toBe(true);
    let printed=smashed.next;
    while(printed.month%3!==0){printed=month(printed).next;ordinary=month(ordinary).next;}
    const issue=currentQuarter(printed);
    expect(issue.embarrassment).toMatchObject({actorId,sourceEventId:source.id,siteId});
    expect(currentQuarter(ordinary).embarrassment).toBeUndefined();
    const ranking=read(printed).find(row=>row.id===issue.id)?.columns.find(col=>col.kind==='embarrassment');
    expect(ranking?.empty).toBe(false);
    expect(ranking?.text).toContain('本季榜首');
    expect(ranking?.text).toContain(printed.cultivators.find(actor=>actor.id===actorId)?.name);
    expect(ranking?.text).toContain(printed.locations.find(site=>site.id===siteId)?.name);
  });

  it('真正丧命不会成为丢人榜素材',()=>{
    let world=managed();
    const attacker=actor(world,'npc-3'),victim=actor(world,'npc-6');
    attacker.locationId='loc-market';victim.locationId='loc-market';
    attacker.combatPower=100_000;victim.hp=1;
    const fight=month(world,{[attacker.id]:{chosenAction:'DUEL',targetCultivatorId:victim.id,innerMonologue:'只认当面一战。'}});
    expect(actor(fight.next,victim.id).alive).toBe(false);
    const death=fight.events.find(row=>row.category==='death'&&row.actorIds.includes(victim.id));
    if(!death)throw new Error('Expected a real native casualty');
    world=month(fight.next).next;
    const paper=currentQuarter(world);
    expect(JSON.stringify(paper)).not.toContain(death.id);
    expect(read(world).find(row=>row.id===paper.id)?.columns.find(col=>col.kind==='embarrassment')?.empty).toBe(true);
    const bounty=fight.next.bounties.find(row=>row.targetCultivatorId===attacker.id);
    if(!bounty)throw new Error('Expected a native public notice from the original bounty mechanics');
    const year=world.year;
    while(world.year===year)world=month(world).next;
    const legacy=world.tianjiGazette?.issues.find(row=>row.trigger==='year_turn'&&row.tick===world.tick);
    expect(legacy?.entries).toContainEqual(expect.objectContaining({kind:'bounty',bountyId:bounty.id,targetActorId:attacker.id}));
    expect(world.tianjiGazette?.quarterlies?.some(row=>row.id===paper.id)).toBe(true);
  });
});
