import {afterEach,describe,expect,it,vi} from 'vitest';
import {availableAlchemy} from '../src/engine/alchemyEngine';
import {queryCultivatorLLMDecision,requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {applySectLiveCommand,projectSectLive,settleSectLiveMonth} from '../src/engine/sectLive';
import {resolveSparringAction} from '../src/engine/sparringEngine';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldEvent,WorldState} from '../src/types/world';
import {actualTournament,actualTournamentSignup,jointournament,tournamentEntrants,tournamentFrame,tournamentId} from './tournamentArenaNativeFixture';

const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'在此处静候。'};
const breakthrough:LLMDecisionPayload={chosenAction:'BREAKTHROUGH',innerMonologue:'在山门前依法引雷。'};
const wave:LLMDecisionPayload={chosenAction:'FACE_TRIBULATION',tribulationStance:'guard',innerMonologue:'凝神守这一重劫。'};
const golden:LLMDecisionPayload={chosenAction:'BREW_PILL',targetPillId:'golden',innerMonologue:'依旧法开炉。'};
const config={enabled:true,apiBaseUrl:'https://livestream-native.invalid/v1',apiKey:'fixture',model:'fixture'};
afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});
function person(world:WorldState,id:string){
  const actor=world.cultivators.find(row=>row.id===id);
  if(!actor)throw new Error(`Missing native actor ${id}`);
  return actor;
}
function managed(seed=1,profile:'classic'|'spirit-bloom'='spirit-bloom'){
  const world=createManagedSectWorld(seed,profile,'drunken-sword-hermitage',0);
  if(!world?.sectManagement)throw new Error('Expected native managed sect');
  const {leaderId,sectId,homeSiteId,foundingDiscipleIds}=world.sectManagement;
  return {world,leaderId,sectId,homeSiteId,foundingDiscipleIds};
}
function turn(world:WorldState,orders:Readonly<Record<string,LLMDecisionPayload>>={},roll=.2,modelId?:string){
  const events:WorldEvent[]=[];
  const accepted=vi.fn();
  const next=advanceWorldTick(world,Object.fromEntries(world.cultivators.filter(actor=>actor.alive).map(actor=>[actor.id,orders[actor.id]??rest])),
    ()=>roll,modelId?'deferred':'utility',accepted,{
      modelActors:modelId?new Set([modelId]):undefined,capturePresentation:false,onCompletedEvents:rows=>events.push(...rows),
    });
  if(modelId)expect(accepted).toHaveBeenCalledWith(modelId,true);
  return {next,events};
}
function trial(){
  const source=managed(13071,'classic');
  const at=person(source.world,source.leaderId);
  at.realm='筑基';at.realmStage=9;at.qiProgress=100;
  const started=turn(source.world,{[at.id]:breakthrough});
  expect(person(started.next,at.id).tribulation?.stage).toBe('lightning');
  expect(started.events).toContainEqual(expect.objectContaining({
    id:`evt-${started.next.tick}-${at.id}-tribulation-start`,locationId:source.homeSiteId,
  }));
  return {...source,started};
}
function byKind(world:WorldState,kind:string){
  const match=projectSectLive(world).shows.find(row=>row.show.kind===kind);
  if(!match)throw new Error(`Expected actual ${kind} broadcast`);
  return match;
}
function roundtrip(world:WorldState){
  const json=encodeEraWorldSave(world),restored=decodeEraWorldSave(json);
  expect(encodeEraWorldSave(restored)).toBe(json);
  return restored;
}

describe('天机直播只转播发生过的事件',()=>{
  it('从真实月历报名、落定四场原擂，直播只认本月真实赛轮',async()=>{
    let {world}=managed();
    // Exercise the natural sixty-month host slot without competing adaptive invitations.
    delete world.storyteller;
    while(world.tick<59)world=tournamentFrame(world);
    world=turn(world).next;
    expect(actualTournament(world)).toMatchObject({status:'registration',startedTick:60});
    const native=actualTournamentSignup(world);
    const fetchFixture=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(jointournament)}}]})));
    vi.stubGlobal('fetch',fetchFixture);
    const source=vi.fn(),candidate=person(world,'npc-2');
    const decision=await queryCultivatorLLMDecision(candidate,world,config,source);
    expect(source).toHaveBeenCalledWith('llm');
    let cognitive=actualTournamentSignup(world,tournamentEntrants,{[candidate.id]:decision});
    let utility=native;
    while(utility.tick<64){utility=tournamentFrame(utility);cognitive=tournamentFrame(cognitive);}
    expect(actualTournament(utility).arena?.rounds[0]).toMatchObject({round:1,tick:64});
    expect(actualTournament(utility).arena?.rounds[0].bouts).toHaveLength(4);
    expect(utility.events.some(event=>event.id===`evt-64-${tournamentId}-round`)).toBe(true);
    expect(byKind(utility,'tournament').live).toBe(true);
    expect(byKind(cognitive,'tournament').show).toEqual(byKind(utility,'tournament').show);
    expect(byKind(roundtrip(utility),'tournament').show).toEqual(byKind(utility,'tournament').show);
  });

  it('原劫与次月真实劫波共用结算，旧场不能发弹幕或打赏',async()=>{
    const {started,leaderId}=trial();
    const at=person(started.next,leaderId);
    const source=vi.fn(),fetchFixture=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(wave)}}]})));
    vi.stubGlobal('fetch',fetchFixture);
    const exact=await queryCultivatorLLMDecision(at,started.next,config,source);
    expect(source).toHaveBeenCalledWith('llm');
    expect(exact).toMatchObject({chosenAction:'FACE_TRIBULATION',tribulationStance:'guard'});
    const utility=turn(started.next,{[leaderId]:wave});
    const llm=turn(started.next,{[leaderId]:exact},.2,leaderId);
    expect(person(utility.next,leaderId).tribulation?.nextWave).toBe(2);
    expect(utility.next.sectManagement?.live).toEqual(llm.next.sectManagement?.live);
    const old=byKind(started.next,'tribulation').show.id;
    expect(projectSectLive(utility.next).shows.find(row=>row.show.id===old)?.live).toBe(false);
    expect(applySectLiveCommand(utility.next,{kind:'danmaku',showId:old,text:'隔月问安。'})).toBe(false);
    expect(applySectLiveCommand(utility.next,{kind:'gift',showId:old})).toBe(false);
  });

  it('本月弹幕独立且限量；打赏恰扣本宗三枚，添一分名望并存真流水',()=>{
    const {started,sectId}=trial(),world=started.next;
    const show=byKind(world,'tribulation'),showId=show.show.id;
    const before=structuredClone(world);
    const sect=world.sects.find(row=>row.id===sectId);
    const original=before.sects.find(row=>row.id===sectId);
    if(!sect||!original)throw new Error('Expected authentic treasury');
    expect(show.live).toBe(true);
    expect(show.show.danmaku.length).toBeGreaterThan(0);
    expect(show.show.danmaku.every(line=>person(world,line.actorId).locationId===show.show.siteId)).toBe(true);
    expect(show.show.danmaku.some(line=>line.actorId==='npc-1')).toBe(false);
    expect(show.giftCost).toBe(3);
    for(const text of ['听雷声不算上阵。','先给前辈留个座。','只看，不添乱。']){
      expect(applySectLiveCommand(world,{kind:'danmaku',showId,text})).toBe(true);
    }
    expect(applySectLiveCommand(world,{kind:'danmaku',showId,text:'再添一条。'})).toBe(false);
    expect(applySectLiveCommand(world,{kind:'danmaku',showId,text:'雷'.repeat(41)})).toBe(false);
    expect(world.sects).toEqual(before.sects);
    expect(world.events).toEqual(before.events);
    expect(world.random).toEqual(before.random);
    const purse=structuredClone(world),empty=purse.sects.find(row=>row.id===sectId)!;
    empty.spiritStones=2;
    const untouched=structuredClone(purse);
    expect(applySectLiveCommand(purse,{kind:'gift',showId})).toBe(false);
    expect(purse).toEqual(untouched);
    expect(applySectLiveCommand(world,{kind:'gift',showId})).toBe(true);
    expect(sect.spiritStones).toBe(original.spiritStones-3);
    expect(sect.reputation).toBe(original.reputation+1);
    expect(applySectLiveCommand(world,{kind:'gift',showId})).toBe(false);
    const flows=world.resourceFlow.months.at(-1)?.entries??[];
    expect(flows.filter(row=>row.good==='stone'&&row.amount===3&&'from' in row&&row.from.kind==='sect'&&row.from.id===sectId)).toHaveLength(1);
    expect(roundtrip(world).sectManagement?.live).toEqual(world.sectManagement?.live);
    expect(world.cultivators).toEqual(before.cultivators);
  });

  it('金丹实耗开炉的罕见事故才开播，寻常失败、成丹与受限接触不乱入',async()=>{
    const actorId='npc-5',siteId='loc-danxia';
    let {world}=managed();
    if(person(world,actorId).locationId!==siteId){
      world=turn(world,{[actorId]:{...rest,chosenAction:'EXPLORE',targetLocationId:siteId}},.95).next;
    }
    expect(person(world,actorId).locationId).toBe(siteId);
    for(const herb of ['jade_leaf','star_bloom','star_bloom'] as const){
      expect(availableAlchemy(person(world,actorId),world,world.tick+1)).toContainEqual({action:'GATHER_HERBS',targetHerbId:herb});
      world=turn(world,{[actorId]:{...rest,chosenAction:'GATHER_HERBS',targetHerbId:herb}}).next;
    }
    expect(availableAlchemy(person(world,actorId),world,world.tick+1)).toContainEqual({action:'BREW_PILL',targetPillId:'golden'});
    const plain=turn(world,{[actorId]:golden},.95).next,success=turn(world,{[actorId]:golden},.1).next;
    const blast=turn(world,{[actorId]:golden},.999);
    const after=person(blast.next,actorId),before=person(world,actorId);
    expect(after.pills.golden).toBe(before.pills.golden);
    expect(after.herbs.jade_leaf).toBe(before.herbs.jade_leaf-2);
    expect(after.herbs.star_bloom).toBe(before.herbs.star_bloom-3);
    expect(after.hp).toBeLessThan(person(plain,actorId).hp);
    expect(after.alive).toBe(true);
    expect(projectSectLive(plain).shows.some(row=>row.show.kind==='furnace')).toBe(false);
    expect(projectSectLive(success).shows.some(row=>row.show.kind==='furnace')).toBe(false);
    expect(byKind(blast.next,'furnace').live).toBe(true);
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(golden)}}]}))));
    const accepted=await requestCultivatorLLMDecision(before,world,config,world.tick+1);
    expect(accepted).toMatchObject({chosenAction:'BREW_PILL',targetPillId:'golden'});
    if(!accepted)throw new Error('Expected real model schema admission');
    const model=turn(world,{[actorId]:accepted},.999,actorId);
    expect(byKind(model.next,'furnace').show).toEqual(byKind(blast.next,'furnace').show);
    const falseCut=structuredClone(blast.next);
    if(falseCut.sectManagement)delete falseCut.sectManagement.live;
    const sealed=blast.events.map(row=>({...row,witnessScope:'participants' as const}));
    falseCut.events=falseCut.events.map(row=>({...row,witnessScope:'participants' as const}));
    settleSectLiveMonth(falseCut,world,sealed);
    expect(projectSectLive(falseCut).shows).toEqual([]);
  });

  it('正常斗法按实开播但不会冒领踢馆，私人邀约无公共回放',()=>{
    const {world,leaderId,foundingDiscipleIds,homeSiteId}=managed(13071,'classic');
    const rival=person(world,'npc-1');rival.locationId=homeSiteId;
    const duel=turn(world,{[leaderId]:{...rest,chosenAction:'DUEL',targetCultivatorId:rival.id}});
    const event=duel.events.find(row=>row.id===`evt-${duel.next.tick}-${leaderId}-duel`);
    expect(event).toMatchObject({actorIds:[leaderId,rival.id]});
    expect(event?.witnessScope).toBeUndefined();
    expect(byKind(duel.next,'combat').title).not.toContain('踢馆');
    const clone=structuredClone(duel.next);
    if(clone.sectManagement)delete clone.sectManagement.live;
    const sealed:WorldEvent[]=[
      {...event!,actorIds:[leaderId,foundingDiscipleIds[0]],witnessScope:'participants'},
    ];
    clone.events=clone.events.filter(row=>row.id!==event?.id).concat(sealed);
    settleSectLiveMonth(clone,world,sealed);
    expect(projectSectLive(clone).shows).toEqual([]);
  });

  it('真实双方逐回合应允的私下切磋从不开公共直播',()=>{
    const {world,leaderId,foundingDiscipleIds}=managed();
    const partnerId=foundingDiscipleIds[1];
    const proposer=person(world,leaderId),partner=person(world,partnerId);
    for(const actor of [proposer,partner]){
      actor.qiProgress=50;actor.techniqueMastery=27;actor.hp=actor.maxHp;
    }
    const practice=(move:LLMDecisionPayload['sparringMove'],fields:Partial<LLMDecisionPayload>):LLMDecisionPayload=>
      ({...rest,chosenAction:'SPARRING',sparringMove:move,...fields});
    const invitation=resolveSparringAction(world,proposer,practice('offer',{targetCultivatorId:partnerId,sparringRounds:1}));
    expect(invitation?.witnessScope).toBe('participants');
    const selected=world.sparring.agreements[0];
    if(!selected)throw new Error('Expected authentic independent consent');
    expect(resolveSparringAction(world,partner,practice('accept',{targetSparringId:selected.id}))?.witnessScope).toBe('participants');
    const ready=practice('ready',{targetSparringId:selected.id});
    const {next,events}=turn(world,{[leaderId]:ready,[partnerId]:ready});
    expect(next.sparring.agreements[0]).toMatchObject({status:'completed',rounds:[expect.anything()]});
    expect(events.filter(row=>row.id.includes(selected.id))).toContainEqual(expect.objectContaining({witnessScope:'participants'}));
    expect(projectSectLive(next).shows).toEqual([]);
  });
});
