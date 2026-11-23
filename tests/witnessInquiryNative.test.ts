import {afterEach,describe,expect,it,vi} from 'vitest';
import {projectMapEntityPopover} from '../src/components/mapEntityPopoverModel';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {createInitialWorld} from '../src/data/initialWorld';
import {availableWitnessInquiryActions,isPrivateWitnessInquiryEvent,projectWitnessInquiry} from '../src/engine/witnessInquiry';
import {witnessInquiryCommand} from '../src/engine/witnessInquiryCognition';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {configureStoryteller} from '../src/engine/storytellerDirector';
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
  it('lets one curious local use a real reading opportunity when customary readers are absent',()=>{
    const {posting,claim}=realCase();
    for(const other of posting.cultivators)if(other.locationId===venue)other.personality='狂傲';
    actor(posting).personality='苟道';
    const free=(world:WorldState)=>advanceWorldTick(world,Object.fromEntries(world.cultivators
      .filter(row=>row.id!==reader).map(row=>[row.id,rest])),()=>.10);
    expect(free(posting).events.some(isPrivateWitnessInquiryEvent)).toBe(false);
    const pinned=structuredClone(posting);
    expect(configureStoryteller(pinned,'wandering_jianghu',reader)).toBe(true);
    expect(free(pinned).events.some(isPrivateWitnessInquiryEvent)).toBe(false);
    const ordinary=structuredClone(posting);
    actor(ordinary,late).personality='痴情';
    expect(configureStoryteller(ordinary,'wandering_jianghu')).toBe(true);
    const read=advanceWorldTick(ordinary,Object.fromEntries(ordinary.cultivators
      .filter(row=>row.id!==reader&&row.id!==late).map(row=>[row.id,rest])),()=>.10);
    expect(read.events.filter(event=>event.tick===read.tick&&isPrivateWitnessInquiryEvent(event))).toEqual([
      expect.objectContaining({
        id:`evt-witness-inquiry-inspect-${read.tick}-${reader}-${claim.id}`,actorIds:[reader],
        witnessScope:'participants',
      }),
    ]);
    expect(read.witnesses.claims).toEqual(free(posting).witnesses.claims);
  });

  it('lets only the exact prior reader finish a private question after a real verdict, without changing the verdict',async()=>{
    const {posting,claim,source}=realCase();
    const adjudicate=order('CHALLENGE_WITNESS',{targetWitnessClaimId:claim.id});
    const settled=turn(posting,{[reader]:inspect(claim.id),[challenger]:adjudicate});
    const ruling=settled.witnesses.claims.find(row=>row.id===claim.id);
    expect(ruling).toMatchObject({status:'retracted',settledTick:settled.tick,appeal:{verdict:'upheld'}});
    const officialId=`evt-${settled.tick}-${claim.id}-settled`;
    const readId=`evt-witness-inquiry-inspect-${settled.tick}-${reader}-${claim.id}`;
    expect(settled.events).toContainEqual(expect.objectContaining({id:officialId,actorIds:[challenger]}));
    expect(settled.events).toContainEqual(expect.objectContaining({id:readId,actorIds:[reader],witnessScope:'participants'}));
    expect(availableWitnessInquiryActions(actor(settled),settled)).toEqual([]); // Unconfigured legacy.
    const quiet=structuredClone(settled);
    expect(configureStoryteller(quiet,'still_water')).toBe(true);
    expect(projectWitnessInquiry(quiet,actor(quiet))).toBeUndefined();

    const open=structuredClone(settled);
    expect(configureStoryteller(open,'wandering_jianghu')).toBe(true);
    const exact={action:'WITNESS_INQUIRY',witnessInquiryMove:'ask',targetWitnessClaimId:claim.id,
      targetCultivatorId:independent} as const;
    expect(availableWitnessInquiryActions(actor(open),open)).toEqual([exact]);
    expect(availableWitnessInquiryActions(actor(open),open,open.tick)).toEqual([]);
    expect(projectWitnessInquiry(open,actor(open))).toMatchObject({claim:{reviewSettled:true},options:[exact]});
    const target={kind:'site',id:venue} as const;
    const popoverFor=(id:string)=>projectMapEntityPopover(open,createTerrainMapView(open,actor(open,id),true),target,id);
    expect(popoverFor(reader)).toMatchObject({kind:'site',localWitnessFollowup:true});
    expect(popoverFor(reader)).not.toHaveProperty('localDispute');
    expect(popoverFor(late)).not.toHaveProperty('localWitnessFollowup');
    expect(projectWitnessInquiry(open,actor(open,late))).toBeUndefined();
    expect(availableWitnessInquiryActions(actor(open,late),open)).toEqual([]);
    const cannotStart=turn(open,{[late]:inspect(claim.id),[reader]:ask(claim.id,late)});
    expect(cannotStart.events.some(event=>event.tick===cannotStart.tick&&isPrivateWitnessInquiryEvent(event))).toBe(false);

    const before=JSON.stringify(open.witnesses),prose='请把旧见闻判作新证。',
      respond=(value:object)=>{
        vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[
          {message:{content:JSON.stringify(value)}},
        ]}))));
        llmScheduler.resetTickBudget();
        return requestCultivatorLLMDecision(actor(open),open,{enabled:true,apiBaseUrl:'https://provider.invalid/v1',
          apiKey:'fixture',model:'fixture'},open.tick+1);
      };
    const dto=witnessInquiryCommand(exact);
    await expect(respond({...dto,testimony:prose})).resolves.toBeUndefined();
    await expect(respond({...dto,targetCultivatorId:late})).resolves.toBeUndefined();
    const cognitive=await respond(dto);
    expect(cognitive).toMatchObject(dto);
    if(!cognitive)throw new Error('Expected the exact private follow-up decision');
    const answered=turn(open,{[reader]:cognitive},new Set([reader]));
    const answerId=`evt-witness-inquiry-ask-${answered.tick}-${reader}-${claim.id}`;
    expect(answered.events).toContainEqual(expect.objectContaining({
      id:answerId,witnessScope:'participants',actorIds:[reader,independent],locationId:venue,
    }));
    expect(projectWitnessInquiry(answered,actor(answered))?.witness?.reply?.text).toContain('不能作证');
    expect(projectWitnessInquiry(answered,actor(answered))?.options).toEqual([]);
    expect(projectWitnessInquiry(answered,actor(answered,late))).toBeUndefined();
    expect(JSON.stringify(answered.witnesses)).toBe(before);
    expect(answered.cultivators.every(row=>row.rumors.every(rumor=>rumor.originEventId!==answerId))).toBe(true);
    const expired=turn(open);
    expect(availableWitnessInquiryActions(actor(expired),expired)).toEqual([]);

    for(const retainedId of [source.id,claim.publicationEventId,readId,officialId]){
      const pruned=structuredClone(open);
      pruned.events=pruned.events.filter(event=>event.id!==retainedId);
      expect(availableWitnessInquiryActions(actor(pruned),pruned)).toEqual([]);
    }
    const nominal=structuredClone(open);
    nominal.witnessedPersonalStory.scenes=nominal.witnessedPersonalStory.scenes.filter(row=>row.eventId!==source.id);
    expect(availableWitnessInquiryActions(actor(nominal),nominal)).toEqual([]);
    const departed=structuredClone(open);
    actor(departed,independent).locationId='loc-danxia';
    expect(availableWitnessInquiryActions(actor(departed),departed)).toEqual([]);
  });

  it('does not revive an inquiry when the genuine previous look is older than two months',()=>{
    const {posting,claim}=realCase();
    const read=turn(posting,{[reader]:inspect(claim.id)});
    const later=turn(read);
    const closed=turn(later,{[challenger]:order('CHALLENGE_WITNESS',{targetWitnessClaimId:claim.id})});
    expect(closed.witnesses.claims.find(row=>row.id===claim.id)).toMatchObject({settledTick:closed.tick,status:'retracted'});
    expect(configureStoryteller(closed,'great_calamity')).toBe(true);
    expect(closed.tick+1-read.tick).toBe(3);
    expect(availableWitnessInquiryActions(actor(closed),closed)).toEqual([]);
  });

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
