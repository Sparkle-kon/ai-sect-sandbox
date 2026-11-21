import {
  projectVillageGranary, VILLAGE_GRANARY_CAPACITY, VILLAGE_GRANARY_DISASTER_WINDOW, VILLAGE_GRANARY_DONATION, VILLAGE_GRANARY_DRAW,
  VILLAGE_GRANARY_MIN_STRESS, VILLAGE_GRANARY_RELIEF_COOLDOWN,
} from '../engine/villageGranaryEngine';
import type { Cultivator, WorldState } from '../types/world';

type GranaryView = NonNullable<ReturnType<typeof projectVillageGranary>>;
const stock = ({ roots, stones }: { roots: number; stones: number }) => `玄土根 ${roots} 株、灵石 ${stones}`;

export function VillageGranaryPanel({ world, cultivator, settlementId }: { world: WorldState; cultivator?: Cultivator; settlementId: string }) {
  const viewer = world.cultivators.find(({ id }) => id === cultivator?.id);
  if (!viewer) return null;
  const view = projectVillageGranary(world, viewer, settlementId);
  if (!view || view.settlementId !== settlementId) return null;
  return <details className="min-w-0 rounded border border-emerald-400/20 bg-slate-950/55">
    <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-emerald-200">义仓库存与短缺支取</summary>
    <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
      <p>只查看本人在场的义仓。单笔实捐 {stock(VILLAGE_GRANARY_DONATION)}，不从无到有产生物资。</p>
      <p>只有本村距实灾不超过 {VILLAGE_GRANARY_DISASTER_WINDOW} 回合、压力至少 {VILLAGE_GRANARY_MIN_STRESS} 且仍有幸存者，才可用足量库存支取 {stock(VILLAGE_GRANARY_DRAW)}；距上次本村赈济须相隔至少 {VILLAGE_GRANARY_RELIEF_COOLDOWN} 回合。用于赈济，不向个人发款、不增加人口或形成债务。</p>
      <GranaryBalance view={view} tick={world.tick} />
    </div>
  </details>;
}

function GranaryBalance({ view, tick }: { view: GranaryView; tick: number }) {
  const receipts = view.receipts.filter(({ tick: receiptTick }) => receiptTick <= tick);
  return <>
    <p>现场记录 Tick #{tick} · 当前村镇压力 {view.stress}/100</p>
    <dl aria-label="义仓实存与容量" className="grid min-w-0 grid-cols-2 gap-1.5 rounded border border-slate-800 p-2">
      <div><dt className="text-slate-400">实存玄土根</dt><dd>{view.roots}/{VILLAGE_GRANARY_CAPACITY.roots} 株</dd></div>
      <div><dt className="text-slate-400">实存灵石</dt><dd>{view.stones}/{VILLAGE_GRANARY_CAPACITY.stones}</dd></div>
    </dl>
    <p>累计实捐：{stock({ roots: view.donatedRoots, stones: view.donatedStones })}。</p>
    <p>累计实用：{stock({ roots: view.spentRoots, stones: view.spentStones })}。</p>
    {view.lastDisasterTick !== undefined && view.lastDisasterTick <= tick && <p>最近实灾 Tick #{view.lastDisasterTick}。</p>}
    {view.lastDrawTick !== undefined && view.lastDrawTick <= tick && <p>最近实支 Tick #{view.lastDrawTick}。</p>}
    <div className="space-y-1 border-t border-slate-800 pt-2">
      <h4 className="font-semibold text-emerald-100">仍保留的收支实录</h4>
      {receipts.length === 0 ? <p className="text-slate-400">未保留捐入或支取凭证。</p> : <ol className="max-h-48 space-y-1 overflow-y-auto" aria-label="义仓收支凭证">
        {receipts.map((receipt, i) => <li key={i} className="min-w-0 break-words rounded border border-slate-800 p-2">
          {receipt.kind === 'draw' ? <>
            <p>Tick #{receipt.tick} · 实际支取 {stock(VILLAGE_GRANARY_DRAW)}</p>
            <p>本次实灾 Tick #{receipt.disasterTick} · 压力 {receipt.stressBefore} → {receipt.stressAfter}。</p>
          </> : <p>Tick #{receipt.tick} · {receipt.own ? '本人实捐' : '实捐入仓'} {stock(VILLAGE_GRANARY_DONATION)}</p>}
        </li>)}
      </ol>}
    </div>
  </>;
}
