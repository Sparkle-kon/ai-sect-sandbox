import type { SpiritRoot } from '../types/world';

// Shared by text chips and canvas markers; each marker also spells out its element.
export const SPIRIT_ROOT_COLORS: Record<SpiritRoot, string> = {
  金: '#fde68a',
  木: '#86efac',
  水: '#93c5fd',
  火: '#fda4af',
  土: '#fdba74',
  雷: '#c4b5fd',
  暗: '#cbd5e1',
  天灵根: '#67e8f9',
};

export function SpiritRootBadge({ root }: { root: SpiritRoot }) {
  return (
    <span
      className="inline-flex items-center rounded border bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-medium leading-none whitespace-nowrap"
      style={{ color: SPIRIT_ROOT_COLORS[root], borderColor: `${SPIRIT_ROOT_COLORS[root]}55` }}
    >
      {root}
    </span>
  );
}
