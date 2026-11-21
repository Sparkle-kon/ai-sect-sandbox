import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableChronicleErrataActions, visibleChronicleErrata } from '../src/engine/chronicleErrataEngine';
import { queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { archiveChronicleEvents, availableChronicleChapter, resolveChronicleChapter } from '../src/engine/novelGenerator';
import { witnessEvent } from '../src/engine/rumorEngine';
import { SETTLEMENT_RELIEF } from '../src/engine/settlementEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture' };
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '静候' };
const order = <T extends Pick<LLMDecisionPayload, 'chronicleErrataMove'>>(fields: T): LLMDecisionPayload =>
  ({ ...fields, chosenAction: 'CHRONICLE_ERRATA', innerMonologue: '只照已查证史料' });
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld(106);
  world.tick = 6; world.month = 7;
  const market = world.locations.find(({ id }) => id === 'loc-market')!;
  const site = world.settlements.villages.find(({ locationId }) => locationId === market.id)!;
  const [donor, author, editor, outsider] = world.cultivators;
  for (const actor of [donor, author, editor]) {
    actor.locationId = market.id;
    actor.hp = actor.maxHp;
    actor.spiritStones = 100;
    actor.herbs.jade_leaf = 4;
  }
  outsider.locationId = 'loc-market-east';
  site.stress = 80;
  return { world, market, site, donor, author, editor, outsider };
}

describe('chronicle errata through model, public ledger, and saved history', () => {
  it('pins independently verifiable actual relief, preserving unresolved conflict through raw-source eviction and save/reload', async () => {
    const { world, site, donor, author, editor, outsider } = fixture();
    const orders: Record<string, LLMDecisionPayload> = Object.fromEntries(world.cultivators.map(({ id }) => [id, rest]));
    orders[donor.id] = { ...rest, chosenAction: 'DELIVER_RELIEF', targetSettlementId: site.id };
    const state = advanceWorldTick(world, orders, () => .99);
    const byId = (key: string) => state.cultivators.find(({ id }) => id === key)!;
    const pinned = state.chronicleErrata.sources.find(({ kind }) => kind === 'relief')!;
    expect(pinned).toMatchObject({ tick: 7, kind: 'relief', stones: SETTLEMENT_RELIEF.stones, herbs: SETTLEMENT_RELIEF.jade_leaf });
    expect(byId(donor.id).spiritStones).toBe(donor.spiritStones - SETTLEMENT_RELIEF.stones);
    expect(visibleChronicleErrata(state, byId(outsider.id))).toEqual([]);
    const published = state.events.find(({ id }) => id === pinned.sourceEventId)!;
    archiveChronicleEvents(state, [published]);
    const plan = availableChronicleChapter(state, true)!;
    const original = resolveChronicleChapter(state, plan, { title: '文学再述', body: '书中随口写道其物未至。这不是证据。' })!;
    expect(original.body).toContain('其物未至');
    const origArchive = structuredClone(state.chronicleArchive);

    state.tick++;
    expect(applyCultivatorBrainDecision(state, byId(donor.id), order({ chronicleErrataMove: 'retell', targetChronicleSourceId: pinned.sourceEventId,
      chronicleReliefReading: 'full_supplies' }), () => .99)).not.toBeNull();
    const wrong = order({ chronicleErrataMove: 'retell', targetChronicleSourceId: pinned.sourceEventId, chronicleReliefReading: 'unfunded' });
    const source = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (_, init?: RequestInit) => {
      expect(init?.body).not.toEqual(expect.stringContaining('书中随口'));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(wrong) } }] }));
    }));
    const model = await queryCultivatorLLMDecision(byId(author.id), state, config, source);
    expect(source).toHaveBeenLastCalledWith('llm');
    expect(applyCultivatorBrainDecision(state, byId(author.id), model, () => .99)).not.toBeNull();
    expect(visibleChronicleErrata(state, byId(editor.id))[0]).toMatchObject({ conflict: true });
    expect(visibleChronicleErrata(state, byId(editor.id))[0]?.correction).toBeUndefined();
    expect(availableChronicleErrataActions(byId(donor.id), state).some((action) => action.chronicleErrataMove === 'correct')).toBe(false);

    // Simulate finite raw buffers rotating. The authored prose is retained but must never prove a verdict.
    state.events = state.events.filter(({ id }) => id !== pinned.sourceEventId);
    state.witnesses.facts = [];
    state.settlements.records = state.settlements.records.filter(({ id }) => 'evt-' + id !== pinned.sourceEventId);
    state.chronicleArchive.anchors = [];
    state.chronicleArchive.chapters[0].anchors = [];
    state.chronicleArchive.chapters[0].biographies = [];
    state.tick++;
    const reset = decodeWorldSave(encodeWorldSave(state));
    const independent = reset.cultivators.find(({ id }) => id === editor.id)!;
    expect(reset.chronicleErrata.sources).toContainEqual(pinned);
    expect(visibleChronicleErrata(reset, independent)[0]).toMatchObject({ conflict: true });
    expect(visibleChronicleErrata(reset, independent)[0]?.correction).toBeUndefined();
    const fix = availableChronicleErrataActions(independent, reset).find(({ chronicleErrataMove }) => chronicleErrataMove === 'correct')!;
    expect(fix).toBeDefined();
    expect(applyCultivatorBrainDecision(reset, independent, order(fix), () => .99)).not.toBeNull();
    expect(reset.chronicleErrata.corrections[0]).toMatchObject({ reading: { kind: 'relief', delivery: 'full_supplies' }, editorId: editor.id });
    expect(reset.chronicleErrata.corrections[0].contestedRetellingIds).toHaveLength(2);
    expect(reset.chronicleErrata.retellings).toEqual(state.chronicleErrata.retellings);
    expect(reset.chronicleArchive.chapters[0].body).toBe(origArchive.chapters[0].body);
    expect(decodeWorldSave(encodeWorldSave(reset)).chronicleErrata).toEqual(reset.chronicleErrata);
    const forgedVerdict = structuredClone(reset);
    forgedVerdict.chronicleErrata.corrections[0].reading = { kind: 'relief', delivery: 'unfunded' };
    expect(() => encodeWorldSave(forgedVerdict)).toThrow(/chronicleErrata.corrections.provenance/);
  });

  it('rejects private-source conflicts and uncovered historical claims', () => {
    const { world, site, donor } = fixture();
    const raw = applyCultivatorBrainDecision(world, donor, { ...rest, chosenAction: 'DELIVER_RELIEF', targetSettlementId: site.id }, () => .99)!;
    expect(raw).toBeDefined();
    witnessEvent(world, { ...raw, witnessScope: 'participants' });
    expect(world.chronicleErrata.sources).toEqual([]);
    const orphan = structuredClone(world);
    orphan.settlements.records = [];
    witnessEvent(orphan, raw);
    expect(orphan.chronicleErrata.sources).toEqual([]);
    witnessEvent(world, raw);
    expect(world.chronicleErrata.sources).toHaveLength(1);
    world.events = [{ ...raw, witnessScope: 'participants' }];
    expect(visibleChronicleErrata(world, donor)).toEqual([]);
    expect(() => encodeWorldSave(world)).toThrow(/chronicleErrata.sources.public_time/);
  });
  it('keeps public duel proof at a relocated headquarters whose terrain place is not typed as an original headquarters', () => {
    const { world, donor, author, editor } = fixture();
    const relocated = world.locations.find(({ type }) => type === 'spirit_vein')!;
    world.sects[0].headquartersId = relocated.id;
    for (const actor of [donor, author, editor]) actor.locationId = relocated.id;
    const publicDuel = applyCultivatorBrainDecision(world, donor, { ...rest, chosenAction: 'DUEL', targetCultivatorId: author.id }, () => .6)!;
    expect(publicDuel.duelWinnerId).toBeDefined();
    witnessEvent(world, publicDuel);
    expect(world.chronicleErrata.sources).toContainEqual(expect.objectContaining({
      kind: 'duel', locationId: relocated.id, winnerId: publicDuel.duelWinnerId,
    }));
    expect(decodeWorldSave(encodeWorldSave(world)).chronicleErrata).toEqual(world.chronicleErrata);
  });
});
