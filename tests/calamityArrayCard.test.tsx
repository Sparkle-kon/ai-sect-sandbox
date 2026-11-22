import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {CalamityArrayCard,type CalamityArrayCardView} from '../src/components/CalamityArrayCard';

const option={action:'CALAMITY_ARRAY',calamityArrayStance:'joint',targetCalamityHazardId:'opaque-event',targetLocationId:'opaque-site'} as const;
const view:CalamityArrayCardView={siteName:'万仙坊市',options:[option,{...option,calamityArrayStance:'local'}]};
describe('scoped miasma formation card',()=>{
  it('shows only real native options and no forecast or raw receipt metadata',()=>{
    const choose=vi.fn(()=>true);
    const html=renderToStaticMarkup(<CalamityArrayCard view={view} onChoose={choose}/>);
    expect(html).toContain('合守阵眼');
    expect(html).toContain('各守山门');
    expect(html.match(/<button\b/g)).toHaveLength(2);
    expect(html.match(/min-h-11/g)).toHaveLength(2);
    expect(html).not.toMatch(/守望实录|救下|opaque-/u);
    expect(choose).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(<CalamityArrayCard view={{...view,options:[]}}/>)).toBe('');
  });
  it('separates intent from actual settlement and removes choice controls after a receipt',()=>{
    const queued=renderToStaticMarkup(<CalamityArrayCard view={{...view,queued:'local'}} onChoose={()=>true}/>);
    expect(queued).toContain('瘴灾尚未结算');
    expect(queued).not.toContain('<button');
    const actual=renderToStaticMarkup(<CalamityArrayCard view={view}
      receipt={{title:'两宗实到',description:'本轮原阵眼实救四人，阵后各自留下异议。'}} onChoose={()=>true}/>);
    expect(actual).toContain('守望实录');
    expect(actual).toContain('本轮原阵眼实救四人');
    expect(actual).not.toMatch(/<button|尚未结算/u);
  });
});
