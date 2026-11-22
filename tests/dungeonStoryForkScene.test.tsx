import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {DungeonStoryForkScene,type DungeonStoryForkView} from '../src/components/DungeonStoryForkScene';
import type {DungeonOption} from '../src/engine/expeditionDungeonEngine';
import type {DungeonCounterfactualStep,DungeonCounterfactualView} from '../src/engine/dungeonCounterfactual';

const gather:DungeonOption={action:'EXPEDITION_DUNGEON',dungeonMove:'gather',targetOccasionId:'opaque-occasion',targetDungeonRoomId:'garden'};
const retreat:DungeonOption={...gather,dungeonMove:'retreat'};
const initial:DungeonStoryForkView={label:'真到药园',sourceTick:7,options:[gather,retreat]};
const actualClaim:DungeonCounterfactualStep={eventId:'opaque-claim',tick:10,move:'claim',roomBefore:'sanctum',roomAfter:'sanctum',
  title:'取下原传承',text:'原传承到手。',stones:80,artifactAwarded:true};
const actualExit:DungeonCounterfactualStep={eventId:'opaque-exit',tick:11,move:'retreat',roomBefore:'garden',roomAfter:'garden',
  title:'循原路出门',text:'沿来时石径离开。',exit:'retreated'};
const compare:DungeonCounterfactualView={actorId:'opaque-owner',occasionId:'opaque-occasion',sourceTick:7,routes:[
  {firstOption:gather,steps:[actualClaim],status:'bounded'},
  {firstOption:retreat,steps:[actualExit],status:'returned'},
]};

describe('two native paths in the same danger',()=>{
  it('shows only the two honest live choices and one separate preview action at touch size',()=>{
    const onChoose=vi.fn(),onCompare=vi.fn();
    const html=renderToStaticMarkup(<DungeonStoryForkScene scene={initial} onChoose={onChoose} onCompare={onCompare}/>);
    expect(html).toContain('此行真正选择');
    expect(html).toContain('先采下一枚玉叶');
    expect(html).toContain('循来路退出');
    expect(html).toContain('先看两条试走');
    expect(html.match(/<button\b/g)).toHaveLength(3);
    expect(html.match(/min-h-11/g)).toHaveLength(3);
    expect(html).not.toMatch(/试走比较|此行实录|opaque-/u);
    expect(onChoose).not.toHaveBeenCalled();
    expect(onCompare).not.toHaveBeenCalled();
    const held=renderToStaticMarkup(<DungeonStoryForkScene scene={initial} busy onChoose={onChoose} onCompare={onCompare}/>);
    expect(held.match(/<button[^>]+disabled=""/g)).toHaveLength(3);
  });

  it('separates claim inside from actual withdrawal and never writes a preview into the live summary',()=>{
    const html=renderToStaticMarkup(<DungeonStoryForkScene scene={{...initial,actual:actualClaim}} comparison={compare}
      onChoose={vi.fn()} onCompare={vi.fn()}/>);
    expect(html).toContain('试走比较 · 不改原线');
    expect(html).toContain('试走不会替你选');
    const live=html.split('试走比较 · 不改原线')[0];
    expect(live).toContain('此行实录');
    expect(live).toContain('已经拿到传承，但此时人还在秘境里');
    expect(live).not.toContain('已经循来路退出');
    expect(html).toContain('已经循来路退出');
    expect(html).toContain('未见脱身实录');
    expect(html).not.toMatch(/<button\b|opaque-/u);
  });

  it('drops comparison at a changed source tick and never invents extra choices',()=>{
    const html=renderToStaticMarkup(<DungeonStoryForkScene scene={{...initial,sourceTick:8,options:[gather,gather]}}
      comparison={compare} onChoose={vi.fn()}/>);
    expect(html).not.toMatch(/试走比较|<button\b|此行实录/u);
  });
});
