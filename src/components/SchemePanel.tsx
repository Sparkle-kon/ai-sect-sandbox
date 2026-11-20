import type { Cultivator, WorldState } from '../types/world';

type Scheme = NonNullable<Cultivator['activeScheme']>;

const SCHEME_KINDS: Record<Scheme['kind'], string> = {
  infiltration: '潜入宗门',
  foundation_pill: '积攒筑基丹资粮',
  vengeance: '寻仇',
  artifact_heist: '夺取法宝',
};

export const SCHEME_STATUS: Record<Scheme['status'], { label: string; color: string }> = {
  active: { label: '进行中', color: 'text-amber-300' },
  completed: { label: '已完成', color: 'text-emerald-300' },
  failed: { label: '已失败', color: 'text-rose-300' },
};

export function countCompletedSchemeSteps(scheme: Scheme): number {
  return scheme.steps.filter((step) => step.completedTick !== undefined).length;
}

interface SchemePanelProps {
  cultivator: Cultivator;
  locations: WorldState['locations'];
  cultivators: WorldState['cultivators'];
}

export function SchemePanel({ cultivator, locations, cultivators }: SchemePanelProps) {
  const scheme = cultivator.activeScheme;
  const targetName = scheme?.targetCultivatorId
    ? cultivators.find(({ id }) => id === scheme.targetCultivatorId)?.name ?? '身份未详'
    : undefined;
  const targetLocation = scheme?.targetLocationId
    ? locations.find(({ id }) => id === scheme.targetLocationId)?.name ?? '地点未详'
    : undefined;
  return (
    <section className="space-y-2 pt-2 border-t border-slate-800" aria-label="长线计划">
      <h4 className="text-xs font-semibold text-slate-200">长线计划</h4>
      {!scheme ? (
        <p className="rounded border border-dashed border-slate-700 p-2 text-xs text-slate-400">
          暂无长线计划记录。
        </p>
      ) : (
        <article className="rounded border border-slate-800/80 bg-slate-950/70 p-2 space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <h5 className="text-xs font-semibold text-slate-200 break-words">{scheme.title}</h5>
            <span className={`text-[10px] font-semibold ${SCHEME_STATUS[scheme.status].color}`}>
              {SCHEME_STATUS[scheme.status].label}
            </span>
          </div>
          <p className="text-[10px] text-slate-400">
            {SCHEME_KINDS[scheme.kind]} · 始于 Tick #{scheme.startedTick} · 完成 {countCompletedSchemeSteps(scheme)}/{scheme.steps.length} 步
          </p>
          {(targetName || targetLocation) && (
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
              {targetName && <span>目标修士：{targetName}</span>}
              {targetLocation && <span>目标地点：{targetLocation}</span>}
            </p>
          )}
          <ol className="space-y-1.5 list-decimal pl-4 text-[11px] text-slate-300">
            {scheme.steps.map((step, index) => {
              const completed = step.completedTick !== undefined;
              const current = scheme.status === 'active' && index === scheme.stepIndex && !completed;
              return (
                <li key={index} aria-current={current ? 'step' : undefined} className="pl-0.5 break-words">
                  <span>{step.label}</span>
                  <span className={`ml-2 text-[10px] ${completed ? 'text-emerald-300' : current ? 'text-amber-300' : 'text-slate-400'}`}>
                    {completed
                      ? `完成于 Tick #${step.completedTick}`
                      : current ? '当前步骤' : scheme.status === 'active' ? '待推进' : '未完成'}
                  </span>
                </li>
              );
            })}
          </ol>
          {scheme.status !== 'active' && scheme.outcome && (
            <p className="text-xs text-slate-300 break-words">{scheme.outcome}</p>
          )}
        </article>
      )}
    </section>
  );
}
