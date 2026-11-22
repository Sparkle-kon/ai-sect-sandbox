import {WorldOccasionsPanel} from '../src/components/WorldOccasionsPanel';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeAll,describe,expect,it,vi} from 'vitest';
import {TournamentArenaRead} from '../src/components/TournamentArenaRead';
import {projectTournamentArena} from '../src/engine/tournamentArenaEngine';
import type {WorldState} from '../src/types/world';
import {actualTournamentSignup,tournamentFrame,tournamentId} from './tournamentArenaNativeFixture';

let signup:WorldState;
let seeded:WorldState;
let champion:WorldState;
beforeAll(()=>{
  signup=actualTournamentSignup();
  seeded=signup;
  while(seeded.tick<63)seeded=tournamentFrame(seeded);
  champion=seeded;
  while(champion.tick<66)champion=tournamentFrame(champion);
});
const read=(world:WorldState,controls?:Parameters<typeof TournamentArenaRead>[0]['controls'])=>{
  const arena=projectTournamentArena(world,tournamentId);
  expect(arena).toBeDefined();
  if(!arena)throw new Error('Duel arena not seeded.');
  return renderToStaticMarkup(<TournamentArenaRead arena={arena} named={id=>world.cultivators.find(row=>row.id===id)?.name??'未详'}
    siteName="万仙坊市" controls={controls}/>);
};
describe('tournament arena',()=>{
  it('keeps historical registration informational and does not invent a bracket',()=>{
    const html=renderToStaticMarkup(<WorldOccasionsPanel world={signup} cultivator={signup.cultivators[0]}/>);
    expect(html).toContain('报名');
    expect(html).not.toContain('待开打');
    expect(html).not.toContain('看下一轮');
    expect(html).not.toContain('快进');
    expect(html).not.toContain('胜出');
  });
  it('shows native pairs as pending, with live step and finish opt-ins',()=>{
    const nextRound=vi.fn(()=>true), finishTournament=vi.fn(()=>true);
    const html=read(seeded,{nextRound,finishTournament});
    expect(html).toContain('八进四 · 待开打');
    expect(html).toContain('看下一轮');
    expect(html).toContain('快进至此场落幕');
    expect(html).not.toContain('魁首：');
    expect(nextRound).not.toHaveBeenCalled();
    expect(finishTournament).not.toHaveBeenCalled();
  });
  it('shows three actual rounds and exact native title/reward only when earned',()=>{
    const html=read(champion);
    expect(html).toContain('八进四');
    expect(html).toContain('半决赛');
    expect(html).toContain('决赛');
    expect(html).toContain('百年论剑魁首');
    expect(html).toContain('万宗照夜印');
    expect(html).not.toContain('待开打');
  });
  it('displays fictional stake only when exact native quote was passed',()=>{
    expect(read(seeded)).not.toContain('旁观押注');
    const html=read(seeded,{getWager:arenaId=>({arenaId,spectatorId:'actual-own-body',contenderIds:['npc-1'],stakes:[5]}),
      placeWager:vi.fn(()=>true)});
    expect(html).toContain('灵石不能兑换现金');
    expect(html).toContain('核对旁观押注');
    expect(html).not.toContain('actual-own-body');
  });
});
