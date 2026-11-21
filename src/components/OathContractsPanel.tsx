import type { Cultivator, WorldState } from '../types/world';
import { OathArbitrationPanel } from './OathArbitrationPanel';

type Contract = WorldState['oaths']['contracts'][number];

const STATUS: Record<Contract['status'], string> = {
  offered: '待应约', active: '履约中', declined: '已拒约', fulfilled: '已履约',
  breached: '违约', excused: '免责结算', expired: '已到期',
};
const TERMS: Record<Contract['term'], { name: string; unit: string }> = {
  foundation_pill: { name: '筑基丹', unit: '枚' }, jade_herb: { name: '翡翠灵叶', unit: '株' },
};
const openStatus = (contract: Contract) => contract.status === 'offered' || contract.status === 'active' ||
  (contract.status === 'breached' && contract.settledTick === undefined);

export function OathContractsPanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator | undefined }) {
  const sects = new Map(world.sects.map(({ id, name }) => [id, name]));
  const locations = new Map(world.locations.map(({ id, name }) => [id, name]));
  const people = new Map(world.cultivators.map((entry) => [entry.id, entry]));
  const side = cultivator && sects.has(cultivator.sectId) ? cultivator.sectId : undefined;
  const relevant = side ? (world.oaths?.contracts ?? []).filter((item) =>
    people.get(item.requesterId)?.sectId === side || people.get(item.providerId)?.sectId === side) : [];
  const orders = relevant.slice().sort((a, b) => Number(openStatus(b)) - Number(openStatus(a)) ||
    (b.settledTick ?? b.offeredTick) - (a.settledTick ?? a.offeredTick));

  return (
    <section className="min-w-0 space-y-2 rounded-xl border border-amber-400/25 bg-slate-900/70 p-3 text-slate-100 sm:p-4" aria-label="天道契书与宗门仲裁">
      <h3 className="text-sm font-semibold text-amber-100">天道契书与宗门仲裁</h3>
      {!side ? <p className="text-xs text-slate-400">{cultivator ? '所选修士无所属宗门。' : '选中修士后查看其所属宗门的契书。'}</p> : (
        <>
          <p className="break-words text-xs text-slate-300">{sects.get(side)} · 进行中 {orders.filter(openStatus).length} · 契书共 {orders.length}</p>
          {orders.length === 0 ? <p className="text-xs text-slate-400">本宗暂无契书。</p> : (
            <div className="max-h-[26rem] space-y-2 overflow-y-auto">
              {orders.map((contract) => {
                const term = TERMS[contract.term];
                const requester = people.get(contract.requesterId);
                const provider = people.get(contract.providerId);
                const requesterLabel = requester ? `${requester.name}（${sects.get(requester.sectId) ?? '无宗门'}）` : '需方未详';
                const providerLabel = provider ? `${provider.name}（${sects.get(provider.sectId) ?? '无宗门'}）` : '供方未详';
                const ownRequester = requester?.sectId === side;
                const ownProvider = provider?.sectId === side;
                const held = contract.escrow.payment + contract.escrow.collateral;
                const appeal = contract.appeal;
                return (
                  <details key={contract.id} className="min-w-0 rounded border border-slate-800 bg-slate-950/60 p-2">
                    <summary className="cursor-pointer break-words text-xs text-slate-100">
                      {term.name} {contract.quantity} {term.unit} · {ownRequester && ownProvider ? '宗门内契书' : ownRequester ? '本宗求购' : '本宗供应'} · {STATUS[contract.status]}
                    </summary>
                    <div className="mt-2 space-y-2 text-xs text-slate-300">
                      <p className="break-words">
                        需方 {requesterLabel} · 供方 {providerLabel} · 交付地点：{locations.get(contract.locationId) ?? '地点未详'}
                      </p>
                      <dl className="grid gap-1.5 sm:grid-cols-2" aria-label="契书里程碑">
                        <div><dt className="text-slate-400">发起／应约截止</dt><dd>Tick #{contract.offeredTick}／#{contract.offerExpiresTick} 前</dd></div>
                        {contract.deadlineTick !== undefined && <div><dt className="text-slate-400">履约截止</dt><dd>Tick #{contract.deadlineTick} 前</dd></div>}
                        {contract.appealUntilTick !== undefined && <div><dt className="text-slate-400">申诉截止</dt><dd>Tick #{contract.appealUntilTick} 前</dd></div>}
                        {contract.settledTick !== undefined && <div><dt className="text-slate-400">实际结算</dt><dd>Tick #{contract.settledTick}</dd></div>}
                      </dl>
                      <section aria-label="托管灵石账目" className="space-y-1 border-t border-slate-800 pt-2">
                        <h4 className="font-semibold text-amber-100">托管灵石账目</h4>
                        <dl className="grid gap-1 sm:grid-cols-2">
                          <div><dt className="text-slate-400">需方价金</dt><dd>约定 {contract.payment} · 当前托管 {contract.escrow.payment}</dd></div>
                          <div><dt className="text-slate-400">供方押金</dt><dd>约定 {contract.collateral} · 当前托管 {contract.escrow.collateral}</dd></div>
                        </dl>
                        <p className={held > 0 ? 'text-amber-200' : 'text-slate-400'}>仍在托管：{held} 灵石。</p>
                        {contract.outcome && <p className="break-words text-slate-100">记录结果：{contract.outcome}</p>}
                      </section>
                      <section aria-label="履约凭证" className="space-y-1 border-t border-slate-800 pt-2">
                        <h4 className="font-semibold text-amber-100">履约凭证</h4>
                        {contract.evidence.length === 0 ? <p className="text-slate-400">暂无提交凭证。</p> : (
                          <ol className="space-y-1">
                            {contract.evidence.map((entry, index) => (
                              <li key={`${entry.tick}:${entry.actorId}:${index}`} className="break-words">
                                Tick #{entry.tick} · {people.get(entry.actorId)?.name ?? '修士未详'} · {entry.kind === 'delivery' ? '已交付' : '曾到场尝试交付'}
                                {entry.quantity} {term.unit} · {locations.get(entry.locationId) ?? '地点未详'} · 需方{entry.requesterPresent ? '在场' : '不在场'}
                              </li>
                            ))}
                          </ol>
                        )}
                      </section>
                      {(appeal || contract.appealUntilTick !== undefined) && (
                        <section aria-label="申诉与仲裁" className="space-y-1 border-t border-slate-800 pt-2">
                          <h4 className="font-semibold text-amber-100">申诉与仲裁</h4>
                          {appeal ? (
                            <p className="break-words">
                              Tick #{appeal.tick} · {people.get(appeal.appellantId)?.name ?? '申诉方未详'} ·
                              {appeal.status === 'upheld' ? '申诉成立' : '申诉驳回'}：{appeal.reason}
                            </p>
                          ) : <p className="text-slate-400">未记录申诉决定。</p>}
                        </section>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </>
      )}
      <OathArbitrationPanel world={world} cultivator={cultivator} />
    </section>
  );
}
