import type { Cultivator, Sect } from '../types/world';
import { SECT_PROMOTION_RULES } from '../engine/sectPoliticsEngine';

const PROMOTIONS = SECT_PROMOTION_RULES.slice().reverse();
const RANKS: Cultivator['sectRank'][] = ['外门弟子', ...PROMOTIONS.map((rule) => rule.rank), '掌门'];
const RANK_REQUIREMENTS = new Map<Cultivator['sectRank'], string>([
  ['外门弟子', '入门默认'],
  ...PROMOTIONS.map((rule) => [rule.rank, `至少${rule.realm} · 贡献 ${rule.contribution}`] as const),
  ['掌门', '经传位产生，不按贡献自动晋升'],
]);

const SUCCESSION_LABELS: Record<NonNullable<Sect['succession']>['method'], string> = {
  election: '推举',
  challenge: '挑战',
  coup: '夺位',
};

interface SectHierarchyPanelProps {
  cultivator: Cultivator;
  sect: Sect | undefined;
  cultivators: Cultivator[];
}

export function SectHierarchyPanel({ cultivator, sect, cultivators }: SectHierarchyPanelProps) {
  const names = new Map(cultivators.map(({ id, name }) => [id, name]));
  const leader = sect?.leaderId ? cultivators.find(({ id }) => id === sect.leaderId) : undefined;
  const succession = sect?.succession;
  const leaderName = leader?.alive ? leader.name : sect?.leaderId && !leader ? '姓名未详' : '空缺';
  return (
    <section className="space-y-2 pt-2 border-t border-slate-800" aria-label="宗门地位与传位">
      <h4 className="text-xs font-semibold text-slate-200">宗门地位与传位</h4>
      {!sect ? (
        <p className="text-[11px] text-slate-400">散修，无宗门位阶或宗门贡献。</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
            <div className="rounded border border-slate-800/80 p-2">
              <dt className="text-slate-400">宗门位阶</dt>
              <dd className="font-medium text-amber-200">{cultivator.sectRank}{!cultivator.alive ? '（陨落留档）' : ''}</dd>
            </div>
            <div className="rounded border border-slate-800/80 p-2">
              <dt className="text-slate-400">宗门贡献</dt>
              <dd className="text-slate-200">{cultivator.contribution}</dd>
            </div>
            <div className="rounded border border-slate-800/80 p-2">
              <dt className="text-slate-400">{sect.name}掌门</dt>
              <dd className="text-slate-200">{leaderName}</dd>
            </div>
          </dl>
          <details className="rounded border border-slate-800/80 bg-slate-950/50 px-2 py-1.5">
            <summary className="cursor-pointer text-xs text-slate-200">位阶与继任记录</summary>
            <ol aria-label="宗门位阶进阶顺序" className="mt-2 list-decimal pl-5 space-y-1 text-[11px] text-slate-300">
              {RANKS.map((rank) => (
                <li key={rank} aria-current={rank === cultivator.sectRank ? 'true' : undefined}>
                  <span className={rank === cultivator.sectRank ? 'text-amber-200' : undefined}>{rank}</span>
                  {rank === cultivator.sectRank && <span className="text-amber-300"> · {cultivator.alive ? '当前位阶' : '记录位阶'}</span>}
                  <span className="ml-2 text-slate-400">{RANK_REQUIREMENTS.get(rank)}</span>
                </li>
              ))}
            </ol>
            {succession ? (
              <dl className="mt-2 space-y-1 border-t border-slate-800/80 pt-2 text-[11px] text-slate-400">
                <div className="flex gap-1"><dt>最近传位：</dt><dd>{SUCCESSION_LABELS[succession.method]} · Tick #{succession.tick}</dd></div>
                <div className="flex gap-1"><dt>前任：</dt><dd>{succession.previousLeaderId ? names.get(succession.previousLeaderId) ?? '姓名未详' : '无前任记录'}</dd></div>
                <div className="flex gap-1"><dt>继任：</dt><dd>{names.get(succession.leaderId) ?? '姓名未详'}</dd></div>
                <div className="flex gap-1">
                  <dt>记录支持者：</dt>
                  <dd>{succession.supporterIds.length > 0 ? succession.supporterIds.map((id) => names.get(id) ?? '姓名未详').join('、') : '无记录'}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 border-t border-slate-800/80 pt-2 text-[11px] text-slate-400">尚无传位记录。</p>
            )}
          </details>
        </>
      )}
    </section>
  );
}
