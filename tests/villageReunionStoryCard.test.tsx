import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {VillageReunionStoryCard} from '../src/components/VillageReunionStoryCard';
import type {VillageReunionOption,VillageReunionView} from '../src/engine/villageReunion';

const base={action:'VILLAGE_REUNION',targetVillageReunionId:'private-meeting'} as const;
const remember:VillageReunionOption={...base,villageReunionMove:'remember'};
const offer:VillageReunionOption={...base,villageReunionMove:'offer'};
const accept:VillageReunionOption={...base,villageReunionMove:'accept'};
const view:VillageReunionView={siteName:'试剑山下',villageName:'青穗村',options:[remember,offer]};

describe('quiet reunion grounded only in actual village residence',()=>{
  it('does not invent childhood, blood relation or hostility and marks the offer as awaiting independent assent',()=>{
    const onChoose=vi.fn();
    const html=renderToStaticMarkup(<VillageReunionStoryCard view={view} onChoose={onChoose}/>);
    expect(html).toContain('都曾在青穗村住过');
    expect(html).toContain('一枚灵石作押');
    expect(html).toContain('待对方另作答复');
    expect(html.match(/min-h-\[44px\]/g)).toHaveLength(2);
    expect(html).not.toMatch(/发小|亲兄弟|仇敌|已结伴|private-meeting/);
    expect(onChoose).not.toHaveBeenCalled();
  });
  it('shows independent acceptance only for the exact native option, locked during busy',()=>{
    const html=renderToStaticMarkup(<VillageReunionStoryCard view={{...view,options:[accept]}} busy onChoose={()=>{}}/>);
    expect(html).toContain('应下这番同行之约');
    expect(html).toContain('不立刻动身');
    expect(html).toContain('disabled=""');
    expect(html).not.toMatch(/提议结伴|说起旧村/);
  });
  it('omits an empty scope and renders a settled receipt without guessing a new outcome',()=>{
    expect(renderToStaticMarkup(<VillageReunionStoryCard view={{...view,options:[]}}/>)).toBe('');
    const html=renderToStaticMarkup(<VillageReunionStoryCard view={{...view,options:[],
      receipt:{title:'旧村已叙',description:'两人已在这里各自说过往事。'}}}/>);
    expect(html).toContain('两人已在这里各自说过往事');
    expect(html).not.toMatch(/<button|作押|private-meeting/);
  });
});
