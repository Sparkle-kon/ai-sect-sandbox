import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {CultivatorPortrait} from '../src/components/CultivatorPortrait';
import type {CultivatorPortraitSpec} from '../src/components/cultivatorPortraitModel';

const base:CultivatorPortraitSpec={
  face:{jaw:0,eyes:1,hair:2,ornament:3,skin:'#bfa27e',ink:'#111827'},
  attire:'neutral', ageBand:'seasoned', brow:'soft',
  palette:{fabric:'#29494a',trim:'#b8985a',spirit:'#92e1df',background:'#0c1c26'},
};

describe('cultivator portrait SVG',()=>{
  it('is a bounded, width-customizable, self-contained decorative portrait',()=>{
    const html=renderToStaticMarkup(<CultivatorPortrait portrait={base} className="h-14 w-12"/>);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('focusable="false"');
    expect(html).toContain('viewBox="0 0 120 136"');
    expect(html).toContain('h-14 w-12');
    expect(html).toContain('shrink-0');
    expect(html).toContain('fill="#29494a"');
    expect(html).not.toMatch(/<image|href=|url\(|\bid=|aria-label=|data-portrait-halo/);
  });

  it('displays only a supplied real aura with completely different native shapes',()=>{
    const glyphs=['gold-wheel','dharma','blood-moon'] as const;
    const images=glyphs.map(kind=>renderToStaticMarkup(<CultivatorPortrait portrait={{...base,halo:{kind,color:'#af628a'}}}/>));
    for(let i=0;i<glyphs.length;i++){
      expect(images[i]).toContain(`data-portrait-halo="${glyphs[i]}"`);
      expect(images[i]).toContain('stroke="#af628a"');
      for(const other of glyphs.filter(kind=>kind!==glyphs[i]))expect(images[i]).not.toContain(other);
    }
    expect(images[0]).toContain('r="44"');
    expect(images[2]).toContain('M70 10a43 43');
  });

  it('keeps the comparable paper-doll layers in depth order without shared SVG references',()=>{
    const image=<CultivatorPortrait portrait={{...base,treasure:'array_disk',halo:{kind:'dharma',color:'#959ae8'}}} presentation="stage"/>;
    const html=renderToStaticMarkup(<div>{image}{image}</div>);
    const layers=(html.match(/data-portrait-layer="[^"]+"/g)??[]).map(attribute=>attribute.split('"')[1]);
    const expected=['scenery','halo','treasure','robe','face','eyes','hair','headpiece'];
    expect(layers).toEqual([...expected,...expected]);
    expect(html).not.toMatch(/<image|href=|url\(|\bid=|tabindex=/i);
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(2);
  });

  it('renders distinct eyes for five supplied states without rerolling the face or ornaments',()=>{
    const images=(['calm','joy','fight','wounded','demon'] as const).map(expression=>{
      const html=renderToStaticMarkup(<CultivatorPortrait portrait={{...base,expression}}/>);
      const faceExpression=/<g data-portrait-layer="eyes".*?(?=<g data-portrait-layer="hair")/;
      const eyes=html.match(faceExpression)?.[0];
      expect(eyes).toContain(`data-portrait-expression="${expression}"`);
      return [eyes,html.replace(faceExpression,'')];
    });
    expect(new Set(images.map(([eyes])=>eyes)).size).toBe(5);
    expect(new Set(images.map(([,rest])=>rest)).size).toBe(1);
  });

  it('reflects selected portrait geometry without guessing metadata in the renderer',()=>{
    const a=renderToStaticMarkup(<CultivatorPortrait portrait={base}/>);
    const b=renderToStaticMarkup(<CultivatorPortrait portrait={{...base,ageBand:'elder',attire:'layered',
      face:{...base.face,jaw:3,eyes:0,hair:1}}}/>);
    expect(a).not.toBe(b);
    expect(b).toContain('M51 44h16');
    expect(b).not.toContain('m37 56 2 2');
    expect(b).toContain('m36 94 24 20');
  });
});
