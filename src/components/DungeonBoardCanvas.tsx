import {useEffect,useRef} from 'react';
import type {DungeonBoardFrame} from './dungeonBoardModel';
import {drawDungeonBoard} from './dungeonBoardRenderer';

export function DungeonBoardCanvas({frame,active=true}:{frame:DungeonBoardFrame;active?:boolean}){
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const element=canvas.current,view=element?.ownerDocument.defaultView;
    if(!active||!element||!view)return;
    let context:CanvasRenderingContext2D|null;
    try{context=element.getContext('2d');}catch{return;}
    if(!context)return;
    const pen=context;
    const update=()=>{
      const {width,height}=element.getBoundingClientRect();
      if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return;
      const logicalWidth=Math.max(1,Math.round(Math.min(960,width)));
      const logicalHeight=Math.max(1,Math.round(Math.min(540,height)));
      const ratio=Number.isFinite(view.devicePixelRatio)?Math.max(1,Math.min(2,view.devicePixelRatio)):1;
      const pixelsWide=Math.round(logicalWidth*ratio),pixelsHigh=Math.round(logicalHeight*ratio);
      if(element.width!==pixelsWide)element.width=pixelsWide;
      if(element.height!==pixelsHigh)element.height=pixelsHigh;
      pen.setTransform(pixelsWide/logicalWidth,0,0,pixelsHigh/logicalHeight,0,0);
      drawDungeonBoard(pen,frame,logicalWidth,logicalHeight);
    };
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(update):undefined;
    observer?.observe(element);
    view.addEventListener('resize',update);
    update();
    return ()=>{observer?.disconnect();view.removeEventListener('resize',update);};
  },[frame,active]);

  return <figure data-dungeon-board="" className="m-0 min-w-0 space-y-1.5 overflow-hidden rounded-lg border border-cyan-300/25 bg-slate-950/70">
    <div className="relative aspect-[640/285] w-full overflow-hidden bg-[#1c2c36]">
      <canvas ref={canvas} width={640} height={285} aria-hidden="true" className="absolute inset-0 block size-full"/>
    </div>
    <figcaption className="min-w-0 space-y-1 px-2 pb-2 text-xs text-slate-200">
      <span className="font-semibold text-cyan-100">{frame.historical?'旧录 · 行过之处':frame.entrance?'秘境入口，尚未踏足':'秘境行路图'}</span>
      {!frame.entrance&&<ol aria-label="秘境行路" className="grid min-w-0 grid-cols-3 gap-1">
        {frame.rooms.map(room=><li key={room.id} aria-current={room.state==='current'?'location':undefined}
          className={`min-w-0 space-y-0.5 rounded border px-1.5 py-1 text-center [overflow-wrap:anywhere] ${room.state==='current'
            ?'border-cyan-300/60 bg-cyan-950/65 text-cyan-100':'border-slate-800 text-slate-300'}`}>
          <p className="font-semibold">{room.state==='hidden'?'未踏足':room.label}</p>
          {room.state!=='hidden'&&<p>{room.state==='current'?'身在此处':'曾抵达'}</p>}
        </li>)}
      </ol>}
      {frame.treasure&&<p>{{
        sealed:'宝匣仍封。',claimable:'妖王已伏倒，宝物尚须亲取。',claimed:'已见取宝实录。',
      }[frame.treasure]}</p>}
    </figcaption>
  </figure>;
}
