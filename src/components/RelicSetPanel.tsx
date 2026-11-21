import { activeRelicResonance, equippedArtifact } from '../engine/artifactEngine';
import { availableRelicActions, heldRelicFragments, RELIC_SETS } from '../engine/relicEngine';
import { knownMapLocations } from '../engine/terrainEngine';
import type { Cultivator, WorldState } from '../types/world';

const SOURCES = { wild_cache: '野外寻得', expedition: '秘境远征所获' };
const SLOTS = ['frame', 'core'] as const;

export function RelicSetPanel({ world, actor }: { world: WorldState; actor: Cultivator }) {
  const fragments = world.relics ? heldRelicFragments(world, actor.id) : [];
  const forged = actor.artifacts.filter(({ relicSetId }) => relicSetId !== undefined);
  const seen = new Set([...fragments.map(({ setId }) => setId), ...forged.flatMap(({ relicSetId }) => relicSetId ? [relicSetId] : [])]);
  if (!seen.size) return null;
  const names = new Map(knownMapLocations(world, actor).map(({ id, name }) => [id, name]));
  const realLocations = new Set(world.locations.map(({ id }) => id));
  const site = world.locations.find(({ id }) => id === actor.locationId);
  const provenanceSite = (source: typeof fragments[number]['source']) => names.get(source.locationId) ??
    (source.kind === 'expedition' && !realLocations.has(source.locationId)
      ? world.occasions.find(({ id, locationId, kind }) => id === source.occasionId && locationId === source.locationId && kind === 'expedition')?.title ?? '已关闭秘境'
      : undefined);
  const opportunities = fragments.length ? availableRelicActions(actor, world) : [];
  const equipped = actor.alive && actor.hp > 0 ? equippedArtifact(actor) : undefined;
  const resonance = actor.alive ? activeRelicResonance(actor) : 0;
  return (
    <section aria-label="法宝碎片与套装" className="min-w-0 space-y-2 border-t border-slate-800 pt-2 text-xs text-slate-300">
      {Array.from(seen).map((setId) => {
        const rule = RELIC_SETS[setId];
        const held = fragments.filter((fragment) => fragment.setId === setId);
        const missing = SLOTS.filter((slot) => !held.some((fragment) => fragment.slot === slot));
        const assembled = forged.filter(({ relicSetId }) => relicSetId === setId);
        const active = equipped?.relicSetId === setId && resonance > 0;
        const canAssemble = opportunities.some((option) => option.action === 'RELIC' && option.relicMove === 'assemble' && option.targetRelicSetId === setId);
        return (
          <details key={setId} className="min-w-0 rounded border border-indigo-400/25 bg-slate-950/50">
            <summary className="min-h-11 cursor-pointer break-words px-3 py-2 text-xs font-semibold text-indigo-100">
              {rule.name} · {assembled.length ? active ? '套装共鸣已生效' : '套装共鸣未生效' : `持有碎片 ${held.length} 件`}
            </summary>
            <div className="space-y-2 border-t border-slate-800 p-3">
              <div className="space-y-1">
                <h5 className="font-semibold text-indigo-100">随身碎片与来源</h5>
                {!held.length ? <p className="text-slate-400">当前没有独立持有的碎片。参与重铸的组件不再单独持有。</p> : <ul className="space-y-1">
                  {held.map(({ id, slot, source }) => {
                    const location = provenanceSite(source);
                    return <li key={id} className="break-words">{rule.slots[slot]} · {SOURCES[source.kind]} · Tick #{source.tick}{location ? ` · ${location}` : ''}</li>;
                  })}
                </ul>}
              </div>
              {held.length > 0 && <div className="space-y-1 border-t border-slate-800 pt-2">
                <h5 className="font-semibold text-indigo-100">重铸要求与当前资格</h5>
                <p>{canAssemble ? '当前符合重铸条件。' : '当前不符合重铸条件。'}</p>
                <p className="break-words">{missing.length ? `缺少：${missing.map((slot) => rule.slots[slot]).join('、')}` : '已持有全部所需碎片。'}</p>
                <p>需 {rule.stoneCost} 灵石与玄土根 {rule.earthCost} 株，至少 {rule.furnaceGrade} 阶丹炉。</p>
                <p className="text-slate-400">当前持有 {actor.spiritStones} 灵石、玄土根 {actor.herbs.earth_root} 株 · {site?.furnaceGrade ? `当前地点丹炉 ${site.furnaceGrade} 阶` : '当前地点无丹炉'}</p>
              </div>}
              {assembled.length > 0 && <div className="space-y-1 border-t border-slate-800 pt-2">
                <h5 className="font-semibold text-indigo-100">已组装与实际共鸣</h5>
                <ul className="space-y-1">
                  {assembled.map((item, index) => <li key={item.id ?? `${item.name}:${index}`} className="break-words">
                    {item.name} · {item === equipped ? '已装备' : '未装备'}
                  </li>)}
                </ul>
                <p className={active ? 'text-emerald-200' : 'text-slate-400'}>{active ? `当前战斗倍率额外 +${Math.round(resonance * 100)}%（按基础倍率计，只生效一次，不叠加）。` : '未激活套装共鸣；只在该套装已认主、未损坏且实际装备时生效。'}</p>
              </div>}
            </div>
          </details>
        );
      })}
    </section>
  );
}
