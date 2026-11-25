import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {MercyReunionStoryCard} from '../src/components/MercyReunionStoryCard';
import type {MercyReunionOption,MercyReunionView} from '../src/engine/mercyReunion';

const common={action:'MERCY_REUNION',targetMercyReunionId:'private-pair'} as const;
const aid:MercyReunionOption={...common,mercyReunionMove:'aid',targetLocationId:'private-refuge'};
const accept:MercyReunionOption={...common,mercyReunionMove:'accept_aid'};
const stand:MercyReunionOption={...common,mercyReunionMove:'stand_down'};
const challenge:MercyReunionOption={...common,mercyReunionMove:'challenge'};
const view:MercyReunionView={siteName:'雁回渡',otherName:'谢折柳',options:[stand,aid,challenge]};

describe('real later meeting after mercy',()=>{
  it('shows only authorized exact choices and does not conflate an offer with protection or consent',()=>{
    const onChoose=vi.fn();
    const html=renderToStaticMarkup(<MercyReunionStoryCard view={view} onChoose={onChoose}/>);
    expect(html).toContain('又见谢折柳');
    expect(html.match(/min-h-\[44px\]/g)).toHaveLength(3);
    expect(html).toContain('对方须另作答复，眼下并未同行');
    expect(html).not.toMatch(/答应同走|已结为好友|private-|重逢实录/);
    expect(onChoose).not.toHaveBeenCalled();
  });
  it('only the distinct actual answer appears when allowed, with no other implied result',()=>{
    const html=renderToStaticMarkup(<MercyReunionStoryCard view={{...view,options:[accept]}} busy onChoose={()=>{}}/>);
    expect(html).toContain('答应同走这一步');
    expect(html).toContain('旧事且留日后分说');
    expect(html).toContain('disabled=""');
    expect(html).not.toMatch(/提议同行|当面再战|这次且不拔剑/);
  });
  it('uses a verified receipt verbatim and does not invent another meeting or button',()=>{
    expect(renderToStaticMarkup(<MercyReunionStoryCard view={{...view,options:[]}}/>)).toBe('');
    const html=renderToStaticMarkup(<MercyReunionStoryCard view={{...view,options:[],
      receipt:{title:'同过一段',description:'两人确已亲自走过这一步。'}}}/>);
    expect(html).toContain('两人确已亲自走过这一步');
    expect(html).not.toMatch(/<button|又见谢折柳|从此和解/);
  });
});
