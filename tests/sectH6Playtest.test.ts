import {describe,expect,it} from 'vitest';
import {simulateH6Rotation} from '../scripts/h6Rotation';

describe('H6 production closing checks',()=>{
  it('completes twelve different monthly boards and keeps material scenes, visitors, and recruits through a verified reload',()=>{
    const fresh=simulateH6Rotation(13071,'qingyun-odd-jobs');
    const recovered=simulateH6Rotation(13071,'qingyun-odd-jobs',0,true);
    expect(recovered).toEqual(fresh);
    expect(recovered.managed).toBe(true);
    expect(recovered.months).toHaveLength(12);
    expect(new Set(recovered.months.map(row=>row.assigned.join(','))).size).toBeGreaterThanOrEqual(10);
    expect(recovered.months.every(row=>row.assigned.length===row.roster&&row.roster>0)).toBe(true);
    expect(recovered.material).toBeGreaterThanOrEqual(10);
    expect(recovered.visitors).toBeGreaterThanOrEqual(3);
    expect(recovered.followUps).toBeGreaterThanOrEqual(3);
    expect(recovered.recruits).toBeGreaterThanOrEqual(1);
    expect(recovered.months.flatMap(month=>month.arrivals).filter(guest=>guest.kind==='visit')
      .every(guest=>guest.voiced?.includes('上回'))).toBe(true);
  });

  it('keeps development disclaimer phrasing off the player surfaces and release notes',async()=>{
    const nodeFiles='node:fs';
    const {readFileSync,readdirSync}=await import(nodeFiles) as {
      readFileSync(path:URL,encoding:'utf8'):string;
      readdirSync(path:URL,options:{withFileTypes:true}):Array<{name:string;isDirectory():boolean}>;
    };
    const source=new URL('../src/',import.meta.url);
    const read=(directory:URL):{file:string;text:string}[]=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
      const path=new URL(entry.name+(entry.isDirectory()?'/':''),directory);
      return entry.isDirectory()?read(path):/\.[cm]?[tj]sx?$/u.test(entry.name)?[{file:path.pathname,text:readFileSync(path,'utf8')}]:[];
    });
    const from=[...read(source),{file:'CHANGELOG.md',text:readFileSync(new URL('../CHANGELOG.md',import.meta.url),'utf8')}];
    expect(from.filter(row=>/不等于|不算|照样算数/u.test(row.text)).map(row=>row.file)).toEqual([]);
  });
});
