import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EraHistoryPanel } from '../src/components/EraHistoryPanel';
import { EraProvenanceRows, EraProvenanceSection, type EraProvenanceReading } from '../src/components/EraProvenanceSection';

const none:EraProvenanceReading={originals:[],relays:[],discrepancies:[]};
const date={year:1099,month:2};
const reading:EraProvenanceReading={
  originals:[
    {...date,kind:'artifact',title:'星砂尺',evidence:'寄存在宗门藏器阁，实物可查。'},
    {...date,kind:'oath',title:'赈谷契',evidence:'当年两人实签，同卷仍在。'},
  ],
  firsthands:[{...date,title:'一名亲历修士',evidence:'这名修士当时守在井边，今仍在原址。'}],
  relays:[{...date,title:'渡口旧话',evidence:'听来的旧话，尚无原件。'}],
  discrepancies:[{...date,title:'同一场赈谷',statements:[
    {witness:'证人甲',claim:'实付全数粮谷。'},
    {witness:'证人乙',claim:'未曾交粮。'},
  ]}],
};

describe('scoped heritage reading in the existing era fold',()=>{
  it('introduces no screen or navigation and does not expose even authorized evidence before its fold opens',()=>{
    const read=vi.fn(()=>[]), readProvenance=vi.fn(()=>reading);
    const options=[{query:{kind:'actor' as const,id:'secret-actor'},label:'当前视角'}];
    const html=renderToStaticMarkup(<EraHistoryPanel scopeKey="a-branch:reader-a" options={options} read={read} readProvenance={readProvenance}/>);
    expect(html.match(/<details\b/g)).toHaveLength(1);
    expect(html).not.toMatch(/<details[^>]*\bopen(?:\s|=|>)|<button|赈谷契|渡口旧话|证人甲|a-branch|secret-actor/);
    expect(html).toContain('查阅年代旧事');
    expect(renderToStaticMarkup(<EraHistoryPanel scopeKey="a-branch:outsider" options={[]} read={read} readProvenance={readProvenance}/>)).toBe('');
    expect(read).not.toHaveBeenCalled();
    expect(readProvenance).not.toHaveBeenCalled();
  });

  it('offers only available paths after the fold is open, and no raw detail automatically',()=>{
    const html=renderToStaticMarkup(<EraProvenanceSection reading={reading}/>);
    expect(html).toContain('百代留痕');
    expect(html.match(/<button\b/g)).toHaveLength(3);
    expect(html).toContain('核看原件');
    expect(html).toContain('从转述查起');
    expect(html).toContain('核听证词');
    expect(html).not.toMatch(/星砂尺|渡口旧话|证人甲|<a /);
    const relayOnly=renderToStaticMarkup(<EraProvenanceSection reading={{...none,relays:reading.relays}}/>);
    expect(relayOnly).toContain('从转述查起');
    expect(relayOnly).not.toMatch(/核看原件|核听证词/);
    expect(renderToStaticMarkup(<EraProvenanceSection reading={none}/>)).toBe('');
  });

  it('separates original, relay, living firsthand and genuine incompatible claims without asserting truth',()=>{
    const original=renderToStaticMarkup(<EraProvenanceRows reading={reading} lane="originals"/>);
    expect(original).toContain('遗物原件 · 星砂尺');
    expect(original).toContain('签契原件 · 赈谷契');
    expect(original).not.toMatch(/渡口旧话|证人甲/);
    const relay=renderToStaticMarkup(<EraProvenanceRows reading={reading} lane="relays"/>);
    expect(relay).toContain('转述不是亲历，也不是原件');
    expect(relay).not.toMatch(/星砂尺|一名亲历修士|证人甲/);
    const testimony=renderToStaticMarkup(<EraProvenanceRows reading={reading} lane="testimony"/>);
    expect(testimony).toContain('亲历 · 一名亲历修士');
    expect(testimony).toContain('证词有异');
    expect(testimony).toContain('证词 1 · 证人甲');
    expect(testimony).toContain('证词 2 · 证人乙');
    expect(testimony).toContain('不替任何一方判真伪');
    expect(testimony.match(/仙历 1099 年 2 月/g)).toHaveLength(2);
    expect(testimony).not.toMatch(/星砂尺|渡口旧话|<button|<a /);
  });
});
