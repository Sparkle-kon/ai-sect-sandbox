import {useRef} from 'react';
import {appendNorthWellRevisitFork} from '../engine/timelineEngine';
import type {TimelineSnapshot,WorldTimeline} from '../engine/timelineEngine';
import type {WorldState} from '../types/world';
import type {NorthWellRevisitAuthorControls} from './NorthWellRevisitPanel';

type Review=NonNullable<Awaited<ReturnType<NorthWellRevisitAuthorControls['onPrepare']>>>;
export interface NorthWellRevisitAuthorContext {
  world:WorldState;
  timeline:WorldTimeline;
  scopeKey:string;
  siteName:string;
  sourceCharterId:string;
  disabled:boolean;
  isCurrent:()=>boolean;
  commit:(next:WorldTimeline,preparedWorld:WorldState)=>boolean;
}

declare const __SECT_UTILITY_RULE_VERSION__: string;
export function useNorthWellRevisitAuthor(context:NorthWellRevisitAuthorContext):NorthWellRevisitAuthorControls{
  const prepared=useRef<{review:Review;source:WorldState;timeline:WorldTimeline;head:TimelineSnapshot;declared:WorldState}>();
  const serial=useRef(0);
  const latest=useRef(context);
  latest.current=context;
  const readHead=()=>context.timeline.branches.find(branch=>branch.id===context.timeline.activeBranchId)?.snapshots.at(-1);
  const current=(source:object)=>source===context.world&&source===latest.current.world&&
    latest.current.scopeKey===context.scopeKey&&!latest.current.disabled&&latest.current.isCurrent();
  return {scopeKey:context.scopeKey,revisionKey:context.world,disabled:context.disabled,
    async onPrepare(source){
      if(!current(source))return undefined;
      const request=++serial.current;
      prepared.current=undefined;
      const head=readHead();
      if(!head||head.tick!==context.world.tick)return undefined;
      try{
        const [{prepareEraCheckpoint,verifyEraCheckpoint},{encodeEraWorldSave,decodeEraWorldSave},{buildNorthWellRevisitAuthor}]=await Promise.all([
          import('../engine/eraCheckpointEngine'),import('../engine/storageEngine'),import('../engine/northWellRevisitLaw')]);
        if(!current(source)||request!==serial.current)return undefined;
        const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
        const packed=await prepareEraCheckpoint(head.world,{branchId:context.timeline.activeBranchId,label:'原生旧井当世'},
          codec,{engineRuleVersion:__SECT_UTILITY_RULE_VERSION__});
        const memory=(file:typeof packed.manifestFile)=>({name:file.name,size:file.bytes.byteLength,
          arrayBuffer:async()=>new Uint8Array(file.bytes).buffer});
        const verified=await verifyEraCheckpoint(memory(packed.manifestFile),packed.parts.map(memory),codec);
        const declared=await buildNorthWellRevisitAuthor(verified,context.sourceCharterId);
        const law=declared?.northWellRevisitLaw;
        if(!current(source)||request!==serial.current||!declared||!law)return undefined;
        const review:Review={proposalKey:law.id,date:{year:law.year,month:law.month},siteName:context.siteName,population:law.retainedPopulation};
        prepared.current={review,source:context.world,timeline:context.timeline,head,declared};
        return review;
      }catch{return undefined;}
    },
    onConfirm(review,source){
      const receipt=prepared.current;
      if(!receipt||receipt.review!==review||receipt.source!==source||receipt.timeline!==context.timeline||!current(source))return false;
      prepared.current=undefined;
      try{
        const next=appendNorthWellRevisitFork(receipt.timeline,receipt.timeline.activeBranchId,receipt.head,receipt.declared);
        return current(source)&&context.commit(next,receipt.declared);
      }catch{return false;}
    },
  };
}
