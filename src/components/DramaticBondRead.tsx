import type {projectDramaticBondArcs,projectPersonalDramaticBonds} from '../engine/dramaticBondEngine';

export type PublicBondArc=ReturnType<typeof projectDramaticBondArcs>[number];
export type PersonalBondRead=NonNullable<ReturnType<typeof projectPersonalDramaticBonds>>;

/** A short public aside from the same native projection used by both story surfaces. */
export function PublicBondAside({arc}:{arc?:PublicBondArc}){
  if(!arc)return null;
  const resolved=arc.milestones.at(-1)?.text;
  return <aside aria-label="公开故事支线" className="min-w-0 space-y-0.5 border-l border-teal-400/35 pl-2.5 [overflow-wrap:anywhere]">
    <p className="text-xs text-teal-200">故事旁线 · 公开见闻</p>
    <h3 className="font-serif text-sm font-semibold text-teal-100">{arc.title} · {arc.names.join('与')}</h3>
    <p className="font-serif text-sm leading-relaxed text-slate-300">{arc.summary}{resolved&&resolved!==arc.summary&&<> {resolved}</>}</p>
  </aside>;
}

export function ActorDramaticBondRead({actorId,publicArcs,personal}:{actorId:string;publicArcs?:readonly PublicBondArc[];personal?:PersonalBondRead}){
  const arcs=(publicArcs??[]).filter(arc=>arc.actorIds.includes(actorId)).slice(0,3);
  const scenes=personal?.actorId===actorId?personal.scenes.slice(0,2):[];
  if(!arcs.length&&!scenes.length)return null;
  return <div className="min-w-0 space-y-2 [overflow-wrap:anywhere]">
    {arcs.length>0&&<section aria-label="这个人物的公开故事旁线" className="space-y-1.5">
      <h4 className="font-serif text-sm font-semibold text-teal-100">与人相逢之后</h4>
      <ul className="space-y-1.5">
        {arcs.map(arc=>{
          const latest=arc.milestones.at(-1);
          return <li key={JSON.stringify(arc.actorIds)} className="space-y-0.5 rounded-lg border border-teal-500/20 bg-slate-950/55 px-2 py-1.5 text-xs">
            <p className="font-serif text-sm font-medium text-teal-100">{arc.title}</p>
            <p className="leading-relaxed text-slate-300">{arc.summary}</p>
            {latest&&latest.text!==arc.summary&&<p className="leading-relaxed text-slate-300">后来所见：{latest.text}</p>}
            {latest&&<p className="text-slate-400">{latest.siteName} · 仙历 {latest.year} 年 {latest.month} 月{arc.witnessName&&(' · 见证：'+arc.witnessName)}</p>}
          </li>;
        })}
      </ul>
    </section>}
    {scenes.length>0&&<section aria-label="仅本人可见的亲历" className="space-y-1 rounded-lg border border-violet-500/25 bg-slate-950/60 px-2 py-1.5">
      <h4 className="font-serif text-sm font-semibold text-violet-100">仅本人可见 · 亲历</h4>
      <ul className="space-y-1.5 text-xs leading-relaxed text-slate-300">
        {scenes.map((scene,index)=><li key={index}>
          <p className="font-medium text-violet-100">{scene.title}</p><p>{scene.text}</p>
        </li>)}
      </ul>
    </section>}
  </div>;
}
