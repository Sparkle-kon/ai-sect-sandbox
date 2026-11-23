import {describe,expect,it,vi} from 'vitest';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {projectVisualDuelArena} from '../src/components/visualDuelArenaModel';
import {resolveGuidedDungeonTurn} from '../src/controllers/guidedDungeonTurn';
import {availableDungeonMoves,projectExpeditionDungeon} from '../src/engine/expeditionDungeonEngine';
import {projectGuidedForbiddenDuel,queueGuidedForbiddenArt} from '../src/engine/forbiddenArtEngine';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick,executeGodIntervention} from '../src/engine/worldEngine';
import type {Cultivator,LLMDecisionPayload,WorldState} from '../src/types/world';
import {actualCommonBond,actualDefenderWinsLethally,bondActor,firstId,secondId} from './dramaticBondNativeFixture';
import {dungeonActor,dungeonExplorer,dungeonMonth,dungeonMove,dungeonOccasion,dungeonOccasionIn,dungeonOutsider,
  enterNativeDungeon} from './expeditionDungeonNativeFixture';
import {actualForbiddenContact,artActor,artTurn} from './forbiddenArtNativeFixture';
import {dialogueProofBase} from './fixtures/publicDialogueFixture';
import {actualTournament,actualTournamentSignup,tournamentEntrants,tournamentFrame,tournamentId} from './tournamentArenaNativeFixture';

const idle:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'只依当下的亲见。'};
const quiet=(world:WorldState):Record<string,LLMDecisionPayload>=>Object.fromEntries(world.cultivators.map(row=>[row.id,idle]));
const body=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const publicDuel=(eventId:string)=>({kind:'duel' as const,eventId});
const tournament=(round:number,bout:number)=>({kind:'tournament' as const,occasionId:tournamentId,round,bout});
const dungeon={kind:'dungeon' as const,occasionId:dungeonOccasion};
const project=(world:WorldState,source:Parameters<typeof projectVisualDuelArena>[2],viewer?:Cultivator,historical=false)=>
  projectVisualDuelArena(world,createTerrainMapView(world,viewer,!!viewer),source,{viewer,historical});
function strict(world:WorldState){
  const bytes=encodeEraWorldSave(world),reopened=decodeEraWorldSave(bytes);
  expect(encodeEraWorldSave(reopened)).toBe(bytes);
  return reopened;
}
async function provider(world:WorldState,actor:Cultivator,answer:object){
  llmScheduler.resetTickBudget();
  const fetch=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(answer)}}]})));
  vi.stubGlobal('fetch',fetch);
  try{
    const actual=await requestCultivatorLLMDecision(actor,world,{enabled:true,apiBaseUrl:'https://provider.invalid/v1',
      apiKey:'fixture-only',model:'fixture'},world.tick+1);
    expect(fetch).toHaveBeenCalledTimes(1);
    return actual;
  }finally{vi.unstubAllGlobals();llmScheduler.resetTickBudget();}
}

describe('visual duel arenas reconstruct only authenticated native contact',()=>{
  it('shows the exact fatal victor and aggregate injuries of the actual two-person witness without bringing the fallen back',()=>{
    const {world,death}=actualDefenderWinsLethally(actualCommonBond().clash);
    const raw=encodeEraWorldSave(world);
    const fallen=bondActor(world,firstId),winner=bondActor(world,secondId);
    expect(fallen).toMatchObject({alive:false,hp:0});
    expect(winner.alive).toBe(true);
    expect(death).toMatchObject({category:'death',actorIds:[fallen.id,winner.id],duelWinnerId:winner.id,locationId:'loc-market'});
    const frame=project(world,publicDuel(death.id),winner)!;
    expect(frame).toMatchObject({kind:'duel',siteId:death.locationId,tick:death.tick,
      left:{name:fallen.name},right:{name:winner.name},outcome:'right'});
    const total=(id:string)=>(death.damage??[]).filter(row=>row.cultivatorId===id).reduce((n,row)=>n+row.amount,0);
    expect(frame.damages).toEqual(expect.arrayContaining([{target:'left',amount:total(fallen.id)}]));
    expect(frame.damages.length).toBeLessThanOrEqual(2);
    expect(JSON.stringify(frame)).not.toMatch(/innerMonologue|secretGoal|rolls/);
    expect(project(world,publicDuel('unknown-duel'),winner)).toBeUndefined();
    expect(project(world,publicDuel(death.id),body(world,'npc-1'))).toBeUndefined();
    const undisclosed={...world,events:world.events.map(row=>row===death?{...row,witnessScope:'participants' as const}:row)};
    const duplicate={...world,events:[...world.events,{...death}]};
    const counterfeitDamage={...world,events:world.events.map(row=>row===death?{...row,damage:[
      {cultivatorId:'npc-7',amount:99999},
    ]}:row)};
    const wrongSite={...world,events:world.events.map(row=>row===death?{...row,locationId:'loc-danxia'}:row)};
    expect(project(undisclosed,publicDuel(death.id))).toBeUndefined();
    expect(project(duplicate,publicDuel(death.id))).toBeUndefined();
    expect(project(counterfeitDamage,publicDuel(death.id))).toBeUndefined();
    expect(project(wrongSite,publicDuel(death.id))).toBeUndefined();
    const later=advanceWorldTick(world,quiet(world),()=>.99);
    const archived=project(later,publicDuel(death.id),undefined,true);
    expect(archived).toBeDefined();
    expect(archived?.historical).toBe(true);
    for(const fighter of [archived?.left,archived?.right]){
      expect(fighter?.hp).toBeUndefined();expect(fighter?.qi).toBeUndefined();
    }
    expect(encodeEraWorldSave(world)).toBe(raw);
  });

  it('returns the same current presentation for exact nonlethal Utility or validated model combat',async()=>{
    const {world:start,actorId,firstId:targetId}=dialogueProofBase();
    const choice:LLMDecisionPayload={chosenAction:'DUEL',targetCultivatorId:targetId,
      innerMonologue:'只有我知道的临阵打算。',spokenLine:'且在当前坊市验证这剑。'};
    const result=await provider(start,body(start,actorId),choice);
    expect(result).toMatchObject({chosenAction:'DUEL',targetCultivatorId:targetId});
    if(!result)throw new Error('Cognitive must validate the originally co-present target');
    const before=encodeEraWorldSave(start);
    const utility=advanceWorldTick(start,{...quiet(start),[actorId]:choice},()=>.5);
    const cognitive=advanceWorldTick(start,{...quiet(start),[actorId]:result},()=>.5,'deferred',undefined,{modelActors:new Set([actorId])});
    const eventId=`evt-${utility.tick}-${actorId}-duel`;
    const event=utility.events.find(row=>row.id===eventId)!;
    expect(event).toMatchObject({category:'combat',actorIds:[actorId,targetId],locationId:'loc-market'});
    const first=project(utility,publicDuel(eventId),body(utility,actorId))!;
    const second=project(cognitive,publicDuel(eventId),body(cognitive,actorId))!;
    expect(first).toEqual(second);
    expect(first.historical).toBe(false);
    expect(first.damages).toHaveLength(event.damage?.length??0);
    for(const [record,id] of [[first.left,actorId],[first.right,targetId]] as const){
      const actor=body(utility,id);
      expect(actor.alive).toBe(true);
      expect(record.hp).toEqual({value:actor.hp,max:actor.maxHp});
      expect(record.qi).toEqual(id===actorId?{value:actor.qiProgress,max:100}:undefined);
    }
    expect(JSON.stringify(first)).not.toContain(choice.innerMonologue);
    expect(encodeEraWorldSave(start)).toBe(before);
  });

  it('renders native actually played tournament bouts; never renders a bye, wrong round, or fraudulent association',()=>{
    const prepared=tournamentFrame(tournamentFrame(actualTournamentSignup()));
    expect(actualTournament(prepared)).toMatchObject({status:'running',round:0,locationId:'loc-market'});
    expect(project(prepared,tournament(1,0))).toBeUndefined();
    const played=tournamentFrame(prepared);
    const occasion=actualTournament(played),round=occasion.arena!.rounds[0],bout=round.bouts[0];
    expect(round.tick).toBe(64);
    expect(bout.secondId).toBeDefined();
    const publicArena=project(played,tournament(1,0))!;
    expect(publicArena).toMatchObject({kind:'tournament',siteId:occasion.locationId,tick:round.tick,
      left:{name:body(played,bout.firstId).name},right:{name:body(played,bout.secondId!).name},
      outcome:bout.winnerId===bout.firstId?'left':'right'});
    expect(publicArena.damages).toEqual(expect.arrayContaining([{target:'left',amount:bout.firstDamage},{target:'right',amount:bout.secondDamage}]));
    for(const fighter of [publicArena.left,publicArena.right]){
      expect(fighter.hp).toBeUndefined();expect(fighter.qi).toBeUndefined();
    }
    expect(project(played,tournament(9,0))).toBeUndefined();
    expect(project(played,tournament(1,19))).toBeUndefined();
    expect(project(played,{...tournament(1,0),occasionId:'occasion-7-tournament'})).toBeUndefined();
    const contradictory=structuredClone(played);
    const matching=actualTournament(contradictory).arena!.rounds[0];
    matching.bouts[0].winnerId=tournamentEntrants.find(id=>id!==bout.firstId&&id!==bout.secondId)!;
    expect(project(contradictory,tournament(1,0))).toBeUndefined();
    const rosterRetreat=tournamentEntrants[0];
    let weak=prepared;
    for(let i=0;i<2;i++)weak=executeGodIntervention(weak,{type:'TRIBULATION_STRIKE',targetCultivatorId:rosterRetreat});
    const site=weak.locations.find(row=>row.id===occasion.locationId)!;
    const incident=applyMapBrush(weak,'meteor',[site]);
    expect(body(incident,rosterRetreat).alive).toBe(false);
    expect(tournamentEntrants.filter(id=>body(incident,id).alive)).toHaveLength(7);
    const declined=tournamentFrame(incident);
    const actual=actualTournament(declined).arena!.rounds[0];
    const walkover=actual.bouts.findIndex(row=>!row.secondId);
    expect(actual.absentIds).toContain(rosterRetreat);
    expect(walkover).toBeGreaterThanOrEqual(0);
    expect(project(declined,tournament(1,walkover))).toBeUndefined();
    const later=tournamentFrame(played);
    const replay=project(strict(later),tournament(1,0))!;
    expect(replay.historical).toBe(true);
    for(const fighter of [replay.left,replay.right]){
      expect(fighter.hp).toBeUndefined();expect(fighter.qi).toBeUndefined();
    }
  });

  it('does not reveal an unentered boss; draws only the later paid Sanctum and real strike for the canonical onsite member',async()=>{
    const {world:garden}=enterNativeDungeon();
    const admitted=dungeonActor(garden);
    expect(projectExpeditionDungeon(garden,admitted,dungeonOccasion)?.room).toBe('garden');
    expect(project(garden,dungeon,admitted)).toBeUndefined();
    const hall=dungeonMove(garden,'gather','garden');
    expect(project(hall,dungeon,dungeonActor(hall))).toBeUndefined();
    const sanctum=strict(dungeonMove(hall,'break_array','hall'));
    const explorer=dungeonActor(sanctum);
    const book=dungeonOccasionIn(sanctum).dungeon!;
    expect(book).toMatchObject({room:'sanctum',bossHp:100});
    expect(book.steps.at(-1)).toMatchObject({move:'break_array',tick:sanctum.tick,qiPaid:18});
    expect(dungeonActor(hall).qiProgress-explorer.qiProgress).toBe(18);
    // The actual paid crossing admits the boss display without implying any attack or forecast.
    const ready=project(sanctum,dungeon,explorer)!;
    expect(ready).toMatchObject({kind:'dungeon',left:{name:explorer.name},
      right:{boss:true,hp:{value:book.bossHp,max:100}},damages:[]});
    expect(ready.outcome).toBeUndefined();
    const closing=book.steps.at(-1)!,spoofed={...sanctum,events:sanctum.events.map(row=>
      row.id===closing.eventId?{...row,witnessScope:undefined}:row)};
    expect(project(spoofed,dungeon,dungeonActor(spoofed))).toBeUndefined();
    expect(project(sanctum,dungeon,dungeonActor(sanctum,dungeonOutsider))).toBeUndefined();
    expect(project(sanctum,dungeon,{...explorer})).toBeUndefined();
    expect(project(sanctum,dungeon)).toBeUndefined();
    const allowed=availableDungeonMoves(sanctum,explorer,sanctum.tick+1).find(row=>row.dungeonMove==='strike')!;
    const request={world:sanctum,branchId:'main',revision:7,actorId:explorer.id,option:allowed};
    expect(resolveGuidedDungeonTurn(request,sanctum,'other',7)).toBeUndefined();
    expect(resolveGuidedDungeonTurn(request,sanctum,'main',8)).toBeUndefined();
    expect(resolveGuidedDungeonTurn({...request,actorId:dungeonOutsider},sanctum,'main',7)).toBeUndefined();
    const actual=resolveGuidedDungeonTurn(request,sanctum,'main',7)!;
    expect(actual.decision).toMatchObject({dungeonMove:'strike',targetDungeonRoomId:'sanctum',targetOccasionId:dungeonOccasion});
    const {action,...fields}=allowed;
    const model=await provider(sanctum,explorer,{chosenAction:action,...fields});
    expect(model).toMatchObject({chosenAction:action,...fields});
    if(!model)throw new Error('The actual scoped boss move must be legal for model resolution');
    const before=encodeEraWorldSave(sanctum);
    const utility=dungeonMonth(sanctum,{[explorer.id]:actual.decision});
    const online=advanceWorldTick(sanctum,{...quiet(sanctum),[explorer.id]:model},()=>.99,'utility',undefined,{modelActors:new Set([explorer.id])});
    const struck=dungeonOccasionIn(utility).dungeon!.steps.at(-1)!;
    expect(struck.move).toBe('strike');
    if(struck.move!=='strike')throw new Error('Native boss strike receipt required');
    expect(struck.actorId).toBe(dungeonExplorer);
    expect(struck.bossBefore).toBe(book.bossHp);
    expect(struck.bossBefore-struck.bossAfter).toBeGreaterThan(0);
    const fight=project(utility,dungeon,dungeonActor(utility))!;
    expect(project(online,dungeon,dungeonActor(online))).toEqual(fight);
    expect(fight).toMatchObject({kind:'dungeon',left:{name:explorer.name},
      right:{boss:true,hp:{value:struck.bossAfter,max:100}}});
    expect(fight.outcome).toBeUndefined();
    expect(project(utility,dungeon,dungeonActor(utility,dungeonOutsider))).toBeUndefined();
    const notPrivate={...utility,events:utility.events.map(row=>row.id===struck.eventId?{...row,witnessScope:undefined}:row)};
    expect(project(notPrivate,dungeon,dungeonActor(notPrivate))).toBeUndefined();
    expect(fight.damages).toEqual(expect.arrayContaining([{target:'right',amount:struck.bossBefore-struck.bossAfter}]));
    if(struck.hpLost>0)expect(fight.damages).toContainEqual({target:'left',amount:struck.hpLost});
    const departing=dungeonMove(utility,'retreat','sanctum');
    expect(project(departing,dungeon,dungeonActor(departing))).toBeUndefined();
    expect(encodeEraWorldSave(sanctum)).toBe(before);
  });

  it('keeps genuine forbidden choices in the real guarded native controller and never announces a held duel as settled',()=>{
    const {offered,contact}=actualForbiddenContact(true);
    const view=projectGuidedForbiddenDuel(offered)!;
    const exact=view.options.find(row=>row.choice==='decline')!;
    expect(view.contact.id).toBe(contact.id);
    expect(view.contact).not.toHaveProperty('rolls');
    expect(offered.events.some(row=>row.tick===offered.tick&&row.duelWinnerId&&row.actorIds.includes(contact.ownerId))).toBe(false);
    expect(queueGuidedForbiddenArt(offered,contact.attackerId,contact.id,exact.choice)).toBe(offered);
    expect(queueGuidedForbiddenArt(offered,contact.ownerId,'other-id',exact.choice)).toBe(offered);
    const queued=queueGuidedForbiddenArt(offered,contact.ownerId,contact.id,exact.choice);
    expect(queued.tick).toBe(offered.tick);
    expect(artActor(queued).hp).toBe(artActor(offered).hp);
    expect(queueGuidedForbiddenArt(queued,contact.ownerId,contact.id,exact.choice)).toBe(queued);
    const settled=artTurn(queued),actual=settled.events.find(row=>row.tick===settled.tick&&row.duelWinnerId&&
      row.actorIds.includes(contact.ownerId)&&row.actorIds.includes(contact.attackerId))!;
    expect(actual).toBeDefined();
    expect(projectGuidedForbiddenDuel(settled)).toBeUndefined();
    expect(artActor(settled).alive).toBe(false);
  });
});
