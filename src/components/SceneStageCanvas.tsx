import {useEffect,useRef} from 'react';
import type {SceneStageFrame} from './sceneStageModel';
import {drawSceneStage} from './sceneStageRenderer';

const MAX_WIDTH=960,MAX_HEIGHT=540,FRAME_INTERVAL=1000/12,ANIMATION_BUDGET=4000;

/** Illustration only: canvas never owns focus, pointer input, time progression or scene authority. */
export function SceneStageCanvas({frame}:{frame:SceneStageFrame}){
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const element=canvas.current,win=element?.ownerDocument.defaultView;
    if(!element||!win)return;
    let ctx:CanvasRenderingContext2D|null;
    try {ctx=element.getContext('2d');} catch {return;}
    if(!ctx)return;
    const prefers=win.matchMedia?.('(prefers-reduced-motion: reduce)');
    const doc=element.ownerDocument;
    let raf=0,width=0,height=0,last=0,started=0,intersecting=true;
    const stop=()=>{if(raf){win.cancelAnimationFrame(raf);raf=0;}};
    const staticOnly=()=>frame.historical||prefers?.matches||doc.hidden||!intersecting;
    const paint=(time:number)=>{
      if(!width||!height)return;
      ctx.setTransform(element.width/width,0,0,element.height/height,0,0);
      drawSceneStage(ctx,frame,width,height,time);
    };
    const animate=(now:number)=>{
      raf=0;
      if(staticOnly())return;
      if(!started)started=now;
      if(now-started>=ANIMATION_BUDGET){paint(0);return;}
      if(now-last>=FRAME_INTERVAL){last=now;paint(now-started);}
      raf=win.requestAnimationFrame(animate);
    };
    const refresh=()=>{
      stop();last=0;started=0;
      const bounds=element.getBoundingClientRect();
      const cssWidth=bounds.width||element.clientWidth,cssHeight=bounds.height||element.clientHeight;
      if(!(cssWidth>0&&cssHeight>0))return;
      width=Math.max(1,Math.round(Math.min(MAX_WIDTH,cssWidth)));
      height=Math.max(1,Math.round(Math.min(MAX_HEIGHT,cssHeight)));
      const dpr=Math.min(2,Math.max(1,win.devicePixelRatio||1));
      const pixelsWide=Math.round(width*dpr),pixelsHigh=Math.round(height*dpr);
      if(element.width!==pixelsWide)element.width=pixelsWide;
      if(element.height!==pixelsHigh)element.height=pixelsHigh;
      paint(0);
      if(!staticOnly()&&typeof win.requestAnimationFrame==='function')raf=win.requestAnimationFrame(animate);
    };
    const resize=typeof ResizeObserver==='function'?new ResizeObserver(refresh):undefined;
    const visibility=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
      const visible=entries.find(entry=>entry.target===element)?.isIntersecting;
      if(visible===undefined||visible===intersecting)return;
      intersecting=visible;
      refresh();
    }):undefined;
    resize?.observe(element);visibility?.observe(element);
    win.addEventListener('resize',refresh);doc.addEventListener('visibilitychange',refresh);
    prefers?.addEventListener?.('change',refresh);
    refresh();
    return ()=>{
      stop();resize?.disconnect();visibility?.disconnect();
      win.removeEventListener('resize',refresh);doc.removeEventListener('visibilitychange',refresh);
      prefers?.removeEventListener?.('change',refresh);
    };
  },[frame]);
  return <figure className="relative isolate m-0 aspect-video w-full min-w-0 overflow-hidden rounded-xl border border-emerald-300/25 bg-[#1c3e44] shadow-inner">
    <canvas ref={canvas} aria-hidden="true" width={640} height={360} data-scene-stage
      className="pointer-events-none absolute inset-0 block size-full"/>
    {frame.siteName&&<figcaption className="absolute bottom-2 left-2 max-w-[calc(100%_-_1rem)] break-words rounded bg-slate-950/80 px-2 py-1 text-xs font-medium text-amber-50">
      {frame.establishing?'开篇人物 · 身在':''}{frame.siteName}
    </figcaption>}
  </figure>;
}
