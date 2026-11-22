import {SharedTurningPointRead} from './SharedTurningPointRead';
import type {SharedTurningPoint} from './sharedTurningPointsModel';
import type { ChapterTurningPoint, TurningPointOutcome } from '../engine/chronicleTurningPoints';
import type { CausalChronicleRelation } from '../types/world';

const RELATION: Record<CausalChronicleRelation, string> = {
  withdrew_siege: '停战实际撤回出征队伍', filled_vacancy: '选举实际填补掌门空位',
  matched_buy_order: '后续实际撮合此买单', matched_sell_order: '后续实际撮合此卖单',
  settled_shipment: '后续结算了这支实际商队',
};
const OUTCOME: Record<TurningPointOutcome, string> = {
  truce_with_withdrawal: '停战生效，相关队伍已撤回', truce_signed: '停战已生效',
  elected: '已正式选出掌门', local_fill: '货物已在本地交割', delivered: '商队到货并已交割',
  route_loss: '途中发生实际货损，未交割', returned: '原单已退运，未完成交割',
};

function connectedEvidence(arc: ChapterTurningPoint) {
  const byId = new Map(arc.scenes.map((scene) => [scene.eventId, scene]));
  if (byId.size !== arc.scenes.length) return undefined;
  const consequence = byId.get(arc.consequenceEventId);
  if (!consequence) return undefined;
  const incoming = arc.links.flatMap((link) => {
    const { fromEventId, toEventId, sameTurn } = link;
    const before = byId.get(fromEventId), after = byId.get(toEventId);
    return before && after && before !== after && before.tick <= after.tick && sameTurn === (before.tick === after.tick)
      ? [{ link, before, after }] : [];
  });
  const connected = new Set([consequence.eventId]);
  for (let pass = 0; pass < arc.scenes.length; pass++) {
    const size = connected.size;
    for (const { before, after } of incoming) if (connected.has(after.eventId)) connected.add(before.eventId);
    if (connected.size === size) break;
  }
  const scenes = arc.scenes.filter(({ eventId }) => connected.has(eventId));
  if (scenes.length < 2) return undefined;
  const links = incoming.filter(({ after }) => connected.has(after.eventId));
  return { consequence, scenes, links };
}

export function ChapterTurningPoints({arcs,shared=[]}:{arcs:readonly ChapterTurningPoint[];shared?:readonly SharedTurningPoint[]}) {
  const exact = arcs.flatMap((arc) => {
    const view = connectedEvidence(arc);
    return view ? [{ id: arc.id, ...view }] : [];
  });
  if (!exact.length&&!shared.length) return null;
  return <details className="min-w-0 rounded border border-amber-400/20 bg-slate-950/55">
    <summary className="flex min-h-11 cursor-pointer items-center px-2.5 text-xs font-semibold text-amber-100
      focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">有据转折</summary>
    <div className="min-w-0 space-y-2 break-words px-2.5 pb-2 text-xs leading-relaxed text-slate-300">
      <p className="text-slate-400">这里只串起实录能接上的事。其余见闻仍照正文各自读。</p>
      {shared.length>0&&<div className="space-y-2" aria-label="两条路在此相逢">
        {shared.map(view=><SharedTurningPointRead key={view.eventId} view={view}/>)}
      </div>}
      {exact.length>0&&<ol aria-label="本章可核验的故事转折" className="max-h-80 space-y-2 overflow-y-auto">
        {exact.map(({ id, consequence, scenes, links }) => <li key={id} className="min-w-0 space-y-2 rounded border border-slate-800 p-2">
          {scenes.map((scene) => <section key={scene.eventId} className="min-w-0 space-y-0.5">
            <h5 className="font-serif text-sm font-semibold text-amber-100">{scene.title}</h5>
            {scene.paragraph && scene.paragraph !== scene.title && <p className="font-serif text-sm text-slate-200">{scene.paragraph}</p>}
            {scene.siteName && <p className="text-slate-400">场地：{scene.siteName}</p>}
          </section>)}
          {consequence.outcome && <p className="font-medium text-emerald-200">实录所证的后果：{OUTCOME[consequence.outcome]}。</p>}
          <ul aria-label="已核验的事实关系" className="space-y-1 border-t border-slate-800 pt-1.5">
            {links.map(({ link, before, after }) => <li key={`${link.fromEventId}:${link.toEventId}:${link.relation}`}>
              〈{before.title}〉→〈{after.title}〉：{RELATION[link.relation]}。
              {link.sameTurn && before.tick === after.tick ? ` 同一轮内有先后（第 ${after.tick} 轮）。`
                : ` 第 ${before.tick} 轮 → 第 ${after.tick} 轮。`}
            </li>)}
          </ul>
        </li>)}
      </ol>}
    </div>
  </details>;
}
