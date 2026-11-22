import type { Artifact, ChronicleReading, Cultivator, EraHeritageArtifact, EraHeritageDate, EraHeritageFact, WorldState } from '../types/world';
import { doctrineFoundingPhysicallyAt } from './doctrineFoundingEngine';
import { visibleRelicExhibits } from './relicExhibitEngine';
import { RELIC_SETS } from './relicEngine';
import { OATH_TERMS } from './oathEngine';
import { regionForPoint } from './regionalSimulationEngine';

interface HeritageLine { title: string; evidence: string; year: number; month: number }
export interface EraHeritageView {
  presentSiteId?:string;
  originals: (HeritageLine & { kind: 'artifact' | 'oath' })[];
  firsthands: HeritageLine[];
  relays: HeritageLine[];
  discrepancies: { title: string; statements: readonly [{ witness: string; claim: string }, { witness: string; claim: string }];
    year: number; month: number }[];
}
const date = ({ year, month }: EraHeritageDate) => ({ year, month });
const reverseDate = (a: EraHeritageDate, b: EraHeritageDate) => b.tick - a.tick;
const verifiedObject = (proof: EraHeritageArtifact, actual: Artifact | undefined): boolean =>
  actual?.id === proof.artifactId && actual.relicSetId === proof.setId && actual.relicFragmentIds?.length === 2 &&
  proof.fragmentIds.every(id => actual.relicFragmentIds!.includes(id)) &&
  new Set(actual.relicFragmentIds).size === 2;
const title = (source: EraHeritageFact['source']) => source.kind === 'duel' ? '旧日斗法' : '旧日赈济';

function explainClaim(reading: ChronicleReading, names: ReadonlyMap<string, Cultivator>): string {
  if (reading.kind === 'relief') return reading.delivery === 'full_supplies' ? '说已足额交付' : '说没有实付';
  const name = names.get(reading.winnerId)?.name;
  return name ? `说${name}取胜` : '所指获胜者姓名未详';
}

const readingKey = (reading: ChronicleReading): string =>
  reading.kind === 'duel' ? `duel:${reading.winnerId}` : `relief:${reading.delivery}`;

/** Actual viewer object, current physical access and real participant links govern every path. */
export function projectEraHeritage(world: WorldState, viewer?: Cultivator): EraHeritageView {
  const view: EraHeritageView = { originals: [], firsthands: [], relays: [], discrepancies: [] };
  const state = world.eraHeritage;
  if (!state || !viewer || !world.cultivators.includes(viewer) || !viewer.alive || viewer.hp <= 0) return view;
  const names = new Map(world.cultivators.map(actor => [actor.id, actor]));
  const sites = new Map(world.locations.map(row => [row.id, row]));
  const canReadOriginalHere = doctrineFoundingPhysicallyAt(world, viewer, viewer.locationId, world.tick);
  const onDisplay = new Map(visibleRelicExhibits(world, viewer).map(exhibit => [exhibit.id, exhibit]));
  for (const proof of state.artifacts.slice().sort(reverseDate)) {
    if (proof.tick > world.tick || !canReadOriginalHere) continue;
    const held = viewer.artifacts.some(item => verifiedObject(proof, item));
    const exhibit = world.relicExhibits.entries.find(row => row.status === 'on_display' && row.siteId === viewer.locationId &&
      onDisplay.has(row.id) && verifiedObject(proof, row.custody));
    if (held || exhibit) {
      view.presentSiteId=viewer.locationId;
      view.originals.push({ kind: 'artifact', title: RELIC_SETS[proof.setId].name,
        evidence: held ? '原件仍在本人手中，已与重铸凭据核对。' : '原件正在此处守约展出，已与重铸凭据核对。', ...date(proof) });
    }
  }
  for (const oath of state.oaths.slice().sort(reverseDate)) {
    if (oath.tick > world.tick || !canReadOriginalHere || (oath.requesterId !== viewer.id && oath.providerId !== viewer.id)) continue;
    view.originals.push({ kind: 'oath', title: '本人所签契书',
      evidence: `原签约定：${OATH_TERMS[oath.term].name} × ${oath.quantity}，实托价款 ${oath.payment}、质押 ${oath.collateral} 枚灵石。签书不等于已经交货。`, ...date(oath) });
  }
  const currentEvents=new Map(world.events.map(event=>[event.id,event]));
  for (const fact of state.facts.slice().sort(reverseDate)) {
    const current=currentEvents.get(fact.source.sourceEventId);
    if (fact.tick > world.tick || current&&(current.witnessScope==='participants'||current.tick!==fact.tick||
      current.locationId!==fact.source.locationId)) continue;
    const origin = sites.get(fact.source.locationId), here = sites.get(viewer.locationId);
    const local = !!origin && origin.id === here?.id && canReadOriginalHere;
    // Having been named as a claimant does not make someone a firsthand witness.
    const witness = canReadOriginalHere && fact.firsthandIds.map(id => names.get(id)).find(actor =>
      actor !== undefined && actor !== viewer && doctrineFoundingPhysicallyAt(world, actor, viewer.locationId, world.tick));
    if (witness) {
      view.presentSiteId=viewer.locationId;
      const remote = origin && here && regionForPoint(world, origin) !== regionForPoint(world, here);
      view.firsthands.push({ title: `${title(fact.source)} · ${witness.name}`,
        evidence: remote ? '这位仍在世的当事人亲见过源地实事，现可在异域当面听证。' : '这位仍在世的当事人亲见过此事，现可当面听证。',
        ...date(fact) });
    }
    if (!local && !witness && fact.relays.some(row => row.learnerId === viewer.id && row.learnedTick <= world.tick)) {
      view.relays.push({ title: title(fact.source), evidence: '本人实际听到的一路相传；未见原件，也未听到对方当面作证。', ...date(fact) });
    }
    if (!local) continue;
    const readings = fact.retellings.filter(row => row.tick <= world.tick);
    const first = readings[0];
    const second = first && readings.find(row => row.authorId !== first.authorId && readingKey(row.reading) !== readingKey(first.reading));
    if (first && second) {
      view.discrepancies.push({ title: fact.correction ? `${title(fact.source)}：旧说仍异，已有独立勘误` : `${title(fact.source)}：两份署名说法不合`,
        statements: [
          { witness: names.get(first.authorId)?.name ?? '旧卷署名未详', claim: explainClaim(first.reading, names) },
          { witness: names.get(second.authorId)?.name ?? '旧卷署名未详', claim: explainClaim(second.reading, names) },
        ], ...date(fact) });
    }
  }
  return view;
}
