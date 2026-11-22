import {useMemo,useSyncExternalStore} from 'react';

const readServer=()=>false;

function narrowServerSafeMedia(minWidth:number){
  if(typeof window==='undefined'||typeof window.matchMedia!=='function'||!Number.isFinite(minWidth)||minWidth<0)return undefined;
  return window.matchMedia(`(min-width: ${minWidth}px)`);
}

/** One reusable width observer; the server never invents an available viewport. */
export function createViewportAtLeastStore(width:number){
  const media=narrowServerSafeMedia(width);
  return {
    read:()=>media?.matches??false,
    readServer,
    subscribe:(onChange:()=>void)=>{
      if(typeof media?.addEventListener==='function'){
        media.addEventListener('change',onChange);
        return ()=>media.removeEventListener?.('change',onChange);
      }
      media?.addListener?.(onChange);
      return ()=>media?.removeListener?.(onChange);
    },
  };
}

/** Subscribe to one threshold without reading layout on every resize pixel. */
export function useViewportAtLeast(width:number):boolean{
  const store=useMemo(()=>createViewportAtLeastStore(width),[width]);
  return useSyncExternalStore(store.subscribe,store.read,store.readServer);
}
