import {useEffect,useRef,useState} from 'react';
import {encodeEraDesignDraft,type EraDesignDraft} from '../engine/eraDesignSchema';
import {availableAvatarHosts} from '../engine/avatarEngine';
import type {AuthoredEraWorkerRequest,AuthoredEraWorkerResponse,AuthoredEraBuildProgress}
  from '../engine/authoredEraBuildEngine';
import type {WorldState} from '../types/world';
import type {WorldTimeline} from '../engine/timelineEngine';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const hashPattern=/^[a-f0-9]{64}$/u;
const bytesOf=(str:string)=>new TextEncoder().encode(str);
async function exactHash(bytes:Uint8Array):Promise<string>{
  const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
}
export interface AuthoredLaunchContext {
  world:WorldState;
  timeline:WorldTimeline;
  scopeKey:string;
  disabled:boolean;
  unavailable?:string;
  isCurrent:()=>boolean;
  commit:(world:WorldState)=>boolean;
}
interface Run {
  id:string;
  worker:Worker;
  normalized:string;
  context:AuthoredLaunchContext;
}
interface Prepared {
  run:Run;
  world:WorldState;
}
const errorMessages={
  draft:'草案未通过严格检查，原世界未动。',range:'目标超出这版从创世可实际推进的范围，原世界未动。',
  rules:'当前浏览器不能校验规则或内容，未建立分支。',constraints:'实际生成的未来不满足此草案；请查看原因或修改草案。',
  codec:'候选未能通过原生存档核对，未建立分支。',integrity:'候选、草案或规则的校验不符，未建立分支。',
  execution:'未能完成本机离线推演；原世界未动。',
} as const;
const summary=(run:Run,world:WorldState)=>{
  const source=world.authoredEraOrigin;
  if(!source)throw Error('候选缺少明记的作者来源。');
  const loc=(id:string)=>world.locations.find(place=>place.id===id)?.name??'地点无法复核';
  const sect=(id:string)=>world.sects.find(group=>group.id===id)?.name;
  const effects=source.effects.map(effect=>{
    switch(effect.kind){
      case 'jade_vein_depleted':return {label:loc(effect.siteId),change:`灵气 ${effect.before.spiritQi} → ${effect.after.spiritQi}，灵叶承载 ${effect.before.jadeCapacity} → ${effect.after.jadeCapacity}。`};
      case 'danxia_branch_moves_north':return {label:sect(effect.branchSectId)??'丹霞北迁一支',
        change:`以作者设定在${loc(effect.destinationId)}开局；${effect.memberIds.length} 名实际在世成员，实有 ${effect.branchStones} 灵石另账，未替人签旧约。`};
      case 'village_capacity':return {label:loc(effect.siteId),change:`村落承载 ${effect.capacityBefore} → ${effect.capacityAfter}；原有 ${effect.population} 名居民不动。`};
    }
  });
  const willingHosts=availableAvatarHosts(world);
  const assigned=new Set(source.effects.flatMap(effect=>effect.kind==='danxia_branch_moves_north'?effect.memberIds:[]));
  const useful=[...willingHosts].sort((a,b)=>Number(assigned.has(b.id))-Number(assigned.has(a.id))||
    (a.id<b.id?-1:a.id>b.id?1:0));
  return {receiptKey:run.id,year:world.year,month:world.month,tick:world.tick,baselineMonths:world.tick-1,
    livingCount:world.cultivators.filter(person=>person.alive&&person.hp>0).length,effects,
    candidates:useful.slice(0,6).map(person=>({name:person.name,siteName:loc(person.locationId),sectName:sect(person.sectId)})),
    totalCandidates:willingHosts.length};
};
type Summary=ReturnType<typeof summary>;
type LaunchState=
  | {phase:'idle'}
  | {phase:'preparing';progress?:AuthoredEraBuildProgress}
  | {phase:'failed';message:string;details?:readonly string[]}
  | {phase:'prepared';summary:Summary};

export function useAuthoredEraLaunch(context:AuthoredLaunchContext) {
  const [state,setState]=useState<LaunchState>({phase:'idle'});
  const active=useRef<Run>();
  const prepared=useRef<Prepared>();
  const serial=useRef(0);
  const cancel=()=>{
    active.current?.worker.terminate();
    active.current=undefined;
    prepared.current=undefined;
    setState({phase:'idle'});
  };
  useEffect(()=>{
    return ()=>{
      active.current?.worker.terminate();
      active.current=undefined;
      prepared.current=undefined;
    };
  },[context.world,context.timeline,context.scopeKey,context.disabled]);
  useEffect(()=>{
    setState(previous=>previous.phase==='idle'?previous:{phase:'idle'});
  },[context.world,context.timeline,context.scopeKey,context.disabled]);
  const onPrepare=(draft:EraDesignDraft)=>{
    if(context.disabled||!context.isCurrent())return;
    cancel();
    let run:Run|undefined;
    try {
      const normalized=encodeEraDesignDraft(draft);
      const worker=new Worker(new URL('../engine/authoredEra.worker.ts',import.meta.url),{type:'module'});
      const id=`authored-${++serial.current}`;
      run={id,worker,normalized,context};
      active.current=run;
      setState({phase:'preparing'});
      const exact=run;
      let verifying=false;
      worker.onmessage=(ev:MessageEvent<AuthoredEraWorkerResponse>)=>{
        const message=ev.data;
        if(verifying||active.current!==exact||message.runId!==exact.id||!exact.context.isCurrent())return;
        if(message.type==='authored_era_progress'){
          setState({phase:'preparing',progress:message.progress});return;
        }
        if(message.type==='authored_era_cancelled'){cancel();return;}
        if(message.type==='authored_era_error'){
          active.current=undefined;worker.terminate();
          setState({phase:'failed',message:errorMessages[message.reason]??errorMessages.execution,
            details:message.issues?.map(issue=>issue.conditionIndex===undefined?
              '实际未来未满足原生资格或账务要求。':`第 ${issue.conditionIndex+1} 项未通过实际未来校验。`)});
          return;
        }
        if(message.type!=='authored_era_ready')return;
        verifying=true;
        worker.terminate();
        void (async()=>{
          try {
            const ready=message.candidate;
            const storage=await import('../engine/storageEngine');
            const encoded=bytesOf(ready.resultText);
            if(exact.normalized!==ready.normalizedDraft||ready.ruleVersion!==__SECT_UTILITY_RULE_VERSION__||
              encoded.byteLength!==ready.resultBytes||encoded.byteLength>storage.ERA_WORLD_SAVE_MAX_BYTES||
              !hashPattern.test(ready.baselineSha256)||!hashPattern.test(ready.draftSha256)||!hashPattern.test(ready.resultSha256)||
              await exactHash(bytesOf(exact.normalized))!==ready.draftSha256||await exactHash(encoded)!==ready.resultSha256)throw Error('hash');
            const output=storage.decodeEraWorldSave(ready.resultText);
            const origin=output.authoredEraOrigin;
            if(storage.encodeEraWorldSave(output)!==ready.resultText||!origin||
              origin.designDigest!==ready.draftSha256||origin.baselineDigest!==ready.baselineSha256||
              origin.rulesRevision!==ready.ruleVersion||encodeEraDesignDraft(origin.draft)!==exact.normalized||
              output.tick!==ready.target.tick||output.year!==ready.target.year||output.month!==ready.target.month||
              origin.openedTick!==output.tick||output.year!==draft.target.year||output.month!==draft.target.month)throw Error('codec');
            if(active.current!==exact||!exact.context.isCurrent())return;
            const display=summary(exact,output);
            active.current=undefined;
            prepared.current={run:exact,world:output};
            setState({phase:'prepared',summary:display});
          } catch {
            if(active.current!==exact)return;
            active.current=undefined;
            setState({phase:'failed',message:errorMessages.integrity});
          }
        })();
      };
      worker.onerror=()=>{
        if(active.current!==exact)return;
        active.current=undefined;worker.terminate();setState({phase:'failed',message:errorMessages.execution});
      };
      const request:AuthoredEraWorkerRequest={type:'authored_era_start',runId:id,draft};
      worker.postMessage(request);
    }catch{
      run?.worker.terminate();active.current=undefined;setState({phase:'failed',message:errorMessages.execution});
    }
  };
  const onCreate=(receiptKey:string)=>{
    const result=prepared.current;
    if(!result||result.run.id!==receiptKey||!result.run.context.isCurrent())return false;
    prepared.current=undefined;
    if(!result.run.context.commit(result.world)){
      setState({phase:'failed',message:'当前分支已改变或没有分支位，原世界未动。'});return false;
    }
    setState({phase:'idle'});
    return true;
  };
  return {scopeKey:context.scopeKey,disabled:context.disabled,unavailable:context.unavailable,state,onPrepare,onCancel:cancel,onCreate};
}
