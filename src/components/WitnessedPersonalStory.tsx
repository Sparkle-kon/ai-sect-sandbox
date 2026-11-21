import type { WitnessedPersonalStoryView } from '../engine/witnessedPersonalStory';

interface WitnessedStoryScopeToggleProps {
  selectedName: string;
  active: boolean;
  onToggle: () => void;
}

export function WitnessedStoryScopeToggle({ selectedName, active, onToggle }: WitnessedStoryScopeToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className="min-h-11 min-w-0 max-w-full rounded border border-amber-500/40 bg-amber-950/25 px-2 py-2 text-left text-xs font-medium text-amber-100 [overflow-wrap:anywhere] aria-pressed:bg-amber-900/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
    >
      随{selectedName}看
      {active && <span aria-hidden="true" className="ml-1 text-amber-200"> · 已开启</span>}
    </button>
  );
}

export function WitnessedPersonalStory({ story }: { story: WitnessedPersonalStoryView }) {
  if (!story.scenes.length) {
    return (
      <p className="p-2 text-sm leading-relaxed text-slate-300">
        现存实录里，尚无这位人物亲历或在场所见的可核验片段。
      </p>
    );
  }
  return (
    <ol aria-label="人物在场所见" className="min-w-0 space-y-2">
      {story.scenes.map((scene) => (
        <li key={scene.eventId} className="min-w-0">
          <article className="space-y-1 rounded-lg border border-slate-800/80 bg-slate-950/80 p-2.5 [overflow-wrap:anywhere]">
            <h4 className="font-serif text-sm font-semibold leading-snug text-slate-100">{scene.title}</h4>
            <p className="font-serif text-sm leading-relaxed text-slate-200">{scene.paragraph}</p>
            <p className="text-xs leading-relaxed text-slate-400">
              <span>{scene.siteName}</span> · <span>仙历 {scene.year}年{scene.month}月</span>
            </p>
          </article>
        </li>
      ))}
    </ol>
  );
}
