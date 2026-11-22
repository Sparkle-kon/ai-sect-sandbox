import {afterEach,describe,expect,it,vi} from 'vitest';
import {queryCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {availableOccasionJoins} from '../src/engine/occasionEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {projectTournamentArena} from '../src/engine/tournamentArenaEngine';
import type {LLMConfig,WorldState} from '../src/types/world';
import {actualTournament,actualTournamentOpen,actualTournamentSignup,jointournament,tournamentActor,tournamentEntrants,tournamentFrame,tournamentId}
  from './tournamentArenaNativeFixture';

const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'fixture'};
afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});
function strict(world:WorldState){
  const raw=encodeEraWorldSave(world),restored=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(restored)).toBe(raw);
  return restored;
}
const set=(ids:readonly string[])=>new Set(ids);

describe('the native eight-entrant tournament arena',()=>{
  it('starts from actual calendar time, enters distinct real people and accepts exact Cognitive signup in the same native bracket',async()=>{
    const opened=actualTournamentOpen(),candidate=tournamentActor(opened,'npc-2');
    const native=actualTournamentSignup(opened);
    const fetchFixture=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(jointournament)}}]})));
    vi.stubGlobal('fetch',fetchFixture);
    const source=vi.fn();
    const cognitive=await queryCultivatorLLMDecision(candidate,opened,config,source);
    expect(source).toHaveBeenCalledWith('llm');
    expect(cognitive).toMatchObject({chosenAction:'JOIN_OCCASION',targetOccasionId:tournamentId});
    const same=actualTournamentSignup(opened,tournamentEntrants,{[candidate.id]:cognitive});
    expect(actualTournament(same)).toEqual(actualTournament(native));
    expect(actualTournament(opened).participantIds).toEqual([]);
    const signed=actualTournament(same);
    expect(signed.bouts).toHaveLength(0);
    expect(availableOccasionJoins(candidate,same,same.tick+1)).not.toContainEqual({action:'JOIN_OCCASION',targetOccasionId:tournamentId});
    expect(same.events.find(row=>row.id===`evt-60-${tournamentId}-open`)?.actorIds).toEqual([]);
  });

  it('plays three actual native rounds, settles only the real champion, and preserves the finished bracket on strict resume',()=>{
    const signed=actualTournamentSignup(),eve=tournamentFrame(signed),start=tournamentFrame(strict(eve));
    expect(actualTournament(start)).toMatchObject({status:'running',round:0,bouts:[]});
    const opening=actualTournament(start).arena!;
    expect(set(opening.seededIds)).toEqual(set(tournamentEntrants));
    expect(opening.rounds).toEqual([]);
    expect(tournamentEntrants.every(id=>tournamentActor(start,id).locationId==='loc-market')).toBe(true);
    const first=tournamentFrame(start),second=tournamentFrame(strict(first)),win=tournamentFrame(strict(second));
    expect(encodeEraWorldSave(tournamentFrame(first))).toBe(encodeEraWorldSave(second));
    const ended=actualTournament(win),arena=ended.arena!;
    expect(ended).toMatchObject({status:'completed',round:3});
    expect(arena.rounds.map(row=>[row.round,row.tick,row.bouts.length])).toEqual([[1,64,4],[2,65,2],[3,66,1]]);
    let qualified=set(opening.seededIds);
    for(const round of arena.rounds){
      const matchActors=round.bouts.flatMap(bout=>bout.secondId?[bout.firstId,bout.secondId]:[bout.firstId]);
      expect(matchActors.length).toBe(qualified.size);
      expect(set(matchActors)).toEqual(qualified);
      for(const bout of round.bouts){
        expect(bout.secondId).toBeDefined();
        expect([bout.firstId,bout.secondId]).toContain(bout.winnerId);
        expect(bout.firstDamage).toBeGreaterThan(0);
        expect(bout.secondDamage).toBeGreaterThan(0);
      }
      qualified=set(round.bouts.map(row=>row.winnerId));
    }
    const champion=ended.championId!,prize=arena.prize!,actor=tournamentActor(win,champion);
    expect(qualified).toEqual(set([champion]));
    expect(prize).toMatchObject({tick:win.tick,actorId:champion,artifactId:`tournament-champion-${tournamentId}`,title:'百年论剑魁首'});
    expect(actor.title).toBe(prize.title);
    expect(actor.artifacts).toContainEqual(expect.objectContaining({id:prize.artifactId,tier:'通天灵宝'}));
    expect(actor.spiritStones-tournamentActor(second,champion).spiritStones).toBe(220);
    expect(win.cultivators.filter(row=>row.artifacts.some(item=>item.id===prize.artifactId)).map(row=>row.id)).toEqual([champion]);
    expect(win.events).toContainEqual(expect.objectContaining({id:`evt-${win.tick}-${tournamentId}-champion`,actorIds:[champion]}));
    const stable=projectTournamentArena(strict(win),tournamentId),later=tournamentFrame(win);
    expect(stable).toBeDefined();
    expect(actualTournament(later).arena).toEqual(arena);
    expect(projectTournamentArena(later,tournamentId)).toEqual(stable);
    expect(tournamentActor(later,champion).artifacts.filter(row=>row.id===prize.artifactId)).toHaveLength(1);
  });

  it('seeds sixteen separately registered real originals and resolves the exact larger bracket natively',()=>{
    const opened=actualTournamentOpen();
    const ids=opened.cultivators.filter(row=>row.alive&&/^(npc-|elder-)/u.test(row.id)).map(row=>row.id);
    expect(ids).toHaveLength(16);
    let world=actualTournamentSignup(opened,ids);
    while(world.tick<67)world=tournamentFrame(world);
    const final=actualTournament(strict(world));
    expect(final.status).toBe('completed');
    expect(set(final.arena?.seededIds??[])).toEqual(set(ids));
    expect(final.arena?.rounds.map(row=>row.bouts.length)).toEqual([8,4,2,1]);
    expect(final.arena?.prize?.actorId).toBe(final.championId);
  });
});
