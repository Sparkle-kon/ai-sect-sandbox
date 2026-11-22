import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {ForbiddenArtCard,ForbiddenArtScarsRead} from '../src/components/ForbiddenArtCard';
import type {projectGuidedForbiddenDuel} from '../src/engine/forbiddenArtEngine';
import {createInitialWorld} from '../src/data/initialWorld';
import type {ForbiddenArtScar} from '../src/types/forbiddenArt';

type View=NonNullable<ReturnType<typeof projectGuidedForbiddenDuel>>;
const base:View={contact:{id:'raw-private-contact',attackerId:'raw-attacker',defenderId:'raw-owner',
  ownerId:'raw-owner',artifactId:'raw-artifact',siteId:'raw-site',openedTick:9,guided:true},
  ownerName:'闻笛',opponentName:'顾霁',artifactName:'照霜剑',options:[
    {choice:'blood-sea-veil',name:'万魂血海吞天',description:'可借一线反击机会，并不保证取胜。',cost:{hp:5,lifespan:2,durability:8}},
    {choice:'decline',name:'旁路',description:'不另消耗',cost:{hp:0,lifespan:0,durability:0}},
  ]};
const baseScar:ForbiddenArtScar={id:'raw-scar',contactId:base.contact.id,ownerId:base.contact.ownerId,opponentId:'raw-attacker',
  artifactId:base.contact.artifactId,siteId:base.contact.siteId,openedTick:9,tick:10,artId:'blood-sea-veil',
  paid:{hp:5,lifespan:2,durability:8},origin:'player',result:'survived'};
function read(view:View=base,busy=false){
  const onChoose=vi.fn(()=>true),onAdvance=vi.fn(()=>true);
  const html=renderToStaticMarkup(<ForbiddenArtCard view={view} busy={busy} onChoose={onChoose} onAdvance={onAdvance}/>);
  expect(onChoose).not.toHaveBeenCalled();expect(onAdvance).not.toHaveBeenCalled();
  expect(html).not.toContain('raw-');
  return html;
}

describe('one guided forbidden art contact',()=>{
  it('shows only actually quoted affordable options and separately offers the original duel at no art cost',()=>{
    const html=read();
    expect(html).toContain('闻笛对阵顾霁 · 照霜剑');
    expect(html).toContain('万魂血海吞天');
    expect(html).toContain('若实际施术，将付 5 点气血、2 载寿元、原器 8 点耐久');
    expect(html).toContain('不动禁术');
    expect(html).toContain('不付禁术代价，仍要照原势与对方真实交手');
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html.match(/min-h-12/g)).toHaveLength(2);
    expect(html).not.toContain('推进一月');
    expect(html).not.toContain('实付');
    expect(read(base,true).match(/<button[^>]*disabled=""/g)).toHaveLength(2);
  });
  it('shows exactly one deliberate next month after either queued choice, before any cost or result',()=>{
    const html=read({...base,contact:{...base.contact,queued:{choice:'decline',tick:9}}});
    expect(html).toContain('已记下：不动禁术');
    expect(html).toContain('此刻未扣代价，也未分胜负');
    expect(html).toContain('推进一月，继续交手');
    expect(html.match(/<button/g)).toHaveLength(1);
  });
  it('states only the actual result and spend, keeps surviving separate from winning, and never reopens action',()=>{
    const html=renderToStaticMarkup(<ForbiddenArtCard scar={baseScar} busy={false} onContinue={vi.fn()}/>);
    expect(html).toContain('保住性命，未能反败为胜');
    expect(html).toContain('实付 5 点气血、2 载寿元、原器 8 点耐久');
    expect(html).not.toContain('原计划');
    expect(html).not.toContain('推进一月');
    expect(html).not.toContain('raw-');
    expect(html.match(/<button/g)).toHaveLength(1);
  });
  it('only shows actual older scars of the canonical owner and exact original item, never future or cloned pages',()=>{
    const world=createInitialWorld(18), actor=world.cultivators[0];
    world.tick=10;
    actor.forbiddenScars=[{...baseScar,ownerId:actor.id}, {...baseScar,id:'future',tick:11,ownerId:actor.id,artId:'taixu-sword-seal'}];
    const read=(artifactId?:string)=>renderToStaticMarkup(<ForbiddenArtScarsRead world={world} actor={actor} artifactId={artifactId}/>);
    expect(read()).toContain('本人禁术旧痕');
    expect(read(baseScar.artifactId)).toContain('此原器的禁术旧痕');
    expect(read('other-original')).toBe('');
    expect(read()).not.toContain('太虚诛仙剑阵');
    expect(renderToStaticMarkup(<ForbiddenArtScarsRead world={world} actor={{...actor}}/>)).toBe('');
  });
});
