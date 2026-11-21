import {
  availableSectCreditActions,
  SECT_CREDIT_EXPOSURE_MAX,
  SECT_CREDIT_RESERVE,
  sectCreditExposure,
  sectCreditLiquidity,
  visibleSectCredit,
} from '../engine/sectCreditEngine';
import type { Cultivator, SectLoan, WorldState } from '../types/world';

const STATUS: Record<SectLoan['status'], string> = {
  offered: '待承诺 · 未放款', active: '未结清', paid: '已全额还清',
  defaulted: '逾期清算 · 已核销', declined: '已拒绝 · 未放款', expired: '报价失效 · 未放款',
};

export function SectCreditPanel({ world, cultivator }: { world: WorldState; cultivator?: Cultivator }) {
  const viewer = world.cultivators.find(({ id }) => id === cultivator?.id);
  const sect = world.sects.find(({ id }) => id === viewer?.sectId);
  const sects = new Map(world.sects.map(({ id, name }) => [id, name]));

  return (
    <section aria-label="本宗信贷账簿" className="min-w-0 space-y-2 rounded-xl border border-amber-400/25 bg-slate-900/70 p-3 text-slate-100 sm:p-4">
      <header className="space-y-1">
        <h4 className="text-sm font-semibold text-amber-100">本宗信贷账簿</h4>
        {sect && <p className="break-words text-xs text-slate-300">{sect.name} · Tick #{world.tick}</p>}
        <p className="text-xs leading-relaxed text-slate-400">游戏内宗门借贷利率固定为 0%，只归还本金；不计入坊市货款或天道契书押金。此页只读，不替修士发起或承诺借贷。</p>
      </header>
      {!sect || !viewer ? <p className="text-xs text-slate-400">{viewer ? '散修无本宗信贷账簿。' : '选择修士后查看其所属宗门的账簿。'}</p>
        : <CreditLedger world={world} viewer={viewer} sectId={sect.id} sects={sects} />}
    </section>
  );
}

function CreditLedger({ world, viewer, sectId, sects }: { world: WorldState; viewer: Cultivator; sectId: string; sects: Map<string, string> }) {
  const exposure = sectCreditExposure(world, sectId);
  const rows = visibleSectCredit(world, viewer)
    .filter(({ lenderSectId, borrowerSectId, openedTick }) => openedTick <= world.tick && (lenderSectId === sectId || borrowerSectId === sectId))
    .sort((a, b) => Number(b.status === 'active' || b.status === 'offered') - Number(a.status === 'active' || a.status === 'offered')
      || (b.settledTick ?? b.openedTick) - (a.settledTick ?? a.openedTick));
  const legalOffers = availableSectCreditActions(viewer, world).filter(({ creditMove }) => creditMove === 'offer').length;
  const restriction = exposure.restrictedUntilTick;
  const restricted = restriction !== undefined && world.tick < restriction;

  return (
    <>
      <dl aria-label="本宗当期信贷余额" className="grid grid-cols-2 gap-2 rounded border border-slate-800 bg-slate-950/40 p-2.5 text-xs sm:grid-cols-3">
        <div><dt className="text-slate-400">实际公库灵石</dt><dd>{sectCreditLiquidity(world, sectId)} 灵石</dd></div>
        <div><dt className="text-slate-400">出借应收本金</dt><dd>{exposure.receivable} 灵石</dd></div>
        <div><dt className="text-slate-400">借入未还本金</dt><dd>{exposure.payable} 灵石</dd></div>
        <div><dt className="text-slate-400">本宗未放款报价</dt><dd>{exposure.pendingOutgoing} 灵石</dd></div>
        <div><dt className="text-slate-400">本宗出借历史核销</dt><dd>{exposure.defaultedWriteOff} 灵石</dd></div>
      </dl>
      <p className={restricted ? 'text-xs leading-relaxed text-rose-200' : 'text-xs leading-relaxed text-slate-400'}>
        {restricted ? `本宗暂不得新借款 · 限制于 Tick #${restriction} 解除。` : '本宗当前无生效中的违约借款限制。'}
        {legalOffers > 0 ? ` 所选修士此时可向 ${legalOffers} 宗提出贷款报价；报价并非放款。` : ' 所选修士此时无合规的新出借报价。'}
      </p>
      <p className="text-xs leading-relaxed text-slate-400">出借需留足 {SECT_CREDIT_RESERVE} 灵石准备金及自身欠款和待放款报价；应收本金加待放款报价不得超过 {SECT_CREDIT_EXPOSURE_MAX} 灵石。借款限制不等于禁放贷款。</p>
      {!rows.length ? <p className="text-xs text-slate-400">此时点无本宗可阅的借贷记录。</p> : (
        <div className="max-h-[30rem] space-y-2 overflow-y-auto">
          {rows.map((loan) => {
            const funded = loan.fundedTick !== undefined && loan.fundedTick <= world.tick;
            const outstanding = loan.status === 'active' ? Math.max(0, loan.principal - loan.paidTotal - loan.writtenOff) : 0;
            const collecting = loan.status === 'active' && loan.dueTick !== undefined && world.tick >= loan.dueTick;
            const status = loan.status === 'offered' && world.tick >= loan.offerExpiresTick ? STATUS.expired
              : collecting ? (loan.collectionUntilTick !== undefined && world.tick >= loan.collectionUntilTick ? '清收期结束 · 待结算' : '逾期收取中') : STATUS[loan.status];
            const outgoing = loan.lenderSectId === sectId;
            return (
              <details key={loan.id} className="min-w-0 rounded border border-slate-800 bg-slate-950/55">
                <summary className="min-h-11 cursor-pointer break-words px-3 py-2 text-xs font-semibold text-amber-100">
                  {outgoing ? '本宗出借' : '本宗借入'} · {sects.get(outgoing ? loan.borrowerSectId : loan.lenderSectId) ?? '对手宗门未详'} · {status}
                </summary>
                <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
                  {funded ? <>
                    <p>实放本金：{loan.principal} 灵石 · Tick #{loan.fundedTick}</p>
                    <p>已实际归还：{loan.paidTotal} 灵石 · 未清本金：{outstanding} 灵石</p>
                    {!!loan.writtenOff && <p className="text-rose-200">已核销本金：{loan.writtenOff} 灵石 · 核销并非归还。</p>}
                    {loan.dueTick !== undefined && <p>到期 Tick #{loan.dueTick}{loan.collectionUntilTick !== undefined && ` · 清收窗口截至 Tick #${loan.collectionUntilTick}`}</p>}
                    {loan.settledTick !== undefined && <p>实际结清／核销：Tick #{loan.settledTick}</p>}
                    {!!loan.receipts.length && <ol aria-label="实际还款流水" className="list-inside list-disc space-y-1">
                      {loan.receipts.filter(({ tick }) => tick <= world.tick).map((entry, index) => (
                        <li key={`${entry.tick}:${entry.kind}:${index}`}>Tick #{entry.tick} · {entry.kind === 'voluntary' ? '主动归还' : '到期清收'} {entry.amount} 灵石</li>
                      ))}
                    </ol>}
                  </> : <>
                    <p>本金报价：{loan.principal} 灵石 · 此时点未放款，不记作未清欠款。</p>
                    <p>提出于 Tick #{loan.openedTick} · 应约截止 Tick #{loan.offerExpiresTick}</p>
                    {loan.settledTick !== undefined && <p>报价处理：Tick #{loan.settledTick}</p>}
                  </>}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </>
  );
}
