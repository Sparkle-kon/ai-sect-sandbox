import {describe,expect,it} from 'vitest';
// @ts-expect-error Tests use the Node hash implementation; the app excludes Node ambient declarations.
import {createHash} from 'node:crypto';
import {createInitialWorld} from '../src/data/initialWorld';
import {
  createAuthoredEraWorkerController,type AuthoredEraBuildControllerOptions,
  type AuthoredEraWorkerResponse,
} from '../src/engine/authoredEraBuildEngine';
import {createEraDesignDraft,encodeEraDesignDraft} from '../src/engine/eraDesignDraft';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';

const rule='a98e730d'.repeat(8);
const seed=2031;
const jan={year:1001,month:1};
const april={year:1001,month:4};
const terms=[
  {kind:'jade_vein_depleted',siteId:'loc-vein-north',spiritQi:30,jadeCapacity:0},
  {kind:'village_capacity',settlementId:'village-loc-market',capacity:450},
] as const;
const draft=(target=april,anchor=jan)=>createEraDesignDraft(seed,'classic',anchor,target,terms);
const hash=async(data:Uint8Array):Promise<string>=>createHash('sha256').update(data).digest('hex');
const digest=(value:string)=>hash(new TextEncoder().encode(value));
function setup(options:Partial<AuthoredEraBuildControllerOptions>={}){
  const events:AuthoredEraWorkerResponse[]=[];
  const callbacks=new Map<number,()=>void>();
  let serial=0;
  const send=createAuthoredEraWorkerController({ruleVersion:rule,post:event=>events.push(event),now:()=>0,sha256:hash,
    schedule:callback=>{callbacks.set(++serial,callback);return serial;},cancelSchedule:handle=>{callbacks.delete(handle as number);},...options});
  const pump=async()=>{
    for(let step=0;step<100;step++){
      const next=[...callbacks][0];
      if(next){callbacks.delete(next[0]);next[1]();}
      await Promise.resolve();
      if(!callbacks.size&&events.at(-1)?.type!=='authored_era_progress')return;
    }
    throw Error('Authored era did not finish');
  };
  return {events,callbacks,send,pump};
}

describe('isolated worker for authored era construction',()=>{
  it('uses the natural monthly reference before applying author effects, and emits reproducible strict result bytes',async()=>{
    const test=setup(), design=draft(), canonical=encodeEraDesignDraft(design);
    let natural=createInitialWorld(seed,'classic');
    const originalText=encodeEraWorldSave(natural);
    for(let index=0;index<3;index++)natural=advanceWorldTick(natural,undefined,undefined,'utility');
    const naturalText=encodeEraWorldSave(natural);
    const start=(runId:string)=>test.send({type:'authored_era_start',runId,draft:design});
    start('one'); await test.pump();
    expect(test.events.filter(event=>event.type==='authored_era_progress').map(({progress})=>progress)).toEqual([
      {current:{...jan,tick:1},target:april,completedMonths:0,requestedMonths:3,phase:'simulating'},
      {current:{year:1001,month:3,tick:3},target:april,completedMonths:2,requestedMonths:3,phase:'simulating'},
      {current:{...april,tick:4},target:april,completedMonths:3,requestedMonths:3,phase:'verifying'},
    ]);
    const got=test.events.at(-1);
    if(got?.type!=='authored_era_ready')throw Error(JSON.stringify(got));
    expect(got.candidate).toMatchObject({target:{...april,tick:4},ruleVersion:rule,normalizedDraft:canonical,
      draftSha256:await digest(canonical),baselineSha256:await digest(naturalText),resultSha256:await digest(got.candidate.resultText),
      resultBytes:new TextEncoder().encode(got.candidate.resultText).byteLength});
    const result=decodeEraWorldSave(got.candidate.resultText);
    expect(encodeEraWorldSave(result)).toBe(got.candidate.resultText);
    expect(result.authoredEraOrigin).toMatchObject({openedTick:4,rulesRevision:rule,effects:[{kind:terms[0].kind},{kind:terms[1].kind}]});
    expect(result.cultivators).toEqual(natural.cultivators);
    expect(result.random).toEqual(natural.random);
    expect(result.events).toEqual(natural.events);
    expect(encodeEraWorldSave(createInitialWorld(seed,'classic'))).toBe(originalText);
    start('two');await test.pump();
    expect(test.events.at(-1)).toEqual({type:'authored_era_ready',runId:'two',candidate:got.candidate});
  });

  it('refuses a late draft outside 1200 months from genesis and surfaces actual kernel conflicts without a candidate',async()=>{
    const test=setup();
    test.send({type:'authored_era_start',runId:'late',draft:draft({year:1101,month:2},{year:1101,month:1})});
    expect(test.events.at(-1)).toEqual({type:'authored_era_error',runId:'late',reason:'range'});
    expect(test.callbacks.size).toBe(0);
    const noSite=createEraDesignDraft(seed,'classic',jan,april,[terms[0],{...terms[1],settlementId:'nonexistent-village'}]);
    test.send({type:'authored_era_start',runId:'conflict',draft:noSite});await test.pump();
    expect(test.events.at(-1)).toMatchObject({type:'authored_era_error',runId:'conflict',reason:'constraints',issues:[{code:'design_conflict'}]});
    expect(test.events.some(event=>event.type==='authored_era_ready')).toBe(false);
  });

  it('drops cancelled queued work, and suppresses native digest completions from a stale run',async()=>{
    const queued=setup();
    queued.send({type:'authored_era_start',runId:'old',draft:draft()});
    const wake=[...queued.callbacks.values()][0];
    queued.send({type:'authored_era_cancel',runId:'other'});
    expect(queued.callbacks.size).toBe(1);
    queued.send({type:'authored_era_cancel',runId:'old'});
    wake();
    expect(queued.callbacks.size).toBe(0);
    expect(queued.events.at(-1)).toEqual({type:'authored_era_cancelled',runId:'old'});
    const pending:Array<()=>void>=[];
    let blocking=true;
    const during=setup({sha256:data=>blocking?new Promise(resolve=>pending.push(()=>{void hash(data).then(resolve);})):hash(data)});
    during.send({type:'authored_era_start',runId:'hashing',draft:draft({year:1001,month:2})});
    const next=[...during.callbacks][0];
    during.callbacks.delete(next[0]);next[1]();
    expect(during.events.at(-1)).toMatchObject({type:'authored_era_progress',progress:{phase:'verifying'}});
    during.send({type:'authored_era_cancel',runId:'hashing'});
    expect(during.events.at(-1)).toEqual({type:'authored_era_cancelled',runId:'hashing'});
    blocking=false;
    during.send({type:'authored_era_start',runId:'new',draft:draft({year:1001,month:2})});
    for(const resolve of pending)resolve();
    await during.pump();
    expect(during.events.filter(event=>event.type==='authored_era_ready').map(({runId})=>runId)).toEqual(['new']);
  });

  it('does not claim a ready world with no exact build revision or digest',async()=>{
    const test=setup({ruleVersion:undefined});
    test.send({type:'authored_era_start',runId:'no-rules',draft:draft()});
    expect(test.events).toEqual([{type:'authored_era_error',runId:'no-rules',reason:'rules'}]);
    const crypto=setup({sha256:async()=>{throw Error('runtime detail');}});
    crypto.send({type:'authored_era_start',runId:'no-crypto',draft:draft()});await crypto.pump();
    expect(crypto.events.at(-1)).toEqual({type:'authored_era_error',runId:'no-crypto',reason:'integrity'});
  });
});
