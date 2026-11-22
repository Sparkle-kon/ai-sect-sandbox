import { afterEach,describe,expect,it,vi } from 'vitest';
import { activeAvatar,possessAvatar } from '../src/engine/avatarEngine';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { prepareShareSavePrivacy,buildConfirmedShareSave } from '../src/engine/shareSavePrivacy';
import { decodeEraWorldSave,encodeEraWorldSave,decodeWorldSave } from '../src/engine/storageEngine';
import { isPrivateTournamentBanquetEvent,projectTournamentBanquet } from '../src/engine/tournamentBanquet';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig,LLMDecisionPayload,WorldState } from '../src/types/world';
import { actualTournament,actualTournamentOpen,actualTournamentSignup,tournamentActor,tournamentFrame,tournamentId } from './tournamentArenaNativeFixture';

const venue='loc-market';
const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'fixture'};
const wait:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'静候原有时序。'};
const atHall=(world:WorldState)=>world.events.find(event=>event.id===`evt-banquet-${tournamentId}-hall-66`);
const privateLines=(world:WorldState)=>world.events.filter(isPrivateTournamentBanquetEvent);
const toMarket:LLMDecisionPayload={chosenAction:'EXPLORE',targetLocationId:venue,innerMonologue:'循实路回坊市。'};
const play=(world:WorldState,plans:Readonly<Record<string,LLMDecisionPayload>>,mode:'utility'|'deferred',
  opts?:Parameters<typeof advanceWorldTick>[5])=>advanceWorldTick(world,Object.fromEntries(
    world.cultivators.map(actor=>[actor.id,plans[actor.id]??wait])),undefined,mode,undefined,opts);
let savedBefore:WorldState|undefined;
function beforeFinal(){
  if(!savedBefore){
    let world=actualTournamentSignup(actualTournamentOpen(),[
      'npc-3','npc-4','elder-taixu-1','npc-6','founder-spirit-bloom-sect-danxia-1',
      'founder-spirit-bloom-sect-danxia-2','founder-spirit-bloom-sect-tianji-1','founder-spirit-bloom-sect-tianji-2',
    ]);
    while(world.tick<65)world=tournamentFrame(world);
    savedBefore=world;
  }
  return structuredClone(savedBefore);
}
function finalists(world:WorldState):[string,string]{
  const bout=actualTournament(world).arena?.rounds.at(-1)?.bouts[0];
  if(!bout?.secondId)throw Error('Expected two actual finalists');
  return [bout.firstId,bout.secondId];
}
function readAs(world:WorldState,id:string){
  const copy=structuredClone(world);
  expect(possessAvatar(copy,id)).toBe(true);
  return { copy, view:projectTournamentBanquet(copy,activeAvatar(copy)) };
}

afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});
describe('the same real final yields public hall, private own thought and real later co-present talk',()=>{
  it('plays the hall natively on either engine without changing the fighters’ actual return, with no spectator mind access',()=>{
    const pre=beforeFinal();
    expect(atHall(pre)).toBeUndefined();
    for(const mode of ['utility','deferred'] as const){
      const world=play(pre,{},mode),ids=finalists(world);
      const hall=atHall(world);
      expect(hall).toMatchObject({tick:66,locationId:venue,actorIds:ids,title:'论剑夜宴·前厅'});
      expect(privateLines(world)).toHaveLength(2);
      expect(privateLines(world).map(row=>row.actorIds)).toEqual(ids.map(id=>[id]));
      expect(privateLines(world).every(row=>row.witnessScope==='participants')).toBe(true);
      expect(ids.every(id=>tournamentActor(world,id).locationId!==venue)).toBe(true);
      expect(projectTournamentBanquet(world,tournamentActor(world,ids[0]))).toEqual({hall:expect.objectContaining({tick:66})});
      const {copy,view}=readAs(world,ids[0]);
      expect(view?.thought?.text).toBe(privateLines(world)[0].description);
      expect(view?.after).toBeUndefined();
      expect(readAs(world,ids[1]).view?.thought?.text).not.toBe(view?.thought?.text);
      const wire=encodeEraWorldSave(copy),reopened=decodeEraWorldSave(wire);
      expect(encodeEraWorldSave(reopened)).toBe(wire);
      expect(projectTournamentBanquet(reopened,activeAvatar(reopened))).toEqual(view);
      expect(JSON.stringify(world.cultivators.flatMap(actor=>actor.rumors))).not.toContain('席间一念');
      expect(JSON.stringify(world.chronicleArchive)).not.toContain(privateLines(world)[0].description);
      const invalid=structuredClone(copy);
      invalid.events.push({...privateLines(invalid)[0]});
      expect(projectTournamentBanquet(invalid,activeAvatar(invalid))?.thought).toBeUndefined();
    }
  });

  it('stamps a later genuine conversation for the pair on Utility and strict accepted Cognitive JSON, never a missed meeting',async()=>{
    const won=play(beforeFinal(),{},'utility'),ids=finalists(won);
    const returning=play(won,{[ids[0]]:toMarket,[ids[1]]:toMarket},'utility');
    expect(ids.map(id=>tournamentActor(returning,id).locationId)).toEqual([venue,venue]);
    const [speakerId,targetId]=ids;
    const ordinary:LLMDecisionPayload={chosenAction:'SOCIALIZE',targetCultivatorId:targetId,innerMonologue:'普通实地交谈。'};
    const transport=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(ordinary)}}]})));
    vi.stubGlobal('fetch',transport);
    const accepted=await requestCultivatorLLMDecision(tournamentActor(returning,speakerId),returning,config,returning.tick+1);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(accepted).toMatchObject({chosenAction:'SOCIALIZE',targetCultivatorId:targetId});
    const missed=play(returning,{},'utility');
    expect(readAs(missed,ids[0]).view?.after).toBeUndefined();
    const direct=play(returning,{[speakerId]:ordinary},'utility');
    const model=play(returning,{[speakerId]:accepted!},'deferred',{modelActors:new Set([speakerId])});
    for(const world of [direct,model]){
      const {copy,view}=readAs(world,ids[0]);
      const after=privateLines(world).find(row=>row.id.endsWith('-after-68'));
      expect(after).toMatchObject({tick:68,locationId:venue,actorIds:[speakerId,targetId]});
      expect(view?.after).toMatchObject({tick:68,text:after?.description,otherName:tournamentActor(world,ids[1]).name});
      expect(readAs(world,ids[1]).view?.after?.text).toBe(view?.after?.text);
      expect(projectTournamentBanquet(world)?.after).toBeUndefined();
      expect(JSON.stringify(world.chronicleArchive)).not.toContain(after?.description);
      expect(world.cultivators.some(actor=>actor.rumors.some(row=>row.originEventId===after?.id))).toBe(false);
      const share=buildConfirmedShareSave(copy,prepareShareSavePrivacy(copy));
      expect(share).toBeDefined();
      expect(share?.json).not.toContain(after?.description);
      const redacted=decodeWorldSave(share!.json);
      expect(projectTournamentBanquet(redacted,activeAvatar(redacted))).toEqual({hall:view?.hall});
    }
  });
});
