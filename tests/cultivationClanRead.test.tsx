import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {CultivationClanRead} from '../src/components/CultivationClanRead';
import type {CultivationClanView} from '../src/engine/cultivationClanEngine';

const base:CultivationClanView={actorId:'actual-owner',options:[],unions:[]};
const union:CultivationClanView['unions'][number]={
  id:'private-union',clanId:'private-clan',parents:['actual-owner','actual-counterpart'],names:['顾云','孟苔'],
  siteName:'松灯集',status:'accepted',own:true,children:[],
};
const named=(id:string)=>id==='actual-owner'?'顾云':'孟苔';

describe('cultivation clan read',()=>{
  it('keeps a plain empty profile unchanged and exposes only native exact role action',()=>{
    expect(renderToStaticMarkup(<CultivationClanRead view={base} tick={10} named={named}/>)).toBe('');
    const guide=vi.fn(async()=>true);
    const html=renderToStaticMarkup(<CultivationClanRead view={{...base,options:[{
      action:'CULTIVATION_CLAN',clanMove:'propose',targetCultivatorId:'actual-counterpart',
    }]}} tick={10} named={named} controls={{guide}}/>);
    expect(html).toContain('道侣与家传');
    expect(html).toContain('邀孟苔议结道侣');
    expect(html).toContain('不替对方答允');
    expect(html).not.toContain('已出生');
    expect(guide).not.toHaveBeenCalled();
  });
  it('distinguishes mutual choice from paid ceremony and planning from actual birth',()=>{
    const notYet=renderToStaticMarkup(<CultivationClanRead view={{...base,unions:[union]}} tick={10} named={named}/>);
    expect(notYet).toContain('两人已同意，尚未举行结契大典');
    expect(notYet).not.toContain('各耗');
    const bonded:CultivationClanView['unions'][number]={...union,status:'bonded',
      ceremony:{actorId:'actual-owner',tick:11,qiPaidEach:8},
      plan:{offeredBy:'actual-owner',offeredTick:12,acceptedBy:'actual-counterpart',acceptedTick:13,
        status:'expecting',earnedTicks:[14,15]}};
    const waiting=renderToStaticMarkup(<CultivationClanRead view={{...base,unions:[bonded]}} tick={15} named={named}/>);
    expect(waiting).toContain('各耗 8 真气');
    expect(waiting).toContain('家传进展 2/9 月');
    expect(waiting).toContain('没有出生实录');
  });
  it('keeps an authorized actual child private and does not present maturity or choices prematurely',()=>{
    const grownFamily:CultivationClanView['unions'][number]={...union,status:'bonded',
      ceremony:{actorId:'actual-owner',tick:10,qiPaidEach:8},children:[{
        id:'private-child',clanId:'private-clan',unionId:'private-union',parentIds:['actual-owner','actual-counterpart'],
        siteId:'private-site',birthTick:40,maturesAtTick:256,name:'小松',gender:'woman',
        parentRoots:['火','木'],roots:['火','木'],innateTrait:'clear_meridians',
      }]};
    const own=renderToStaticMarkup(<CultivationClanRead view={{...base,unions:[grownFamily]}} tick={40} named={named}/>);
    expect(own).toContain('小松');
    expect(own).toContain('尚未成年');
    expect(own).toContain('火、木');
    expect(own).toContain('灵脉清明');
    expect(own).not.toContain('<button');
    const guest=renderToStaticMarkup(<CultivationClanRead view={{...base,unions:[{...grownFamily,own:false}]}} tick={40} named={named}/>);
    expect(guest).toContain('双方已结为道侣');
    expect(guest).not.toContain('小松');
    expect(guest).not.toContain('灵脉清明');
  });
});
