import { createFastForwardWorkerController } from './fastForwardEngine';
import type { FastForwardWorkerRequest, FastForwardWorkerResponse } from './fastForwardEngine';
import type { ReplayReceiptRequest,ReplayReceiptResponse } from './replayReceiptEngine';

declare const __SECT_UTILITY_RULE_VERSION__:string;
type Request=FastForwardWorkerRequest|ReplayReceiptRequest;
type Response=FastForwardWorkerResponse|ReplayReceiptResponse;
const scope = globalThis as unknown as {
  postMessage(message:Response):void;
  addEventListener(event:'message',listener:(message:MessageEvent<Request>)=>void):void;
};
const receiveAdvance = createFastForwardWorkerController({
  post:(message)=>scope.postMessage(message),
  schedule:(callback)=>setTimeout(callback,0),
  cancelSchedule:(handle)=>clearTimeout(handle as ReturnType<typeof setTimeout>),
});
let lane:'advance'|'replay'|undefined;
scope.addEventListener('message', ({ data }) => {
  if(!data||typeof data!=='object')return;
  if(data.type==='verify_replay'){
    if(lane)return;
    const reportSource=data.source?.kind==='branch'&&/^(?:main|branch-[1-9]\d*)$/.test(data.source.branchId)&&
      Number.isSafeInteger(data.source.tick) ? {kind:'branch' as const,branchId:data.source.branchId,tick:data.source.tick} :
      data.source?.kind==='fixture'&&(data.source.fixtureId==='short48'||data.source.fixtureId==='long526') ?
        {kind:'fixture' as const,fixtureId:data.source.fixtureId} : undefined;
    if(!reportSource||typeof data.runId!=='string')return;
    lane='replay';
    const ruleVersion=typeof __SECT_UTILITY_RULE_VERSION__==='string'?__SECT_UTILITY_RULE_VERSION__:undefined;
    // Ordinary fast-forward does not load the strict save verifier; only explicit QA needs it.
    void import('./replayReceiptEngine').then(({ verifyReplayReceipt })=>
      verifyReplayReceipt(data,{ruleVersion,timingScope:'browser_worker'})).then((response)=>scope.postMessage(response))
      .catch(()=>scope.postMessage({type:'replay_receipt',runId:data.runId,source:reportSource,
        outcome:{status:'unavailable',reason:'execution'}}));
    return;
  }
  if(lane==='replay')return;
  lane='advance';
  receiveAdvance(data);
});
