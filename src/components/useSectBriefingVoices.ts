import {useEffect,useRef,useState} from 'react';
import type {LLMConfig} from '../types/world';
import type {SectBriefingLine,SectBriefingSlot} from '../engine/sectBriefingModel';

export function useSectBriefingVoices(slots:readonly SectBriefingSlot[],tick:number,config?:LLMConfig){
  const available=!!config?.apiKey.trim()&&config.sectReportsEnabled!==false;
  const signature=config&&available?JSON.stringify([tick,slots,config.apiBaseUrl,config.model]):'';
  const requested=useRef<{
    signature:string;config:LLMConfig;promise:Promise<ReadonlyMap<string,SectBriefingLine>|undefined>;aborter:AbortController;
  }>();
  const [accepted,setAccepted]=useState<{
    signature:string;config:LLMConfig;copy:ReadonlyMap<string,SectBriefingLine>;
  }>();
  useEffect(()=>{
    if(!signature||!config||!slots.length){requested.current?.aborter.abort();requested.current=undefined;return;}
    const controller=new AbortController();
    const promise=import('../engine/sectBriefingModel').then(({requestSectBriefing})=>
      requestSectBriefing(slots,tick,config,controller.signal));
    const request={signature,config,promise,aborter:controller};
    requested.current=request;
    void promise.then(copy=>{
      if(copy&&requested.current===request&&!controller.signal.aborted)setAccepted({signature,config,copy});
    }).catch(()=>{});
    return ()=>controller.abort();
    // Signature includes every canon fact, while credentials/config live in memory only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[signature,config]);
  return signature&&accepted?.signature===signature&&accepted.config===config?accepted.copy:undefined;
}
