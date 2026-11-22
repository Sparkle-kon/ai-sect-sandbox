import type { Ref } from 'react';
import type { projectProtagonistSuccession } from '../engine/protagonistSuccession';
import { publicChronicleExcerpt } from '../engine/chroniclePublicProse';

export type ProtagonistSuccessionView = ReturnType<typeof projectProtagonistSuccession>;
type Arc = ProtagonistSuccessionView['archived'][number];

/** Only titles resolved by the authority from actual public sources form these cues. */
export function protagonistCueTitles(arc: Pick<Arc, 'evidence'>): string[] {
  const sources = new Map<string, { tick: number; title: string }>();
  for (const proof of arc.evidence) {
    const title = proof.title && publicChronicleExcerpt(proof.title).trim();
    if (title && !sources.has(proof.eventId)) sources.set(proof.eventId, { tick: proof.tick, title });
  }
  const titles = [...new Set([...sources.values()].sort((a, b) => a.tick - b.tick).map(({ title }) => title))];
  return titles.length > 2 ? [titles[0], titles[titles.length - 1]] : titles;
}

function reason(arc: Arc, verifiedAscension: boolean): string {
  if (verifiedAscension) return '飞升实录证实越过仙门，前卷收束。';
  if (arc.closeReason === 'public_death' && arc.death?.category === 'death') return '公开实录证实陨落，前卷收束。';
  if (arc.closeReason === 'receded' && !arc.compromised) return '后续没有足够新实录，前卷主线淡出。';
  return '已有见证不足以继续支撑主线，前卷留作旧记。';
}

const tieLabel = { encounter: '相逢', practice: '共修', duel: '交锋' } as const;

function handoffTies(predecessor: Arc, successor: Arc | undefined) {
  const handoff = successor?.handoff;
  const hasExit = handoff?.exitKind === 'public_death'
    ? predecessor.closeReason === 'public_death' && predecessor.death?.category === 'death'
    : handoff?.exitKind === 'ascension' && predecessor.closeReason === 'receded';
  const end = predecessor.endedTick;
  if (!handoff || !hasExit || end === undefined || successor?.openedTick !== end || handoff.ties.length !== 3 ||
    handoff.ties.some(tie => !Number.isSafeInteger(tie.tick) || tie.tick < 1 || tie.tick > end) ||
    new Set(handoff.ties.map(tie => tie.kind)).size !== 3 ||
    new Set(handoff.ties.map(tie => tie.eventId)).size !== 3) return [];
  return [...handoff.ties].sort((a,b) => a.tick - b.tick).map(tie => ({
    kind: tie.kind, title: publicChronicleExcerpt(tie.title).trim(),
  }));
}

export function ProtagonistArchive({ succession, disclosureRef }: {
  succession: ProtagonistSuccessionView; disclosureRef?: Ref<HTMLDetailsElement>;
}) {
  if (!succession.archived.length) return null;
  const successorByArc = new Map<string, Arc | undefined>();
  for (const arc of [...succession.archived, ...(succession.active ? [succession.active] : [])]) {
    if (arc.predecessorArcId && !arc.compromised) successorByArc.set(arc.predecessorArcId,
      successorByArc.has(arc.predecessorArcId) ? undefined : arc);
  }
  const archived = [...succession.archived].reverse();
  return <details ref={disclosureRef} className="min-w-0 rounded border border-slate-800 bg-slate-950/50">
    <summary className="flex min-h-11 cursor-pointer items-center px-2.5 text-xs font-medium text-amber-100
      focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">前卷主线</summary>
    <ol aria-label="已留档的前卷主线" className="mx-2 mb-2 max-h-52 space-y-1.5 overflow-y-auto text-xs leading-relaxed text-slate-300">
      {archived.map((arc) => {
        const candidate = successorByArc.get(arc.id);
        const successor = candidate?.actorId !== arc.actorId ? candidate?.name : undefined;
        const ties = successor ? handoffTies(arc,candidate) : [];
        const cues = protagonistCueTitles(arc);
        const deathTitle = arc.closeReason === 'public_death' && arc.death?.category === 'death' && arc.death.title
          ? publicChronicleExcerpt(arc.death.title) : undefined;
        return <li key={arc.id} className="min-w-0 space-y-0.5 break-words rounded border border-slate-800 p-2 [overflow-wrap:anywhere]">
          <p><strong className="text-amber-100">{arc.name ?? '前卷人物姓名未详'}</strong> · {reason(arc,ties.length > 0 && candidate?.handoff?.exitKind === 'ascension')}</p>
          {cues.length > 0 && <p>仍可核对的场景：{cues.map((title) => `〈${title}〉`).join('、')}。</p>}
          {deathTitle && <p>陨落实录：〈{deathTitle}〉。</p>}
          {successor && <p>后来另从<strong className="text-amber-100">{successor}</strong>自己的见闻读起。
            {successor === arc.name && '两人同名，并非同一人。'}</p>}
          {ties.length > 0 && <p data-protagonist-handoff className="text-slate-200">
            <span className="font-medium text-amber-200">两卷相接，有三件旧事可证：</span>
            {ties.map(({kind,title},index) => <span key={kind}>{index > 0 ? '、' : ''}
              {tieLabel[kind]}{title ? `〈${title}〉` : ''}</span>)}。
          </p>}
        </li>;
      })}
    </ol>
  </details>;
}
