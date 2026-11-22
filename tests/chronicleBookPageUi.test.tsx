import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ChronicleBookPage } from '../src/components/ChronicleBookPage';
import type { ChronicleBookSource } from '../src/components/chronicleBookSources';
import type { ChronicleReading } from '../src/engine/novelGenerator';

const reading: ChronicleReading = {
  title: '山中数页', sections:[],
  continuity: {
    opening: {text:'书接上回，旧舟抵岸。',eventId:'prior-proof-id',chapterId:'prior-raw-chapter-id'},
    closing: {text:'新约既立，尚待践诺。',eventId:'end-proof-id'},
  },
  beats: [
    {kind:'opening',paragraphs:['山客歇脚。炉中凝丹。','渡口人渐散。'],
      eventIds:['a-proof-id','b-proof-id','c-proof-id'],paragraphEventIds:[['a-proof-id','b-proof-id'],['c-proof-id']]},
    {kind:'focal',title:'长河结盟',paragraphs:['有人在长河边立约。'],eventIds:['end-proof-id'],paragraphEventIds:[['end-proof-id']]},
    {kind:'closing',paragraphs:['夜色已深。'],eventIds:['out-of-scope-id'],paragraphEventIds:[['out-of-scope-id']]},
  ],
};

describe('inline chronicle book notes', () => {
  it('asks for only exact paragraph sources and prior chapter separately, rendering quiet controls without the proof content', () => {
    const resolveSources = vi.fn((ids: readonly string[], priorChapterId?: string): readonly ChronicleBookSource[] =>
      ids.filter(id => id !== 'out-of-scope-id' && (id !== 'prior-proof-id' || priorChapterId === 'prior-raw-chapter-id'))
        .map(id => ({tick:20,year:1002,month:8,title:`原题${id}`,detail:`原录${id}`})));
    const html = renderToStaticMarkup(<ChronicleBookPage reading={reading} resolveSources={resolveSources}/>);
    expect(resolveSources.mock.calls).toEqual([
      [['prior-proof-id'],'prior-raw-chapter-id'],
      [['a-proof-id','b-proof-id']],
      [['c-proof-id']],
      [['end-proof-id']],
      [['out-of-scope-id']],
      [['end-proof-id']],
    ]);
    expect(html).toContain('data-chronicle-prose="true"');
    expect(html).toContain('data-chronicle-continuity="opening"');
    expect(html).toContain('data-chronicle-continuity="closing"');
    expect(html.match(/<h4/g)).toHaveLength(1);
    expect(html).toContain('山中数页</h4>');
    expect(html.match(/data-chronicle-paragraph-text/g)).toHaveLength(6);
    expect(html.match(/<h5/g)).toHaveLength(1);
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(5);
    expect(html).toContain('第 5 条史料注');
    const controlled = [...html.matchAll(/aria-controls="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(controlled).size).toBe(5);
    for (const id of controlled) expect(html).toContain(`<aside id="${id}" hidden=""`);
    expect(html).not.toMatch(/proof-id|prior-raw-chapter-id|out-of-scope-id|原题|原录|仙历/u);
    expect(html.indexOf('山客歇脚。炉中凝丹。')).toBeLessThan(html.indexOf('渡口人渐散。'));
    expect(html).toContain('min-h-11 min-w-11');
  });

  it('keeps a proven-but-unsourced paragraph readable and never exposes an orphan button', () => {
    const html = renderToStaticMarkup(<ChronicleBookPage reading={reading} resolveSources={() => []}/>);
    expect(html).toContain('夜色已深。');
    expect(html).toContain('书接上回，旧舟抵岸。');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<aside');
  });

  it('does not fallback to a whole evidence shelf if the book has no readable beats', () => {
    const resolveSources = vi.fn(() => []);
    const html = renderToStaticMarkup(<ChronicleBookPage reading={{...reading,beats:[]}} resolveSources={resolveSources}/>);
    expect(html).toContain('本章没有可写成场景的公开史料');
    expect(resolveSources).not.toHaveBeenCalled();
  });
});
