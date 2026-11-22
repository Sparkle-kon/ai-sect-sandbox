import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {ColdWaterVeinPanel} from '../src/components/ColdWaterVeinPanel';
import {MiningCharterEvidence,NorthMiningCharterPanel,reviewedMiningOrder,type MiningCharterControls} from '../src/components/NorthMiningCharterPanel';
import type {NorthMiningOption,NorthMiningCharterView} from '../src/engine/northMiningCharterEngine';

const original:NorthMiningCharterView['rows'][number]={
  id:'document-1',year:1001,month:11,stance:'detour',status:'ratified',signedRoles:['household','miner','sect'],
  active:true,paidStones:24,hasVerifiedPassage:false,fieldWasReduced:false,
};
const stagedOrder:NorthMiningOption={action:'NORTH_MINING_CHARTER',northMiningMove:'propose',northMiningStance:'seal'};
const revision={};
const controls:MiningCharterControls={scopeKey:'scope-a',revisionKey:revision,choices:[stagedOrder],onQueue:vi.fn(()=>true)};

describe('northern original charter within the existing well fold',()=>{
  it('starts silently when there is neither an original nor a real legal action',()=>{
    expect(renderToStaticMarkup(<NorthMiningCharterPanel view={{scope:'local',rows:[]}}/>)).toBe('');
    expect(renderToStaticMarkup(<ColdWaterVeinPanel/>)).toBe('');
    const html=renderToStaticMarkup(<ColdWaterVeinPanel><NorthMiningCharterPanel view={{scope:'personal',rows:[original]}}/></ColdWaterVeinPanel>);
    expect(html).toContain('寒玉井边');
    expect(html).toContain('翻看采契');
    expect(html).not.toContain('<details open=');
    expect(html).not.toContain('实付');
    expect(html).not.toContain('实际通行');
  });
  it('separates signed payment, real road use and actual reduced crop in the native original',()=>{
    const noUse=renderToStaticMarkup(<MiningCharterEvidence row={original} local/>);
    expect(noUse).toContain('实付 24 灵石');
    expect(noUse).toContain('尚未核到实际通行');
    expect(noUse).not.toContain('已有真实通行凭据');
    expect(noUse).toContain('不能从水亏直接推算');
    const used=renderToStaticMarkup(<MiningCharterEvidence row={{...original,hasVerifiedPassage:true,fieldWasReduced:true}} local/>);
    expect(used).toContain('已有真实通行凭据');
    expect(used).toContain('可核的实际田产受损');
    expect(used).not.toContain('尚未核到实际通行');
  });
  it('remote authorized original has no present action, status or travel; local pending is not as signed',()=>{
    const remote=renderToStaticMarkup(<NorthMiningCharterPanel view={{scope:'personal',rows:[original]}} controls={controls}/>);
    expect(remote).toContain('核看本案凭据');
    expect(remote).not.toMatch(/参与此事|封矿保水|此刻仍按|已经记下打算/);
    const local=renderToStaticMarkup(<NorthMiningCharterPanel view={{scope:'local',rows:[]}} controls={{...controls,pending:true}}/>);
    expect(local).toContain('尚未落笔或落账');
    expect(controls.onQueue).not.toHaveBeenCalled();
  });
  it('will not review stale or ambiguous options',()=>{
    const option={key:'same',order:stagedOrder,label:'请求',review:'当面确认'};
    const staged={choice:option,revision};
    expect(reviewedMiningOrder(staged,revision,[option])).toBe(option);
    expect(reviewedMiningOrder(staged,{},[option])).toBeUndefined();
    expect(reviewedMiningOrder(staged,revision,[{...option,key:'other'}])).toBeUndefined();
    expect(reviewedMiningOrder(staged,revision,[option,{...option}])).toBeUndefined();
  });
});
