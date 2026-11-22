import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {MapSidebarDossier,reviewedMapSidebarAction} from '../src/components/MapSidebarDossier';
import type {MapSidebarDossierRead} from '../src/components/mapSidebarDossierModel';

const empty:MapSidebarDossierRead={destiny:[],actions:[]};
const actor={kind:'actor',target:{kind:'actor',id:'internal-actor'},name:'闻秋',realm:'金丹2层',hp:255,maxHp:120,
  actionLabel:'调息',persona:'话到唇边，先看今宵月色。'} as const;
const site={kind:'site',target:{kind:'site',id:'internal-site'},name:'青溪',spiritQi:26,spiritRoot:'木',
  residents:[],residentCount:1,eventTitles:['青溪来客'],details:[{label:'丹炉',text:'二阶 · 现场停炉'}]} as const;
const data:MapSidebarDossierRead={actor,leadName:'叶连翘',sectName:'青云宗',qi:150,destiny:['逆流'],
  artifact:{name:'照霜',quality:'灵器',bound:true},dao:{name:'剑道',rank:'初窥'},site,
  actions:[{target:actor.target,action:'whisper'},{target:actor.target,action:'lightning'},{target:site.target,action:'treasure'}]};

describe('map sidebar dossier',()=>{
  it('keeps genuine lead distinct and displays actual existing selected facts without exposing identities',()=>{
    const html=renderToStaticMarkup(<MapSidebarDossier data={data}/>);
    expect(html).toContain('本卷主角：叶连翘');
    expect(html).toContain('当前选中');
    expect(html).toContain('闻秋');
    expect(html).toContain('青云宗');
    expect(html).toContain('逆流');
    expect(html).toContain('value="120"');
    expect(html).toContain('value="100"');
    expect(html).toContain('人物演绎 · 并非亲知');
    expect(html).toContain('照霜');
    expect(html).toContain('本命法宝');
    expect(html).toContain('剑道');
    expect(html).toContain('青溪来客');
    expect(html).toContain('现场停炉');
    expect(html).not.toContain('internal-');
    expect(html).not.toContain('神念传音');
  });

  it('has no fake values or absent actions and labels authorized current thoughts truthfully',()=>{
    const none=renderToStaticMarkup(<MapSidebarDossier data={empty}/>);
    expect(none).toContain('尚无主角');
    expect(none).toContain('未选中可见修士');
    expect(none).not.toMatch(/<meter|<button|灵气 0/);
    const own=renderToStaticMarkup(<MapSidebarDossier data={{...data,actor:{...actor,monologue:'旧誓仍不能忘。'}}}
      onCommit={vi.fn(()=>true)} onFocus={vi.fn()}/>);
    expect(own).toContain('仅本人可见 · 心声');
    expect(own).toContain('旧誓仍不能忘');
    expect(own).not.toContain(actor.persona);
    expect(own).toContain('聚焦修士');
    expect(own).toContain('神念传音');
    expect(own).toContain('降下机缘');
    expect(own).toContain('降下雷劫');
    expect(own).not.toContain('确认执行');
  });

  it('requires immutable same context and a unique matching native typed actor or site action for the second confirmation',()=>{
    const command=data.actions[2];
    const review={data,choice:command};
    expect(reviewedMapSidebarAction(review,data)).toBe(command);
    expect(reviewedMapSidebarAction(review,{...data})).toBeUndefined();
    const duplicate={...data,actions:[command,command]};
    expect(reviewedMapSidebarAction({data:duplicate,choice:command},duplicate)).toBeUndefined();
    const wrong={...command,target:actor.target};
    const wrongKind={...data,actions:[wrong]};
    expect(reviewedMapSidebarAction({data:wrongKind,choice:wrong},wrongKind)).toBeUndefined();
    expect(reviewedMapSidebarAction(undefined,data)).toBeUndefined();
  });
});
