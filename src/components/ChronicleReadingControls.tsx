interface ChronicleReadingControlProps {
  disabled?: boolean;
  onClick: () => void;
}

const control = 'min-h-11 min-w-0 max-w-full rounded border border-amber-500/40 bg-amber-950/25 px-2 py-2 text-left text-xs font-medium text-amber-100 [overflow-wrap:anywhere] enabled:hover:bg-amber-900/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 aria-disabled:cursor-wait aria-disabled:opacity-60';

export function ChronicleReadingMarkButton({ disabled, onClick }: ChronicleReadingControlProps) {
  return <button type="button" aria-disabled={disabled || undefined} onClick={() => { if (!disabled) onClick(); }} data-chronicle-reading-mark className={control}>记住此场</button>;
}

export function ChronicleReadingResumeButton({ disabled, onClick }: ChronicleReadingControlProps) {
  return <button type="button" aria-disabled={disabled || undefined} onClick={() => { if (!disabled) onClick(); }} className={control}>回到记住的场景</button>;
}
