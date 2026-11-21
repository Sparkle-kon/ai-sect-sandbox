import { ALCHEMY_RECIPES, HERB_LABELS } from '../engine/alchemyEngine';
import { visibleEstates } from '../engine/estateEngine';
import type { Cultivator, HerbId, PillId, WorldState } from '../types/world';

function EstateAssets({ assets }: {
  assets: { stones: number; herbs: Partial<Record<HerbId, number>>; pills: Partial<Record<PillId, number>> } &
    ({ artifacts: readonly { name: string }[] } | { artifactIds: readonly string[] });
}) {
  const herbs = (Object.keys(HERB_LABELS) as HerbId[]).flatMap((id) => (assets.herbs[id] ?? 0) > 0 ? [`${HERB_LABELS[id]} ${assets.herbs[id]} 株`] : []);
  const pills = (Object.keys(ALCHEMY_RECIPES) as PillId[]).flatMap((id) => (assets.pills[id] ?? 0) > 0 ? [`${ALCHEMY_RECIPES[id].name} ${assets.pills[id]} 枚`] : []);
  const artifacts = 'artifacts' in assets
    ? (assets.artifacts.length > 0 ? `器物 ${assets.artifacts.map(({ name }) => name).join('、')}` : undefined)
    : (assets.artifactIds.length > 0 ? `器物 ${assets.artifactIds.length} 件` : undefined);
  const amounts = [...(assets.stones > 0 ? [`${assets.stones} 灵石`] : []), ...herbs, ...pills, ...(artifacts ? [artifacts] : [])];
  return <span>{amounts.length ? amounts.join(' · ') : '无登记资产'}</span>;
}

type Estate = WorldState['estates']['entries'][number];
const STATUS: Record<Estate['status'], string> = { open: '遗产待裁定', settled: '已裁定', unclaimed: '无人承领' };
const CLAIM_BASIS: Record<Estate['claims'][number]['basis'], string> = {
  nomination: '生前指定', bond: '生前交情', sect: '同门关系',
};

export function EstateMemorialPanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator | undefined }) {
  const viewer = world.cultivators.find(({ id }) => id === cultivator?.id);
  const living = viewer?.alive && viewer.hp > 0;
  const shown = viewer && world.estates ? visibleEstates(world, viewer).filter((estate) => living || estate.deceasedId === viewer.id).sort((a, b) =>
    Number(b.status === 'open') - Number(a.status === 'open') || b.openedTick - a.openedTick || a.id.localeCompare(b.id)) : [];
  const people = new Map(world.cultivators.map((actor) => [actor.id, actor]));
  const names = (id: string) => people.get(id)?.name ?? '姓名未详';
  const sites = new Map(world.locations.map(({ id, name }) => [id, name]));
  const sects = new Map(world.sects.map(({ id, name }) => [id, name]));

  return (
    <section className="min-w-0 space-y-2 rounded-xl border border-amber-400/25 bg-slate-900/70 p-3 text-slate-100 sm:p-4" aria-label="归葬与遗产">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold text-amber-100">归葬与遗产</h3>
        <p className="break-words text-xs text-slate-300">{living ? `${viewer.name}当前可阅的本地遗产登记 · ${shown.length} 件` : viewer ? '陨落修士仅显示本人归葬档案。' : '选中修士后查看可阅登记。'}</p>
        <p className="text-xs text-slate-400">遗产仅将经核验的搜刮结束后剩余资产入账。已分配栏是历史交割，不是可再次支用的余额。</p>
      </header>
      {!shown.length ? <p className="text-xs text-slate-400">{living ? '此地没有可阅的遗产登记。' : viewer ? '未查到此修士的归葬档案。' : '未选中修士，不展示全局案卷。'}</p> : (
        <div className="max-h-[28rem] space-y-2 overflow-y-auto">
          {shown.map((estate) => {
            const deceased = people.get(estate.deceasedId);
            const corpse = living && deceased && !deceased.alive && deceased.locationId === viewer.locationId ? deceased : undefined;
            return (
            <details key={estate.id} className="min-w-0 rounded border border-slate-800 bg-slate-950/60 p-2">
              <summary className="cursor-pointer break-words text-xs text-slate-100">
                <span className="font-semibold text-amber-100">{names(estate.deceasedId)}</span> · {STATUS[estate.status]}
              </summary>
              <div className="mt-2 space-y-2 text-xs text-slate-300">
                <p className="break-words">遗产与祭礼登记地：{sites.get(estate.locationId) ?? '地点未详'} · 开卷 Tick #{estate.openedTick}</p>
                <p>申领截止 Tick #{estate.closesTick} 前{estate.settledTick !== undefined ? ` · 结案 Tick #${estate.settledTick}` : ''}</p>
                <dl className="grid gap-2 border-t border-slate-800 pt-2 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="min-w-0 break-words"><dt className="font-semibold text-amber-100">遗身当前库存</dt><dd>{corpse
                    ? <EstateAssets assets={{ stones: corpse.spiritStones, herbs: corpse.herbs, pills: corpse.pills, artifacts: corpse.artifacts }} />
                    : '此处未核对遗身库存'}</dd></div>
                  <div className="min-w-0 break-words"><dt className="font-semibold text-amber-100">遗产托管余额</dt><dd><EstateAssets assets={estate.holdings} /></dd></div>
                  <div className="min-w-0 break-words"><dt className="font-semibold text-amber-100">已分配（历史交割）</dt><dd><EstateAssets assets={estate.distributed} /></dd></div>
                </dl>
                <div className="space-y-1 border-t border-slate-800 pt-2">
                  <h4 className="font-semibold text-amber-100">继承人及证据</h4>
                  <p className="break-words">生前指定：{estate.namedHeirId ? names(estate.namedHeirId) : '未登记'}</p>
                  {estate.sponsorSectId && <p className="break-words">登记宗门：{sects.get(estate.sponsorSectId) ?? '宗门未详'}</p>}
                  {estate.beneficiaryId && <p className="break-words">实际承领：{names(estate.beneficiaryId)}</p>}
                  <p>{estate.claims.length > 1 ? `存在竞争申领 · ${estate.claims.length} 项` : `已登记申领 · ${estate.claims.length} 项`}</p>
                  {estate.claims.length ? <ol className="space-y-1 text-slate-400">
                    {estate.claims.map((claim) => <li key={`${claim.actorId}:${claim.tick}`} className="break-words">
                      Tick #{claim.tick} · {names(claim.actorId)} · 依据：{CLAIM_BASIS[claim.basis]} · 登记强度 {claim.strength}
                    </li>)}
                  </ol> : <p className="text-slate-400">暂无申领凭证。</p>}
                </div>
                <div className="space-y-1 border-t border-slate-800 pt-2">
                  <h4 className="font-semibold text-amber-100">祭礼实录</h4>
                  {estate.memorial ? (
                    <>
                      <p className="break-words">Tick #{estate.memorial.tick} · 主祭：{names(estate.memorial.organizerId)} · 到场 {estate.memorial.attendeeIds.length} 人</p>
                      {!!estate.memorial.attendeeIds.length && <p className="break-words">到场：{estate.memorial.attendeeIds.map(names).join('、')}</p>}
                      <p>实际更新 {estate.memorial.relationshipImpacts} 项关系</p>
                    </>
                  ) : <p className="text-slate-400">尚无祭礼记录。</p>}
                </div>
              </div>
            </details>
            );
          })}
        </div>
      )}
    </section>
  );
}
