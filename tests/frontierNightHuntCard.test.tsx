import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {FrontierNightHuntCard} from '../src/components/FrontierNightHuntCard';
import type {FrontierNightHuntView} from '../src/types/frontierNightHunt';

const view:FrontierNightHuntView={
  siteId:'frontier-north-lee-mid',weather:{kind:'霜息',intensity:.62},
  options:[{action:'FRONTIER_NIGHT_HUNT',frontierNightHuntMove:'trace',targetFrontierSiteId:'frontier-north-lee-mid'}],
};

describe('夜行 card',()=>{
  it('shows native current weather, only available options, and nothing about an unseen animal',()=>{
    const html=renderToStaticMarkup(<FrontierNightHuntCard view={view} siteName="雪谷" onChoose={()=>{}}/>);
    expect(html).toContain('雪谷 · 霜息');
    expect(html).toContain('查迹');
    expect(html).not.toMatch(/妖兽|足迹|守候|安返|frontier-north-lee-mid/);
    expect(html.match(/<button/g)).toHaveLength(1);
  });
  it('can identify a proved, retained trail without stating it saw a creature or showing a target ID',()=>{
    const html=renderToStaticMarkup(<FrontierNightHuntCard view={{...view,observed:{kind:'妖兽',siteId:'frontier-north-lee-mid',alive:true}}}/>);
    expect(html).toContain('确曾辨得妖兽足迹');
    expect(html).toContain('不等于见了真身');
    expect(html).not.toMatch(/<button|frontier-north-lee-mid/);
  });
  it('keeps an independently verified arrival notice without resurrecting the hunt',()=>{
    const html=renderToStaticMarkup(<FrontierNightHuntCard view={{...view,options:[]}} notice="已经回到避风道。" onChoose={()=>{}}/>);
    expect(html).toContain('已经回到避风道。');
    expect(html).not.toMatch(/足迹|该如何走|<button/);
  });
  it('renders the exact retained contact and its paid injuries, never predicts a victory',()=>{
    const html=renderToStaticMarkup(<FrontierNightHuntCard view={{...view, observed:{kind:'妖兽',siteId:'frontier-north-lee-mid',alive:true},
      last:{tick:2,move:'wait',outcome:'contact',paidQi:2,damage:7,beastDamage:4}}}/>);
    expect(html).toContain('守候：这一回确实撞上了。');
    expect(html).toContain('自身受伤 7 点。');
    expect(html).toContain('实伤妖兽 4 点。');
    expect(html).not.toContain('猎获');
  });
  it('omits empty eligibility and locks all offered choices while the actual turn runs',()=>{
    expect(renderToStaticMarkup(<FrontierNightHuntCard view={{...view,options:[]}}/>)).toBe('');
    const html=renderToStaticMarkup(<FrontierNightHuntCard view={view} busy onChoose={()=>{}}/>);
    expect(html).toContain('disabled=""');
    expect(html).toContain('这一程尚未落定');
  });
});
