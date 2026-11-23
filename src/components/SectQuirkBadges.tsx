export function SectQuirkBadges({labels}:{labels?:readonly string[]}){
  if(!labels?.length)return null;
  return <ul aria-label="怪癖" className="mt-1.5 flex min-w-0 flex-wrap gap-1 text-xs">
    {labels.map(label=><li key={label} className="rounded-full border border-orange-300/25 bg-orange-950/40 px-2 py-0.5 text-orange-100">{label}</li>)}
  </ul>;
}
