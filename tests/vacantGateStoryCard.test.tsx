import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {VacantGateStoryCard} from '../src/components/VacantGateStoryCard';
import type {VacantGateOption,VacantGateView} from '../src/engine/vacantGate';

const base={action:'VACANT_GATE',targetVacantGateSiegeId:'private-siege'} as const;
const guard:VacantGateOption={...base,vacantGateMove:'guard'};
const withdraw:VacantGateOption={...base,vacantGateMove:'withdraw',targetLocationId:'private-refuge'};
const view:VacantGateView={siteName:'试剑山门',lostRole:'leader',options:[guard,withdraw]};

describe('vacant gate local scene',()=>{
  it('offers only authentic options and does not predict payment, authority or company',()=>{
    const onChoose=vi.fn();
    const html=renderToStaticMarkup(<VacantGateStoryCard view={view} onChoose={onChoose}/>);
    expect(html).toContain('掌门已不在了');
    expect(html).toContain('才耗八点真气');
    expect(html).toContain('旁人未必应下');
    expect(html.match(/min-h-\[44px\]/g)).toHaveLength(2);
    expect(html).not.toMatch(/private-|已撤走|已守住|新任掌门/);
    expect(onChoose).not.toHaveBeenCalled();
  });
  it('shows the correct lost role and locks the exact available move while busy',()=>{
    const html=renderToStaticMarkup(<VacantGateStoryCard view={{...view,lostRole:'ward_keeper',options:[guard]}} busy onChoose={()=>{}}/>);
    expect(html).toContain('原守阵人已不在了');
    expect(html).toContain('disabled=""');
    expect(html).not.toMatch(/掌门已不在|请撤，自己先走/);
  });
  it('keeps actual personal receipt distinct and does not create an empty or interactive historical scene',()=>{
    expect(renderToStaticMarkup(<VacantGateStoryCard view={{...view,options:[]}}/>)).toBe('');
    const html=renderToStaticMarkup(<VacantGateStoryCard view={{...view,options:[],
      receipt:{title:'独自撤出',description:'此人确实走过了这一步。'}}}/>);
    expect(html).toContain('此人确实走过了这一步');
    expect(html).not.toMatch(/<button|才耗八点真气|掌门已不在/);
  });
});

it('keeps an actual received plea visible with no move, award, or implied assent',()=>{
  const notice='同在山门的闻笛请你退往近处，去留由自己定。';
  const html=renderToStaticMarkup(<VacantGateStoryCard view={{...view,notice,options:[]}} onChoose={()=>{}}/>);
  expect(html).toContain('山门撤离请求');
  expect(html).toContain(notice);
  expect(html).not.toMatch(/<button|掌门已不在|已经答应|山门实录/);
});
