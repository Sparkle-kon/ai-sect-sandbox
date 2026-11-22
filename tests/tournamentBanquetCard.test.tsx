import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TournamentBanquetCard } from '../src/components/TournamentBanquetCard';
import type { TournamentBanquetView } from '../src/engine/tournamentBanquet';

const hall:TournamentBanquetView['hall']={id:'opaque-hall-receipt',tick:15,siteName:'松灯坊市',
  speech:'席间诸位，今夜只叙同席旧情。'};
const render=(view:TournamentBanquetView)=>renderToStaticMarkup(
  <TournamentBanquetCard view={view} scopeKey="opaque-viewer" revision={{}}/>);

describe('separate public and private feast scenes',()=>{
  it('starts with actual public hall speech and gives public observers no private placeholders',()=>{
    const html=render({hall});
    expect(html).toContain('夜宴前厅 · 松灯坊市');
    expect(html).toContain(`>${hall.speech}</blockquote>`);
    expect(html).not.toMatch(/席间心绪|散席后|opaque-|<button/u);
  });

  it('keeps exact private thought and actual later talk independently closed, out of initial DOM',()=>{
    const html=render({hall,thought:{text:'仅本人心绪标记'},
      after:{tick:16,text:'仅双方对谈标记',otherName:'何关津'}});
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(2);
    expect(html.match(/min-h-11/g)).toHaveLength(2);
    expect(html).toContain('席间心绪');
    expect(html).toContain('散席后');
    expect(html).not.toMatch(/仅本人|仅双方|何关津|opaque-/u);
    const targets=[...html.matchAll(/aria-controls="([^"]+)"/g)].map(match=>match[1]);
    expect(new Set(targets).size).toBe(2);
    for (const id of targets) expect(html).toContain(`<div hidden="" id="${id}"`);
  });

  it('does not turn a same-month or absent reply into a later conversation, and treats speech as text',()=>{
    const html=render({hall:{...hall,speech:'<em>不执行的文本</em>'},after:{tick:hall.tick,text:'假私语',otherName:'何关津'}});
    expect(html).toContain('&lt;em&gt;不执行的文本&lt;/em&gt;');
    expect(html).not.toMatch(/<em>|散席后|席间心绪|假私语|何关津/u);
    const later=render({hall,after:{tick:hall.tick+1,text:'独立已落成后谈',otherName:'何关津'}});
    expect(later).toContain('散席后');
    expect(later).not.toContain('席间心绪');
  });
});
