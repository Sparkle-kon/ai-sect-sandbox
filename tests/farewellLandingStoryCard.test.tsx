import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {FarewellLandingStoryCard} from '../src/components/FarewellLandingStoryCard';
import type {FarewellLandingOption,FarewellLandingView} from '../src/engine/farewellLanding';

const base={action:'FAREWELL_LANDING',targetFarewellDeceasedId:'private-dead-body'} as const;
const lamp:FarewellLandingOption={...base,farewellLandingMove:'keep_light'};
const leave:FarewellLandingOption={...base,farewellLandingMove:'farewell'};
const view:FarewellLandingView={siteName:'实到泊岸',deceasedName:'魏迟',options:[lamp,leave]};

describe('quiet actual farewell',()=>{
  it('renders the departed person only in their authenticated story, with exact distinct actions',()=>{
    const html=renderToStaticMarkup(<FarewellLandingStoryCard view={view} onChoose={()=>{}}/>);
    expect(html).toContain('曾亲识的魏迟');
    expect(html).toContain('花一块灵石');
    expect(html).toContain('不点灯，也不离开');
    expect(html.match(/<button\b/g)).toHaveLength(2);
    expect(html).not.toMatch(/private-dead-body|复生|已点灯|故人应声/);
  });
  it('omits the scene with no actual option or receipt; verified farewells never show pretend lamps',()=>{
    expect(renderToStaticMarkup(<FarewellLandingStoryCard view={{...view,options:[]}}/>)).toBe('');
    const html=renderToStaticMarkup(<FarewellLandingStoryCard
      view={{...view,options:[],receipt:{title:'作别既成',description:'在岸上作别，并未点灯。'}}}/>);
    expect(html).toContain('在岸上作别，并未点灯');
    expect(html).not.toMatch(/<button|花一块灵石|故人应声/);
  });
});
