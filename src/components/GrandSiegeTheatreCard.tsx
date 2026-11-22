import {useEffect,useId,useRef,useState} from 'react';
import {Shield,Swords} from 'lucide-react';
import {GRAND_SIEGE_HERO_COSTS} from '../engine/grandSiegeTheatreEngine';
import type {projectGrandSiegeTheatres} from '../engine/grandSiegeTheatreEngine';
import type {GrandSiegeFighter,GrandSiegeHeroMove} from '../types/grandSiege';
import type {WorldState} from '../types/world';

export type GrandSiegeRead=ReturnType<typeof projectGrandSiegeTheatres>[number];
const words={
  'elder-rescue':{name:'太上长老援阵',hint:'以自身灵气托住将开之隙，为护山阵卸去一部分来势。'},
  'leader-last-stand':{name:'掌门亲守阵眼',hint:'亲守阵眼，以灵气和气血换阵势不至立刻崩开；不是舍命。'},
  hold:{name:'不另出手',hint:'你引导的人不付援阵代价，攻防照原势继续。'},
} satisfies Record<GrandSiegeHeroMove,{name:string;hint:string}>;
const action='min-h-12 w-full min-w-0 rounded-lg border border-amber-400/30 bg-slate-950/65 px-3 py-2 text-left text-sm text-amber-100 hover:bg-amber-950/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200 disabled:opacity-50';

function cost(qi:number,hp:number){
  return [qi>0?`${qi} 点灵气`:undefined,hp>0?`${hp} 点气血`:undefined].filter(Boolean).join('、')||'无额外代价';
}
function uniqueName(world:WorldState,id:string){
  const matches=world.cultivators.filter(row=>row.id===id);
  return matches.length===1?matches[0].name:undefined;
}
const ranks={'掌门':0,'太上长老':1,'真传弟子':2} as Partial<Record<NonNullable<GrandSiegeFighter['rank']>,number>>;
function roster(world:WorldState,rows:readonly GrandSiegeFighter[]){
  const sortable=rows.map(row=>({name:uniqueName(world,row.actorId),rank:row.rank}));
  const found=sortable.filter(({name})=>!!name).sort((a,b)=>
    (a.rank&&ranks[a.rank]!==undefined?ranks[a.rank]!:3)-(b.rank&&ranks[b.rank]!==undefined?ranks[b.rank]!:3));
  const names=found.slice(0,3).map(row=>row.rank?`${row.name}（${row.rank}）`:row.name).join('、');
  const remaining=rows.length-Math.min(3,found.length);
  return names?(remaining>0?`${names}等 ${rows.length} 人`:names):`${rows.length} 人`;
}

type Witness = NonNullable<GrandSiegeRead['witness']>;
type WitnessRound = Witness['rounds'][number];
interface WitnessFrame {
  readonly world:WorldState;
  readonly tick:number;
  readonly scope?:string;
  readonly actorId:string;
  readonly siegeId:string;
}
interface WitnessSelection {
  readonly frame:WitnessFrame;
  readonly sourceId?:string;
  readonly roundStamp?:string;
}

const stampRound = (row:WitnessRound) => JSON.stringify([
  row.sourceId,row.round,row.tick,row.year,row.month,row.side,row.wallBefore,row.wallAfter,row.wallMax,row.selfDamage,
  row.selfGuard&&[row.selfGuard.move,row.selfGuard.paidQi,row.selfGuard.paidHp,row.selfGuard.wallSaved],
]);
const sameWitnessFrame = (a:WitnessFrame,b:WitnessFrame) =>
  a.world===b.world&&a.tick===b.tick&&a.scope===b.scope&&a.actorId===b.actorId&&a.siegeId===b.siegeId;

/** Reject stale selected rounds without substituting a newer or merely public one. */
export function resolveSelectedSiegeWitnessRound(selection:WitnessSelection|undefined, frame:WitnessFrame, witness:Witness):WitnessRound|undefined{
  if(!selection?.sourceId||!sameWitnessFrame(selection.frame,frame)||
    witness.actorId!==frame.actorId||witness.siegeId!==frame.siegeId)return undefined;
  const matches=witness.rounds.filter(row=>row.sourceId===selection.sourceId);
  return matches.length===1&&stampRound(matches[0])===selection.roundStamp?matches[0]:undefined;
}

export function selectSiegeWitnessRound(frame:WitnessFrame,row?:WitnessRound):WitnessSelection {
  return {frame,sourceId:row?.sourceId,roundStamp:row&&stampRound(row)};
}

export function SiegeWitnessRoundReading({round}:{round:WitnessRound}){
  return <article aria-label="所选亲历战况" className="space-y-1.5 px-1 pb-1 font-serif leading-relaxed text-slate-200">
    <p>第 {round.round} 轮，你身在{round.side==='attacker'?'阵外':'阵内'}。</p>
    <p>亲见护山阵：{round.wallBefore} → {round.wallAfter}（上限 {round.wallMax}）</p>
    {round.selfDamage!==undefined&&round.selfDamage>0&&<p>这一轮，你实损 {round.selfDamage} 点气血。</p>}
    {round.selfGuard&&<p>你亲自援阵，实付 {cost(round.selfGuard.paidQi,round.selfGuard.paidHp)}，
      为原阵挡下 {round.selfGuard.wallSaved} 点阵损。</p>}
  </article>;
}

function SiegeWitnessReport({world,scope,witness}:{world:WorldState;scope?:string;witness:Witness}){
  const [selection,setSelection]=useState<WitnessSelection>();
  const button=useRef<HTMLButtonElement>(null);
  const field=useRef<HTMLSelectElement>(null);
  const reportId=useId();
  const frame:WitnessFrame={world,tick:world.tick,scope,actorId:witness.actorId,siegeId:witness.siegeId};
  const open=selection!==undefined&&sameWitnessFrame(selection.frame,frame);
  const chosen=resolveSelectedSiegeWitnessRound(selection,frame,witness);
  useEffect(()=>{
    setSelection(previous=>previous&&sameWitnessFrame(previous.frame,{world,tick:world.tick,scope,
      actorId:witness.actorId,siegeId:witness.siegeId})?previous:undefined);
  },[world,world.tick,scope,witness.actorId,witness.siegeId]);
  useEffect(()=>{if(open)field.current?.focus();},[open]);
  const close=()=>{setSelection(undefined);button.current?.focus();};
  return <section aria-label="亲历战报" className="min-w-0 border-t border-slate-800/80 pt-1">
    <button type="button" ref={button} aria-expanded={open} aria-controls={reportId} onClick={()=>open?close():setSelection({frame})}
      className="min-h-11 rounded px-2 text-left text-sm font-semibold text-teal-100 hover:bg-teal-950/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-200">
      亲历战报
    </button>
    <div id={reportId} hidden={!open} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();close();}}}
      className="min-w-0 space-y-2 px-1 text-sm">
      {open&&<>
        <label htmlFor={`${reportId}-round`} className="block text-xs text-slate-300">选一轮亲历</label>
        <select ref={field} id={`${reportId}-round`} value={chosen?String(witness.rounds.indexOf(chosen)):''}
          onChange={event=>{
            const value=event.currentTarget.value;
            const row=value===''?undefined:witness.rounds[Number(value)];
            setSelection(selectSiegeWitnessRound(frame,row));
          }}
          className="min-h-11 w-full max-w-full rounded border border-teal-300/30 bg-slate-950 px-2 text-teal-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-200">
          <option value="">请选择</option>
          {witness.rounds.map((row,index)=><option key={index} value={index}>第 {row.round} 轮 · 仙历 {row.year} 年 {row.month} 月</option>)}
        </select>
        {chosen&&<SiegeWitnessRoundReading round={chosen}/>}
      </>}
    </div>
  </section>;
}

interface Controls {
  busy:boolean;
  onChoose:(move:GrandSiegeHeroMove)=>boolean;
  onAdvance:()=>boolean;
}
export function GrandSiegeTheatreCard({world,view,siteName,controls,onContinue,witnessScopeKey}:{
  world:WorldState;view:GrandSiegeRead;siteName:string;controls?:Controls;onContinue?:()=>void;witnessScopeKey?:string;
}){
  const title=useId(),heading=useRef<HTMLHeadingElement>(null);
  const [notice,setNotice]=useState('');
  const round=view.round,terminal=view.terminal,clash=round?.clash,hero=round?.hero;
  const winner=clash&&uniqueName(world,clash.winnerId);
  const attacker=clash&&uniqueName(world,clash.attackerId),defender=clash&&uniqueName(world,clash.defenderId);
  const heroName=hero&&uniqueName(world,hero.actorId);
  const queued=view.queued;
  const witness=view.witness?.siegeId===view.siegeId&&view.witness.rounds.length>0?view.witness:undefined;
  const isFeatured=!!(controls||onContinue);
  const status=terminal?.status??(queued?'queued':controls?'choice':round?.round??view.status);
  useEffect(()=>{
    if(!isFeatured)return;
    setNotice('');
    heading.current?.focus({preventScroll:true});
    heading.current?.scrollIntoView?.({block:'nearest',behavior:'instant'});
  },[isFeatured,view.siegeId,status]);
  const invoke=(action:()=>boolean)=>{if(!controls?.busy&&!action())setNotice('此阵或时机已变，没有执行。');};
  return <section aria-labelledby={title} className="relative min-w-0 space-y-2.5 rounded-2xl border border-amber-400/30
    bg-gradient-to-br from-amber-950/65 via-slate-950 to-slate-950 p-3.5 text-slate-100 [overflow-wrap:anywhere] sm:p-5">
    <header className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs text-amber-200"><Swords size={15} aria-hidden="true" className="shrink-0"/>
        {siteName} · {view.attackerName}对阵{view.defenderName}
      </p>
      <h2 id={title} ref={heading} tabIndex={isFeatured?-1:undefined} className="font-serif text-xl font-semibold text-amber-50">山门阵前</h2>
    </header>
    {terminal?<p className="font-serif text-sm leading-relaxed text-slate-200">
      {!terminal.battlefield?'攻方已经撤去，此役未曾真正交手。':
        terminal.status==='victory'?'攻方打下了这一阵，随后撤兵。胜的是攻坚，不是占领山门。':
        terminal.status==='repelled'?'守方顶住了这次来攻，攻方已经退去。':'两边不再交兵，攻方已经撤去。'}
    </p>:round?<p className="font-serif text-sm leading-relaxed text-slate-200">人已到了山门。兵锋压来时，护山阵承下的力都写在这场交手里。</p>:
      <p className="font-serif text-sm leading-relaxed text-slate-200">{view.noPublicRound?'这处山门暂没有可核的公开战报。':
        view.arrivedTick!==undefined?'来军已到阵前，两边还未真正交手。':'两边已有动静，来军尚未抵达山门。'}</p>}
    {round&&<div className="min-w-0 space-y-1.5 rounded-lg border border-amber-400/20 bg-slate-950/60 p-2.5 text-sm text-slate-300">
      {witness&&<p className="text-xs font-semibold text-slate-300">公开战况</p>}
      <p className="text-amber-100">{round.tick===world.tick?'本月护山阵':'原轮护山阵'}：{round.wallBefore} → {round.wallAfter}（上限 {round.wallMax}）</p>
      {round.attackers.length>0&&<p>阵外：{roster(world,round.attackers)}。</p>}
      {round.defenders.length>0&&<p>阵内：{roster(world,round.defenders)}。</p>}
      {clash&&attacker&&defender&&winner&&<p className="font-serif text-slate-200">头一场交锋，{attacker}与{defender}先后出手，{winner}占了上风。
        {clash.attackerDamage>0?` ${attacker}实损 ${clash.attackerDamage} 点气血。`:''}
        {clash.defenderDamage>0?` ${defender}实损 ${clash.defenderDamage} 点气血。`:''}
      </p>}
      {hero&&heroName&&<p className="rounded border border-teal-500/25 p-2 text-teal-100">
        {heroName}在阵眼出手，实付 {cost(hero.paidQi,hero.paidHp)}，为原阵挡下 {hero.wallSaved} 点阵损。
      </p>}
    </div>}
    {witness&&<SiegeWitnessReport world={world} witness={witness} scope={witnessScopeKey}/>}
    {controls&&!queued&&view.options.length>0&&<div role="group" aria-label="这一轮如何守阵" className="grid gap-1.5">
      {view.options.map(option=>{
        const move=option.grandSiegeHeroMove;
        const {name,hint}=words[move];
        const price=move==='hold'?undefined:GRAND_SIEGE_HERO_COSTS[move];
        return <button type="button" key={move} className={`${action} ${move==='hold'?'border-slate-600 text-slate-200':''}`} disabled={controls.busy}
          onClick={event=>{if(event.detail<=1)invoke(()=>controls.onChoose(move));}}
          onKeyDown={event=>{if(event.key==='Enter'&&event.repeat)event.preventDefault();}}>
          <span className="flex items-center gap-1.5 font-serif font-semibold"><Shield size={14} aria-hidden="true"/>{name}</span>
          <span className="block text-xs leading-relaxed text-slate-300">{hint}</span>
          {price&&<span className="block text-xs text-amber-200">若真能入阵，下月才付 {cost(price.qi,price.hp)}。</span>}
        </button>;
      })}
    </div>}
    {controls&&queued&&<>
      <p role="status" className="rounded border border-amber-400/25 p-2 text-sm text-amber-100">已记下：{words[queued.move].name}。这一轮尚未出手，也未扣代价。</p>
      <button type="button" disabled={controls.busy} className={`${action} text-center font-semibold`}
        onClick={event=>{if(event.detail<=1)invoke(controls.onAdvance);}}
        onKeyDown={event=>{if(event.key==='Enter'&&event.repeat)event.preventDefault();}}>推进一月，继续守阵</button>
    </>}
    {onContinue&&<button type="button" className={`${action} text-center`} onClick={onContinue}>收起这一幕</button>}
    {notice&&<p role="status" className="text-xs text-amber-100">{notice}</p>}
  </section>;
}
