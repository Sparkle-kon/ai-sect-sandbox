import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {DungeonExpeditionRead} from '../src/components/DungeonExpeditionRead';
import type {ExpeditionDungeonView} from '../src/engine/expeditionDungeonEngine';

const hall:ExpeditionDungeonView={openedTick:14,occasionId:'private-expedition',siteId:'private-gate',room:'hall',bossHp:77,bossMaxHp:96,
  leaderId:'first-actor',members:[{actorId:'first-actor',enteredTick:14},{actorId:'second-actor',enteredTick:15}],
  steps:[{move:'enter',actorId:'first-actor',tick:14,eventId:'private-entrance'},
    {move:'break_array',actorId:'first-actor',tick:16,eventId:'private-array',qiPaid:18}],
  expiresTick:22,options:[
    {action:'EXPEDITION_DUNGEON',dungeonMove:'strike',targetOccasionId:'private-expedition',targetDungeonRoomId:'hall'},
    {action:'EXPEDITION_DUNGEON',dungeonMove:'retreat',targetOccasionId:'private-expedition',targetDungeonRoomId:'hall'},
  ]};
const named=(id:string)=>id==='first-actor'?'云萝':'楚弦';

describe('dungeon expedition read',()=>{
  it('shows the exact occupied layer, real boss health, actual cost and distinct eligible commands',()=>{
    const guide=vi.fn(async()=>true);
    const html=renderToStaticMarkup(<DungeonExpeditionRead view={hall} viewerId="first-actor" tick={18} named={named} controls={{guide}}/>);
    expect(html).toContain('外围药园');
    expect(html).toContain('核心古殿');
    expect(html).toContain('传承禁地');
    expect(html).toContain('aria-current="location"');
    expect(html).toContain('77 / 96 气血');
    expect(html).toContain('4 月');
    expect(html).toContain('实耗 18 真气');
    expect(html).toContain('与护宝妖王交手');
    expect(html).toContain('及时退出秘境');
    expect(html).not.toContain('取传承之宝');
    expect(html).not.toContain('private-expedition');
    expect(guide).not.toHaveBeenCalled();
  });
  it('gives historical reads no buttons and never portrays a departed member as standing deeper',()=>{
    const old:ExpeditionDungeonView={...hall,room:'sanctum',outcome:'collapsed',members:[
      {...hall.members[0],leftTick:16,exit:'retreated'},{...hall.members[1],leftTick:22,exit:'collapse',hpLost:11},
    ]};
    const html=renderToStaticMarkup(<DungeonExpeditionRead view={old} viewerId="first-actor" tick={22} named={named}/>);
    expect(html).toContain('崩塌');
    expect(html).toContain('自行退出');
    expect(html).toContain('实损 11 气血');
    expect(html).not.toContain('aria-current="location"');
    expect(html).not.toContain('护宝妖王气血');
    expect(html).not.toContain('与护宝妖王交手');
  });
});
