import {describe,expect,it,vi} from 'vitest';
import {playTournamentArena} from '../src/components/useTournamentArenaControls';
import {tournamentArenaMapMarks} from '../src/components/tournamentArenaMapMark';
import {actualTournament,actualTournamentSignup,tournamentFrame,tournamentId} from './tournamentArenaNativeFixture';

const opened=()=>tournamentFrame(tournamentFrame(actualTournamentSignup()));
const observer='npc-9';

describe('the visible arena advances only its matching native timeline',()=>{
  it('plays a single genuine round and then stops fast-forward exactly at championship',async()=>{
    let world=opened();
    const read=()=>({world,branch:'main',revision:2,viewerId:observer,blocked:false});
    const step=vi.fn(async()=>{world=tournamentFrame(world);});
    expect([...tournamentArenaMapMarks(world,id=>id==='loc-market')]).toEqual([['loc-market',0]]);
    expect(tournamentArenaMapMarks(world,()=>false).size).toBe(0);
    expect(await playTournamentArena(tournamentId,read(),read,step,false)).toBe(true);
    expect(actualTournament(world).round).toBe(1);
    expect(step).toHaveBeenCalledTimes(1);
    expect([...tournamentArenaMapMarks(world,()=>true)]).toEqual([['loc-market',1]]);
    expect(await playTournamentArena(tournamentId,read(),read,step,true)).toBe(true);
    expect(step).toHaveBeenCalledTimes(3);
    expect(world.tick).toBe(66);
    expect(actualTournament(world).status).toBe('completed');
    expect(tournamentArenaMapMarks(world,()=>true).size).toBe(0);
  });

  it('never follows a new branch, revision or hidden session after the first real turn',async()=>{
    let world=opened(),branch='main';
    const read=()=>({world,branch,revision:2,viewerId:observer,blocked:false});
    const source=read();
    const step=vi.fn(async()=>{world=tournamentFrame(world);branch='other';});
    expect(await playTournamentArena(tournamentId,source,read,step,true)).toBe(false);
    expect(step).toHaveBeenCalledTimes(1);
    expect(await playTournamentArena(tournamentId,{...read(),blocked:true},read,step,true)).toBe(false);
    expect(step).toHaveBeenCalledTimes(1);
  });
});
