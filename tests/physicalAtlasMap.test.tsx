import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import type {PhysicalAtlasPoint,PhysicalAtlasView} from '../src/engine/physicalAtlasTerms';
import {PhysicalAtlasSummary,physicalAtlasMapMarks,planPhysicalAtlasDrawing} from '../src/components/physicalAtlasMap';
import {activatePaintedMark,MapPaintedTargets} from '../src/components/MapKeyboardExplorer';

const west:PhysicalAtlasPoint={address:{chartId:'lower-base',tileId:'tile-8-2'},regionId:'west',col:8,row:2};
const center:PhysicalAtlasPoint={address:{chartId:'lower-base',tileId:'tile-9-2'},regionId:'center',col:9,row:2};
const border={from:west,to:center};
const view:PhysicalAtlasView={home:{point:west,locationId:'exact-site',locationOwnerSectId:'proof-site-owner',
  tileOwnerSectId:'proof-tile-owner'},regions:['west','center'],borders:[border],
  routes:[{kind:'road',id:'signed-road',status:'established',borders:[border],traversedBorders:[]},
    {kind:'village_supply',id:'actual-freight',status:'traversed',borders:[{from:center,to:west}],traversedBorders:[{from:center,to:west}]}]};

describe('read-only physical atlas map',()=>{
  it('distinguishes the two exact ownership scopes, local name and scoped crossing without naming unseen regions',()=>{
    const html=renderToStaticMarkup(<PhysicalAtlasSummary view={view} drawing={planPhysicalAtlasDrawing(view,{cols:25,rows:15})} locationName="石亭"
      locationOwner="旧钟门" tileOwner="净溪宗"/>);
    expect(html).toContain('现地：西境 · 石亭');
    expect(html).toContain('站点所属：旧钟门');
    expect(html).toContain('此格所属：净溪宗');
    expect(html).toContain('西境与中州');
    expect(html).not.toContain('东境');
    expect(html).not.toContain('exact-site');
    expect(html).not.toContain('<button');
    expect(renderToStaticMarkup(<PhysicalAtlasSummary/>)).toBe('');
  });
  it('supplies keyboard targets from the same geometry and scoped route movement only',()=>{
    const drawing=planPhysicalAtlasDrawing(view,{cols:25,rows:15});
    const marks=physicalAtlasMapMarks(drawing);
    expect(drawing.borders[0]).toMatchObject({start:{x:360,y:80},end:{x:360,y:120}});
    expect(drawing.routes[0]).toMatchObject({start:{x:340,y:100},end:{x:380,y:100}});
    expect(drawing.routes[1]).toMatchObject({start:{x:380,y:100},end:{x:340,y:100}});
    expect(marks.map(row=>row.title)).toEqual(['西境与中州界线','西境至中州：驿路','中州至西境：乡运']);
    let selected: unknown;
    expect(activatePaintedMark(marks,'route',marks[2].id,point=>selected=point)).toBe(true);
    expect(selected).toEqual({x:360,y:100});
    expect(activatePaintedMark(marks,'route','forged',point=>selected=point)).toBe(false);
    const html=renderToStaticMarkup(<MapPaintedTargets marks={marks} kind="route" firstOrdinal={1} onActivate={()=>{}}/>);
    expect(html).toContain('已立路，未见实走凭据');
    expect(html).toContain('有原生实走凭据');
    expect(html).not.toContain('东境');
  });
  it('keeps reverse travel separate from a declared forward road and closure',()=>{
    const roads:PhysicalAtlasView={...view,routes:[{kind:'road',id:'reverse',status:'closed',
      borders:[border],traversedBorders:[{from:center,to:west}]}]};
    const marks=physicalAtlasMapMarks(planPhysicalAtlasDrawing(roads,{cols:25,rows:15}));
    expect(marks[1].title).toBe('西境至中州：驿路');
    expect(marks[1].summary).toContain('已停用，不作通行凭据');
    expect(marks[1].summary).not.toContain('往日实走');
    expect(marks[2].title).toBe('中州至西境：驿路');
    expect(marks[2].summary).toContain('已停用；这段另有往日实走凭据');
  });
  it('does not produce a keyboard target or painted line for invalid geometry or a route outside the projected borders',()=>{
    const bad={...center,col:10};
    const clipped:PhysicalAtlasView={regions:['west','center'],borders:[{from:west,to:bad}],
      routes:[{kind:'road',id:'hidden',status:'closed',borders:[border],traversedBorders:[]}]};
    const drawing=planPhysicalAtlasDrawing(clipped,{cols:25,rows:15});
    expect(drawing.borders).toHaveLength(0);
    expect(drawing.routes).toHaveLength(0);
    expect(physicalAtlasMapMarks(drawing)).toEqual([]);
  });
});
