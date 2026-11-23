import {VisualDuelArena} from './VisualDuelArena';
import type {VisualDuelArenaFrame} from './visualDuelArenaModel';
import {useId,useRef,useState} from 'react';
import type {DungeonMove,DungeonOutcome,DungeonStep} from '../types/expeditionDungeon';
import type {ExpeditionDungeonView} from '../engine/expeditionDungeonEngine';

const rooms=['garden','hall','sanctum'] as const;
type Room=typeof rooms[number];
const roomLabels:Record<Room,string>={garden:'外围药园',hall:'核心古殿',sanctum:'传承禁地'};
const roomInk:Record<Room,string>={
  garden:'M12 25V11m0 5Q5 16 4 10q6-1 8 6m0 3q6-8 11-6-1 7-11 7M6 26h12',
  hall:'M3 14 12 7l9 7M6 15v9m6-9v9m6-9v9M4 25h16',
  sanctum:'M12 7 22 17 12 27 2 17Zm0 4v12m-6-6h12',
};
const choice='min-h-11 min-w-0 rounded-md border border-cyan-300/30 px-3 py-1.5 text-sm text-cyan-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50';

function DungeonMap({at,visited}:{at?:Room;visited:ReadonlySet<Room>}){
  return <ol aria-label="秘境行路" className="grid grid-cols-3 gap-1.5">
    {rooms.map(room=><li key={room} aria-current={at===room?'location':undefined}
      className={`min-w-0 rounded-md border px-1.5 py-1.5 text-center [overflow-wrap:anywhere] ${at===room
        ?'border-cyan-300/60 bg-cyan-950/65 text-cyan-100':'border-slate-800 bg-slate-950/60 text-slate-300'}`}>
      <svg viewBox="0 0 24 32" aria-hidden="true" focusable="false" className="mx-auto h-8 w-6">
        <path d={roomInk[room]} fill="none" stroke="currentColor" strokeWidth="1.05" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <p className="text-xs font-semibold">{roomLabels[room]}</p>
      <p className="text-[11px]">{at===room?'身在此处':visited.has(room)?'曾抵达':'未踏足'}</p>
    </li>)}
  </ol>;
}

type DungeonExpeditionOption=ExpeditionDungeonView['options'][number];
export interface DungeonExpeditionControls {
  busy?:boolean;
  guide?:(option:DungeonExpeditionOption)=>Promise<boolean>;
}
const moveText:Record<DungeonMove,string>={
  enter:'踏入秘境',gather:'采下一株灵叶',break_array:'破阵（耗 18 真气）',strike:'与护宝妖王交手',
  claim:'取传承之宝',retreat:'及时退出秘境',
};
const outcomeText:Record<DungeonOutcome,string>={
  claimed:'已有人取走传承，本场探索落定。',retreated:'探者已退出，未取得传承。',
  collapsed:'秘境已经崩塌，离开与伤势须看各人的实录。',lost:'秘境已经闭合，未见平安撤出的实录。',
};
const exitText={retreated:'自行退出',escaped:'赶在封门前脱出',collapse:'崩塌时受创',rescued:'已被救出',lost:'未见平安撤出'} as const;

function stepText(step:DungeonStep){
  switch(step.move){
    case 'enter':return '踏入药园。';
    case 'gather':return '采得一枚玉叶。';
    case 'break_array':return `实耗 ${step.qiPaid} 真气，打开古殿阵门。`;
    case 'strike':return `妖王气血 ${step.bossBefore} → ${step.bossAfter}${step.hpLost>0?`；本人实损 ${step.hpLost} 气血`:''}。`;
    case 'claim':return `取得传承法宝和 ${step.stones} 灵石。`;
    case 'retreat':return '循来路退出秘境。';
  }
}

export function DungeonExpeditionRead({view,viewerId,tick,named,controls,duel}:{
  view:ExpeditionDungeonView;viewerId:string;tick:number;named:(id:string)=>string;controls?:DungeonExpeditionControls;duel?:VisualDuelArenaFrame;
}){
  const titleId=useId();
  const [failed,setFailed]=useState(false);
  const [advancing,setAdvancing]=useState(false);
  const pendingRef=useRef(false);
  const mine=view.members.find(member=>member.actorId===viewerId);
  const inside=mine!==undefined&&mine.leftTick===undefined;
  const busy=!!controls?.busy||advancing;
  const visited=new Set<Room>();
  if(mine)visited.add('garden');
  if((inside&&view.room!=='garden')||view.steps.some(step=>step.actorId===viewerId&&(step.move==='strike'||step.move==='claim')))visited.add('hall');
  if((inside&&view.room==='sanctum')||view.steps.some(step=>step.actorId===viewerId&&step.move==='claim'))visited.add('sanctum');
  const onAdvance=async(option:DungeonExpeditionOption)=>{
    if(!controls?.guide||busy||pendingRef.current||!view.options.includes(option))return;
    pendingRef.current=true;
    setAdvancing(true);
    setFailed(false);
    try {setFailed(!await controls.guide(option));} catch {setFailed(true);}
    finally {pendingRef.current=false;setAdvancing(false);}
  };
  return <section aria-labelledby={titleId} className="min-w-0 space-y-3 rounded-xl border border-cyan-300/30 bg-gradient-to-b from-cyan-950/25 to-slate-950/75 p-3">
    <header>
      <p className="text-xs font-semibold tracking-wider text-cyan-300">秘境行路</p>
      <h4 id={titleId} className="font-serif text-base font-semibold text-cyan-50">
        {inside?roomLabels[view.room]:'古境三重门'}
      </h4>
      {!view.outcome&&<p className="mt-1 text-xs text-slate-300">距秘境关闭 {Math.max(0,view.expiresTick-tick)} 月。</p>}
    </header>
    <DungeonMap visited={visited} at={inside?view.room:undefined}/>
    {duel&&<VisualDuelArena frame={duel}/>}
    {!duel?.right.hp&&inside&&view.room!=='garden'&&<div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-cyan-100">
      <span>护宝妖王：{view.bossHp} / {view.bossMaxHp} 气血</span>
      <meter aria-label="护宝妖王气血" min={0} max={view.bossMaxHp} value={view.bossHp} className="h-2 w-24 accent-cyan-300"/>
    </div>}
    {view.outcome&&<p role="status" className="text-sm text-slate-200">{outcomeText[view.outcome]}</p>}
    {view.members.length>0&&<ul aria-label="此行探者" className="space-y-1 text-xs text-slate-300">
      {view.members.map(member=><li key={member.actorId} className="[overflow-wrap:anywhere]">
        {named(member.actorId)}{member.actorId===viewerId?'（本人）':''}{!view.outcome&&view.leaderId===member.actorId?' · 领路':''}：{member.exit?exitText[member.exit]:'仍在秘境'}
        {typeof member.hpLost==='number'&&member.hpLost>0?` · 实损 ${member.hpLost} 气血`:''}
      </li>)}
    </ul>}
    {view.steps.length>0&&<details className="rounded border border-slate-800 px-2">
      <summary className="min-h-11 cursor-pointer py-2 text-sm text-slate-200">查看此行实录</summary>
      <ol className="space-y-1 pb-2 text-xs text-slate-300">
        {view.steps.map(step=><li key={step.eventId} className="[overflow-wrap:anywhere]">{named(step.actorId)}：{stepText(step)}</li>)}
      </ol>
    </details>}
    {controls?.guide&&view.options.length>0&&<div aria-busy={busy} className="space-y-2">
      <p className="text-xs text-slate-300">{advancing?'正在继续此行…':'选一项，行过一月。'}</p>
      <div role="group" aria-label="此刻可行" className="flex flex-wrap gap-2">
        {view.options.map(option=><button type="button" key={option.dungeonMove} className={choice} disabled={busy}
          onClick={()=>void onAdvance(option)}>{moveText[option.dungeonMove]}</button>)}
      </div>
    </div>}
    {failed&&<p role="status" className="text-xs text-amber-200">此令未成。请核对此刻所在与余力。</p>}
  </section>;
}
