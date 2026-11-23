import {projectGuidedVisualDuelArena} from '../src/components/visualGuidedDuelArenaModel';
import {createSceneFrameLease,type SceneFrame} from '../src/controllers/sceneFrameLease';
import { resolveGuidedWorldTurn } from '../src/controllers/guidedWorldTurn';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {possessAvatar} from '../src/engine/avatarEngine';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {taughtSwordPracticeEventId,taughtSwordProof} from '../src/engine/taughtSwordForm';
import {projectSchoolFormStrokes,schoolFormDuelView,schoolFormStoryReceipt} from '../src/engine/schoolFormDuel';
import {schoolFormCommand} from '../src/engine/schoolFormDuelCognition';
import {decodeWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const learnerId='npc-2',mentorId='npc-1',siteId='loc-taixu';
const actor=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const tuition=(world:WorldState)=>world.mentorship.offers.find(row=>row.studentId===learnerId&&row.mentorId===mentorId)!;
const command=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'',...fields});
const rest=command('REST');
function month(world:WorldState,choices:Record<string,LLMDecisionPayload>={},modelActors?:ReadonlySet<string>){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,choices[row.id]??rest])),()=>.9,
    modelActors?'deferred':'utility',undefined,modelActors?{modelActors}:undefined);
}
afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});
function invited(){
  const initial=createInitialWorld(1,'spirit-bloom');
  expect(actor(initial,learnerId).locationId).not.toBe(siteId);
  let arrival=month(initial,{[learnerId]:command('EXPLORE',{targetLocationId:siteId}),[mentorId]:command('CULTIVATE')});
  expect(actor(arrival,learnerId).locationId).toBe(siteId);
  for(let i=0;i<9;i++)arrival=month(arrival,{[mentorId]:command('CULTIVATE')});
  expect(actor(arrival,mentorId).techniqueMastery).toBe(55);
  const offer=month(arrival,{[mentorId]:command('TEACH',{targetCultivatorId:learnerId})});
  expect(tuition(offer).status).toBe('pending');
  return offer;
}
function accepted(){
  const offered=invited();
  const world=month(offered,{[learnerId]:command('ACCEPT_TUITION',{targetTuitionId:tuition(offered).id})});
  expect(tuition(world).status).toBe('accepted');
  expect(actor(world,learnerId).technique).toEqual({name:'太虚御剑经',spiritRoot:'金'});
  expect(tuition(world).swordPractice).toBeUndefined();
  return world;
}
function practiced(){
  const learned=accepted();
  const masteryBefore=actor(learned,learnerId).techniqueMastery;
  const world=month(learned,{[learnerId]:command('CULTIVATE')});
  expect(tuition(world).swordPractice).toEqual({tick:world.tick,siteId,masteryBefore,masteryAfter:masteryBefore+3});
  expect(world.events).toContainEqual(expect.objectContaining({id:taughtSwordPracticeEventId(learnerId,world.tick),
    actorIds:[learnerId],witnessScope:'participants',locationId:siteId}));
  return world;
}
const proof=(world:WorldState)=>taughtSwordProof(world,actor(world,learnerId),actor(world,mentorId));

describe('actual direct sword lesson and independent cultivation receipt',()=>{
  it('records only real later cultivation and does not invent earlier or repeated practice',()=>{
    const learned=accepted();
    const idled=month(learned);
    expect(tuition(idled).swordPractice).toBeUndefined();
    expect(proof(idled)).toBeUndefined();
    const practice=practiced();
    expect(proof(practice)).toBeUndefined();
    const later=month(practice,{[learnerId]:command('CULTIVATE')});
    expect(tuition(later).swordPractice).toEqual(tuition(practice).swordPractice);
    expect(proof(later)).toEqual({tuitionId:tuition(later).id,learnerId,mentorId,
      lessonTick:learned.tick,practiceTick:practice.tick,practiceSiteId:siteId});
    expect(taughtSwordProof(later,actor(later,learnerId),{...actor(later,mentorId)})).toBeUndefined();
  });

  it('rejects a real refusal sibling, absent body, and duplicated or public source without weakening the native lesson',()=>{
    const offered=invited();
    const refused=month(offered,{[learnerId]:command('DECLINE_TUITION',{targetTuitionId:tuition(offered).id})});
    expect(tuition(refused).status).toBe('declined');
    const alternate=month(refused,{[learnerId]:command('CULTIVATE')});
    expect(tuition(alternate).swordPractice).toBeUndefined();
    const real=month(practiced());
    expect(proof(real)).toBeDefined();
    const other=month(real,{[learnerId]:command('EXPLORE',{targetLocationId:'loc-market'})});
    expect(actor(other,learnerId).locationId).toBe('loc-market');
    expect(proof(other)).toBeUndefined();
    const id=taughtSwordPracticeEventId(learnerId,tuition(real).swordPractice!.tick);
    const original=real.events.find(row=>row.id===id)!;
    const duplicate=structuredClone(real);
    duplicate.events.push({...original});
    expect(proof(duplicate)).toBeUndefined();
    const publicCopy=structuredClone(real);
    publicCopy.events.find(row=>row.id===id)!.witnessScope=undefined;
    expect(proof(publicCopy)).toBeUndefined();
    expect(proof(real)).toBeDefined();
    const restored=decodeWorldSave(encodeWorldSave(real));
    expect(proof(restored)).toEqual(proof(real));
  });
  it('can withdraw only its own true challenge, or pay and land a true later counter without exposing the lesson',()=>{
    const aimed=command('DUEL',{targetCultivatorId:mentorId});
    const unpracticed=month(accepted(),{[learnerId]:aimed});
    expect(unpracticed.schoolFormDuels).toBeUndefined();
    const source=practiced();
    const sourceJson=JSON.stringify(source);
    const opened=month(source,{[learnerId]:aimed});
    const view=schoolFormDuelView(opened,actor(opened,learnerId))!;
    expect(view.options).toEqual(['counter','stop']);
    const arena=projectGuidedVisualDuelArena(opened,actor(opened,learnerId),'school',view.contactId);
    expect(arena).toMatchObject({siteId,damages:[],left:{id:learnerId},right:{id:mentorId}});
    expect(arena?.outcome).toBeUndefined();
    expect(arena?.accent).toBeUndefined();
    expect(arena?.right.qi).toBeUndefined();
    expect(projectGuidedVisualDuelArena(opened,actor(opened,mentorId),'school',view.contactId)).toBeUndefined();
    expect(projectGuidedVisualDuelArena(opened,{...actor(opened,learnerId)},'school',view.contactId)).toBeUndefined();
    const saved=decodeWorldSave(encodeWorldSave(opened));
    expect(schoolFormDuelView(saved,actor(saved,learnerId))?.contactId).toBe(view.contactId);
    const guard={kind:'school-form-duel',world:opened,branchId:'real-fork',revision:7,
      actorId:learnerId,contactId:view.contactId,choice:'stop'} as const;
    expect(resolveGuidedWorldTurn(guard,opened,'real-fork',7)?.decision).toMatchObject(schoolFormCommand(view.contactId,'stop'));
    expect(resolveGuidedWorldTurn(guard,saved,'real-fork',7)).toBeUndefined();
    expect(resolveGuidedWorldTurn(guard,opened,'other-fork',7)).toBeUndefined();
    expect(resolveGuidedWorldTurn(guard,opened,'real-fork',8)).toBeUndefined();
    const edited=structuredClone(opened);
    edited.events=edited.events.filter(event=>!event.id.startsWith('evt-school-form-private-noticed-'));
    expect(schoolFormDuelView(edited,actor(edited,learnerId))).toBeUndefined();
    expect(()=>decodeWorldSave(encodeWorldSave(edited))).toThrow();
    expect(schoolFormDuelView(opened,actor(opened,mentorId))).toBeUndefined();
    expect(schoolFormDuelView(opened,actor(opened,'npc-3'))).toBeUndefined();
    expect(actor(opened,learnerId).hp).toBe(actor(source,learnerId).hp);
    expect(actor(opened,mentorId).hp).toBe(actor(source,mentorId).hp);
    const stopped=month(opened,{[learnerId]:{...schoolFormCommand(view.contactId,'stop'),innerMonologue:''}});
    expect(schoolFormStoryReceipt(stopped,learnerId,view.contactId,'stop')).toBeDefined();
    expect(actor(stopped,learnerId).hp).toBe(actor(opened,learnerId).hp);
    expect(actor(stopped,mentorId).hp).toBe(actor(opened,mentorId).hp);
    expect(projectSchoolFormStrokes(stopped)).toEqual([]);
    const countered=month(opened,{[learnerId]:{...schoolFormCommand(view.contactId,'counter'),innerMonologue:''}});
    expect(schoolFormStoryReceipt(countered,learnerId,view.contactId,'counter')).toBeDefined();
    expect(actor(countered,learnerId).qiProgress).toBe(actor(stopped,learnerId).qiProgress-10);
    expect(actor(countered,mentorId).hp).toBeLessThan(actor(stopped,mentorId).hp);
    expect(projectSchoolFormStrokes(countered)).toContainEqual({actorId:learnerId,opponentId:mentorId,siteId});
    const actual=countered.events.find(row=>row.tick===countered.tick&&row.id.startsWith('evt-school-form-stroke-'))!;
    expect(actual.witnessScope).toBeUndefined();
    const fraud={...countered,events:countered.events.filter(event=>!event.id.startsWith('evt-school-form-private-counter-'))};
    expect(projectSchoolFormStrokes(fraud)).toEqual([]);
    expect(`${actual.title} ${actual.description}`).not.toMatch(/太虚御剑经|传授|师徒/);
    expect(JSON.stringify(source)).toBe(sourceJson);
  });

  it('commits the same counter under actual Utility and strict Cognitive, but a held body rejects model/stale contact commands',async()=>{
    const opened=month(practiced(),{[learnerId]:command('DUEL',{targetCultivatorId:mentorId})});
    const view=schoolFormDuelView(opened,actor(opened,learnerId))!;
    const exact=schoolFormCommand(view.contactId,'counter');
    const modelConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'test-only'};
    const request=(world:WorldState,id=learnerId)=>requestCultivatorLLMDecision(actor(world,id),world,modelConfig,world.tick+1);
    const stub=(value:object)=>{
      const mock=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]})));
      llmScheduler.resetTickBudget();
      vi.stubGlobal('fetch',mock);
      return mock;
    };
    stub({...exact,targetSchoolFormContactId:`${view.contactId}-old`});
    expect(await request(opened)).toBeUndefined();
    stub({...exact,damage:999});
    expect(await request(opened)).toBeUndefined();
    const transport=stub(exact);
    expect(await request(opened,mentorId)).toBeUndefined();
    expect(transport).not.toHaveBeenCalled();
    const approved=await request(opened);
    expect(approved).toMatchObject(exact);
    const cognitive=month(opened,{[learnerId]:approved!},new Set([learnerId]));
    const utility=month(opened);
    expect(projectSchoolFormStrokes(cognitive)).toEqual(projectSchoolFormStrokes(utility));
    expect(projectSchoolFormStrokes(cognitive)).toHaveLength(1);
    expect(actor(cognitive,learnerId).qiProgress).toBe(actor(utility,learnerId).qiProgress);
    expect(actor(cognitive,mentorId).hp).toBe(actor(utility,mentorId).hp);

    const held=structuredClone(opened);
    expect(possessAvatar(held,learnerId)).toBe(true);
    const heldTransport=stub(exact);
    expect(await request(held)).toBeUndefined();
    expect(heldTransport).not.toHaveBeenCalled();
    const pending=month(held,{[learnerId]:approved!},new Set([learnerId]));
    expect(schoolFormDuelView(pending,actor(pending,learnerId))?.contactId).toBe(view.contactId);
    expect(projectSchoolFormStrokes(pending)).toEqual([]);
    expect(actor(pending,learnerId).qiProgress).toBe(actor(held,learnerId).qiProgress);
    const chosenStop=month(pending,{[learnerId]:{...schoolFormCommand(view.contactId,'stop'),innerMonologue:''}});
    expect(schoolFormStoryReceipt(chosenStop,learnerId,view.contactId,'stop')).toBeDefined();
    expect(projectSchoolFormStrokes(chosenStop)).toEqual([]);
  });

});

describe('single gesture authority at the actual native school-form contact',()=>{
  const openedFrame=():SceneFrame=>{
    const world=month(practiced(),{[learnerId]:command('DUEL',{targetCultivatorId:mentorId})});
    return {world,branchId:'main',revision:3,viewerId:learnerId,sceneId:schoolFormDuelView(world,actor(world,learnerId))!.contactId,
      scopeEpoch:1,live:true,focused:true};
  };

  it('reserves synchronously once across duplicate touch/keyboard callbacks and advances the same actual frame only once',()=>{
    const frame=openedFrame(),lease=createSceneFrameLease();
    const firstQuote=lease.quote(frame),parallelQuote=lease.quote(frame);
    expect(firstQuote).toBeDefined();
    let commits=0,current=frame.world;
    const invoke=(quote=firstQuote)=>{
      const token=lease.reserve(quote,frame);
      if(!token)return;
      return ()=>{
        const directed=resolveGuidedWorldTurn({kind:'school-form-duel',world:frame.world,branchId:frame.branchId,
          revision:frame.revision,actorId:frame.viewerId,contactId:frame.sceneId,choice:'counter'},current,frame.branchId,frame.revision)!;
        current=month(current,{[directed.actorId]:directed.decision});
        commits++;
        expect(schoolFormStoryReceipt(current,frame.viewerId,frame.sceneId,'counter')).toBeDefined();
        expect(lease.finish(token,frame)).toBe(true);
      };
    };
    const complete=invoke()!;
    expect(invoke()).toBeUndefined();
    expect(invoke(parallelQuote)).toBeUndefined();
    complete();
    expect(invoke()).toBeUndefined();
    expect(invoke(parallelQuote)).toBeUndefined();
    expect(lease.quote({...frame,scopeEpoch:2})).toBeUndefined();
    expect(commits).toBe(1);
    expect(current.tick).toBe(frame.world.tick+1);
    expect(actor(current,learnerId).qiProgress).toBe(actor(frame.world,learnerId).qiProgress-10);
  });

  it('rejects same-calendar siblings, wrong branch/revision/actor, nonlive history, and faded view quotes',()=>{
    const frame=openedFrame(),lease=createSceneFrameLease();
    const old=lease.quote(frame)!;
    for(const mismatch of [
      {world:structuredClone(frame.world)}, {branchId:'sibling'}, {revision:frame.revision+1},
      {viewerId:mentorId},{sceneId:`${frame.sceneId}-stale`},{scopeEpoch:2},{live:false},{focused:false},
    ])expect(lease.reserve(old,{...frame,...mismatch})).toBeUndefined();
    expect(lease.quote({...frame,live:false})).toBeUndefined();
    expect(lease.quote({...frame,focused:false})).toBeUndefined();
    expect(createSceneFrameLease().reserve(old,frame)).toBeUndefined();
    lease.invalidate();
    expect(lease.reserve(old,frame)).toBeUndefined();
    const reentered={...frame,scopeEpoch:2};
    const fresh=lease.quote(reentered)!;
    expect(lease.reserve(fresh,reentered)).toBeDefined();
  });

  it('blur revokes stale focus without reopening a source already used, and a new native frame may then run',()=>{
    const frame=openedFrame(),lease=createSceneFrameLease();
    expect(possessAvatar(frame.world,learnerId)).toBe(true);
    const token=lease.reserve(lease.quote(frame),frame)!;
    expect(token).toBeDefined();
    const next={...frame,world:month(frame.world),scopeEpoch:2};
    expect(schoolFormDuelView(next.world,actor(next.world,learnerId))?.contactId).toBe(frame.sceneId);
    lease.invalidate();
    const nextQuote=lease.quote(next);
    expect(nextQuote).toBeDefined();
    expect(lease.reserve(nextQuote,next)).toBeUndefined(); // old in-flight lock still belongs only to its first token
    expect(lease.finish(token,{...frame,focused:false})).toBe(false);
    expect(lease.quote({...frame,scopeEpoch:2})).toBeUndefined();
    const nextToken=lease.reserve(nextQuote,next)!;
    expect(nextToken).toBeDefined();
    expect(lease.finish(token,next)).toBe(false);
    expect(lease.finish(nextToken,next)).toBe(true);
  });
});
