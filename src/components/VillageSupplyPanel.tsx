import { useEffect, useRef } from 'react';
import { projectVillageGranary } from '../engine/villageGranaryEngine';
import { projectVillageSupply } from '../engine/villageSupplyEngine';
import { supplyLegEndpoints, VILLAGE_SUPPLY_FEE, VILLAGE_SUPPLY_QUANTITY } from '../engine/villageSupplyAccounting';
import { knownMapLocations } from '../engine/terrainEngine';
import type { Cultivator, VillageSupplyAgreement, VillageSupplyLeg, WorldState } from '../types/world';

const states: Record<VillageSupplyAgreement['status'], string> = {
  offered: '邀约待同意（未发货）', active: '已启运，分两路结算', completed: '两路均已结案',
  declined: '邀约被谢绝', withdrawn: '邀约已撤回', expired: '邀约已过期',
};
const phases: Record<VillageSupplyLeg['phase'], string> = {
  outbound: '在途，尚未抵仓', returning: '正在返回原仓，尚未退入', delivered: '已实收进目的仓',
  returned: '实货已退回原仓', lost: '核实途中货损，不入仓',
};
const cargo = (good: VillageSupplyLeg['good']) => good === 'earth_root'
  ? `玄土根 ${VILLAGE_SUPPLY_QUANTITY.earth_root} 株` : `灵石 ${VILLAGE_SUPPLY_QUANTITY.stone}`;
const atOrBefore = (tick: number | undefined, through: number): tick is number => tick !== undefined && tick <= through;

function SupplyLeg({ agreement, leg, settlementId, tick }: {
  agreement: VillageSupplyAgreement; leg: VillageSupplyLeg; settlementId: string; tick: number;
}) {
  const { source } = supplyLegEndpoints(agreement, leg.good);
  const arrived = ['delivered', 'returned', 'lost'].includes(leg.phase);
  if (leg.lastAdvancedTick > tick || (arrived && !atOrBefore(leg.settledTick, tick))) return null;
  const total = agreement.path ? agreement.path.length - 1 : 0;
  return <li className="min-w-0 space-y-0.5 rounded border border-slate-800 p-2 [overflow-wrap:anywhere]">
    <p className="font-semibold text-emerald-100">{source === settlementId ? '本村发出' : '本村应收'} · {cargo(leg.good)}</p>
    <p>{phases[leg.phase]}{atOrBefore(leg.settledTick, tick) && ` · 第 ${leg.settledTick} 轮`}</p>
    {!arrived && total > 0 && <p className="text-slate-400">距发货仓的已核查进度 {leg.checkpoint}/{total} 段。</p>}
    {leg.turnback && atOrBefore(leg.turnback.tick, tick) && <p className="text-slate-400">第 {leg.turnback.tick} 轮决定折返：
      {leg.turnback.cause === 'destination_closed' ? '目的村仓无法接收。' : '下一段不安全，未向前继续。'}</p>}
    {leg.phase === 'lost' && leg.loss && <p className="text-amber-200">途经严重兽潮（强度 {leg.loss.intensity}）时核实全批损失。</p>}
  </li>;
}

export function VillageSupplyPanel({ world, cultivator, settlementId }: {
  world: WorldState; cultivator: Cultivator; settlementId: string;
}) {
  const viewer = world.cultivators.find(({ id }) => id === cultivator.id);
  const village = world.settlements.villages.find(({ id }) => id === settlementId);
  const rows = viewer && village ? projectVillageSupply(world, viewer).filter((row) => row.offeredTick <= world.tick &&
    (row.fromSettlementId === village.id || row.toSettlementId === village.id) &&
    (row.acceptedTick === undefined || row.acceptedTick <= world.tick) &&
    (row.closedTick === undefined || row.closedTick <= world.tick)) : [];
  if (!viewer || !village || !rows.length) return null;
  const stock = projectVillageGranary(world, viewer, settlementId);
  const known = new Set(knownMapLocations(world, viewer).map(({ id }) => id));
  const counterparts = new Map(world.settlements.villages.filter(({ locationId }) => known.has(locationId)).map(({ id, name }) => [id, name]));
  return <SupplyReceiptFold rows={rows} villageName={village.name} worldTick={world.tick} settlementId={settlementId}
    counterpartNames={counterparts} stock={stock} />;
}

function SupplyReceiptFold({ rows, villageName, worldTick, settlementId, counterpartNames, stock }: {
  rows: readonly VillageSupplyAgreement[]; villageName: string; worldTick: number; settlementId: string;
  counterpartNames: ReadonlyMap<string, string>; stock?: { roots: number; stones: number };
}) {
  const element = useRef<HTMLDetailsElement>(null);
  const ownedFocus = useRef(false);
  useEffect(() => {
    const inner = element.current;
    const outer = inner?.parentElement?.closest('details')?.querySelector<HTMLElement>(':scope > summary');
    return () => {
      if (!inner || !outer?.isConnected || !outer.getClientRects().length || !ownedFocus.current) return;
      const document = outer.ownerDocument;
      if (!document.activeElement || document.activeElement === document.body) outer.focus({ preventScroll: true });
    };
  }, []);
  const sorted = [...rows].sort((a, b) => (b.closedTick ?? b.acceptedTick ?? b.offeredTick) - (a.closedTick ?? a.acceptedTick ?? a.offeredTick));
  return <details ref={element} className="min-w-0 rounded border border-emerald-400/20 bg-slate-950/55"
    onFocusCapture={() => { ownedFocus.current = true; }}
    onBlurCapture={(event) => {
      const target = event.relatedTarget;
      if (target && target !== event.currentTarget.ownerDocument.body && !event.currentTarget.contains(target)) ownedFocus.current = false;
    }}>
    <summary className="min-h-11 cursor-pointer px-3 py-2.5 text-xs font-semibold text-emerald-200 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">村镇互助与实运</summary>
    <div className="min-w-0 space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
      {stock && <p className="text-emerald-100">现场本仓实存：玄土根 {stock.roots} 株、灵石 {stock.stones}；不含在途物资。</p>}
      <p className="text-slate-400">此处只读。两村各以实余补对方短缺，两路分别核对。运费与货物分记；实运不增加人口。</p>
      <ol aria-label="此村授权的互助凭据" className="max-h-64 space-y-2 overflow-y-auto">
        {sorted.map((row) => {
          const homeSendsRoots = row.fromSettlementId === settlementId;
          const partner = counterpartNames.get(homeSendsRoots ? row.toSettlementId : row.fromSettlementId);
          const accepted = atOrBefore(row.acceptedTick, worldTick) && row.acceptor !== undefined && row.legs?.length === 2;
          return <li key={row.id} className="min-w-0 space-y-1.5 rounded border border-slate-800 p-2 [overflow-wrap:anywhere]">
            <p className="font-semibold text-emerald-100">本村「{villageName}」与{partner ? `对村「${partner}」` : '未观测对村'}</p>
            <p>{row.status === 'offered' && row.expiresTick <= worldTick ? '已到回应期限，未见结案凭据' : states[row.status]} · 第 {row.offeredTick} 轮发出邀约
              {row.status === 'offered' && row.expiresTick > worldTick && ` · 第 ${row.expiresTick} 轮截止前`}
              {atOrBefore(row.closedTick, worldTick) && ` · 第 ${row.closedTick} 轮结案`}</p>
            {accepted ? <>
              <p>第 {row.acceptedTick} 轮已确认并从原仓实拨；双方经办各实际付运费 {VILLAGE_SUPPLY_FEE} 灵石。折返或货损不退运费。</p>
              {row.status === 'completed' && <p className="text-slate-400">结案不表示两路都已送达，以各路实际结果为准。</p>}
              <ol aria-label="两路货物实际状态" className="grid min-w-0 gap-1.5">
                {row.legs!.slice().sort((a, b) => Number(supplyLegEndpoints(row, b.good).source === settlementId) -
                  Number(supplyLegEndpoints(row, a.good).source === settlementId)).map((leg) =>
                  <SupplyLeg key={leg.good} agreement={row} leg={leg} settlementId={settlementId} tick={worldTick} />)}
              </ol>
            </> : <>
              <p>约定本村拟出 {cargo(homeSendsRoots ? 'earth_root' : 'stone')}、拟收 {cargo(homeSendsRoots ? 'stone' : 'earth_root')}。</p>
              <p className="text-slate-400">没有确认发货凭据，未记实际运费、出仓或到仓。</p>
            </>}
          </li>;
        })}
      </ol>
    </div>
  </details>;
}
