import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {PilgrimageForkStoryCard} from '../src/components/PilgrimageForkStoryCard';
import type {PilgrimageForkOption,PilgrimageForkView} from '../src/engine/pilgrimageFork';

const base={action:'PILGRIMAGE_FORK',targetPilgrimageForkId:'private-junction'} as const;
const escort:PilgrimageForkOption={...base,pilgrimageForkMove:'escort',targetLocationId:'private-next'};
const detour:PilgrimageForkOption={...base,pilgrimageForkMove:'detour',targetLocationId:'private-bend'};
const remain:PilgrimageForkOption={...base,pilgrimageForkMove:'remain'};
const view:PilgrimageForkView={siteName:'山脊岔口',options:[escort,detour,remain]};

describe('same way for only one real segment',()=>{
  it('offers exact physical choices without committing another traveller or predicting arrival',()=>{
    const onChoose=vi.fn();
    const html=renderToStaticMarkup(<PilgrimageForkStoryCard view={view} onChoose={onChoose}/>);
    expect(html).toContain('同路一夜，各望一山');
    expect(html).toContain('两人都实走同一段，才算同行');
    expect(html).toContain('是否走成，以实走为准');
    expect(html).toContain('不替同路人做决定');
    expect(html.match(/min-h-\[44px\]/g)).toHaveLength(3);
    expect(html).not.toMatch(/private-|已到终点|同路人已应允/);
    expect(onChoose).not.toHaveBeenCalled();
  });
  it('locks only native visible options during a request',()=>{
    const html=renderToStaticMarkup(<PilgrimageForkStoryCard view={{...view,options:[remain]}} busy onChoose={()=>{}}/>);
    expect(html).toContain('留在此处');
    expect(html).toContain('disabled=""');
    expect(html).not.toMatch(/独走岔路|愿同走一步/);
  });
  it('suppresses empty scopes and keeps the actual reading receipt separate',()=>{
    expect(renderToStaticMarkup(<PilgrimageForkStoryCard view={{...view,options:[]}}/>)).toBe('');
    const html=renderToStaticMarkup(<PilgrimageForkStoryCard view={{...view,options:[],
      receipt:{title:'实经一段',description:'两人确实一起走过这一段。'}}}/>);
    expect(html).toContain('两人确实一起走过这一段');
    expect(html).not.toMatch(/<button|未落定|私下/);
  });
});
