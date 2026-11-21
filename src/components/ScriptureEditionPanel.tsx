import { knownMapLocations } from '../engine/terrainEngine';
import {
  availableScriptureActions, scriptureEditionModifiers, SCRIPTURE_CORRECTION_COST, SCRIPTURE_CORRECTION_MASTERY,
  SCRIPTURE_EDITION_LABELS as EDITIONS, SCRIPTURE_EDITION_MODIFIERS, visibleScriptureEditions,
} from '../engine/scriptureEngine';
import type { Cultivator, WorldState } from '../types/world';

type Catalog = ReturnType<typeof visibleScriptureEditions>;
type Edition = Catalog['editions'][number];
const SOURCES: Record<NonNullable<Catalog['original']>['source'], string> = { authored: '创法手稿', pavilion: '藏经阁传本', inheritance: '传承遗卷' };
const EVIDENCE: Record<NonNullable<Edition['evidence']>['kind'], string> = {
  pavilion: '藏经阁底本', inheritance: '当地遗卷底本', author_manuscript: '创法者手稿',
};
const change = (multiplier: number) => {
  const percent = Math.round((multiplier - 1) * 1000) / 10;
  return percent === 0 ? '不变' : `${percent > 0 ? '+' : ''}${percent}%`;
};

export function ScriptureEditionPanel({ world, actor, catalog = visibleScriptureEditions(world, actor) }: {
  world: WorldState; actor: Cultivator; catalog?: Catalog;
}) {
  const { original, editions } = catalog;
  if (!original) return null;
  const present = world.cultivators.find(({ id }) => id === actor.id);
  if (!present) return null;
  const positions = new Map(knownMapLocations(world, actor).map(({ id, name }) => [id, name]));
  const sects = new Map(world.sects.map(({ id, name }) => [id, name]));
  const names = new Map(world.cultivators.map(({ id, name }) => [id, name]));
  const byEdition = new Map(editions.map((item) => [item.id, item]));
  const active = actor.activeEdition?.originalId === original.id ? byEdition.get(actor.activeEdition.editionId) : undefined;
  const effects = scriptureEditionModifiers(actor);
  const activeEffect = Boolean(active && actor.alive && actor.hp > 0);
  const actions = availableScriptureActions(actor, world);
  const comparisons = new Set(actions.flatMap((option) => option.action === 'SCRIPTURE' && option.editionMove === 'compare' && option.targetScriptureEditionId
    ? [option.targetScriptureEditionId] : []));
  const canAnnotate = actions.some((option) => option.action === 'SCRIPTURE' && option.editionMove === 'annotate' && option.targetScriptureOriginalId === original.id);
  const originalPlace = original.sourceLocationId ? positions.get(original.sourceLocationId) : undefined;
  const originalSect = original.sourceSectId ? sects.get(original.sourceSectId) : undefined;
  return (
    <details className="min-w-0 rounded border border-cyan-400/25 bg-slate-950/50 text-xs text-slate-300">
      <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 font-semibold text-cyan-100">经义校勘 · {original.technique.name}</summary>
      <div className="space-y-2 border-t border-slate-800 p-3">
        <p className="break-words">{activeEffect ? `当前采用：${EDITIONS[active!.kind]} · 战斗 ${change(effects.combat)} · 修习 ${change(effects.cultivation)}` :
          '当前无生效异本；原本不改变战斗或修习倍率。'}</p>
        <div className="grid min-w-0 items-start gap-2 lg:grid-cols-2">
          <div className="min-w-0 space-y-1 break-words rounded bg-slate-900 p-2">
            <h5 className="font-semibold text-cyan-100">底本 · {original.technique.name}</h5>
            <p>{SOURCES[original.source]} · 灵根 {original.technique.spiritRoot} · 首见 Tick #{original.firstSeenTick}</p>
            {original.technique.authorId && <p>创法：{names.get(original.technique.authorId) ?? '姓名未详'}</p>}
            {(originalSect || originalPlace) && <p className="text-slate-400">来源：{[originalSect, originalPlace].filter(Boolean).join(' · ')}</p>}
          </div>
          <div className="min-w-0 space-y-1.5 rounded bg-slate-900 p-2">
            <h5 className="font-semibold text-cyan-100">所见异本 · {editions.length} 卷</h5>
            {!editions.length ? <p className="text-slate-400">此修士暂无可查的异本。</p> : <ul className="max-h-64 space-y-1.5 overflow-y-auto">
              {editions.map((edition) => {
                const modifier = SCRIPTURE_EDITION_MODIFIERS[edition.kind];
                const parent = edition.parentEditionId ? byEdition.get(edition.parentEditionId) : undefined;
                const evidenceSite = edition.evidence && positions.get(edition.evidence.locationId);
                return <li key={edition.id} className="space-y-1 break-words rounded bg-slate-950/75 p-2">
                  <p>{EDITIONS[edition.kind]} · {names.get(edition.authorId) ?? '署名未详'} · Tick #{edition.createdTick}
                    {active?.id === edition.id ? ` · ${activeEffect ? '当前采用' : '曾采用，当前不生效'}` : ''}</p>
                  <p className="text-slate-400">采用后：战斗 {change(modifier.combat)} · 修习 {change(modifier.cultivation)}</p>
                  {parent && <p className="text-slate-400">所据版本：{EDITIONS[parent.kind]}</p>}
                  {edition.evidence && <p className="text-slate-400">校验见证：{EVIDENCE[edition.evidence.kind]}{evidenceSite ? ` · ${evidenceSite}` : ''}</p>}
                  {comparisons.has(edition.id) && <p className="text-emerald-200">此本在当前位置可对照校订。</p>}
                </li>;
              })}
            </ul>}
          </div>
        </div>
        <div className="space-y-1 border-t border-slate-800 pt-2">
          <h5 className="font-semibold text-cyan-100">当地校勘条件</h5>
          <p>需当前地点可核对的底本、熟练度至少 {SCRIPTURE_CORRECTION_MASTERY}/100、{SCRIPTURE_CORRECTION_COST} 灵石。</p>
          <p className="text-slate-400">当前熟练度 {actor.techniqueMastery}/100 · 持有 {actor.spiritStones} 灵石 · {comparisons.size ? `此处可核对 ${comparisons.size} 本` : '此处无可校订的异本'}{canAnnotate ? ' · 可留下注解' : ''}。</p>
        </div>
      </div>
    </details>
  );
}
