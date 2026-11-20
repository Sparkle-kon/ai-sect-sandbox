import type { WorldEvent } from '../types/world';

type Dialogue = NonNullable<WorldEvent['dialogue']>;

export const DIALOGUE_KIND_LABELS: Record<Dialogue['kind'], string> = {
  combat: '斗法交锋',
  trade: '交易交涉',
  dual_cultivation: '双修论道',
  sect_diplomacy: '宗门交涉',
};

export function DialogueTranscript({ dialogue }: { dialogue: Dialogue }) {
  if (dialogue.turns.length === 0) return null;

  return (
    <details className="mt-2 rounded border border-indigo-500/25 bg-indigo-950/25 px-2 py-1.5">
      <summary className="cursor-pointer text-[11px] font-medium text-indigo-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400">
        {DIALOGUE_KIND_LABELS[dialogue.kind]} · 查看对话（{dialogue.turns.length} 句）
      </summary>
      <p className="mt-2 text-[10px] text-slate-400">
        {dialogue.source === 'llm' ? '模型演绎' : '离线演绎'}。对白仅供演绎，事件结果以上方编年史为准。
      </p>
      <ol className="mt-2 space-y-1.5 text-xs">
        {dialogue.turns.map((turn, index) => (
          <li key={`${turn.speakerId}-${index}`} className="rounded bg-slate-950/70 p-2 leading-relaxed break-words">
            <span className="font-semibold text-indigo-200">{turn.speakerName}：</span>
            <span className="text-slate-200">{turn.text}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
