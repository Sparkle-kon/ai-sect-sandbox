import {pavilionActor,pavilionChoice,pavilionLoanCheckedOutFixture,pavilionMove,pavilionTurn} from './fixtures/pavilionLoanFixture';
import {availableTechniques} from '../src/engine/techniqueEngine';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {availablePavilionFireActions,projectPavilionFire} from '../src/engine/pavilionFire';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {pavilionFireCommand} from '../src/engine/pavilionFireCognition';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import type {PavilionFireMove} from '../src/types/pavilionFire';

afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});

const owner='npc-1',siteId='loc-taixu',sectId='sect-qingyun',refuge='brush-vein-tile-5-3';
const actor=(world:WorldState,id=owner)=>world.cultivators.find(row=>row.id===id)!;
const sect=(world:WorldState)=>world.sects.find(row=>row.id===sectId)!;
const row=(world:WorldState)=>world.pavilionFires?.cases[0];
function command(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload{
  return {chosenAction,innerMonologue:'按实有处置。',...fields};
}
function month(world:WorldState,orders:Record<string,LLMDecisionPayload>={}){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,orders[row.id]??command('REST')])),()=>.9);
}
function issue(world:WorldState,move:PavilionFireMove,chosen?:string,reader=owner){
  const quote=availablePavilionFireActions(actor(world,reader),world).find(option=>option.pavilionFireMove===move&&
    (!chosen||option.targetLocationId===chosen||option.targetCultivatorId===chosen))!;
  expect(quote).toBeDefined();
  return command(quote.action,{targetPavilionFireId:quote.targetPavilionFireId,pavilionFireMove:quote.pavilionFireMove,
    ...(quote.targetLocationId?{targetLocationId:quote.targetLocationId}:{}),...(quote.targetCultivatorId?{targetCultivatorId:quote.targetCultivatorId}:{})});
}
function source(visitor?:string){
  let world=createInitialWorld(1,'spirit-bloom');
  expect(sect(world).pavilion).toEqual([]);
  for(let i=0;i<17;i++)world=month(world,{[owner]:command('CULTIVATE')});
  const authored=month(world,{[owner]:command('AUTHOR_TECHNIQUE'),
    ...(visitor?{[visitor]:command('EXPLORE',{targetLocationId:siteId})}:{})});
  if(visitor)expect(actor(authored,visitor).locationId).toBe(siteId);
  const scroll=actor(authored).authoredTechnique!;
  expect(scroll.id).toBeDefined();
  expect(sect(authored).pavilion).toContainEqual(scroll);
  const near=applyMapBrush(authored,'paint_vein',[{x:220,y:140}]);
  expect(near.locations.some(place=>place.id===refuge)).toBe(true);
  const fire=applyMapBrush(near,'meteor',[{x:180,y:150}]);
  expect(actor(fire).hp).toBeLessThan(actor(near).hp);
  expect(row(fire)).toMatchObject({siteId,sectId,scrollId:scroll.id,scrollStatus:'shelved',heatTick:fire.tick+1});
  expect(fire.events).toContainEqual(expect.objectContaining({title:'陨火烧到藏经阁',locationId:siteId}));
  return {fire,scroll};
}

describe('real local library fire and three independent native choices',()=>{
  it('does not mistake a corrected copy actually checked out and moved away for the original shelf volume',()=>{
    const fixture=pavilionLoanCheckedOutFixture();
    const arrived=pavilionTurn(fixture.world,{[fixture.borrower]:pavilionChoice('EXPLORE',{targetLocationId:'loc-market'})});
    expect(pavilionActor(arrived,fixture.borrower).locationId).toBe('loc-market');
    const library=arrived.locations.find(site=>site.id===fixture.siteId)!;
    const strike=applyMapBrush(arrived,'meteor',[library]);
    expect(strike.pavilionFires?.cases[0]).toMatchObject({scrollStatus:'shelved',scrollId:fixture.originalId,siteId:fixture.siteId});
    const copies=strike.pavilionLoans.copies;
    const after=pavilionTurn(strike,{[fixture.borrower]:pavilionMove('read',fixture.loanId)});
    expect(after.pavilionFires?.cases[0]).toMatchObject({scrollStatus:'lost',scrollId:fixture.originalId});
    expect(after.pavilionLoans.copies).toEqual(copies);
    expect(after.pavilionLoans.loans.find(loan=>loan.id===fixture.loanId)?.read)
      .toMatchObject({siteId:'loc-market',credited:true});
    expect(after.scriptures.originals).toEqual(arrived.scriptures.originals);
    expect(decodeEraWorldSave(encodeEraWorldSave(after)).pavilionLoans).toEqual(after.pavilionLoans);
  });

  it('opens actual later study only to the carrier at the safe place and gives no access to a volume burned on its own shelf',()=>{
    const reader='npc-2';
    const {fire,scroll}=source(reader),id=scroll.id!;
    const offered=(world:WorldState,person=reader)=>availableTechniques(actor(world,person),world).find(row=>row.id===id);
    expect(offered(fire)).toBeUndefined();
    const left=month(fire,{[reader]:issue(fire,'leave',refuge,reader)});
    expect(row(left)?.scrollStatus).toBe('lost');
    expect(offered(left)).toBeUndefined();
    const carried=month(fire,{[reader]:issue(fire,'salvage',refuge,reader)});
    expect(offered(carried)).toBeUndefined();
    const secured=month(carried,{[reader]:issue(carried,'secure',undefined,reader)});
    expect(offered(secured)?.source).toBe('fire_recovery');
    expect(offered(secured,owner)).toBeUndefined();
    const read=month(secured,{[reader]:command('STUDY_TECHNIQUE',{targetTechniqueId:id})});
    expect(actor(read,reader).technique).toEqual(scroll);
    expect(read.events).toContainEqual(expect.objectContaining({id:`evt-${read.tick}-${reader}-study-technique-fire`,
      locationId:refuge,witnessScope:'participants'}));
    expect(row(read)?.copy).toEqual(scroll);
    expect(read.scriptures.originals).toEqual(secured.scriptures.originals);
  });

  it('salvages a physical shelf copy through a real adjacent place, then secures only on a later turn',()=>{
    const {fire,scroll}=source(),before=encodeEraWorldSave(fire);
    expect(projectPavilionFire(fire,actor(fire,'npc-3'))).toBeUndefined();
    const out=month(fire,{[owner]:issue(fire,'salvage',refuge)});
    expect(actor(out).locationId).toBe(refuge);
    expect(row(out)).toMatchObject({scrollStatus:'carried',copy:scroll,carrierId:owner,safeSiteId:refuge,carriedTick:out.tick});
    expect(sect(out).pavilion).not.toContainEqual(scroll);
    expect(out.scriptures.originals).toEqual(fire.scriptures.originals);
    expect(actor(out).authoredTechnique).toEqual(scroll);
    expect(actor(out).hp).toBe(actor(fire).hp);
    const secured=month(out,{[owner]:issue(out,'secure')});
    expect(row(secured)).toMatchObject({scrollStatus:'secured',securedTick:out.tick+1,copy:scroll});
    expect(projectPavilionFire(secured,actor(secured))?.receipt?.title).toBe('救出的一卷已安置');
    expect(encodeEraWorldSave(decodeEraWorldSave(encodeEraWorldSave(secured)))).toBe(encodeEraWorldSave(secured));
    expect(encodeEraWorldSave(fire)).toBe(before);
  });

  it('changes real heat only for the physically present named protected person; leaving does not save others or the copy',()=>{
    const {fire,scroll}=source();
    const stay=month(fire);
    const intent=issue(fire,'ward'),target=intent.targetCultivatorId!;
    expect(target).not.toBe(owner);
    const ward=month(fire,{[owner]:intent});
    const evacuated=month(fire,{[owner]:issue(fire,'leave',refuge)});
    expect(row(ward)?.heat?.wardSaved).toBeGreaterThan(0);
    expect(actor(ward,target).hp-actor(stay,target).hp).toBe(row(ward)?.heat?.wardSaved);
    expect(actor(ward,target).locationId).toBe(siteId);
    expect(actor(stay).qiProgress-actor(ward).qiProgress).toBe(8);
    expect(projectPavilionFire(ward,actor(ward))?.receipt?.description).toContain('实付八点灵气');
    expect(actor(evacuated).locationId).toBe(refuge);
    expect(row(stay)?.heat?.damage.some(hit=>hit.cultivatorId===owner)).toBe(true);
    expect(row(evacuated)?.heat?.damage.some(hit=>hit.cultivatorId===owner)).toBe(false);
    expect(actor(evacuated,target).locationId).toBe(siteId);
    expect(actor(evacuated,target).hp).toBe(actor(stay,target).hp);
    for(const all of [stay,ward,evacuated]){
      expect(row(all)).toMatchObject({scrollStatus:'lost',lostTick:all.tick});
      expect(sect(all).pavilion).not.toContainEqual(scroll);
      expect(actor(all).authoredTechnique).toEqual(scroll);
    }
  });
  it('accepts the one exact Cognitive salvage route and rejects manufactured injuries and path, without changing the Utility preference',async()=>{
    const {fire,scroll}=source();
    const exact=availablePavilionFireActions(actor(fire),fire).find(row=>row.pavilionFireMove==='salvage')!;
    const commandSpec=pavilionFireCommand(exact);
    const nonOwners=Object.fromEntries(fire.cultivators.filter(body=>body.id!==owner).map(row=>[row.id,command('REST')]));
    const ask=(value:object)=>{
      vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}))));
      llmScheduler.resetTickBudget();
      return requestCultivatorLLMDecision(actor(fire),fire,{enabled:true,apiBaseUrl:'https://provider.invalid/v1',
        apiKey:'fixture',model:'fixture'},fire.tick+1);
    };
    expect(await ask({...commandSpec,targetLocationId:'loc-market'})).toBeUndefined();
    expect(await ask({...commandSpec,damage:500})).toBeUndefined();
    const choice=await ask(commandSpec);
    expect(choice).toMatchObject(commandSpec);
    const cognitive=advanceWorldTick(fire,{...nonOwners,[owner]:choice!},()=>.9,'deferred',undefined,{modelActors:new Set([owner])});
    expect(row(cognitive)).toMatchObject({scrollStatus:'carried',copy:scroll,safeSiteId:refuge});
    expect(cognitive.events.find(event=>event.title==='经阁火势落定')?.description).toContain(`《${scroll.name}》已被带离火场，尚未安置`);
    const physical=month(fire,{[owner]:issue(fire,'salvage',refuge)});
    expect(row(cognitive)).toEqual(row(physical));
    const utility=advanceWorldTick(fire,nonOwners,()=>.9);
    expect(row(utility)).toMatchObject({scrollStatus:'lost',ward:{actorId:owner},heat:{wardSaved:expect.any(Number)}});
  });

});
