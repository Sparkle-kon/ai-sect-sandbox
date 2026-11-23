import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {AnomalyRelayStoryCard} from '../src/components/AnomalyRelayStoryCard';
import type {AnomalyRelayView} from '../src/engine/anomalyRelay';

type Scene=AnomalyRelayView['scenes'][number];
const source:Scene={siteId:'private-source',siteName:'云涧',tick:3,year:1000,month:3,channel:'witness'};
const second:Scene={siteId:'private-conversation',siteName:'苇镇',tick:5,year:1000,month:5,channel:'conversation'};
const third:Scene={siteId:'private-flight',siteName:'雁关',tick:6,year:1000,month:6,channel:'flying_sword'};

describe('read only actual staggered anomaly receipts',()=>{
  it('stays empty without admissible scenes, and a single source does not name or forecast other sites',()=>{
    expect(renderToStaticMarkup(<AnomalyRelayStoryCard view={{scenes:[],complete:false}}/>)).toBe('');
    const html=renderToStaticMarkup(<AnomalyRelayStoryCard view={{scenes:[source],complete:false}}/>);
    expect(html).toContain('云涧 · 仙历 1000 年 3 月 · 亲见');
    expect(html).not.toMatch(/苇镇|雁关|飞剑|三地|private-|<button/);
  });
  it('lists only the present two chapters using their actual reception dates and no future channel',()=>{
    const html=renderToStaticMarkup(<AnomalyRelayStoryCard view={{scenes:[source,second],complete:false}}/>);
    expect(html).toContain('苇镇 · 仙历 1000 年 5 月 · 当面传闻');
    expect(html.indexOf('云涧')).toBeLessThan(html.indexOf('苇镇'));
    expect(html).not.toMatch(/雁关|三地|飞剑|private-/);
  });
  it('ties together the exact verified scenes only when the engine declares them complete',()=>{
    const html=renderToStaticMarkup(<AnomalyRelayStoryCard view={{scenes:[source,second,third],complete:true}}/>);
    expect(html).toContain('雁关 · 仙历 1000 年 6 月 · 飞剑传讯');
    expect(html).toContain('一场天变，三地闻钟');
    expect(html).toContain('三地闻讯先后不同');
    expect(html.indexOf('苇镇')).toBeLessThan(html.indexOf('雁关'));
    expect(html).not.toMatch(/private-|<button|<a /);
  });
});
