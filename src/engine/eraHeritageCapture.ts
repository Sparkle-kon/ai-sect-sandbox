import type { Artifact, ChronicleCorrection, ChronicleRetelling, ChronicleSourceFact, Cultivator,
  EraHeritageState, OathContract, Rumor, WorldEvent, WorldState } from '../types/world';

const stamp = ({ tick, year, month }: WorldState) => ({ tick, year, month });
// The index is rebuilt once per detached frame; it is not a second persisted source of truth.
const factIndexes=new WeakMap<EraHeritageState,Map<string,EraHeritageState['facts'][number]>>();
function factsByEvent(state:EraHeritageState){
  let index=factIndexes.get(state);
  if(!index||index.size!==state.facts.length){
    index=new Map(state.facts.map(row=>[row.source.sourceEventId,row]));
    factIndexes.set(state,index);
  }
  return index;
}

function archive(world: WorldState): EraHeritageState {
  return world.eraHeritage ??= { version: 1, oaths: [], artifacts: [], facts: [] };
}
function physicalEvent(world: WorldState, event: WorldEvent, locationId: string): boolean {
  return event.tick === world.tick && event.locationId === locationId && world.locations.some(site =>
    site.id === locationId && site.type !== 'secret_realm' && site.type !== 'abyss');
}

/** Called only at native funded acceptance, not when reconstructing expired contracts. */
export function captureHeritageOath(world: WorldState, oath: OathContract, event: WorldEvent): void {
  if (!physicalEvent(world, event, oath.locationId) || oath.status !== 'active' ||
      oath.escrow.payment !== oath.payment || oath.escrow.collateral !== oath.collateral ||
      oath.requesterId === oath.providerId || event.id !== `evt-${oath.id}-${world.tick}-accept` ||
      event.actorIds[0] !== oath.requesterId || event.actorIds[1] !== oath.providerId ||
      world.eraHeritage?.oaths.some(row => row.oathId === oath.id)) return;
  const { id: oathId, locationId, requesterId, providerId, term, quantity, payment, collateral } = oath;
  archive(world).oaths.push({ ...stamp(world), oathId, eventId: event.id, locationId, requesterId, providerId,
    term, quantity, payment, collateral });
}

/** A receipt proves manufacture, not where the surviving object can now be seen. */
export function captureHeritageArtifact(world: WorldState, maker: Cultivator, artifact: Artifact, event: WorldEvent): void {
  const { id: artifactId, relicSetId: setId, relicFragmentIds: ids } = artifact;
  if (!artifactId || !setId || !ids || ids[0] === ids[1] || !maker.artifacts.includes(artifact) ||
      !physicalEvent(world, event, maker.locationId) || event.actorIds[0] !== maker.id ||
      world.eraHeritage?.artifacts.some(row => row.artifactId === artifactId)) return;
  const fragments = ids.map(id => world.relics.fragments.find(row => row.id === id && row.setId === setId &&
    row.holder.kind === 'consumed' && row.holder.id === artifactId));
  if (!fragments[0] || !fragments[1] || fragments[0].slot === fragments[1].slot) return;
  archive(world).artifacts.push({ ...stamp(world), artifactId, setId, eventId: event.id, locationId: maker.locationId,
    makerId: maker.id, fragmentIds: [ids[0], ids[1]] });
}

/** Only the typed public fact just admitted by the native board can establish firsthand authority. */
export function captureHeritageFact(world: WorldState, source: ChronicleSourceFact, event: WorldEvent): void {
  if (event.witnessScope === 'participants' || source.sourceEventId !== event.id || source.tick !== world.tick ||
      !physicalEvent(world, event, source.locationId) || !world.chronicleErrata.sources.includes(source) ||
      (world.eraHeritage && factsByEvent(world.eraHeritage).has(source.sourceEventId))) return;
  const nativeWitnesses = source.kind === 'duel' ?
    world.witnesses.facts.find(row => row.eventId === event.id && row.tick === world.tick)?.witnessIds ?? [] : [];
  const subjects = source.kind === 'duel' ? source.participantIds : [source.actorId];
  const persons = new Map(world.cultivators.map(actor => [actor.id, actor]));
  const firsthandIds = [...new Set([...subjects, ...nativeWitnesses])].filter(id => {
    const actor = persons.get(id);
    return actor?.alive && actor.hp > 0 && actor.locationId === source.locationId;
  }).sort();
  if (!firsthandIds.length) return;
  const state=archive(world), index=factsByEvent(state);
  const fact={ ...stamp(world), source: structuredClone(source), firsthandIds, retellings: [], relays: [] };
  state.facts.push(fact);
  index.set(source.sourceEventId,fact);
}

/** Signed board opinions remain opinions. Preserve any native correction separately from both claims. */
export function captureHeritageBoardReading(world: WorldState, reading: ChronicleRetelling | ChronicleCorrection): void {
  const state=world.eraHeritage;
  const fact=state&&factsByEvent(state).get(reading.sourceEventId);
  if (!fact || reading.tick !== world.tick) return;
  if ('editorId' in reading) {
    if (!fact.correction && world.chronicleErrata.corrections.includes(reading)) fact.correction = structuredClone(reading);
  } else if (world.chronicleErrata.retellings.includes(reading) &&
      !fact.retellings.some(row => row.authorId === reading.authorId || row.id === reading.id)) {
    fact.retellings.push(structuredClone(reading));
  }
}

/** A relay token is received, not broadcast by the archive. Free-text fabrications have no native origin. */
export function captureHeritageRelay(world: WorldState, learner: Cultivator, rumor: Rumor): void {
  if (!world.eraHeritage || !rumor.originEventId || !rumor.originSourceCultivatorId || !rumor.sourceCultivatorId ||
      rumor.witnessScope === 'participants' || rumor.learnedTick !== world.tick ||
      (rumor.provenance !== 'conversation' && rumor.provenance !== 'flying_sword') ||
      !learner.rumors.includes(rumor)) return;
  const fact=factsByEvent(world.eraHeritage).get(rumor.originEventId);
  if (!fact || fact.tick!==rumor.originTick || fact.source.locationId!==rumor.locationId || !fact.firsthandIds.includes(rumor.originSourceCultivatorId) || fact.firsthandIds.includes(learner.id) ||
      fact.relays.some(row => row.learnerId === learner.id)) return;
  // Retain the origin identity, not a new attribution or a claim that the learner saw the original.
  fact.relays.push({ learnerId: learner.id, originWitnessId: rumor.originSourceCultivatorId, learnedTick: world.tick });
}
