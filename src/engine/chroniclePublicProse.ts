import type { PublicDialogueProvenance } from './publicDialogueProvenance';
import { writeChronicleScene, type ChronicleSceneFact, type ChronicleSceneText } from './chronicleScene';

const unprovedSpeech = /(?:言道|说道|开口道|问道|答道|低语|喊道|曰)\s*[：:]|[“”‘’「」『』"]/u;

/** A public scene is not a back door for speaker attribution assembled from ambiguous prose. */
export function publicChronicleExcerpt(value: string): string {
  const offset = value.search(unprovedSpeech);
  if (offset < 0) return value;
  const context = value.slice(0, offset).trimEnd().replace(/[，、：:；]$/u, '');
  if (!context) return '';
  return /[。！？…!?]$/u.test(context) ? context : `${context}。`;
}

export function writePublicChronicleScene(fact: ChronicleSceneFact): ChronicleSceneText {
  if (fact.witnessScope === 'participants') return { title: '未公开的纪事', paragraph: '' };
  return writeChronicleScene({
    ...fact, title: publicChronicleExcerpt(fact.title), description: publicChronicleExcerpt(fact.description),
  });
}

/** Preserve the saved manuscript, but don't present a quotation under an unchecked speaker. */
export function canShowOriginalChronicleManuscript(
  manuscript: string, proofs: Iterable<PublicDialogueProvenance | undefined>,
): boolean {
  if (!unprovedSpeech.test(manuscript)) return true;
  const attestedLines = new Set<string>();
  for (const proof of proofs) {
    if (proof?.status === 'conflict' || proof?.status === 'unresolved') return false;
    if (proof?.status === 'verified' || proof?.status === 'fragment') {
      for (const turn of proof.turns) {
        if (!turn.text.includes('\n')) attestedLines.add(`${turn.speakerName}：「${turn.text}」`);
      }
    }
  }
  return manuscript.split('\n').every((line) => !unprovedSpeech.test(line) || attestedLines.has(line));
}
