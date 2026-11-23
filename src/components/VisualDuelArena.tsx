import {useEffect,useId,useRef,useState} from 'react';
import {CultivatorPortrait} from './CultivatorPortrait';
import {drawVisualDuelArena} from './visualDuelArenaRenderer';
import type {VisualDuelArenaFrame} from './visualDuelArenaModel';

const DUR=1150,STEP=1000/15;
const titles={duel:'生死交锋',tournament:'演武交锋',dungeon:'禁地斗法'} as const;
type Fighter=VisualDuelArenaFrame['left'];

function Gauge({label,value}:{label:string;value:Fighter['hp']}){
  if(!value||!Number.isFinite(value.value)||!Number.isFinite(value.max)||value.max<=0)return null;
  const amount=Math.max(0,Math.min(value.value,value.max));
  return <div className="min-w-0 space-y-0.5">
    <p className="text-[11px] text-stone-200">{label} {amount} / {value.max}</p>
    <meter aria-label={label} min={0} max={value.max} value={amount}
      className={`block h-2 w-full ${label==='气血'?'accent-rose-300':'accent-cyan-300'}`}/>
  </div>;
}
function FighterRead({fighter}:{fighter:Fighter}){
  return <section aria-label={fighter.name} className="min-w-0 space-y-1 rounded-md border border-amber-100/20 bg-stone-950/80 p-2">
    {fighter.sprite&&<CultivatorPortrait portrait={fighter.sprite.appearance} presentation="stage" className="mx-auto h-auto w-full max-w-24"/>}
    {fighter.boss&&!fighter.sprite&&<svg aria-hidden="true" focusable="false" viewBox="0 0 120 136" className="mx-auto w-full max-w-24 rounded-lg bg-[#35304e]">
      <path d="m18 72 8-30 10 10 9-30 13 19 15-19 11 29 12-10 7 31-10 29 16 20H9l16-24Z" fill="#926987" stroke="#e8ac90" strokeWidth="2"/>
      <path d="m35 66 17 8-10 7Zm51 0-17 8 10 7Z" fill="#ffd391"/>
      <path d="m51 91 9 6 9-6-9 11Z" fill="#32253c"/>
    </svg>}
    <p className="font-serif font-semibold text-amber-50 [overflow-wrap:anywhere]">{fighter.name}</p>
    {fighter.realm&&<p className="text-xs text-amber-100">{fighter.realm}</p>}
    <Gauge label="气血" value={fighter.hp}/><Gauge label="真气" value={fighter.qi}/>
  </section>;
}

/** One original contact shown on demand. Nothing in this view advances or rewrites the world. */
export function VisualDuelArena({frame}:{frame:VisualDuelArenaFrame}){
  return <DuelFrame key={frame.key} frame={frame}/>;
}

function DuelFrame({frame}:{frame:VisualDuelArenaFrame}){
  const title=useId();
  const canvas=useRef<HTMLCanvasElement>(null);
  const replay=useRef<()=>void>();
  const [canReplay,setCanReplay]=useState(false),[playing,setPlaying]=useState(false);
  const meaningful=!frame.historical&&(frame.damages.length>0||frame.outcome!==undefined);
  useEffect(()=>{
    setPlaying(false);setCanReplay(false);
    const el=canvas.current,win=el?.ownerDocument.defaultView;
    if(!el||!win)return;
    let ctx:CanvasRenderingContext2D|null;
    try{ctx=el.getContext('2d');}catch{return;}
    if(!ctx)return;
    const doc=el.ownerDocument,motion=win.matchMedia?.('(prefers-reduced-motion: reduce)');
    let raf=0,width=0,height=0,started:number|undefined,last=-Infinity;
    const allowed=()=>meaningful&&!motion?.matches&&!doc.hidden&&typeof win.requestAnimationFrame==='function';
    const paint=(phase?:number)=>{
      if(!width||!height)return;
      ctx.setTransform(el.width/width,0,0,el.height/height,0,0);
      drawVisualDuelArena(ctx,frame,width,height,phase);
    };
    const stop=()=>{
      if(raf)win.cancelAnimationFrame(raf);
      raf=0;started=undefined;last=-Infinity;
    };
    const tick=(now:number)=>{
      raf=0;
      if(!allowed()){stop();paint();setPlaying(false);return;}
      started??=now;
      const elapsed=now-started;
      if(elapsed>=DUR){stop();paint();setPlaying(false);return;}
      if(now-last>=STEP){paint(elapsed/DUR);last=now;}
      raf=win.requestAnimationFrame(tick);
    };
    const update=()=>{
      const bounds=el.getBoundingClientRect();
      width=Math.round(Math.min(960,bounds.width));
      height=Math.round(Math.min(540,bounds.height));
      if(width>0&&height>0){
        const dpr=Math.min(2,Math.max(1,win.devicePixelRatio||1));
        const pixelsWide=Math.round(width*dpr),pixelsHigh=Math.round(height*dpr);
        if(el.width!==pixelsWide)el.width=pixelsWide;
        if(el.height!==pixelsHigh)el.height=pixelsHigh;
      }
      if(!allowed()){stop();setPlaying(false);}
      if(!raf)paint();
      setCanReplay(allowed()&&width>0&&height>0);
    };
    replay.current=()=>{
      if(raf||!allowed()||width<=0||height<=0)return;
      setPlaying(true);raf=win.requestAnimationFrame(tick);
    };
    const resize=typeof ResizeObserver==='function'?new ResizeObserver(update):undefined;
    resize?.observe(el);win.addEventListener('resize',update);doc.addEventListener('visibilitychange',update);
    motion?.addEventListener?.('change',update);update();
    return ()=>{
      replay.current=undefined;stop();resize?.disconnect();
      win.removeEventListener('resize',update);doc.removeEventListener('visibilitychange',update);
      motion?.removeEventListener?.('change',update);
    };
  },[frame,meaningful]);
  const winner=frame.outcome==='left'?frame.left:frame.outcome==='right'?frame.right:undefined;
  return <section data-visual-duel-arena="" aria-labelledby={title}
    className="min-w-0 space-y-2 rounded-lg border border-amber-400/30 bg-[#272032] p-2.5 [container-type:inline-size]">
    <div className="flex flex-wrap items-baseline gap-x-2">
      <h3 id={title} className="font-serif font-semibold text-amber-50">{frame.kind==='duel'&&!meaningful&&frame.outcome===undefined&&!frame.damages.length?'交手将起':titles[frame.kind]}</h3>
      <p className="text-xs text-amber-100 [overflow-wrap:anywhere]">{frame.siteName}{frame.historical&&' · 旧录'}</p>
    </div>
    <div className="grid min-w-0 grid-cols-2 items-start gap-2 [@container(min-width:34rem)]:grid-cols-[minmax(5rem,1fr)_minmax(0,3fr)_minmax(5rem,1fr)]">
      <FighterRead fighter={frame.left}/>
      <figure className="relative order-last col-span-2 m-0 aspect-video w-full overflow-hidden rounded-lg bg-[#34364d] [@container(min-width:34rem)]:order-none [@container(min-width:34rem)]:col-span-1">
        <canvas ref={canvas} width={640} height={360} aria-hidden="true" className="absolute inset-0 block size-full"/>
      </figure>
      <FighterRead fighter={frame.right}/>
    </div>
    {(winner||frame.damages.length>0)&&<ul aria-label="此番交锋实录" className="space-y-0.5 text-sm text-stone-200">
      {frame.damages.map(({target,amount})=><li key={target}>{frame[target].name}实损 {amount} 气血。</li>)}
      {winner&&<li className="font-semibold text-amber-100">{winner.name}{frame.kind==='dungeon'?'得手。':'胜出。'}</li>}
    </ul>}
    {canReplay&&<button type="button" disabled={playing} onClick={()=>replay.current?.()}
      className="min-h-11 rounded-md border border-amber-300/50 bg-stone-950/65 px-3 py-2 text-sm text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200 disabled:opacity-60">
      {playing?'演示交锋中…':'重看此番交锋'}
    </button>}
  </section>;
}
