import type { Cultivator } from '../types/world';
import { durabilityOf, equippedArtifact, maxDurabilityOf } from '../engine/artifactEngine';
import { SpiritRootBadge } from './SpiritRootBadge';

const TIER_COLOR = {
  法器: 'text-slate-300',
  灵器: 'text-sky-300',
  法宝: 'text-violet-300',
  通天灵宝: 'text-amber-300',
};

export function ArtifactPanel({ cultivator, cultivators }: { cultivator: Cultivator; cultivators: Cultivator[] }) {
  const equipped = cultivator.alive ? equippedArtifact(cultivator) : undefined;
  const names = new Map(cultivators.map(({ id, name }) => [id, name]));
  return (
    <section className="flex flex-wrap items-start gap-1.5 text-xs" aria-label="法宝装备与器灵">
      <span className="text-slate-400">本命与随身法宝：</span>
      {cultivator.artifacts.length === 0 && <span className="text-slate-500">暂无</span>}
      {cultivator.artifacts.length > 0 && (
        <ul className="basis-full grid gap-1.5">
          {cultivator.artifacts.map((artifact, index) => {
            const tier = artifact.tier ?? '法器';
            const durability = durabilityOf(artifact);
            const maxDurability = maxDurabilityOf(artifact);
            const isEquipped = artifact === equipped;
            return (
              <li key={artifact.id ?? `${artifact.name}-${index}`} className="space-y-1 rounded border border-slate-700 bg-slate-800/50 px-2 py-1.5">
                <div className="flex flex-wrap items-center gap-1.5 text-slate-200">
                  {artifact.name}
                  <SpiritRootBadge root={artifact.spiritRoot} />
                  <span className={TIER_COLOR[tier]}>{tier}</span>
                  <span className={isEquipped ? 'text-emerald-300' : 'text-slate-400'}>
                    {isEquipped ? '已装备' : '未装备'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-slate-400">
                  <span className={durability <= 0 ? 'text-rose-300' : undefined}>
                    耐久 {durability}/{maxDurability}{durability <= 0 ? ' · 已损坏' : ''}
                  </span>
                  <span>{artifact.boundTo ? `认主：${names.get(artifact.boundTo) ?? '姓名未详'}` : '未认主'}</span>
                  {artifact.resonance !== undefined && <span>共鸣 {artifact.resonance}</span>}
                  {artifact.soul && <span>器灵：{artifact.soul.name} · 经验 {artifact.soul.experience}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
