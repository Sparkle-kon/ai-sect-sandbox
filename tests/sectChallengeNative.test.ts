import {afterEach,describe,expect,it,vi} from 'vitest';
import {projectSectLiveScene} from '../src/components/sectLiveScene';
import {adjustSectAffinity,sectRelation} from '../src/engine/diplomacyEngine';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {answerSectChallenge,chooseSectChallengeAction,listSectChallengeTargets,requestSectChallenge} from '../src/engine/sectChallenges';
import {projectSectChat} from '../src/engine/sectChat';
import {projectSectLive} from '../src/engine/sectLive';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {sectChallengeEventId} from '../src/types/sectChallenge';
import {starterSectIdentity} from '../src/types/sectManagement';
import {sectRecurringIdentity} from '../src/types/sectRecurring';
import type {LLMDecisionPayload,WorldEvent,WorldState} from '../src/types/world';

const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'今月且调息。'};
const config={enabled:true,apiBaseUrl:'https://sect-challenge-native.invalid/v1',apiKey:'fixture',model:'fixture'};
afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});
function management(world:WorldState){
  if(!world.sectManagement)throw new Error('Expected native management');
  return world.sectManagement;
}
function actor(world:WorldState,id:string){
  const person=world.cultivators.find(row=>row.id===id);
  if(!person)throw new Error(`Missed native body ${id}`);
  return person;
}
function sect(world:WorldState,id:string){
  const faction=world.sects.find(row=>row.id===id);
  if(!faction)throw new Error(`Missed native faction ${id}`);
  return faction;
}
function terrain(world:WorldState,id:string){
  const site=world.locations.find(row=>row.id===id);
  const tile=site&&terrainTileAt(world,site.x,site.y);
  if(!tile)throw new Error(`Missed native venue ${id}`);
  return tile;
}
function knows(world:WorldState,actorId:string,siteId:string){
  const traveller=actor(world,actorId),id=terrain(world,siteId).id;
  if(!traveller.exploredTileIds.includes(id))traveller.exploredTileIds.push(id);
}
function month(world:WorldState,overrides:Readonly<Record<string,LLMDecisionPayload>>={},modelId?:string){
  const completed:WorldEvent[]=[];
  const used=vi.fn();
  const next=advanceWorldTick(world,Object.fromEntries(world.cultivators.map(person=>[person.id,overrides[person.id]??rest])),
    ()=>.2,modelId?'deferred':'utility',used,{
      modelActors:modelId?new Set([modelId]):undefined,capturePresentation:false,captureTrace:true,
      onCompletedEvents:rows=>completed.push(...rows),
    });
  return {next,completed,used};
}
function lineage(){
  const genesis=createManagedSectWorld(13071,'classic','drunken-sword-hermitage',0);
  if(!genesis)throw new Error('Expected native drunk sword sect');
  const world=month(genesis).next,m=management(world);
  const ids=sectRecurringIdentity(m.sectId,starterSectIdentity(world.random.seed,m.starterId,m.draw).creditorId);
  const discipleId=m.foundingDiscipleIds[1];
  expect(actor(world,ids.rival)).toMatchObject({locationId:ids.rivalSiteId,alive:true,sectId:ids.rivalSectId});
  expect(sect(world,ids.rivalSectId).headquartersId).toBe(ids.rivalSiteId);
  knows(world,discipleId,ids.rivalSiteId);
  knows(world,ids.rival,m.homeSiteId);
  return {world,discipleId,ids,sectId:m.sectId,home:m.homeSiteId,leader:m.leaderId};
}
function history(world:WorldState){
  return management(world).challenges?.history??[];
}
function pending(world:WorldState){
  const offer=management(world).challenges?.pending;
  if(!offer)throw new Error('Expected authentic offer');
  return offer;
}
function strict(world:WorldState){
  const saved=encodeEraWorldSave(world),restored=decodeEraWorldSave(saved);
  expect(encodeEraWorldSave(restored)).toBe(saved);
  return restored;
}

describe('山门来帖：只有两人真的到场才是踢馆',()=>{
  it('本门派出真弟子，赴三尺门公擂；接受前无战果、到场才结算',()=>{
    const {world,discipleId,ids,sectId,home}=lineage();
    expect(listSectChallengeTargets(world,discipleId)).not.toHaveLength(0);
    expect(requestSectChallenge(world,discipleId,ids.rivalSectId)).toBeTruthy();
    const requested=pending(world);
    expect(requested).toMatchObject({phase:'awaiting_response',direction:'outbound',challengerId:discipleId,
      defenderId:ids.rival,siteId:ids.rivalSiteId,challengerSectId:sectId,defenderSectId:ids.rivalSectId});
    expect(actor(world,discipleId).locationId).toBe(home);
    expect(history(world)).toEqual([]);
    expect(requestSectChallenge(world,discipleId,ids.rivalSectId)).toBeFalsy();
    const waved=month(strict(world)).next;
    expect(pending(waved)).toMatchObject({id:requested.id,phase:'traveling'});
    expect(actor(waved,discipleId).locationId).toBe(home);
    expect(history(waved)).toEqual([]);
    expect(chooseSectChallengeAction(waved,actor(waved,discipleId))).toMatchObject({
      chosenAction:'EXPLORE',targetLocationId:ids.rivalSiteId,
    });
    const before=actor(waved,discipleId).hp;
    const arrived=month(waved),result=history(arrived.next).find(row=>row.id===requested.id);
    expect(actor(arrived.next,discipleId).locationId).toBe(ids.rivalSiteId);
    expect(result).toMatchObject({outcome:'completed',eventId:sectChallengeEventId(requested,arrived.next.tick),siteId:ids.rivalSiteId});
    if(result?.outcome!=='completed')throw new Error('Expected a real event with a conclusive winner');
    expect([discipleId,ids.rival]).toContain(result.winnerId);
    expect(result.winnerId).not.toBe(result.loserId);
    expect(result.injury).toBeGreaterThan(0);
    expect(arrived.completed.filter(row=>row.id===result.eventId)).toHaveLength(1);
    expect(arrived.completed.find(row=>row.id===result.eventId)).toMatchObject({locationId:result.siteId,actorIds:[discipleId,ids.rival]});
    const aired=projectSectLive(arrived.next).shows.find(row=>row.show.sourceEventId===result.eventId);
    if(!aired)throw new Error('The public broadcast lost the exact proof');
    expect(aired.show.kind).toBe('sect_challenge');
    expect(projectSectLiveScene(arrived.next,aired.show)).toMatchObject({kind:'arena',frame:{kind:'sect_challenge',
      left:{id:discipleId},right:{id:ids.rival},siteId:result.siteId,tick:result.resolvedTick}});
    expect(projectSectChat(arrived.next).some(room=>room.posts.some(post=>post.sourceEventId===result.eventId))).toBe(true);
    for(const id of [discipleId,ids.rival]){
      expect(actor(arrived.next,id).alive).toBe(true);
      expect(actor(arrived.next,id).hp).toBeGreaterThanOrEqual(1);
      expect(actor(arrived.next,id).artifacts).toEqual(actor(waved,id).artifacts);
    }
    expect(actor(arrived.next,discipleId).hp).toBeLessThanOrEqual(before);
    expect(sectRelation(arrived.next,sectId,ids.rivalSectId)?.pact??'neutral').toBe('neutral');
    expect(history(strict(arrived.next))).toEqual(history(arrived.next));
  });

  it('赵掌门来帖优先；拒绝确保无擂，答应之后仍要真人来到本门',()=>{
    let {world,ids,home,leader,sectId}=lineage();
    adjustSectAffinity(world,sectId,ids.rivalSectId,-20);
    adjustSectAffinity(world,sectId,'sect-qingyun',-20);
    knows(world,'npc-1',home);
    while(world.tick<management(world).foundedTick+2)world=month(world).next;
    const alternative=structuredClone(world);
    const rivalry=sectRelation(alternative,sectId,ids.rivalSectId);
    if(!rivalry)throw new Error('Expected genuine rival relation');
    rivalry.pact='alliance';
    expect(pending(month(alternative).next).challengerId).toBe('npc-1');
    world=month(world).next;
    const offer=pending(world);
    expect(offer).toMatchObject({direction:'inbound',phase:'awaiting_response',challengerId:ids.rival,
      challengerSectId:ids.rivalSectId,siteId:home});
    expect(offer.defenderId).toBe(management(world).foundingDiscipleIds[3]);
    expect(offer.defenderId).not.toBe(leader);
    expect(actor(world,ids.rival).locationId).toBe(ids.rivalSiteId);
    const untouched=month(world).next;
    expect(actor(untouched,ids.rival).locationId).toBe(ids.rivalSiteId);
    expect(history(untouched).some(row=>row.id===offer.id&&row.outcome==='completed')).toBe(false);
    const rejected=structuredClone(world),accepted=structuredClone(world);
    expect(answerSectChallenge(rejected,'wrong-native-offer',true)).toBe(false);
    expect(answerSectChallenge(rejected,offer.id,false)).toBe(true);
    expect(answerSectChallenge(rejected,offer.id,true)).toBe(false);
    expect(history(rejected).find(row=>row.id===offer.id)).toMatchObject({outcome:'refused'});
    const noFight=month(rejected);
    expect(noFight.completed.some(row=>row.id===sectChallengeEventId(offer,noFight.next.tick))).toBe(false);
    expect(answerSectChallenge(accepted,offer.id,true)).toBe(true);
    expect(pending(accepted)).toMatchObject({id:offer.id,phase:'traveling'});
    expect(history(accepted)).toEqual([]);
    const travelled=month(accepted);
    expect(actor(travelled.next,ids.rival).locationId).toBe(home);
    expect(history(travelled.next).find(row=>row.id===offer.id)).toMatchObject({outcome:'completed'});
  });

  it('按原擂同走离线与 JSON 决策；受保护的路人绝不会被移上擂台',async()=>{
    const {world,ids,discipleId,home}=lineage();
    expect(requestSectChallenge(world,discipleId,ids.rivalSectId)).toBeTruthy();
    const scheduled=month(world).next;
    const invite=pending(scheduled);
    const native=chooseSectChallengeAction(scheduled,actor(scheduled,discipleId));
    if(!native)throw new Error('Expected authoritative route action at departure');
    const mock=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(native)}}]})));
    vi.stubGlobal('fetch',mock);
    const model=await requestCultivatorLLMDecision(actor(scheduled,discipleId),scheduled,config,scheduled.tick+1);
    if(!model)throw new Error('Expected exact JSON decision checked by the affordance decoder');
    expect(mock).toHaveBeenCalledOnce();
    expect(model).toMatchObject({chosenAction:'EXPLORE',targetLocationId:ids.rivalSiteId});
    const direct=month(scheduled,{[discipleId]:native});
    const deferred=month(scheduled,{[discipleId]:model},discipleId);
    expect(history(deferred.next)).toEqual(history(direct.next));
    expect(history(deferred.next)).toContainEqual(expect.objectContaining({id:invite.id,outcome:'completed'}));
    const overridden=month(scheduled,{[discipleId]:rest},discipleId);
    expect(history(overridden.next)).toEqual(history(direct.next));
    expect(overridden.used).toHaveBeenCalledWith(discipleId,false);

    const protectedDraft=structuredClone(scheduled),challenger=actor(protectedDraft,discipleId);
    challenger.realm='筑基';challenger.realmStage=9;challenger.qiProgress=100;
    challenger.tribulation={id:`trial-${discipleId}-${protectedDraft.tick}`,targetRealm:'金丹',startedTick:protectedDraft.tick,
      stage:'lightning',nextWave:1,totalWaves:3,pressure:0,interruptions:0,lastActedTick:protectedDraft.tick,lastOutcome:'正在亲身引动雷劫。'};
    expect(chooseSectChallengeAction(protectedDraft,challenger)).toBeUndefined();
    const tookCover=month(protectedDraft);
    expect(actor(tookCover.next,discipleId).locationId).toBe(home);
    expect(history(tookCover.next).some(row=>row.id===invite.id&&row.outcome==='completed')).toBe(false);
    expect(tookCover.completed.some(row=>row.id===sectChallengeEventId(invite,tookCover.next.tick))).toBe(false);
  });

  it('原令已有守山职责时会过期，不会靠超时补一场擂台',()=>{
    const {world,discipleId,ids,leader}=lineage();
    expect(requestSectChallenge(world,discipleId,ids.rivalSectId)).toBe(true);
    const activeDuty=month(world,{[leader]:{...rest,chosenAction:'DISPATCH_GUARD',targetCultivatorId:discipleId,
      targetLocationId:'loc-vein-north'}});
    const scheduled=activeDuty.next,offer=pending(scheduled);
    const duty=actor(scheduled,discipleId).guardAssignment;
    expect(duty).toMatchObject({locationId:'loc-vein-north',assignedTick:scheduled.tick});
    expect(duty?.expiresTick).toBeGreaterThan(offer.expiresTick);
    expect(activeDuty.completed).toContainEqual(expect.objectContaining({id:`evt-${scheduled.tick}-${leader}-dispatch_guard`}));
    const events:WorldEvent[]=[];
    let waiting=scheduled;
    while(waiting.tick<offer.expiresTick){
      const step=month(waiting);
      waiting=step.next;events.push(...step.completed);
    }
    expect(history(waiting).find(row=>row.id===offer.id)).toMatchObject({outcome:'expired',resolvedTick:offer.expiresTick});
    expect(management(waiting).challenges?.pending).toBeUndefined();
    expect(actor(waiting,discipleId).locationId).not.toBe(ids.rivalSiteId);
    expect(events.some(row=>row.id.endsWith(offer.id+'-completed'))).toBe(false);
    expect(projectSectLive(waiting).shows.some(row=>row.show.kind==='sect_challenge')).toBe(false);
  });
});
