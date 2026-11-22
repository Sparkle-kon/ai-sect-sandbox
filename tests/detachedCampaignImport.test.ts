import {describe,expect,it} from 'vitest';
import {decodeDetachedImportPlan} from '../scripts/detachedCampaignImport';
const a='a'.repeat(64),b='b'.repeat(64);
const row=(tick:number,sha256=a)=>({kind:'native',file:`source-${tick}.json`,tick,year:1001,month:tick,bytes:1024,sha256});
const plan=()=>({format:'ai-sect-detached-import',version:1,timelineId:'timeline-1',nextBranchNumber:3,sourceRuleVersion:b,
  active:{branchId:'base',tick:2,sha256:b},branches:[{id:'base',label:'真档原线',snapshots:[row(1),row(2,b)]}]});
const decode=(value:unknown)=>decodeDetachedImportPlan(JSON.stringify(value));
describe('bounded explicit detached archive input plan',()=>{
  it('keeps all original references and requires exact selected digest and newest retained snapshot',()=>{
    const source=plan();
    expect(decode(source)).toEqual(source);
    expect(()=>decode({...source,active:{branchId:'base',tick:1,sha256:a}})).toThrow(/支线头/u);
    expect(()=>decode({...source,active:{...source.active,sha256:a}})).toThrow(/支线头/u);
  });
  it('rejects shadow fields, duplicate physical split parts, unordered months and unbounded input sizes',()=>{
    const source=plan();
    expect(()=>decode({...source,unexpectedAutomation:true})).toThrow(/格式/u);
    const replace=(snapshot:unknown)=>({...source,branches:[{...source.branches[0],snapshots:[row(1),snapshot]}]});
    expect(()=>decode(replace({...row(2,b),bytes:33*1024*1024}))).toThrow(/体积/u);
    expect(()=>decode(replace(row(1,b)))).toThrow(/年月/u);
    const {file:_,...descriptor}=row(2,b);
    expect(()=>decode(replace({...descriptor,kind:'era',manifest:'original.era',parts:['same.part','same.part']}))).toThrow(/分卷/u);
    const badBranch={id:'other',label:'真实副本',parentBranchId:'not-there',forkTick:1,snapshots:[row(2,b)]};
    expect(()=>decode({...source,branches:[...source.branches,badBranch]})).toThrow(/父子/u);
  });
});
