import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {PavilionFireStoryCard} from '../src/components/PavilionFireStoryCard';
import type {PavilionFireOption,PavilionFireView} from '../src/engine/pavilionFire';

const common={action:'PAVILION_FIRE',targetPavilionFireId:'private-fire'} as const;
const salvage:PavilionFireOption={...common,pavilionFireMove:'salvage',targetLocationId:'private-destination'};
const ward:PavilionFireOption={...common,pavilionFireMove:'ward',targetCultivatorId:'private-body'};
const leave:PavilionFireOption={...common,pavilionFireMove:'leave',targetLocationId:'private-destination'};
const secure:PavilionFireOption={...common,pavilionFireMove:'secure'};
const siteName='栖霞峰';

describe('藏经阁火场正有此事时',()=>{
  it('only shows native authorized choices, at tap size, and distinguishes staying to protect from moving others',()=>{
    const view:PavilionFireView={siteName,options:[salvage,ward,leave]};
    const onChoose=vi.fn();
    const html=renderToStaticMarkup(<PavilionFireStoryCard view={view} onChoose={onChoose}/>);
    expect(html.match(/min-h-\[44px\]/g)).toHaveLength(3);
    expect(html).toMatch(/救卷.*护人.*撤走/);
    expect(html).toContain('此举不替人撤离。');
    expect(html).toContain('以实际行止为准。');
    expect(html).not.toMatch(/private-|已安全|功法失传|火场实录/);
    expect(onChoose).not.toHaveBeenCalled();
  });
  it('shows real separately staged custody, not a fresh rescue or a conclusion about all copies',()=>{
    const view:PavilionFireView={siteName,options:[secure],receipt:{title:'已离火场',description:'这一册确已带出，尚未入新架。'}};
    const html=renderToStaticMarkup(<PavilionFireStoryCard view={view} busy onChoose={()=>{}}/>);
    expect(html).toContain('尚未入新架');
    expect(html).toContain('安置救出的卷册');
    expect(html).toContain('disabled=""');
    expect(html).not.toMatch(/火已到了阁里|功法失传|private-/);
  });
  it('leaves unrelated scopes empty and replay choices noninteractive',()=>{
    expect(renderToStaticMarkup(<PavilionFireStoryCard view={{siteName,options:[]}}/>)).toBe('');
    expect(renderToStaticMarkup(<PavilionFireStoryCard view={{siteName,options:[leave]}}/>)).not.toContain('<button');
  });
});
