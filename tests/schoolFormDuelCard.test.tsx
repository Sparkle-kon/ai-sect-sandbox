import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {SchoolFormDuelCard,type SchoolFormDuelCardView} from '../src/components/SchoolFormDuelCard';

const view:SchoolFormDuelCardView={contactId:'opaque-contact',actorName:'闻笛',opponentName:'薛照雪',siteName:'太虚剑峰',options:['counter','stop']};
describe('scoped old sword-form dramaturgy',()=>{
  it('uses exact live legal choices without forecasting victory or exposing internal proof',()=>{
    const choose=vi.fn();
    const html=renderToStaticMarkup(<SchoolFormDuelCard view={view} onChoose={choose}/>);
    expect(html.match(/min-h-11/g)).toHaveLength(2);
    expect(html).toContain('以旧式还招');
    expect(html).toContain('只收自己的剑');
    expect(html).toContain('不替对手决定');
    expect(html).not.toMatch(/opaque-|已命中|还招实录/u);
    expect(choose).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(<SchoolFormDuelCard view={{...view,options:[]}}/>)).toBe('');
  });
  it('shows only the supplied actual receipt after settlement',()=>{
    const receipt={title:'旧式落定',description:'这一剑确已落下。'};
    const html=renderToStaticMarkup(<SchoolFormDuelCard view={view} receipt={receipt} onChoose={vi.fn()}/>);
    expect(html).toContain('还招实录');
    expect(html).toContain(receipt.description);
    expect(html).not.toMatch(/<button|opaque-/u);
  });
});
