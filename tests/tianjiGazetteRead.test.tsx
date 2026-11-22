import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {TianjiGazettePaper,TianjiGazetteRead} from '../src/components/TianjiGazetteRead';
import type {TianjiGazetteIssueView} from '../src/engine/tianjiGazetteEngine';

const issue:TianjiGazetteIssueView={id:'native-private-key',tick:61,year:6,month:1,trigger:'finale',entries:[
  {kind:'headline',title:'山门不曾易主',text:'联军已退，守阵者仍在阶前。',tick:60,year:5,month:12,siteName:'血月山门'},
  {kind:'bounty',title:'坊中悬榜',text:'榜上写有赏格，尚非定罪。',tick:61,year:6,month:1,siteName:'万仙坊市'},
]};

describe('Tianji Gazette reader',()=>{
  it('starts folded and omits all UI when there is no accessible issue',()=>{
    expect(renderToStaticMarkup(<TianjiGazetteRead scopeKey="unshared-branch" issues={[]}/>)).toBe('');
    const html=renderToStaticMarkup(<TianjiGazetteRead scopeKey="unshared-branch" issues={[issue]}/>);
    expect(html).toContain('<details');
    expect(html).toContain('天机风云报');
    expect(html).not.toContain('<article');
    expect(html).not.toContain('联军已退');
    expect(html).not.toContain('unshared-branch');
  });
  it('shows a dated past edition whose actual witnessed source date can differ from the issue date',()=>{
    const html=renderToStaticMarkup(<TianjiGazettePaper issue={issue} historical/>);
    expect(html).toContain('旧卷 · 此役终卷');
    expect(html).toContain('仙历 6 年 1 月刊');
    expect(html).toContain('5 年 12 月见闻');
    expect(html).toContain('联军已退，守阵者仍在阶前。');
    expect(html).toContain('榜上写有赏格，尚非定罪。');
    expect(html).not.toContain('崭露锋芒');
    expect(html).not.toContain('江湖恩怨');
    expect(html).not.toContain('native-private-key');
  });
  it('does not fill in a missing lead or a missing section on a quiet annual issue',()=>{
    const html=renderToStaticMarkup(<TianjiGazettePaper issue={{...issue,trigger:'year_turn',entries:[issue.entries[1]]}}/>);
    expect(html).toContain('岁首刊');
    expect(html).toContain('坊间悬赏');
    expect(html).not.toContain('头版头条');
    expect(html).not.toContain('联军');
  });
});
