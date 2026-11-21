import { REINCARNATION_CHANCE, visibleRecollection } from '../engine/reincarnationEngine';
import type { WorldState } from '../types/world';

type Echo = NonNullable<ReturnType<typeof visibleRecollection>>;
const FRAGMENTS: Record<Echo['theme'], string> = {
  cultivation: '修习时，偶有难以解释的熟悉感。',
  conflict: '偶尔无来由地警觉，却想不起缘由。',
  community: '有时觉得身边的交谈似曾相识。',
  heavenly: '偶尔生起对天象的模糊印象。',
};
const ATTITUDES: Record<Echo['status'], string> = { unconsidered: '尚未审视', considered: '已审视，仍无定论', dismissed: '已搁置' };

export function RecollectionPanel({ world, actorId }: { world: WorldState; actorId: string }) {
  const echo = world.reincarnation ? visibleRecollection(world, actorId) : undefined;
  if (!echo || echo.receivedTick > world.tick) return null;
  return (
    <details className="min-w-0 rounded border border-indigo-400/25 bg-slate-950/60 text-slate-200">
      <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-indigo-100">未证实的轮回残响</summary>
      <div className="space-y-1.5 border-t border-slate-800 p-3 text-xs leading-relaxed">
        <p>{FRAGMENTS[echo.theme]}</p>
        <p>主观感受：{echo.confidence === 'faint' ? '微弱' : '模糊'} · {ATTITUDES[echo.status]} · 最初感知 Tick #{echo.receivedTick}</p>
        <p className="text-slate-400">只是一段无法核实的感受，不证明身份、地点或过去发生的事。</p>
        <p className="text-slate-400">轮回是罕见的独立规则：符合条件的已记录死亡有 {REINCARNATION_CHANCE * 100}% 的机会留下候选，并不保证后续重生。残响不继承财物、职位或前世知识。</p>
      </div>
    </details>
  );
}
