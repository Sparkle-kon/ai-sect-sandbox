import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {HeavenlyAlchemyRead} from '../src/components/HeavenlyAlchemyRead';
import {HEAVENLY_HEATS,HEAVENLY_QUALITIES} from '../src/types/heavenlyAlchemy';
import type {HeavenlyAlchemyView} from '../src/engine/heavenlyAlchemyEngine';

const empty={actorId:'original-owner',siteId:'original-site',stock:[],attempts:[],options:[]} satisfies HeavenlyAlchemyView;
const options=HEAVENLY_HEATS.map(heavenlyAlchemyHeat=>({
  action:'HEAVENLY_ALCHEMY',heavenlyAlchemyMove:'brew',targetHeavenlyRecipeId:'nine_turn_golden',heavenlyAlchemyHeat,
} as const));

describe('heavenly alchemy read',()=>{
  it('shows only exact currently allowed native heat choices and cost, not guessed outcome',()=>{
    const guide=vi.fn(async()=>true);
    const state={...empty,options};
    expect(renderToStaticMarkup(<HeavenlyAlchemyRead view={state}/>)).toBe('');
    const html=renderToStaticMarkup(<HeavenlyAlchemyRead view={state} controls={{guide}}/>);
    expect(html).toContain('高阶火候');
    expect(html).toContain('三阶丹炉');
    expect(html).toContain('120 灵石');
    expect(html).toContain('翡翠灵叶 2 株');
    expect(html).toContain('温火守炉');
    expect(html).toContain('文武相济');
    expect(html).toContain('烈火冲纹');
    expect(html).not.toContain('渡劫神丹');
    expect(html).not.toContain('成丹之时，丹雷');
    expect(html).not.toContain('original-owner');
    expect(guide).not.toHaveBeenCalled();
  });
  it('shows actual stock, exact settled quality and seen lightning, but never supplies speculative dosing',()=>{
    const attempt={id:'internal-batch',tick:9,siteId:'original-site',recipeId:'nine_turn_golden',heat:'fierce',
      roll:930,mastery:100,toxicity:0,fireRoot:true,quality:'peerless'} as const;
    const state:HeavenlyAlchemyView={...empty,attempts:[attempt],stock:[{recipeId:'nine_turn_golden',quality:'peerless',count:1}]};
    const seen=renderToStaticMarkup(<HeavenlyAlchemyRead view={state}/>);
    expect(seen).toContain('绝世丹纹 · 1 枚');
    expect(seen).toContain('丹雷伴丹香而起');
    expect(seen).not.toContain('服用一枚');
    expect(seen).not.toContain('930');
    expect(seen).not.toContain('internal-batch');
    const dosing=renderToStaticMarkup(<HeavenlyAlchemyRead view={{...state,options:[{
      action:'HEAVENLY_ALCHEMY',heavenlyAlchemyMove:'take',targetHeavenlyRecipeId:'nine_turn_golden',heavenlyAlchemyQuality:'peerless',
    }]}} controls={{guide:vi.fn(async()=>true)}}/>);
    expect(dosing).toContain('服用一枚绝世丹纹九转金丹');
    const consumed=renderToStaticMarkup(<HeavenlyAlchemyRead view={{...empty,attempts:[{...attempt,
      recipeId:'tribulation_divine',use:{tick:10,wardSpentTick:11}}]}}/>);
    expect(consumed).toContain('此丹已服，所得护持已在渡劫时消耗');
  });
  it('keeps all four grades and a failed flame distinct in the actual receipt display',()=>{
    const attempts=HEAVENLY_QUALITIES.map((quality,index)=>({id:`brew-${index}`,tick:index+1,siteId:'original-site',
      recipeId:'tribulation_divine',heat:'calm',roll:450,mastery:12,toxicity:0,fireRoot:false,quality} as const));
    const failure={...attempts[0],tick:8,id:'burned',quality:undefined};
    const html=renderToStaticMarkup(<HeavenlyAlchemyRead view={{...empty,attempts:[...attempts,failure]}}/>);
    for(const qualityName of ['凡品','灵品','仙品','绝世丹纹'])expect(html).toContain(qualityName);
    expect(html).toContain('此炉未成丹');
    expect(html.match(/丹雷伴丹香/g)).toHaveLength(2);
  });

});
