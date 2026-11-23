import {useRef, type MutableRefObject} from 'react';
import type {SectPlayerChatPrepared} from '../engine/sectPlayerChat';
import type {WorldTimeline} from '../engine/timelineEngine';
import type {SectPlayerChatDraft} from '../types/sectPlayerChat';
import type {LLMConfig, WorldState} from '../types/world';

interface PostingBinding {
  readonly frame:WorldState;
  readonly branch:string;
  readonly revision:number;
  readonly draft:SectPlayerChatDraft;
  readonly intentId?:string;
  readonly previewBytes:string;
}
interface PostingController {
  readonly authority:{readonly current:WorldState};
  readonly history:{readonly current:WorldTimeline};
  readonly revision:{readonly current:number};
  readonly browsing:{readonly current:boolean};
  readonly config:LLMConfig;
  readonly abort:MutableRefObject<AbortController|undefined>;
  readonly safe:()=>boolean;
  readonly begin:()=>boolean;
  readonly end:()=>void;
  readonly commit:(expected:WorldState,next:WorldState)=>boolean;
}

/** Links a player's explicit preview to one current managed world and one lawful rule quote. */
export function useSectPlayerPosting(controller:PostingController){
  const pending=useRef(new WeakMap<SectPlayerChatPrepared,PostingBinding>());
  const {authority,history,revision,browsing,config,abort,safe,begin,end,commit}=controller;
  const current=(frame:WorldState,branch:string,version:number):boolean=>authority.current===frame&&!browsing.current&&
    history.current.activeBranchId===branch&&revision.current===version;
  const prepare=async(frame:WorldState,draft:SectPlayerChatDraft,useModel=false):Promise<SectPlayerChatPrepared|undefined>=>{
    const branch=history.current.activeBranchId,version=revision.current;
    if(!safe()||!current(frame,branch,version))return;
    const input=structuredClone(draft);
    const lease=new AbortController();
    abort.current?.abort();abort.current=lease;
    const stillCurrent=()=>!lease.signal.aborted&&abort.current===lease&&safe()&&current(frame,branch,version);
    try{
      const {prepareSectPlayerChat}=await import('../engine/sectPlayerChat');
      if(!stillCurrent())return;
      const local=prepareSectPlayerChat(frame,input);
      if(!local)return;
      let intentId:string|undefined;
      if(useModel&&input.roomId==='jiuzhou'&&input.body.kind==='free'&&config.sectChatEnabled){
        const {requestSectPlayerChatIntent}=await import('../engine/sectPlayerChatProvider');
        if(!stillCurrent())return;
        intentId=await requestSectPlayerChatIntent(frame,input,config,lease.signal);
      }
      if(!stillCurrent())return;
      const preview=(intentId?prepareSectPlayerChat(frame,input,intentId):undefined)??local;
      if(preview===local)intentId=undefined;
      pending.current.set(preview,{frame,branch,revision:version,draft:input,intentId,previewBytes:JSON.stringify(preview)});
      return preview;
    }catch{return;}
    finally{if(abort.current===lease)abort.current=undefined;}
  };
  const send=async(frame:WorldState,preview:SectPlayerChatPrepared):Promise<boolean>=>{
    const binding=pending.current.get(preview);
    if(!binding||binding.frame!==frame||binding.previewBytes!==JSON.stringify(preview)||
      !safe()||!current(frame,binding.branch,binding.revision)||!begin())return false;
    pending.current.delete(preview);
    try{
      const rules=await import('../engine/sectPlayerChat');
      if(!current(frame,binding.branch,binding.revision)||JSON.stringify(rules.prepareSectPlayerChat(frame,binding.draft,binding.intentId))!==binding.previewBytes)
        return false;
      const next=rules.applySectPlayerChat(frame,binding.draft,binding.intentId);
      return next!==frame&&commit(frame,next);
    }catch{return false;}
    finally{end();}
  };
  return {prepare,send};
}
