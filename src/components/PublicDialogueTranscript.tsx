import type { PublicDialogueProvenance } from '../engine/publicDialogueProvenance';
import { DIALOGUE_KIND_LABELS } from './DialogueTranscript';

const STATUS = {
  verified: '已核验',
  fragment: '仅存片段',
  unresolved: '归属待核',
  conflict: '记录相冲突',
} as const;

export function PublicDialogueTranscript({ provenance }: { provenance?: PublicDialogueProvenance }) {
  if (!provenance) return null;

  return (
    <details className="mt-2 rounded border border-indigo-500/25 bg-indigo-950/25 px-2 py-1.5">
      <summary className="min-h-11 cursor-pointer py-2 text-xs font-medium leading-6 text-indigo-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400">
        查看对话 · {STATUS[provenance.status]}
      </summary>
      {'turns' in provenance ? (
        <>
          <p className="text-xs leading-relaxed text-slate-300">
            {DIALOGUE_KIND_LABELS[provenance.kind]} · {provenance.surface === 'chapter' ? '本章存录' : '原事件存录'} · {provenance.source === 'llm' ? '模型演绎' : '离线演绎'}
          </p>
          {provenance.status === 'fragment' && (
            <p className="mt-1 text-xs leading-relaxed text-slate-400">仅列尚可核验的原句，不补录缺失对白。</p>
          )}
          {provenance.alternateVersion && (
            <p className="mt-1 text-xs leading-relaxed text-slate-400">另有不同版本的演绎存录，此处不混编。</p>
          )}
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs text-indigo-200">
            {[...provenance.turns].sort((left, right) => left.ordinal - right.ordinal).map((turn) => (
              <li key={turn.ordinal} className="rounded bg-slate-950/70 p-2 leading-relaxed">
                <span className="font-semibold [overflow-wrap:anywhere]">{turn.speakerName}：</span>
                <span className="whitespace-pre-wrap text-slate-200 [overflow-wrap:anywhere]">{turn.text}</span>
              </li>
            ))}
          </ol>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">存录可说明这句话如何被演绎，不能替代实际的事件结果。</p>
        </>
      ) : (
        <p className="text-xs leading-relaxed text-slate-300">
          {provenance.status === 'conflict' ? '现存记录互相矛盾，不引原话，也不署名。' : '现有证据不足以核定对白归属，不引原话，也不署名。'}
        </p>
      )}
    </details>
  );
}
