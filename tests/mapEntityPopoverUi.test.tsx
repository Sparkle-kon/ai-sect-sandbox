import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {MapEntityPopover,boundedMapWhisper,reviewMapEntityAction} from '../src/components/MapEntityPopover';
import type {MapEntityAction,MapEntityRead} from '../src/components/mapEntityPopoverModel';

const actor:MapEntityRead={kind:'actor',target:{kind:'actor',id:'secret-actor-id'},name:'司南',realm:'练气三层',
  hp:42,maxHp:78,actionLabel:'调息',monologue:'定要寻一处清静山门。'};
const site:MapEntityRead={kind:'site',target:{kind:'site',id:'secret-place-id'},name:'照水镇',spiritQi:61,
  residentCount:5,residents:['司南','青棠','闻师行'],population:0,eventTitles:['渡口奇遇']};
function read(data:MapEntityRead,actions:readonly MapEntityAction[],pinned:boolean,readOnly=false){
  const onCommit=vi.fn(()=>true),onClose=vi.fn(),onFocus=vi.fn();
  const html=renderToStaticMarkup(<MapEntityPopover data={data} actions={actions} pinned={pinned} readOnly={readOnly}
    anchor={{x:109,y:-18}} onCommit={onCommit} onClose={onClose} onFocus={onFocus}/>);
  expect(onCommit).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect(onFocus).not.toHaveBeenCalled();
  return html;
}

describe('scoped map entity popover reading and exact review',()=>{
  it('offers a bounded noninteractive hover peek with semantic actor gauge and no raw target',()=>{
    const html=read(actor,['lightning','whisper'],false);
    expect(html).toContain('司南');
    expect(html).toContain('练气三层');
    expect(html).toContain('气血 42 / 78');
    expect(html).toContain('<meter min="0" max="78" value="42"');
    expect(html).toContain('定要寻一处清静山门');
    expect(html).toContain('pointer-events-none');
    expect(html).toContain('--map-card-left:clamp(.5rem, 100%');
    expect(html).not.toContain('<button');
    expect(html).not.toContain(actor.target.id);
  });
  it('renders only actual local site facts, and only exact site actions on pinned live cards',()=>{
    const html=read(site,['treasure','whisper'],true);
    expect(html).toContain('照水镇');
    expect(html).toContain('61');
    expect(html).toContain('聚落 0 人');
    expect(html).toContain('在场修士 5 人');
    expect(html).toContain('司南、青棠、闻师行等');
    expect(html).toContain('渡口奇遇');
    expect(html).toContain('关闭地图检视卡');
    expect(html).toContain('聚焦此地');
    expect(html).toContain('min-h-11');
    expect(html).toContain('降下机缘');
    expect(html).not.toContain('神念传音');
    expect(html).not.toContain('确认执行');
    expect(html).not.toContain(site.target.id);
    const preview=read(site,['treasure'],true,true);
    expect(preview).toContain('聚焦此地');
    expect(preview).not.toContain('降下机缘');
  });
  it('displays no other-actor thought if it was not authorized by the native projection',()=>{
    const html=read({...actor,monologue:undefined},['whisper','lightning'],true);
    expect(html).toContain('神念传音');
    expect(html).toContain('降下雷劫');
    expect(html).toContain('聚焦追踪');
    expect(html).not.toContain('<blockquote');
    expect(html).not.toContain('确认传音');
  });
  it('allows only the reviewed exact source + feasible action and sanitizes bounded whisper text',()=>{
    const selected={data:actor,action:'whisper'} as const;
    expect(reviewMapEntityAction(selected,actor,['whisper'])).toBe('whisper');
    expect(reviewMapEntityAction(selected,{...actor},['whisper'])).toBeUndefined();
    expect(reviewMapEntityAction(selected,site,['whisper'])).toBeUndefined();
    expect(reviewMapEntityAction(selected,actor,['whisper','whisper'])).toBeUndefined();
    expect(reviewMapEntityAction(selected,actor,['lightning'])).toBeUndefined();
    expect(reviewMapEntityAction({data:site,action:'whisper'},site,['whisper'])).toBeUndefined();
    expect(boundedMapWhisper(' \t\u202e ')).toBe('');
    expect(boundedMapWhisper(' \t入山\n\u202e 问路 ')).toBe('入山 问路');
    expect(boundedMapWhisper('问'.repeat(219)+'🐉')).toBe('问'.repeat(219));
    expect(boundedMapWhisper('问'.repeat(400))).toHaveLength(220);
  });
});
