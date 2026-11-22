import type {SharedTurningPoint} from './sharedTurningPointsModel';

export function SharedTurningPointRead({view}:{view:SharedTurningPoint}){
  return <section aria-label="相逢与各自后事"
    className="min-w-0 space-y-2 rounded border border-amber-500/30 bg-slate-950 p-2 [overflow-wrap:anywhere]">
    {view.reunion&&<p className="font-medium text-amber-200">两人再度相逢</p>}
    <h5 className="font-serif text-sm font-semibold text-amber-100">{view.title}</h5>
    <p className="font-serif text-sm leading-6 text-slate-100">{view.paragraph}</p>
    {view.siteName&&<p className="text-slate-400">相逢处：{view.siteName}</p>}
    <ol aria-label="两人各自有据的后事" className="space-y-1.5">
      {view.people.map(person=><li key={person.actorId} className="min-w-0 space-y-1 rounded border border-slate-800 p-2">
        <h6 className="text-sm font-semibold text-amber-100">{person.name} · {person.role==='buyer'?'买方':'卖方'}</h6>
        <p>{person.settlement}</p>
        {person.aftermath?<div className="space-y-0.5">
          <p className="font-medium text-slate-200">后来：{person.aftermath.title}</p>
          {person.aftermath.paragraph&&person.aftermath.paragraph!==person.aftermath.title&&
            <p className="font-serif text-sm leading-6">{person.aftermath.paragraph}</p>}
        </div>:<p className="text-slate-400">此人后来如何，目前没有可接读的实录。</p>}
      </li>)}
    </ol>
    {view.people.some(person=>person.aftermath)&&<p className="text-slate-400">后事各归其人，先后并不能证明由这次相逢而起。</p>}
    <details className="min-w-0 rounded border border-slate-800 px-2">
      <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-amber-100 focus-visible:outline focus-visible:outline-amber-300">查两人各自的原卷</summary>
      <p>第 {view.tick} 轮：同一笔坊市实交。</p>
      <ul className="space-y-1 pb-2">
        {view.people.map(person=><li key={person.actorId}>
          {person.name}原有见闻：〈{person.earlier.title}〉，第 {person.earlier.tick} 轮。
          {person.aftermath&&<> 后日实录：〈{person.aftermath.title}〉，第 {person.aftermath.tick} 轮。</>}
        </li>)}
      </ul>
    </details>
  </section>;
}
