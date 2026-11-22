import type {WorldState} from '../types/world';

/** The caller supplies its current canonical frame and view epoch, not a saved button's values. */
export interface SceneFrame {
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly viewerId:string;
  readonly sceneId:string;
  readonly scopeEpoch:number;
  readonly live:boolean;
  readonly focused:boolean;
}

const quoteBrand:unique symbol=Symbol('sceneFrameQuote');
const tokenBrand:unique symbol=Symbol('sceneFrameToken');
export interface SceneFrameQuote {readonly [quoteBrand]:true}
export interface SceneFrameToken {readonly [tokenBrand]:true}
const matches=(a:SceneFrame,b:SceneFrame)=>a.world===b.world&&a.branchId===b.branchId&&a.revision===b.revision&&
  a.viewerId===b.viewerId&&a.sceneId===b.sceneId&&a.scopeEpoch===b.scopeEpoch&&b.live&&b.focused;
const key=(frame:SceneFrame)=>JSON.stringify([frame.branchId,frame.revision,frame.viewerId,frame.sceneId]);

/**
 * A passive view may issue a quote but cannot submit for it later unless that exact scope
 * is live, focused and unspent. An attempted live turn consumes the quote synchronously;
 * settling, losing focus or reopening the surface does not authorize a retry.
 */
export function createSceneFrameLease(){
  const issued=new WeakMap<SceneFrameQuote,{frame:SceneFrame;epoch:number}>();
  const spent=new WeakMap<WorldState,Set<string>>();
  let epoch=0;
  let held:{token:SceneFrameToken;frame:SceneFrame;epoch:number}|undefined;
  return {
    quote(frame:SceneFrame):SceneFrameQuote|undefined{
      if(!frame.live||!frame.focused||spent.get(frame.world)?.has(key(frame)))return;
      const quote:SceneFrameQuote=Object.freeze({[quoteBrand]:true as const});
      issued.set(quote,{frame:Object.freeze({...frame}),epoch});
      return quote;
    },
    reserve(quote:SceneFrameQuote|undefined,current:SceneFrame|undefined):SceneFrameToken|undefined{
      if(!quote||!current||held)return;
      const named=issued.get(quote);
      if(!named||named.epoch!==epoch||!matches(named.frame,current))return;
      const id=key(current);
      const tied=spent.get(current.world)??new Set<string>();
      if(tied.has(id))return;
      tied.add(id);
      spent.set(current.world,tied);
      const token:SceneFrameToken=Object.freeze({[tokenBrand]:true as const});
      held={token,frame:named.frame,epoch};
      return token;
    },
    finish(token:SceneFrameToken,current?:SceneFrame):boolean{
      const prior=held;
      if(!prior||prior.token!==token)return false;
      held=undefined;
      return !!current&&prior.epoch===epoch&&matches(prior.frame,current);
    },
    invalidate():void{epoch++;},
  };
}
