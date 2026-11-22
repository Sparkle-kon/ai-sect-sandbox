import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {CampaignAssemblyCard} from '../src/components/CampaignAssemblyCard';
import type {CampaignAssemblyOption,CampaignAssemblyView} from '../src/engine/campaignAssembly';

const join:CampaignAssemblyOption={kind:'join',siegeId:'native-private-marker',label:'赴阵',
  command:{chosenAction:'EXPLORE',targetLocationId:'exact-site-marker'}};
const remote:CampaignAssemblyView={siteName:'试剑山门',phase:'arrived',cohorts:[],options:[join]};
const local:CampaignAssemblyView={...remote,options:[],cohorts:[
  {sectName:'问霜宗',side:'attacker',count:3,commanderName:'余晚舟'},
  {sectName:'涧石门',side:'defender',count:2},
]};

describe('阵前所见',()=>{
  it('describes a known destination rather than names or apparent arrival when only offsite join is allowed',()=>{
    const html=renderToStaticMarkup(<CampaignAssemblyCard view={remote} onChoose={()=>{}}/>);
    expect(html).toContain('试剑山门');
    expect(html).toContain('赴阵前');
    expect(html).toContain('须真正抵达才算在阵前');
    expect(html).not.toMatch(/亲见到阵人马|带队|山门前的誓师|native-private-marker|exact-site-marker/);
    expect(html.match(/<button/g)).toHaveLength(1);
  });
  it('shows exact arrived counts and conceded commander only if provided, with no predicted win',()=>{
    const html=renderToStaticMarkup(<CampaignAssemblyCard view={local}/>);
    expect(html).toContain('问霜宗 · 3 人');
    expect(html).toContain('涧石门 · 2 人');
    expect(html).toContain('带队：余晚舟');
    expect(html.match(/带队：/g)).toHaveLength(1);
    expect(html).not.toMatch(/大胜|已守住|<button/);
  });
  it('debrief does not invent a winner; no eligible choices hides an empty offsite scene',()=>{
    const html=renderToStaticMarkup(<CampaignAssemblyCard view={{...local,phase:'withdrawn'}}/>);
    expect(html).toContain('阵前收兵');
    expect(html).toContain('不替各宗分高下');
    expect(renderToStaticMarkup(<CampaignAssemblyCard view={{...remote,options:[]}}/>)).toBe('');
  });
});

it('shows a verified local withdrawal without reconstructing a roster after it left',()=>{
  const html=renderToStaticMarkup(<CampaignAssemblyCard view={{siteName:'山门',phase:'withdrawn',cohorts:[],options:[]}}/>);
  expect(html).toContain('阵前收兵');
  expect(html).not.toContain('亲见到阵人马');
  expect(html).not.toContain('赴阵前');
});
