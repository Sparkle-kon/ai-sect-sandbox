import type {ReactNode} from 'react';

export interface ReadingOpportunity {
  readonly card: ReactNode;
  /** Derived from the same current, actor-scoped options that render into the card. */
  readonly hasLegalChoice: boolean;
}

/** An older, lived choice should not disappear beneath an ordinary invitation. */
export function selectReadingOpportunity(native: readonly (ReadingOpportunity | undefined)[],
  director: ReactNode): ReactNode | undefined {
  if (director == null) return undefined; // Keep the pre-existing reading order when there's no competing invitation.
  const first = native.find(row => row?.hasLegalChoice && row.card != null)?.card;
  if (first == null) return director;
  return <div className="min-w-0 space-y-2">
    {first}
    <details className="min-w-0 rounded-lg border border-slate-700 px-2 py-0.5">
      <summary className="min-h-[44px] cursor-pointer rounded py-2 text-sm text-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">
        另有一幕
      </summary>
      <div className="pb-2">{director}</div>
    </details>
  </div>;
}
