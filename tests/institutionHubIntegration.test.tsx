import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {App} from '../src/App';
import {DesktopInstitutionHub,InstitutionHubPanel,nextInstitutionHubTab} from '../src/components/hubs/InstitutionHubPanel';

const groupFixtures=[
  {id:'story',label:'纪事阅读',sectionIds:['feed','library']},
  {id:'proof',label:'考据与时间线',sectionIds:['timeline','witness']},
  {id:'hidden',label:'当前不存在的分组',sectionIds:['not-in-this-world']},
] as const;
const leaves=[
  {id:'feed',label:'山河见闻'},
  {id:'library',label:'藏书阁与故事'},
  {id:'timeline',label:'原始时间线与分支'},
  {id:'witness',label:'证词与名誉复核'},
] as const;
function basis(){
  const mounts:string[]=[];
  function Example({id}:{id:string}){mounts.push(id);return <p data-institution-leaf={id}>本分支唯一挂载：{id}</p>;}
  return {mounts,props:{label:'纪事与历史',sections:leaves.map(section=>({...section,content:<Example id={section.id}/>})),
    groups:[...groupFixtures],initialOpen:'feed',onOpenChange:vi.fn()}};
}
const idsIn=(markup:string)=>Array.from(markup.matchAll(/data-institution-leaf="([^"]+)"/gu),match=>match[1]);

describe('grouped institution hubs reuse the existing workspace and leaf authority',()=>{
  it('preserves the recognizable three tool entry points and wide-independent mobile initial section routing',()=>{
    const initial=renderToStaticMarkup(<App/>);
    expect(initial.match(/<button\b/g)).toHaveLength(2);
    expect(initial).toContain('data-story-home');
    for(const [workspace,leaf,label] of [
      ['sect','oaths','天道契书与宗门仲裁'],
      ['world','markets','坊市与商队'],
      ['chronicle','timeline','原始时间线与分支'],
    ] as const){
      const html=renderToStaticMarkup(<App initialWorkspace={workspace} initialSection={leaf}/>);
      expect(html.match(/role="tab"/g)).toHaveLength(5);
      expect(html).toMatch(new RegExp(`-tab-${workspace}[^>]*role="tab" aria-selected="true"`,'u'));
      expect(html).toMatch(new RegExp(`id="[^"]+-switch-${leaf}"[^>]*aria-expanded="true"[^>]*>[^<]*${label}`,'u'));
      expect(html).toContain('更多内容');
      expect(html).not.toContain('data-panoramic-cockpit');
    }
  });

  it('groups a saved legacy leaf on desktop without mounting its siblings or groups without actual content',()=>{
    const f=basis();
    const html=renderToStaticMarkup(<DesktopInstitutionHub {...f.props} rememberedOpen="timeline"/>);
    expect(f.mounts).toEqual(['timeline']);
    expect(idsIn(html)).toEqual(['timeline']);
    expect(html).toContain('纪事阅读');
    expect(html).toContain('考据与时间线');
    expect(html).not.toContain('当前不存在的分组');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"/u);
    expect(f.props.onOpenChange).not.toHaveBeenCalled();
  });

  it('uses the same legacy remembered leaf in mobile, and a historical override acts only as a locked read target',()=>{
    const mobile=basis(),forced=basis();
    const ordinary=renderToStaticMarkup(<InstitutionHubPanel {...mobile.props} rememberedOpen="witness"/>);
    expect(idsIn(ordinary)).toEqual(['witness']);
    expect(ordinary).toContain('更多内容');
    expect(ordinary).not.toContain('role="tablist"');
    const mobileRead=renderToStaticMarkup(<InstitutionHubPanel {...forced.props} rememberedOpen="witness" forcedOpen="feed"/>);
    expect(idsIn(mobileRead)).toEqual(['feed']);
    expect(mobileRead).toContain('aria-disabled="true"');
    expect(mobileRead).not.toContain('更多内容');
    const desktopRead=renderToStaticMarkup(<DesktopInstitutionHub {...forced.props} rememberedOpen="witness" forcedOpen="feed"/>);
    expect(forced.mounts).toEqual(['feed','feed']);
    expect(idsIn(desktopRead)).toEqual(['feed']);
    expect(desktopRead).not.toContain('本分支唯一挂载：witness');
    expect(desktopRead).not.toContain('role="tablist"');
    expect(desktopRead).toContain('role="region" aria-label="山河见闻"');
    expect(forced.props.onOpenChange).not.toHaveBeenCalled();
    const fresh=basis();
    expect(idsIn(renderToStaticMarkup(<DesktopInstitutionHub {...fresh.props} rememberedOpen="witness"/>))).toEqual(['witness']);
  });


  it('keeps explicit closed state empty, falls back for missing IDs, and does not strand an ungrouped live leaf',()=>{
    const f=basis();
    const closed=renderToStaticMarkup(<DesktopInstitutionHub {...f.props} rememberedOpen={null}/>);
    expect(idsIn(closed)).toEqual([]);
    expect(closed).toContain('选择一个主题，查看对应内容。');
    expect(closed.match(/aria-selected="true"/gu)).toBeNull();
    expect(closed.match(/role="tab"[^>]*tabindex="0"/gu)).toHaveLength(1);
    const stale=renderToStaticMarkup(<DesktopInstitutionHub {...f.props} rememberedOpen="old-removed" forcedOpen="old-forced"/>);
    expect(idsIn(stale)).toEqual(['feed']);
    const staleAll=renderToStaticMarkup(<DesktopInstitutionHub {...f.props} initialOpen="missing-page" rememberedOpen="removed"/>);
    expect(idsIn(staleAll)).toEqual([]);
    const unfiled=renderToStaticMarkup(<DesktopInstitutionHub {...f.props}
      sections={[...f.props.sections,{id:'bookkeeping',label:'新账簿',content:<p data-institution-leaf="bookkeeping">实际新账</p>}]}
      rememberedOpen="bookkeeping"/>);
    expect(idsIn(unfiled)).toEqual(['bookkeeping']);
    expect(unfiled).toContain('其他');
    expect(unfiled).toContain('aria-label="新账簿"');
    expect(f.mounts).toEqual(['feed']);
    expect(f.props.onOpenChange).not.toHaveBeenCalled();
  });

  it('keeps roving desktop keyboard targets bounded and does not eat unrelated keys',()=>{
    expect(nextInstitutionHubTab('ArrowRight',0,3)).toBe(1);
    expect(nextInstitutionHubTab('ArrowRight',2,3)).toBe(0);
    expect(nextInstitutionHubTab('ArrowLeft',0,3)).toBe(2);
    expect(nextInstitutionHubTab('Home',2,3)).toBe(0);
    expect(nextInstitutionHubTab('End',0,3)).toBe(2);
    expect(nextInstitutionHubTab('Tab',0,3)).toBeUndefined();
    expect(nextInstitutionHubTab('ArrowRight',0,0)).toBeUndefined();
  });
});
