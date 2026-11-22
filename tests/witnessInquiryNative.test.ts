import {afterEach,describe,expect,it,vi} from 'vitest';
import {projectMapEntityPopover} from '../src/components/mapEntityPopoverModel';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {createInitialWorld} from '../src/data/initialWorld';
import {availableWitnessInquiryActions,isPrivateWitnessInquiryEvent,projectWitnessInquiry} from '../src/engine/witnessInquiry';
import {witnessInquiryCommand} from '../src/engine/witnessInquiryCognition';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});

const venue='loc-market',challenger='npc-5',opponent='npc-2',independent='npc-6',reader='npc-1',late='npc-3';
const actor=(world:WorldState,id=reader)=>world.cultivators.find(row=>row.id===id)!;
const order=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'只问所见。',...fields});
const travel=(targetLocationId:string)=>order('EXPLORE',{targetLocationId});
const rest=order('REST');
function turn(world:WorldState,orders:Record<string,LLMDecisionPayload>={},modelActors?:ReadonlySet<string>){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,orders[row.id]??rest])),()=>.10,
    modelActors?'deferred':'utility',undefined,modelActors?{modelActors}:undefined);
}
function realCase(){
  const initial=createInitialWorld(2031,'classic');
  expect(actor(initial,independent).locationId).toBe(venue);
  const assembled=turn(initial,{[challenger]:travel(venue),[opponent]:travel(venue)});
  expect(actor(assembled,challenger).locationId).toBe(venue);
  expect(actor(assembled,opponent).locationId).toBe(venue);
  const original=turn(assembled,{[challenger]:order('DUEL',{targetCultivatorId:opponent})});
  const source=original.events.find(row=>row.id===`evt-${original.tick}-${challenger}-duel`)!;
  expect(source).toMatchObject({category:'combat',actorIds:[challenger,opponent],locationId:venue,duelWinnerId:challenger});
  expect(actor(original,opponent).alive).toBe(true);
  const scene=original.witnessedPersonalStory.scenes.find(row=>row.eventId===source.id)!;
  expect(scene.witnessIds).toContain(independent);
  expect(scene.witnessIds).not.toContain(reader);
  expect(scene.witnessIds).not.toContain(late);
  const posting=turn(original,{
    [opponent]:order('FILE_WITNESS_CLAIM',{targetWitnessEventId:source.id,targetCultivatorId:challenger}),
    [reader]:travel(venue),[late]:travel(venue),
  });
  const claim=posting.witnesses.claims.find(row=>row.sourceEventId===source.id)!;
  expect(claim).toMatchObject({subjectId:challenger,claimantId:opponent,locationId:venue,status:'pending'});
  expect(posting.events).toContainEqual(expect.objectContaining({id:claim.publicationEventId,locationId:venue,actorIds:[opponent,challenger]}));
  expect(actor(posting).locationId).toBe(venue);
  expect(actor(posting,late).locationId).toBe(venue);
  return {posting,claim,source};
}
const inspect=(claimId:string)=>order('WITNESS_INQUIRY',{targetWitnessClaimId:claimId,witnessInquiryMove:'inspect'});
const ask=(claimId:string,witnessId=independent)=>order('WITNESS_INQUIRY',{
  targetWitnessClaimId:claimId,targetCultivatorId:witnessId,witnessInquiryMove:'ask'});

describe('the actual local posting and a real independently witnessed duel',()=>{
  it('checks two actual on-site clues without changing legal evidence or silently endorsing a false posting',()=>{
    const {posting,claim}=realCase();
    const publicRead=projectWitnessInquiry(posting,actor(posting))!;
    expect(publicRead.claim.text).toContain(`称${actor(posting,challenger).name}在所引斗法中落败`);
    expect(publicRead.witness).toBeUndefined();
    const target={kind:'site',id:venue} as const;
    const local=projectMapEntityPopover(posting,createTerrainMapView(posting,actor(posting),true),target,reader);
    expect(local).toMatchObject({kind:'site',localDispute:true});
    const remote='npc-7';
    const knownRemote=projectMapEntityPopover(posting,createTerrainMapView(posting,actor(posting,remote),false),target,remote);
    expect(knownRemote).toMatchObject({kind:'site'});
    expect(knownRemote).not.toHaveProperty('localDispute');
    const refusedEarly=turn(posting,{[reader]:ask(claim.id)});
    expect(refusedEarly.events.some(isPrivateWitnessInquiryEvent)).toBe(false);
    const read=turn(posting,{[reader]:inspect(claim.id)});
    expect(read.events.filter(row=>row.tick===read.tick&&isPrivateWitnessInquiryEvent(row))).toEqual([
      expect.objectContaining({actorIds:[reader],locationId:venue,title:'亲阅当地指证'}),
    ]);
    expect(projectWitnessInquiry(read,actor(read))?.witness).toMatchObject({name:actor(read,independent).name,canAsk:true});
    expect(projectWitnessInquiry(read,actor(read,late))?.witness).toBeUndefined();
    expect(availableWitnessInquiryActions(actor(read),read)).not.toContainEqual(expect.objectContaining({targetCultivatorId:late}));
    const asked=turn(read,{[reader]:ask(claim.id)});
    expect(asked.events.filter(row=>row.tick===asked.tick&&isPrivateWitnessInquiryEvent(row))).toEqual([
      expect.objectContaining({actorIds:[reader,independent],locationId:venue,title:'当场者只说所见'}),
    ]);
    const reply=projectWitnessInquiry(asked,actor(asked))?.witness;
    expect(reply?.reply?.text).toContain(`${actor(asked,challenger).name}在那场交锋中占了上风`);
    expect(reply?.reply?.text).toContain('不能作证');
    expect(reply?.canAsk).toBe(false);
    expect(projectWitnessInquiry(asked,actor(asked,late))?.witness).toBeUndefined();
    expect(asked.witnesses.claims).toEqual(read.witnesses.claims);
    expect(asked.sects.map(row=>row.reputation)).toEqual(turn(read).sects.map(row=>row.reputation));
    expect(asked.cultivators.every(row=>row.rumors.every(rumor=>!rumor.originEventId?.startsWith('evt-witness-inquiry-')))).toBe(true);
  });

  it('never substitutes a nominal witness, a departed first-hand witness, a public impostor or a duplicated source',()=>{
    const {posting,claim,source}=realCase();
    const read=turn(posting,{[reader]:inspect(claim.id)});
    const away=turn(read,{[independent]:travel('loc-danxia')});
    expect(actor(away,independent).locationId).not.toBe(venue);
    expect(projectWitnessInquiry(away,actor(away))?.witness).toBeUndefined();
    expect(availableWitnessInquiryActions(actor(away),away)).toEqual([]);
    const questioned=turn(read,{[reader]:ask(claim.id,late)});
    expect(questioned.events.some(row=>row.tick===questioned.tick&&isPrivateWitnessInquiryEvent(row))).toBe(false);
    const forged=structuredClone(read);
    forged.events.push({...source,witnessScope:'participants'});
    expect(projectWitnessInquiry(forged,actor(forged))).toBeUndefined();
    const nominal=structuredClone(read);
    nominal.witnessedPersonalStory.scenes=nominal.witnessedPersonalStory.scenes.filter(row=>row.eventId!==source.id);
    expect(projectWitnessInquiry(nominal,actor(nominal))).toBeUndefined();
  });
  it('Utility and a strict Cognitive player reach the same actual observer without letting the model author testimony',async()=>{
    const {posting,claim}=realCase();
    const quietOthers=Object.fromEntries(posting.cultivators.filter(row=>row.id!==reader).map(row=>[row.id,rest]));
    const utilityRead=advanceWorldTick(posting,quietOthers,()=>.10);
    expect(utilityRead.events).toContainEqual(expect.objectContaining({title:'亲阅当地指证',tick:utilityRead.tick,actorIds:[reader]}));
    const utilityAsk=advanceWorldTick(utilityRead,quietOthers,()=>.10);
    expect(utilityAsk.events).toContainEqual(expect.objectContaining({title:'当场者只说所见',tick:utilityAsk.tick,actorIds:[reader,independent]}));
    const request=(world:WorldState,proposal:object)=>{
      const injected=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{
        expect(String(init?.body)).not.toContain('旁的事，我不能作证');
        return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(proposal)}}]}));
      });
      vi.stubGlobal('fetch',injected);
      llmScheduler.resetTickBudget();
      return requestCultivatorLLMDecision(actor(world),world,{enabled:true,apiBaseUrl:'https://provider.invalid/v1',
        apiKey:'fixture',model:'fixture'},world.tick+1);
    };
    const inspectNative=availableWitnessInquiryActions(actor(posting),posting).find(row=>row.targetWitnessClaimId===claim.id)!;
    const acceptedRead=await request(posting,witnessInquiryCommand(inspectNative));
    expect(acceptedRead).toMatchObject(witnessInquiryCommand(inspectNative));
    const read=turn(posting,{[reader]:acceptedRead!},new Set([reader]));
    const exact=availableWitnessInquiryActions(actor(read),read).find(row=>row.targetCultivatorId===independent)!;
    expect(exact).toBeDefined();
    expect(await request(read,{...witnessInquiryCommand(exact),targetCultivatorId:late})).toBeUndefined();
    expect(await request(read,{...witnessInquiryCommand(exact),testimony:'I declare a ruling'})).toBeUndefined();
    const acceptedAsk=await request(read,witnessInquiryCommand(exact));
    expect(acceptedAsk).toMatchObject(witnessInquiryCommand(exact));
    const asked=turn(read,{[reader]:acceptedAsk!},new Set([reader]));
    expect(projectWitnessInquiry(asked,actor(asked))?.witness).toEqual(projectWitnessInquiry(utilityAsk,actor(utilityAsk))?.witness);
    expect(projectWitnessInquiry(asked,actor(asked))?.witness?.reply?.text).toContain('占了上风');
  });

});
