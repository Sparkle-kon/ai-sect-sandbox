import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {BattlefieldAftermathStoryCard} from '../src/components/BattlefieldAftermathStoryCard';
import type {BattlefieldAftermathOption,BattlefieldAftermathView} from '../src/engine/battlefieldAftermath';

const base={action:'BATTLEFIELD_AFTERMATH',targetBattlefieldAftermathId:'private-epilogue'} as const;
const remain:BattlefieldAftermathOption={...base,battlefieldAftermathMove:'remain'};
const back:BattlefieldAftermathOption={...base,battlefieldAftermathMove:'return',targetLocationId:'private-road'};
const care:BattlefieldAftermathOption={...base,battlefieldAftermathMove:'offer_care',targetCultivatorId:'private-body'};
const accept:BattlefieldAftermathOption={...base,battlefieldAftermathMove:'accept_care',targetCultivatorId:'private-carer'};
const view:BattlefieldAftermathView={siteName:'残阵边',options:[remain,back,care]};

describe('quiet aftermath for one actually present person',()=>{
  it('renders exact offered choices with actual reachable return and a distinct request for consent',()=>{
    const onChoose=vi.fn();
    const html=renderToStaticMarkup(<BattlefieldAftermathStoryCard view={view} onChoose={onChoose}/>);
    expect(html).toContain('战后拾愿');
    expect(html).toContain('回往曾亲自到过的地方');
    expect(html).toContain('先问对方愿不愿意。眼下还没施治。');
    expect(html.match(/min-h-\[44px\]/g)).toHaveLength(3);
    expect(html).not.toMatch(/private-|一举大胜|已经痊愈|应下照料/);
    expect(onChoose).not.toHaveBeenCalled();
  });
  it('shows only the authentic acceptance when available and locks it while committing',()=>{
    const html=renderToStaticMarkup(<BattlefieldAftermathStoryCard view={{...view,options:[accept]}} busy onChoose={()=>{}}/>);
    expect(html).toContain('应下照料');
    expect(html).toContain('不预断伤势会如何');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('提议照料');
  });
  it('suppresses an empty context, and separates a settled own receipt',()=>{
    expect(renderToStaticMarkup(<BattlefieldAftermathStoryCard view={{...view,options:[]}}/>)).toBe('');
    const html=renderToStaticMarkup(<BattlefieldAftermathStoryCard view={{...view,options:[],
      receipt:{title:'留在旧阵边',description:'此人留了下来。'}}}/>);
    expect(html).toContain('此人留了下来。');
    expect(html).not.toMatch(/<button|实付代价|大胜/);
  });
});
