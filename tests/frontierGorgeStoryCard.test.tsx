import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {FrontierGorgeStoryCard} from '../src/components/FrontierGorgeStoryCard';
import type {FrontierGorgeOption,FrontierGorgeView} from '../src/engine/frontierGorge';

const wait:FrontierGorgeOption={action:'FRONTIER_GORGE',frontierGorgeMove:'wait',
  targetFrontierSiteId:'frontier-north-home'};
const view:FrontierGorgeView={siteName:'峡口',weather:{kind:'罡风',intensity:.62,bearing:'west'},options:[wait]};

describe('峡口实走与可选下一步',()=>{
  it('shows native present wind and only exact actions, without predicting the road will reopen',()=>{
    const html=renderToStaticMarkup(<FrontierGorgeStoryCard view={view} busy onChoose={()=>{}}/>);
    expect(html).toContain('风向西');
    expect(html).toContain('等风');
    expect(html).toContain('风势何时转弱，还要看后来');
    expect(html).toContain('disabled=""');
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).not.toMatch(/绕行|已经过峡|frontier-north-home/);
  });
  it('shows only receipt truth when actually sheltered, and no card with no facts or option',()=>{
    expect(renderToStaticMarkup(<FrontierGorgeStoryCard view={{siteName:'峡口',options:[]}}/>)).toBe('');
    const html=renderToStaticMarkup(<FrontierGorgeStoryCard view={{siteName:'峡口',options:[],
      receipt:{title:'这一回未走',description:'确已在原处等过一回。'}}}/>);
    expect(html).toContain('确已在原处等过一回');
    expect(html).not.toMatch(/<button|罡风|全路已通/);
  });
});
