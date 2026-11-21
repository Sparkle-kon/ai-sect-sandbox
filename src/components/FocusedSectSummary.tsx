export function FocusedSectSummary({ name, alignment, leaderName }: {
  name: string;
  alignment: string;
  leaderName?: string;
}) {
  return <section aria-label="纪事所指宗门" className="min-w-0 space-y-1 rounded border border-violet-400/25 bg-slate-950/60 p-3 text-slate-300">
    <h4 className="break-words text-sm font-semibold text-violet-100">{name}</h4>
    <p className="break-words text-xs">公开立场：{alignment}</p>
    {leaderName && <p className="break-words text-xs">已知掌门：{leaderName}</p>}
  </section>;
}
