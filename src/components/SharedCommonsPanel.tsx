import { HERB_LABELS } from '../engine/alchemyEngine';
import { commonsHarvestLimit, currentCommonsRound, visibleSharedCommons } from '../engine/sharedCommonsEngine';
import { currentVisibleTileIds, terrainTileAt } from '../engine/terrainEngine';
import type { Cultivator, WorldState } from '../types/world';

type Pact = ReturnType<typeof visibleSharedCommons>[number];
const END: Record<NonNullable<Pact['closeReason']>, string> = {
  declined: '有一方拒绝签署', offer_expiry: '未在期限内签齐', title_change: '场地地权已变化', site_lost: '公域场地不再有效',
  term_complete: '共管期限已满', stale_signer: '签署资格已失效',
};

export function SharedCommonsPanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator }) {
  const actor = world.cultivators.find(({ id }) => id === cultivator.id);
  if (!actor) return null;
  const pacts = visibleSharedCommons(world, actor).filter((pact) => pact.openedTick <= world.tick && pact.parties.some(({ sectId }) => sectId === actor.sectId));
  if (!pacts.length) return null;
  const observed = currentVisibleTileIds(world, actor);
  const sites = new Map(world.locations.map((site) => [site.id, site]));
  const names = new Map(world.sects.map(({ id, name }) => [id, name]));
  const sectName = (id: string) => names.get(id) ?? '宗门未详';

  return (
    <details className="min-w-0 rounded border border-teal-400/20 bg-slate-950/55">
      <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-teal-200">灵地公域与共管配额</summary>
      <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
        <p>三宗自愿签署，只共管中立灵地的真实库存，不转让领地。按所签份额承担维护；漏缴只失去当期配额，不记欠款。其他修士只能采当前储备之外的余量。此页只读。</p>
        <ul className="max-h-[30rem] space-y-2 overflow-y-auto" aria-label="本宗可阅的灵地公域协议">
          {[...pacts].sort((a, b) => b.openedTick - a.openedTick).map((pact) => {
            const site = sites.get(pact.siteId);
            const rounds = pact.rounds.filter(({ startTick }) => startTick <= world.tick);
            const tile = site && terrainTileAt(world, site.x, site.y);
            const isObserved = !!tile && observed.has(tile.id);
            const live = isObserved ? currentCommonsRound(world, pact) : undefined;
            const active = !!live;
            const ledgerLive = pact.status === 'active' && pact.startsTick !== undefined && pact.startsTick <= world.tick &&
              pact.endsTick !== undefined && world.tick < pact.endsTick;
            const label = pact.status === 'closed' ? '协议已结案'
              : pact.status === 'offered' ? world.tick < pact.offerExpiresTick ? '征求三方签署' : '签署期限已满'
                : active ? '共管协议生效' : pact.startsTick !== undefined && world.tick < pact.startsTick ? '三方已签，下一回合生效'
                  : !isObserved && ledgerLive ? '本宗账簿：签约期内，现场未观测' : '当前不再有效';
            const herb = HERB_LABELS[pact.herbId];
            return (
              <li key={pact.id} className="min-w-0 space-y-1.5 break-words rounded border border-slate-800 p-2">
                <h5 className="font-semibold text-teal-200">{site?.name ?? '原址未详'} · {herb} · {label}</h5>
                <p>{!isObserved ? '协议以中立地为前提；未直接观测当前地权。'
                  : site?.ownerSectId ? `当前地权：${sectName(site.ownerSectId)}` : '当前场地无宗门地权'}</p>
                <p>发起 Tick #{pact.openedTick}{pact.status === 'offered' && ` · 签署截止 Tick #${pact.offerExpiresTick}`}
                  {pact.startsTick !== undefined && ` · 生效 Tick #${pact.startsTick}`}
                  {pact.endsTick !== undefined && ` · 到期 Tick #${pact.endsTick}`}
                </p>
                {pact.closeReason && <p>结案：{END[pact.closeReason]}{pact.settledTick !== undefined && ` · Tick #${pact.settledTick}`}</p>}
                <ol aria-label="实际签署份额" className="space-y-1">
                  {pact.parties.map((party) => <li key={party.sectId}>
                    {sectName(party.sectId)} · {party.share} 份 · {party.signedTick !== undefined && party.signedTick <= world.tick ? `已签署 Tick #${party.signedTick}` : '未签署'}
                  </li>)}
                </ol>
                {live && site && actor.locationId === site.id && <p>本人本轮单次可采上限：{commonsHarvestLimit(world, actor, site, pact.herbId)} 株（受现货与配额限制）。</p>}
                {rounds.length === 0 ? <p className="text-slate-400">尚无当期维护或配额实录。</p> : (
                  <ol aria-label="实际共管清册" className="space-y-1.5">
                    {[...rounds].reverse().map((round) => {
                      const current = ledgerLive && round.startTick <= world.tick && world.tick < round.endsTick && (!isObserved || live?.startTick === round.startTick);
                      return <li key={round.startTick} className="rounded bg-slate-900/75 p-2">
                        <p className="text-teal-100">{current ? '本期实际配额' : '历史清册'} · Tick #{round.startTick} 至 #{round.endsTick} 前</p>
                        <p>期初现货 {round.stockAtOpen} 株 · 实际预留 {round.reserved} 株</p>
                        <ul className="space-y-0.5">
                          {round.allocations.map((allocation) => (
                            <li key={allocation.sectId}>
                              {sectName(allocation.sectId)} · 维护应付 {allocation.maintenanceDue}／实付 {allocation.maintenancePaid} 灵石
                              {allocation.maintenancePaid < allocation.maintenanceDue ? ' · 本期配额失效，不欠款'
                                : ` · 配额 ${allocation.quota} 株，实采 ${allocation.used} 株${current ? `，余 ${Math.max(0, allocation.quota - allocation.used)} 株` : ''}`}
                            </li>
                          ))}
                        </ul>
                      </li>;
                    })}
                  </ol>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
