import {afterEach,describe,expect,it,vi} from 'vitest';
import {advanceDanxiaSeasonReviews,availableDanxiaReviewActions,compareDanxiaSeasonReviews,localDanxiaSeasonReviewSite,projectDanxiaSeasonReviews} from '../src/engine/danxiaSeasonReviewEngine';
import {DANXIA_FIXTURE,danxiaActor,danxiaPayload,danxiaTurn,preparedDanxiaAppointment} from './fixtures/danxiaNativeFixture';
import {possessAvatar,queueAvatarDanxiaReview} from '../src/engine/avatarEngine';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {danxiaSeasonUiFixture} from './fixtures/danxiaSeasonUiFixture';
import {readBranchFateOrigin} from '../src/engine/branchFateComparison';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {decodeWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {verifiableDanxiaScenarioOutcome} from '../src/engine/scenarioDanxiaOutcome';
import type {DanxiaReviewMove,LLMDecisionPayload,ScenarioDanxiaOutcome,WorldState} from '../src/types/world';

const fixture=DANXIA_FIXTURE;
const donor=fixture.discipleId,escort=fixture.staffId;
const villageSite=fixture.villageSiteId;
const load=(world:WorldState)=>decodeWorldSave(encodeWorldSave(world));
const visit=(targetLocationId=villageSite)=>danxiaPayload('EXPLORE',{targetLocationId});
const reviewAction=(danxiaReviewMove:DanxiaReviewMove,targetDanxiaReviewId:string,targetSettlementRecordId?:string)=>
  danxiaPayload('DANXIA_REVIEW',{danxiaReviewMove,targetDanxiaReviewId,...(targetSettlementRecordId?{targetSettlementRecordId}:{})});
const outcome=(world:WorldState,settlementId:string,required:ScenarioDanxiaOutcome,asOf=world.tick,actorId:string=donor)=>
  verifiableDanxiaScenarioOutcome(world,{kind:'danxia_medicine_outcome',actorId,settlementId,required},asOf);
const review=(world:WorldState)=>world.danxiaReviews.reviews[0];

function advanceUntil(world:WorldState,target:number,choices:Record<string,LLMDecisionPayload>={}){
  while(world.tick<target)world=danxiaTurn(world,choices);
  expect(world.tick).toBe(target);
  return world;
}
function realShortage(){
  const f=preparedDanxiaAppointment();
  const world=danxiaTurn(f.world);
  const thisShortage=world.danxiaShortages.cases[0];
  expect(thisShortage).toMatchObject({status:'open',discipleId:donor,patientId:f.patientId});
  danxiaActor(world,donor).herbs.jade_leaf=2;
  return {...f,world,shortageId:thisShortage.id};
}
function realDelivery(f:ReturnType<typeof realShortage>){
  const offered=danxiaTurn(f.world,{[donor]:danxiaPayload('DANXIA_MEDICINE',{
    danxiaMedicineMove:'offer_ship',targetDanxiaShortageId:f.shortageId,targetCultivatorId:escort})});
  const medicine=offered.danxiaMedicine.commitments[0];
  const accepted=danxiaTurn(offered,{[escort]:danxiaPayload('DANXIA_MEDICINE',{
    danxiaMedicineMove:'accept',targetDanxiaMedicineId:medicine.id}),[f.patientId]:visit(),[donor]:visit()});
  let waiting=accepted;
  while(waiting.tick<accepted.tick+8&&waiting.danxiaMedicine.commitments[0].status!=='arrived')waiting=danxiaTurn(waiting);
  expect(waiting.danxiaMedicine.commitments[0].status).toBe('arrived');
  expect(waiting.danxiaReviews.reviews).toEqual([]);
  const received=danxiaTurn(waiting,{[f.patientId]:danxiaPayload('DANXIA_MEDICINE',{
    danxiaMedicineMove:'receive',targetDanxiaMedicineId:medicine.id})});
  expect(received.danxiaMedicine.commitments[0]).toMatchObject({status:'received',settlement:{tick:received.tick,actorId:f.patientId}});
  expect(received.tick).toBe(114);
  expect(received.danxiaReviews.reviews).toEqual([]);
  return received;
}

afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});

describe('native Danxia commitments settle in a later real season',()=>{
  it('compares only genuine retained branch ancestry at the exact shared reading month',()=>{
    const f=danxiaSeasonUiFixture();
    const baseline=readBranchFateOrigin(f.timeline,f.mainId,f.deliveryId,f.throughTick);
    expect(baseline?.tick).toBe(108);
    expect(readBranchFateOrigin(f.timeline,f.mainId,f.mainId,f.throughTick)).toBeUndefined();
    expect(readBranchFateOrigin(f.timeline,f.mainId,f.deliveryId,f.throughTick+1)).toBeUndefined();
    const answers=baseline&&compareDanxiaSeasonReviews(baseline,f.left,f.right,f.shortageId,f.discipleId);
    expect(answers).toMatchObject({first:{status:'refused'},second:{status:'renewed'}});
    expect(baseline&&compareDanxiaSeasonReviews(baseline,f.left,f.right,f.shortageId,f.outsiderId)).toBeUndefined();
  });

  it('counts signed receipt rather than arrival; same-source siblings can independently renew or explicitly refuse',()=>{
    const f=realShortage(),receipt=realDelivery(f);
    expect(outcome(receipt,f.villageId,'delivered')).toBe(false); // not yet date-qualified reviewed evidence
    const opened=danxiaTurn(receipt);
    const proof=review(opened);
    expect(opened.tick).toBe(115);
    expect(proof).toMatchObject({shortageId:f.shortageId,discipleId:donor,patientId:f.patientId,openedTick:115,
      source:{outcome:'delivered',finalTick:114,deliveredLeaves:2},status:'open'});
    expect(advanceDanxiaSeasonReviews(opened)).toEqual([]);
    expect(outcome(opened,f.villageId,'delivered')).toBe(true);
    expect(outcome(opened,f.villageId,'renewed')).toBe(false);
    expect(outcome(opened,f.villageId,'delivered',114)).toBe(false);
    const unrelated=danxiaActor(opened,escort);
    unrelated.name=danxiaActor(opened,f.patientId).name;
    expect(projectDanxiaSeasonReviews(opened,unrelated)).toEqual([]);
    expect(outcome(opened,f.villageId,'delivered',opened.tick,escort)).toBe(false);
    const proposer=danxiaTurn(load(opened),{[f.patientId]:reviewAction('propose_renew',proof.id),[donor]:reviewAction('accept',proof.id)});
    expect(review(proposer)).toMatchObject({status:'proposed',proposal:{kind:'renew',proposedTick:proposer.tick}});
    const renewed=danxiaTurn(proposer,{[donor]:reviewAction('accept',proof.id)});
    const refusal=danxiaTurn(opened,{[f.patientId]:reviewAction('refuse',proof.id)});
    const refused=advanceUntil(refusal,renewed.tick);
    expect(review(renewed)).toMatchObject({status:'renewed',decision:{actorId:donor,tick:renewed.tick,reason:'signed'}});
    expect(review(refused)).toMatchObject({status:'refused',decision:{actorId:f.patientId,tick:refusal.tick,reason:'refused'}});
    expect(review(opened).status).toBe('open');
    expect(outcome(renewed,f.villageId,'renewed')).toBe(true);
    expect(outcome(renewed,f.villageId,'renewed',proposer.tick)).toBe(false);
    expect(outcome(refused,f.villageId,'renewed')).toBe(false);
    expect(outcome(refused,f.villageId,'refused')).toBe(true);
    expect(outcome(refused,f.villageId,'delivered')).toBe(true);
    expect(load(renewed).danxiaReviews).toEqual(renewed.danxiaReviews);
    expect(load(refused).danxiaReviews).toEqual(refused.danxiaReviews);
    const pair=compareDanxiaSeasonReviews(f.world,renewed,refused,f.shortageId,donor);
    expect(pair).toMatchObject({first:{role:'original_disciple',status:'renewed'},second:{role:'original_disciple',status:'refused'}});
    expect(compareDanxiaSeasonReviews(f.world,renewed,refused,f.shortageId,escort)).toBeUndefined();
    const impostor=structuredClone(refused);
    impostor.danxiaShortages.cases[0].openedTick--;
    expect(compareDanxiaSeasonReviews(f.world,renewed,impostor,f.shortageId,donor)).toBeUndefined();
    for(const mode of ['source','actor','time','public'] as const){
      const forged=structuredClone(renewed), row=review(forged);
      if(mode==='source')row.source.deliveredLeaves=0;
      if(mode==='actor')row.decision!.actorId=escort;
      if(mode==='time')row.decision!.tick=row.proposal!.proposedTick;
      if(mode==='public')Reflect.deleteProperty(forged.events.find(event=>event.id.endsWith(row.id+'-renewed'))!,'witnessScope');
      expect(()=>encodeWorldSave(forged)).toThrow(expect.objectContaining({code:'invalid_world'}));
    }
  });

  it('changes counterpart only after the village actually receives counted alternative aid and the right person later signs',()=>{
    const f=realShortage(), sponsor='npc-1';
    const start=danxiaTurn(f.world,{[donor]:danxiaPayload('DANXIA_MEDICINE',{danxiaMedicineMove:'retain',targetDanxiaShortageId:f.shortageId}),
      [sponsor]:visit(),[f.patientId]:visit()});
    const commitment=start.danxiaMedicine.commitments[0];
    const gather=(targetHerbId:'jade_leaf'|'earth_root')=>danxiaPayload('GATHER_HERBS',{targetHerbId});
    const ingredients=danxiaTurn(start,{[donor]:gather('earth_root'),[sponsor]:gather('jade_leaf')});
    const failed=danxiaTurn(ingredients,{[donor]:danxiaPayload('DANXIA_MEDICINE',{danxiaMedicineMove:'brew',targetDanxiaMedicineId:commitment.id})});
    expect(failed.danxiaMedicine.commitments[0]).toMatchObject({status:'brew_failed',settlement:{tick:111}});
    const site=failed.locations.find(row=>row.id===villageSite)!;
    const afterRain=applyMapBrush(failed,'beast_tide',[{x:site.x,y:site.y}]);
    const sponsorBefore=danxiaActor(afterRain,sponsor);
    expect(sponsorBefore.herbs.jade_leaf).toBeGreaterThanOrEqual(2);
    const aid=danxiaTurn(afterRain,{[sponsor]:danxiaPayload('DELIVER_RELIEF',{targetSettlementId:f.villageId})});
    expect(review(aid)).toMatchObject({openedTick:112,status:'open',source:{outcome:'unfulfilled',finalTick:111,deliveredLeaves:0}});
    const actual=aid.settlements.records.find(row=>row.kind==='relief'&&row.actorId===sponsor&&row.tick===112)!;
    expect(actual).toMatchObject({settlementId:f.villageId,sectId:'sect-qingyun',stones:12,herbs:2});
    expect(danxiaActor(aid,sponsor).herbs.jade_leaf).toBe(sponsorBefore.herbs.jade_leaf-2);
    const notAid=danxiaTurn(afterRain);
    expect(availableDanxiaReviewActions(danxiaActor(notAid,f.patientId),notAid,notAid.tick+1)
      .some(row=>row.danxiaReviewMove==='propose_switch')).toBe(false);
    const opened=review(aid);
    const beforeAlias=danxiaActor(aid,escort);
    beforeAlias.name=danxiaActor(aid,sponsor).name;
    const proposed=danxiaTurn(load(aid),{[f.patientId]:reviewAction('propose_switch',opened.id,actual.id)});
    expect(review(proposed)).toMatchObject({proposal:{kind:'switch',representativeId:sponsor,relief:{id:actual.id,stones:12,herbs:2}}});
    const signed=danxiaTurn(proposed,{[sponsor]:reviewAction('accept',opened.id),[escort]:reviewAction('accept',opened.id)});
    expect(review(signed)).toMatchObject({status:'switched',decision:{reason:'signed',actorId:sponsor,tick:114}});
    expect(outcome(signed,f.villageId,'switched')).toBe(true);
    expect(outcome(signed,f.villageId,'delivered')).toBe(false);
    expect(outcome(signed,f.villageId,'renewed')).toBe(false);
    expect(load(signed).danxiaReviews).toEqual(signed.danxiaReviews);
    const counterfeit=structuredClone(signed);
    counterfeit.settlements.records=counterfeit.settlements.records.filter(row=>row.id!==actual.id);
    expect(()=>encodeWorldSave(counterfeit)).toThrow(expect.objectContaining({code:'invalid_world'}));
  });

  it('shares native choices across model, Utility and queued player orders without a private map leak', async()=>{
    const f=realShortage(),opened=danxiaTurn(realDelivery(f)),actor=danxiaActor(opened,f.patientId),row=review(opened);
    const other=danxiaActor(opened,escort);
    expect(other.locationId).toBe(villageSite);
    expect(localDanxiaSeasonReviewSite(opened,actor)).toBe(villageSite);
    expect(localDanxiaSeasonReviewSite(opened,other)).toBeUndefined();
    const legal=availableDanxiaReviewActions(actor,opened,opened.tick+1).find(item=>item.danxiaReviewMove==='propose_renew')!;
    expect(legal).toBeDefined();
    const cfg={enabled:true,apiBaseUrl:'https://fixture.invalid',apiKey:'mock-only',model:'native-scenario-fixture'};
    const exact=reviewAction('propose_renew',row.id);
    let response:object=exact;
    vi.stubGlobal('fetch',vi.fn(async (_url:string,init:RequestInit)=>{
      const body=JSON.parse(String(init.body)) as {messages:{role:string;content:string}[]};
      const prompt=body.messages.find(message=>message.role==='user')?.content??'';
      expect(prompt).toContain('"danxiaReviewMove":"propose_renew"');
      expect(prompt).toContain('单方提议或到期不表示对方签字');
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(response)}}]}));
    }));
    const choice=await requestCultivatorLLMDecision(actor,opened,cfg,opened.tick+1);
    expect(choice).toMatchObject(exact);
    expect(review(danxiaTurn(opened,{[actor.id]:choice!})).status).toBe('proposed');
    llmScheduler.resetTickBudget();
    response={...exact,signed:true};
    expect(await requestCultivatorLLMDecision(actor,opened,cfg,opened.tick+1)).toBeUndefined();

    const peers=Object.fromEntries(opened.cultivators.filter(other=>other.id!==actor.id).map(other=>[other.id,danxiaPayload('REST')]));
    const utility=advanceWorldTick(opened,peers,()=>.99,'utility');
    expect(review(utility)).toMatchObject({status:'proposed',proposal:{kind:'renew'}});

    const avatar=structuredClone(opened);
    expect(possessAvatar(avatar,actor.id)).toBe(true);
    expect(queueAvatarDanxiaReview(avatar,actor.id,legal)).toBe(true);
    expect(queueAvatarDanxiaReview(avatar,actor.id,legal)).toBe(false);
    expect(avatar.playerAvatar.essence).toBe(71);
    expect(avatar.tick).toBe(opened.tick);
    expect(review(avatar).status).toBe('open');
    const stored=load(avatar);
    const after=danxiaTurn(stored);
    expect(after.playerAvatar.pendingOrder).toBeUndefined();
    expect(review(after)).toMatchObject({status:'proposed',proposal:{kind:'renew',proposedTick:116}});
    const forged=structuredClone(avatar);
    if(forged.playerAvatar.pendingOrder?.action==='DANXIA_REVIEW')forged.playerAvatar.pendingOrder.targetDanxiaReviewId+='x';
    expect(()=>encodeWorldSave(forged)).toThrow(expect.objectContaining({code:'invalid_world'}));
  });

  it('quiet expiry records no contract and does not turn original silence into a refusal',()=>{
    const f=realShortage(), uncommitted=advanceUntil(f.world,112,{[f.patientId]:visit()});
    const proof=review(uncommitted);
    expect(proof).toMatchObject({shortageId:f.shortageId,source:{outcome:'no_commitment',finalTick:109,deliveredLeaves:0},openedTick:112,status:'open'});
    expect(availableDanxiaReviewActions(danxiaActor(uncommitted,f.patientId),uncommitted)
      .some(row=>row.danxiaReviewMove==='propose_switch'||row.danxiaReviewMove==='propose_renew')).toBe(false);
    const elapsed=advanceUntil(uncommitted,proof.expiresTick);
    expect(review(elapsed)).toMatchObject({status:'no_agreement',decision:{tick:proof.expiresTick,reason:'expired'}});
    expect(outcome(elapsed,f.villageId,'refused')).toBe(false);
    expect(load(elapsed).danxiaReviews).toEqual(elapsed.danxiaReviews);
  });
});
