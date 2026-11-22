import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {FrontierPortLocalRead} from '../src/components/FrontierPortLocalRead';
import type {FrontierPortView} from '../src/engine/frontierPortTerms';

const dock:FrontierPortView={siteId:'frontier-east-dock',resident:true,tide:'wind_closed',options:[],
  hull:{id:'exact-own-hull',condition:4,status:'away'},stock:{reef_salt:7,port_rigging:5}};

describe('outside harbor: local tide, shore and scope',()=>{
  it('does not portray a signed ship as the actor or leave a hull available while it is away',()=>{
    const html=renderToStaticMarkup(<FrontierPortLocalRead view={dock}/>);
    expect(html).toContain('风季关停');
    expect(html).toContain('本港的船不在泊位');
    expect(html).toContain('你仍在岸边');
    expect(html).not.toContain('耐久 4');
    expect(html).not.toContain('exact-own-hull');
    expect(html).not.toContain('潮晶 7');
    expect(html).not.toContain('已到对方');
  });
  it('shows current warehouse goods only in the warehouse and does not merge goods in motion',()=>{
    const html=renderToStaticMarkup(<FrontierPortLocalRead view={{...dock,siteId:'frontier-east-warehouse',tide:'open'}}/>);
    expect(html).toContain('潮晶 7');
    expect(html).toContain('船具 5');
    expect(html).toContain('不含尚在航路的货');
    expect(html).not.toContain('不在泊位');
    expect(html).not.toContain('exact-own-hull');
  });
});
