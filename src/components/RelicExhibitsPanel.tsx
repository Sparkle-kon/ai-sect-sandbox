import { RELIC_SETS } from '../engine/relicEngine';
import { visibleRelicExhibits } from '../engine/relicExhibitEngine';
import { knownMapLocations } from '../engine/terrainEngine';
import type { Cultivator, WorldState } from '../types/world';

type ExhibitView = ReturnType<typeof visibleRelicExhibits>[number];
type Participant = Extract<ExhibitView, { scope: 'participant' }>;
const END: Record<NonNullable<Participant['closeReason']>, string> = {
  declined: '宗门谢绝展出', withdrawn: '持有人撤回邀约', offer_expired: '邀约期满', item_unavailable: '原件已不可核',
  owner_died: '持有人已陨落', recalled: '持有人已撤展', host_closed: '主展宗门已结束展出', term_complete: '展期届满', host_breach: '主展方已不具展出条件',
};
const SOURCE = { wild_cache: '野外寻获', expedition: '秘境远征' } as const;

export function RelicExhibitsPanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator }) {
  const actor = world.cultivators.find(({ id }) => id === cultivator.id);
  if (!actor) return null;
  const rows = visibleRelicExhibits(world, actor);
  if (!rows.length) return null;
  const names = new Map(knownMapLocations(world, actor).map(({ id, name }) => [id, name]));
  const sects = new Map(world.sects.map(({ id, name }) => [id, name]));
  const people = new Map(world.cultivators.map(({ id, name }) => [id, name]));

  return (
    <details className="min-w-0 rounded border border-indigo-400/20 bg-slate-950/65">
      <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-indigo-200">法宝公展与公开溯源</summary>
      <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
        <p>到场修士只看当场可核的展品及来源类别；原持有人和主持签署者另有私人凭证。展出不转让归属，也不复制藏品。</p>
        <ul aria-label="本人可阅的展览与参与档案" className="max-h-[27rem] space-y-2 overflow-y-auto">
          {rows.map((row) => {
            const sources = [...new Set(row.sourceKinds.map((kind) => SOURCE[kind]))].join('、') || '来源类别未登记';
            const title = RELIC_SETS[row.setId].name;
            const site = names.get(row.siteId) ?? '展地名称未详';
            if (row.scope === 'public') {
              if (row.acceptedTick > world.tick || row.expiresTick <= world.tick) return null;
              return (
                <li key={row.id} className="min-w-0 space-y-1 break-words rounded border border-indigo-500/25 p-2">
                  <h5 className="font-semibold text-indigo-100">{title} · 现场公开展出</h5>
                  <p>{site} · 展期 Tick #{row.acceptedTick} 至 #{row.expiresTick} 前</p>
                  <p>公开溯源类别：{sources}</p>
                </li>
              );
            }
            const owner = row.ownerId === actor.id;
            const accepted = row.acceptedTick !== undefined && row.acceptedTick <= world.tick;
            const archivedStatus = row.status === 'closed' ? '已结案'
              : row.status === 'offered' ? world.tick < row.offerExpiresTick ? '等待主展方签署' : '邀约期满'
              : row.expiresTick !== undefined && world.tick >= row.expiresTick ? '展期已满' : '已签署展出';
            return (
              <li key={row.id} className="min-w-0 space-y-1.5 break-words rounded border border-slate-800 p-2">
                <h5 className="font-semibold text-indigo-100">{title} · {owner ? '本人出展' : '本人主持签署'} · {archivedStatus}</h5>
                <p>{site} · 主展方 {sects.get(row.hostSectId) ?? '宗门未详'}{!owner && ` · 持有人 ${people.get(row.ownerId) ?? '修士未详'}`}</p>
                <p>私人出展邀约 Tick #{row.offeredTick}{row.status === 'offered' && ` · 应答截止 Tick #${row.offerExpiresTick}`}</p>
                {accepted && <p>主展方实际同意 Tick #{row.acceptedTick}{row.expiresTick !== undefined && ` · 展期截止 Tick #${row.expiresTick}`}</p>}
                {row.closeReason && <p>结案：{END[row.closeReason]}{row.closedTick !== undefined && ` · Tick #${row.closedTick}`}</p>}
                <p>登记的公开溯源类别：{sources}。</p>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
