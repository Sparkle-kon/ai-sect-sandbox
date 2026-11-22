import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {activateSchoolFormChoice,SchoolFormDuelCard,type SchoolFormDuelCardView} from '../src/components/SchoolFormDuelCard';

const view:SchoolFormDuelCardView={contactId:'opaque-contact',actorName:'闻笛',opponentName:'薛照雪',siteName:'太虚剑峰',options:['counter','stop']};
describe('scoped old sword-form dramaturgy',()=>{
  it('uses exact live legal choices without forecasting victory or exposing internal proof',()=>{
    const choose=vi.fn(()=>true);
    const html=renderToStaticMarkup(<SchoolFormDuelCard view={view} onChoose={choose}/>);
    expect(html.match(/min-h-\[44px\]/g)).toHaveLength(2);
    expect(html).toContain('以旧式还招');
    expect(html).toContain('只收自己的剑');
    expect(html).toContain('不替对手决定');
    expect(html).not.toMatch(/opaque-|已命中|还招实录/u);
    expect(choose).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(<SchoolFormDuelCard view={{...view,options:[]}}/>)).toBe('');
  });
  it('shows only the supplied actual receipt after settlement',()=>{
    const receipt={title:'旧式落定',description:'这一剑确已落下。'};
    const html=renderToStaticMarkup(<SchoolFormDuelCard view={view} receipt={receipt} onChoose={vi.fn(()=>true)}/>);
    expect(html).toContain('还招实录');
    expect(html).toContain(receipt.description);
    expect(html).not.toMatch(/<button|opaque-/u);
  });
});

describe('native scene activation and readonly parity',()=>{
  it('rejects stale leases, repeated taps, busy submits, and second native clicks after acceptance',()=>{
    const lease={scope:'A',contact:'same',accepted:false};
    const next={scope:'B',contact:'same',accepted:false};
    const action=vi.fn(()=>true);
    activateSchoolFormChoice(lease,next,false,1,action);
    activateSchoolFormChoice(lease,lease,true,1,action);
    activateSchoolFormChoice(lease,lease,false,2,action);
    expect(action).not.toHaveBeenCalled();
    activateSchoolFormChoice(lease,lease,false,0,action); // keyboard click
    activateSchoolFormChoice(lease,lease,false,1,action); // later pointer click or regained focus
    activateSchoolFormChoice(lease,lease,false,0,action);
    expect(action).toHaveBeenCalledTimes(1);
  });
  it('allows retry only when the exact lease did not acquire a real request',()=>{
    const lease={scope:'A',contact:'x',accepted:false};
    const denied=vi.fn(()=>false),accepted=vi.fn(()=>true);
    activateSchoolFormChoice(lease,lease,false,1,denied);
    activateSchoolFormChoice(lease,lease,false,1,accepted);
    expect(denied).toHaveBeenCalledOnce();
    expect(accepted).toHaveBeenCalledOnce();
    expect(lease.accepted).toBe(true);
  });
  it('keeps the same history scene and choice text without interactive buttons, even if callbacks exist',()=>{
    const html=renderToStaticMarkup(<SchoolFormDuelCard view={view} historical onChoose={()=>true} onContinue={()=>{}}/>);
    expect(html).toContain('data-school-form-scene');
    expect(html).toContain('历史回看 · 只读');
    expect(html).toContain('以旧式还招');
    expect(html).toContain('只收自己的剑');
    expect(html).not.toMatch(/<button|tabindex/iu);
  });
});
